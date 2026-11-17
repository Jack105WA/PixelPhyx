// PixelPhyx rigid props. World coordinates use one unit per material cell.
export function createObjectSystem({getWidth,getHeight,getGravity,getCell,displaceCell,getAirborne=()=>[],onPublish=()=>{}}){
 const bodies=[];let nextId=1,drag=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const defs={
  car:{w:34,h:12,mass:3.2,restitution:.16,friction:.91},
  bucket:{w:16,h:18,mass:1.15,restitution:.12,friction:.88},
  ball:{w:12,h:12,mass:.55,restitution:.58,friction:.985},
  crate:{w:15,h:15,mass:1.5,restitution:.16,friction:.86},
  barrel:{w:13,h:17,mass:1.3,restitution:.22,friction:.9}
 };
 function spawn(type,x=getWidth()/2,y=18,providedId){
  const d=defs[type];if(!d||bodies.length>=60)return null;
  const car=type==='car';
  const b={id:providedId||'prop-'+(nextId++),type,x:clamp(x,d.w/2,getWidth()-d.w/2),y:clamp(y,d.h/2,getHeight()-d.h/2),vx:0,vy:0,angle:0,spin:0,w:d.w,h:d.h,mass:d.mass,restitution:d.restitution,friction:d.friction,damage:0,sleep:0,wheelY:[0,0],wheelV:[0,0],wheelSpin:[0,0],suspension:car?{rest:5,stiffness:.24,damping:.68,max:8}:null};
  bodies.push(b);return b;
 }
 function remove(id){const i=bodies.findIndex(b=>b.id===id);if(i>=0)bodies.splice(i,1);if(drag?.body.id===id)drag=null}
 function localPoint(b,x,y){const dx=x-b.x,dy=y-b.y,c=Math.cos(b.angle),s=Math.sin(b.angle);return{x:dx*c+dy*s,y:-dx*s+dy*c}}
 function worldPoint(b,p){const c=Math.cos(b.angle),s=Math.sin(b.angle);return{x:b.x+p.x*c-p.y*s,y:b.y+p.x*s+p.y*c}}
 function pointVelocity(b,p){return{x:b.vx-b.spin*p.y,y:b.vy+b.spin*p.x}}
 function hit(b,x,y){const p=localPoint(b,x,y);return b.type==='ball'?Math.hypot(p.x,p.y)<=b.w*.55:Math.abs(p.x)<=b.w/2+1&&Math.abs(p.y)<=b.h/2+1}
 function grabAt(x,y){
  let best=null,dist=Infinity;
  for(const b of bodies){if(!hit(b,x,y))continue;const d=Math.hypot(x-b.x,y-b.y);if(d<dist){best=b;dist=d}}
  if(!best)return false;
  const point=localPoint(best,x,y),velocity=pointVelocity(best,point);
  drag={body:best,point,target:{x,y},targetV:{x:0,y:0},last:{x,y},lastAt:performance.now(),lastMoveAt:performance.now()};
  best.sleep=0;return true;
 }
 function moveGrab(x,y){
  if(!drag)return;
  const now=performance.now(),dt=clamp((now-drag.lastAt)/1000,.001,.05);
  drag.targetV={x:clamp((x-drag.last.x)/dt,-32,32),y:clamp((y-drag.last.y)/dt,-32,32)};
  drag.last={x,y};drag.lastAt=now;drag.lastMoveAt=now;drag.target={x,y};
 }
 function releaseGrab(){
  if(!drag)return;
  const b=drag.body;b.sleep=0;
  // Preserve the velocity the body actually acquired; only add a small release flick.
  b.vx=clamp(b.vx+drag.targetV.x*.12,-24,24);
  b.vy=clamp(b.vy+drag.targetV.y*.12,-24,24);
  drag=null;onPublish({type:'props',items:serialize()});
 }
 function applyGrabConstraint(b){
  if(!drag||drag.body!==b)return;
  const p=worldPoint(b,drag.point),v=pointVelocity(b,drag.point);
  const dx=drag.target.x-p.x,dy=drag.target.y-p.y;
  // A damped spring at the actual local grab point transfers force and torque.
  const fx=clamp(dx*.22+(drag.targetV.x-v.x)*.48,-3.5,3.5);
  const fy=clamp(dy*.22+(drag.targetV.y-v.y)*.48,-3.5,3.5);
  b.vx=clamp(b.vx+fx/b.mass,-26,26);b.vy=clamp(b.vy+fy/b.mass,-26,26);
  const inertia=Math.max(1,b.mass*(b.w*b.w+b.h*b.h)/12);
  b.spin=clamp(b.spin+(drag.point.x*fy-drag.point.y*fx)/inertia,-.55,.55);
 }
 function corners(b){
  const hw=b.w/2,hh=b.h/2;
  return[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>worldPoint(b,{x,y}));
 }
 function contactSample(b,x,y,nx,ny,impact){
  const gx=Math.floor(x),gy=Math.floor(y),w=getWidth(),h=getHeight();
  if(gx<0||gx>=w||gy<0||gy>=h){
   if(gx<0||gx>=w){b.x=clamp(b.x,b.w/2,w-b.w/2);b.vx*=-.25}
   if(gy>=h){b.y=h-b.h/2;b.vy=-Math.abs(b.vy)*b.restitution;b.spin*=.7}
   if(gy<0){b.y=b.h/2;b.vy=Math.abs(b.vy)*.2}
   return true;
  }
  const material=getCell(gx,gy);if(!material)return false;
  // Ask the granular world to move the exact contacted particle out of the prop's path.
  if(displaceCell?.(gx,gy,nx,ny,b.vx,b.vy))return false;
  const vn=b.vx*nx+b.vy*ny;
  if(vn<0){const impulse=-(1+b.restitution)*vn;b.vx+=impulse*nx;b.vy+=impulse*ny;b.vx*=b.friction;b.vy*=b.friction}
  if(impact>2&&b.type==='car')b.damage=Math.min(1,b.damage+impact*.002);
  return true;
 }
 function solveTerrain(b){
  const pts=corners(b),cx=b.x,cy=b.y;
  const edges=b.type==='car'?[[pts[0],pts[1]],[pts[1],pts[2]],[pts[3],pts[0]]]:b.type==='bucket'?[[pts[1],pts[2]],[pts[2],pts[3]],[pts[3],pts[0]]]:[[pts[0],pts[1]],[pts[1],pts[2]],[pts[2],pts[3]],[pts[3],pts[0]]];
  let contacts=0,nxSum=0,nySum=0;
  for(const [a,z] of edges){
   const length=Math.hypot(z.x-a.x,z.y-a.y),steps=Math.max(2,Math.ceil(length/1.5));
   for(let k=0;k<=steps;k++){
    const t=k/steps,x=a.x+(z.x-a.x)*t,y=a.y+(z.y-a.y)*t;
    let nx=x-cx,ny=y-cy,l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
    // Contact normal points outward from the object's centre; invert for collision response.
    if(contactSample(b,x,y,-nx,-ny,Math.hypot(b.vx,b.vy))){contacts++;nxSum+=nx;nySum+=ny}
   }
  }
  if(contacts){
   const nx=nxSum/(Math.hypot(nxSum,nySum)||1),ny=nySum/(Math.hypot(nxSum,nySum)||1);
   const vn=b.vx*nx+b.vy*ny;
   if(vn<0){b.vx-=(1+b.restitution)*vn*nx;b.vy-=(1+b.restitution)*vn*ny}
   b.sleep=Math.hypot(b.vx,b.vy)<.12?b.sleep+1:0;
  }else b.sleep=0;
 }
 function solveCarSuspension(b){
  if(b.type!=='car')return;
  const s=b.suspension;
  for(let i=0;i<2;i++){
   const lx=i===0?-11:11,base=worldPoint(b,{x:lx,y:4.5});
   const wheelX=base.x,wheelY=base.y+s.rest+b.wheelY[i],r=3.2;
   let ground=false;
   for(let k=-2;k<=2;k++){
    const px=Math.floor(wheelX+k*1.05),py=Math.floor(wheelY+r);
    if(px<0||px>=getWidth()||py<0||py>=getHeight())continue;
    if(getCell(px,py)!==0){
     if(displaceCell?.(px,py,0,-1,b.vx,b.vy))continue;
     ground=true;break;
    }
   }
   if(ground){
    // Compress the wheel against the surface; the spring pushes the chassis upward.
    b.wheelY[i]=Math.min(-.45,b.wheelY[i]-.32);
    const springForce=clamp((-b.wheelY[i])*s.stiffness-b.wheelV[i]*s.damping,-.2,1.8);
    b.wheelV[i]=clamp(b.wheelV[i]+springForce,-2.2,2.2);
    b.wheelY[i]=clamp(b.wheelY[i]+b.wheelV[i],-4,1);
    b.vy-=springForce*.7;b.spin+=(i===0?1:-1)*springForce*.012;
    const wheelSpeed=b.vx+(i===0?1:-1)*b.spin*11;
    b.wheelSpin[i]+=wheelSpeed*.055;
    b.vx*=.999;
   }else{
    // Unloaded wheels extend back toward their rest position.
    const returnForce=clamp((-b.wheelY[i])*s.stiffness-b.wheelV[i]*s.damping,-.8,.8);
    b.wheelV[i]=clamp(b.wheelV[i]+returnForce,-2,2);
    b.wheelY[i]=clamp(b.wheelY[i]+b.wheelV[i],-4,2.5);
    b.wheelSpin[i]+=(b.vx+(i===0?1:-1)*b.spin*11)*.055;
   }
  }
 }
 function blocksParticleMove(x1,y1,x2,y2){
  for(const b of bodies){
   const a=localPoint(b,x1,y1),z=localPoint(b,x2,y2);
   if(b.type==='bucket'){
    const insideCavity=p=>Math.abs(p.x)<5.8&&p.y>-7.2&&p.y<7.5;
    const aInside=insideCavity(a),zInside=insideCavity(z);
    if(aInside&&!zInside)return true;
    if(!aInside&&zInside&&z.y< -6.5)return false;
    if(!aInside&&zInside&&z.y>=-6.5)return true;
    if(!aInside&&!zInside&&Math.abs(z.x)<7.2&&z.y> -8.5&&z.y<9)return true;
    continue;
   }
   if(b.type==='ball'){
    if(Math.hypot(z.x,z.y)<b.w*.52)return true;
   }else if(Math.abs(z.x)<b.w/2&&Math.abs(z.y)<b.h/2)return true;
  }
  return false;
 }
 function collideAirborne(b){
  const particles=getAirborne();if(!Array.isArray(particles)||!particles.length)return;
  const reach=Math.max(b.w,b.h)*.6+2;
  for(const p of particles){
   if(Math.abs(p.x-b.x)>reach||Math.abs(p.y-b.y)>reach)continue;
   const local=localPoint(b,p.x,p.y),hx=b.w/2,hy=b.h/2;
   if(Math.abs(local.x)>hx+.6||Math.abs(local.y)>hy+.6)continue;
   const px=hx+.6-Math.abs(local.x),py=hy+.6-Math.abs(local.y);
   let nx=0,ny=0,penetration;
   if(px<py){nx=local.x<0?-1:1;penetration=px}else{ny=local.y<0?-1:1;penetration=py}
   const worldNormal={x:nx*Math.cos(b.angle)-ny*Math.sin(b.angle),y:nx*Math.sin(b.angle)+ny*Math.cos(b.angle)};
   const corrected=worldPoint(b,{x:local.x+nx*(penetration+.02),y:local.y+ny*(penetration+.02)});
   p.x=corrected.x;p.y=corrected.y;
   const surface=pointVelocity(b,local),rvx=p.vx-surface.x,rvy=p.vy-surface.y,vn=rvx*worldNormal.x+rvy*worldNormal.y;
   if(vn<0){const impulse=-(1.25)*vn;p.vx+=worldNormal.x*impulse;p.vy+=worldNormal.y*impulse}
   p.vx=clamp(p.vx*.985,-16,16);p.vy=clamp(p.vy*.985,-16,16);
  }
 }
 function solveBodyContacts(){
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],ac=Math.cos(a.angle),as=Math.sin(a.angle),bc=Math.cos(b.angle),bs=Math.sin(b.angle);
   const axes=[[ac,as],[-as,ac],[bc,bs],[-bs,bc]];
   let minOverlap=Infinity,nx=0,ny=0,separated=false;
   const dx=b.x-a.x,dy=b.y-a.y;
   for(const [ax,ay] of axes){
    const ar=Math.abs(ax*ac+ay*as)*a.w/2+Math.abs(ax*(-as)+ay*ac)*a.h/2;
    const br=Math.abs(ax*bc+ay*bs)*b.w/2+Math.abs(ax*(-bs)+ay*bc)*b.h/2;
    const overlap=ar+br-Math.abs(dx*ax+dy*ay);
    if(overlap<=0){separated=true;break}
    if(overlap<minOverlap){minOverlap=overlap;const sign=dx*ax+dy*ay<0?-1:1;nx=ax*sign;ny=ay*sign}
   }
   if(separated)continue;
   const invA=1/a.mass,invB=1/b.mass,total=invA+invB;
   const correction=Math.max(0,minOverlap-.015)*.82/total;
   a.x-=nx*correction*invA;b.x+=nx*correction*invB;
   a.y-=ny*correction*invA;b.y+=ny*correction*invB;
   const ia=Math.max(.5,a.mass*(a.w*a.w+a.h*a.h)/12),ib=Math.max(.5,b.mass*(b.w*b.w+b.h*b.h)/12);
   const supportA=worldPoint(a,{x:Math.sign(nx*ac+ny*as||1)*a.w/2,y:Math.sign(-nx*as+ny*ac||1)*a.h/2}),supportB=worldPoint(b,{x:-Math.sign(nx*bc+ny*bs||1)*b.w/2,y:-Math.sign(-nx*bs+ny*bc||1)*b.h/2});
   const contactX=(supportA.x+supportB.x)/2,contactY=(supportA.y+supportB.y)/2,raX=contactX-a.x,raY=contactY-a.y,rbX=contactX-b.x,rbY=contactY-b.y;
   const avx=a.vx-a.spin*raY,avy=a.vy+a.spin*raX,bvx=b.vx-b.spin*rbY,bvy=b.vy+b.spin*rbX;
   const rvx=bvx-avx,rvy=bvy-avy,vn=rvx*nx+rvy*ny;
   if(vn>=0)continue;
   const ran=raX*ny-raY*nx,rbn=rbX*ny-rbY*nx;
   const e=Math.min(a.restitution,b.restitution),denom=total+ran*ran/ia+rbn*rbn/ib;
   const impulse=-(1+e)*vn/denom,ix=impulse*nx,iy=impulse*ny;
   a.vx-=ix*invA;a.vy-=iy*invA;b.vx+=ix*invB;b.vy+=iy*invB;
   a.spin-=(raX*iy-raY*ix)/ia;b.spin+=(rbX*iy-rbY*ix)/ib;
   const tx=-ny,ty=nx,tangent=rvx*tx+rvy*ty;
   const jt=clamp(-tangent/denom,-impulse*.24,impulse*.24);
   a.vx-=jt*tx*invA;a.vy-=jt*ty*invA;b.vx+=jt*tx*invB;b.vy+=jt*ty*invB;
   if(Math.abs(vn)>2){a.damage=Math.min(1,a.damage+Math.abs(vn)*.006);b.damage=Math.min(1,b.damage+Math.abs(vn)*.006)}
   a.sleep=b.sleep=0;
  }
 }
 function step(){
  const gravity=clamp(getGravity(),.1,3),w=getWidth(),h=getHeight();
  for(const b of bodies){
   applyGrabConstraint(b);
   b.vy=clamp(b.vy+.16*gravity,-20,20);b.vx*=.999;b.spin*=.992;
   b.x+=b.vx;b.y+=b.vy;b.angle+=b.spin;
   solveCarSuspension(b);solveTerrain(b);collideAirborne(b);
   if(b.y>h+30||b.x<-30||b.x>w+30)remove(b.id);
   if(b.sleep>10&&Math.abs(b.vx)<.08&&Math.abs(b.vy)<.08&&Math.abs(b.spin)<.008){b.vx=0;b.vy=0;b.spin=0}
  }
  solveBodyContacts();
 }
 function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function draw(ctx){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const b of bodies){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
   if(b.type==='ball'){const g=ctx.createRadialGradient(-3,-4,1,0,0,7);g.addColorStop(0,'#fff4d1');g.addColorStop(.28,'#ffbd59');g.addColorStop(1,'#b94b2b');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#612d27';ctx.lineWidth=1;ctx.stroke()}
   else if(b.type==='car'){
    ctx.fillStyle='#111923';roundRect(ctx,-17,-3,34,12,3);ctx.fillStyle='#e65355';roundRect(ctx,-16,-7,32,9,3);ctx.fillStyle='#f5b4a6';roundRect(ctx,-8,-12,16,7,2);ctx.fillStyle='#8ed7e8';roundRect(ctx,-6,-11,12,5,1);
    for(let i=0;i<2;i++){const x=i===0?-11:11,y=9.5+b.wheelY[i];ctx.save();ctx.translate(x,y);ctx.rotate(b.wheelSpin[i]);ctx.fillStyle='#20252d';ctx.beginPath();ctx.arc(0,0,3.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aeb9c7';ctx.beginPath();ctx.arc(0,0,1.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c8d1da';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-2.3,0);ctx.lineTo(2.3,0);ctx.stroke();ctx.restore()}
    ctx.strokeStyle='#7c3339';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-11,4);ctx.lineTo(-11,6.3+b.wheelY[0]);ctx.moveTo(11,4);ctx.lineTo(11,6.3+b.wheelY[1]);ctx.stroke();
    if(b.damage>.08){ctx.strokeStyle='#702f35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-6);ctx.lineTo(-1,-2);ctx.lineTo(2,-5);ctx.stroke()}
   }else if(b.type==='bucket'){
    ctx.fillStyle='#b5c3cf';ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,-8);ctx.lineTo(5,9);ctx.lineTo(-5,9);ctx.closePath();ctx.fill();ctx.strokeStyle='#526575';ctx.lineWidth=1.5;ctx.stroke();ctx.strokeStyle='#dbe6ed';ctx.beginPath();ctx.arc(0,-7,7,Math.PI,Math.PI*2);ctx.stroke()
   }else if(b.type==='crate'){ctx.fillStyle='#a86b3e';roundRect(ctx,-7.5,-7.5,15,15,1);ctx.strokeStyle='#5e3827';ctx.lineWidth=1.5;ctx.strokeRect(-6,-6,12,12);ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke()}
   else{ctx.fillStyle='#447d91';roundRect(ctx,-6.5,-8.5,13,17,3);ctx.fillStyle='#9dc4ca';ctx.fillRect(-5,-5,10,2);ctx.fillStyle='#2c5264';ctx.fillRect(-6,5,12,2)}
   ctx.restore();
  }
  if(drag){const p=worldPoint(drag.body,drag.point);ctx.strokeStyle='rgba(131,228,189,.8)';ctx.lineWidth=.8;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(drag.target.x,drag.target.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#83e4bd';ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill()}
  ctx.restore();
 }
 function serialize(){return bodies.map(b=>[b.id,b.type,+b.x.toFixed(2),+b.y.toFixed(2),+b.vx.toFixed(2),+b.vy.toFixed(2),+b.angle.toFixed(3),+b.spin.toFixed(3),+b.damage.toFixed(2),...(b.type==='car'?[...b.wheelY,...b.wheelV,...b.wheelSpin]:[])])}
 function restore(items){
  if(!Array.isArray(items))return;
  const previous=new Map(bodies.map(b=>[b.id,b])),next=[];
  for(const p of items.slice(0,60)){
   if(!Array.isArray(p)||p.length<9||typeof p[0]!=='string'||!defs[p[1]]||!p.slice(2,9).every(Number.isFinite))continue;
   let b=previous.get(p[0]);
   if(b&&b.type!==p[1])b=null;
   if(!b){const d=defs[p[1]];b={id:p[0],type:p[1],x:p[2],y:p[3],vx:0,vy:0,angle:0,spin:0,w:d.w,h:d.h,mass:d.mass,restitution:d.restitution,friction:d.friction,damage:0,sleep:0,wheelY:[0,0],wheelV:[0,0],wheelSpin:[0,0],suspension:p[1]==='car'?{rest:5,stiffness:.24,damping:.68,max:8}:null}}
   b.x=p[2];b.y=p[3];[b.vx,b.vy,b.angle,b.spin,b.damage]=p.slice(4,9);
   if(b.type==='car'&&p.length>=15)[b.wheelY[0],b.wheelY[1],b.wheelV[0],b.wheelV[1],b.wheelSpin[0],b.wheelSpin[1]]=p.slice(9,15);
   next.push(b);
  }
  bodies.splice(0,bodies.length,...next);
  if(drag&&!bodies.includes(drag.body))drag=null;
 }
 function apply(op){if(!op)return;if(op.type==='propAdd')spawn(op.kind,op.x,op.y,op.id);else if(op.type==='propDelete')remove(op.id);else if(op.type==='props')restore(op.items)}
 function clear(){bodies.length=0;drag=null}
 return{spawn,step,draw,grabAt,moveGrab,releaseGrab,blocksParticleMove,apply,serialize,restore,clear,get count(){return bodies.length},get dragging(){return !!drag}};
}
