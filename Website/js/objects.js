// PixelPhyx rigid-body system. World units are material cells; simulation advances at 60 Hz.
export function createObjectSystem({getWidth,getHeight,getGravity,getCell,displaceCell,getAirborne=()=>[],onPublish=()=>{}}){
 const bodies=[];
 const MAX_BODIES=60, SUBSTEPS=3, SOLVER_PASSES=4;
 let nextId=1,drag=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const defs={
  car:{w:32,h:9,mass:3.4,restitution:.08,friction:.82},
  bucket:{w:16,h:18,mass:1.25,restitution:.08,friction:.8},
  ball:{w:11,h:11,mass:.62,restitution:.48,friction:.96},
  crate:{w:15,h:15,mass:1.65,restitution:.12,friction:.82},
  barrel:{w:13,h:17,mass:1.35,restitution:.16,friction:.86}
 };
 const movable=new Set([1,2,5,6,7,8,9,11,14,16]);
 const invMass=b=>1/b.mass;
 const inertia=b=>Math.max(1,b.mass*(b.w*b.w+b.h*b.h)/12);
 const rotate=(x,y,a)=>({x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)});
 function localPoint(b,x,y){const p=rotate(x-b.x,y-b.y,-b.angle);return p}
 function worldPoint(b,x,y){const p=rotate(x,y,b.angle);return{x:b.x+p.x,y:b.y+p.y}}
 function pointVelocity(b,x,y){return{x:b.vx-b.spin*y,y:b.vy+b.spin*x}}
 function spawn(type,x=getWidth()/2,y=18,providedId){
  const d=defs[type];if(!d||bodies.length>=MAX_BODIES)return null;
  const car=type==='car',b={id:providedId||'prop-'+(nextId++),type,x:clamp(x,d.w/2,getWidth()-d.w/2),y:clamp(y,d.h/2,getHeight()-d.h/2),vx:0,vy:0,angle:0,spin:0,w:d.w,h:d.h,mass:d.mass,restitution:d.restitution,friction:d.friction,damage:0,sleep:0,wheelY:[0,0],wheelV:[0,0],wheelSpin:[0,0],wheelGround:[false,false]};
  bodies.push(b);return b;
 }
 function remove(id){const i=bodies.findIndex(b=>b.id===id);if(i>=0)bodies.splice(i,1);if(drag?.body.id===id)drag=null}
 function hit(b,x,y){const p=localPoint(b,x,y);if(b.type==='ball')return Math.hypot(p.x,p.y)<=b.w*.56;if(b.type==='bucket')return Math.abs(p.x)<=b.w/2&&Math.abs(p.y)<=b.h/2;return Math.abs(p.x)<=b.w/2&&Math.abs(p.y)<=b.h/2}
 function grabAt(x,y){
  let chosen=null,best=-Infinity;
  for(let i=bodies.length-1;i>=0;i--){const b=bodies[i];if(!hit(b,x,y))continue;const score=b.type==='ball'?b.w*.56-Math.hypot(x-b.x,y-b.y):Math.min(b.w/2-Math.abs(localPoint(b,x,y).x),b.h/2-Math.abs(localPoint(b,x,y).y));if(score>best){best=score;chosen=b}}
  if(!chosen)return false;
  const p=localPoint(chosen,x,y),now=performance.now();
  drag={body:chosen,point:p,target:{x,y},targetV:{x:0,y:0},last:{x,y},lastAt:now};
  chosen.sleep=0;return true;
 }
 function moveGrab(x,y){
  if(!drag||!Number.isFinite(x)||!Number.isFinite(y))return;
  const now=performance.now(),dt=clamp((now-drag.lastAt)/1000,1/240,.08);
  drag.targetV={x:clamp((x-drag.last.x)/dt,-45,45),y:clamp((y-drag.last.y)/dt,-45,45)};
  drag.last={x,y};drag.lastAt=now;drag.target={x:clamp(x,0,getWidth()),y:clamp(y,0,getHeight())};
 }
 function releaseGrab(){
  if(!drag)return;
  const b=drag.body;b.vx=clamp(b.vx+drag.targetV.x*.055,-28,28);b.vy=clamp(b.vy+drag.targetV.y*.055,-28,28);b.sleep=0;drag=null;
  onPublish({type:'props',items:serialize()});
 }
 function applyGrab(b,dt){
  if(!drag||drag.body!==b)return;
  const p=worldPoint(b,drag.point.x,drag.point.y),v=pointVelocity(b,drag.point.x,drag.point.y);
  const dx=drag.target.x-p.x,dy=drag.target.y-p.y;
  const stiffness=clamp(b.mass*.42,1.1,2.2),damping=clamp(b.mass*.7,1.8,3.5);
  const fx=clamp(dx*stiffness+(drag.targetV.x-v.x)*damping,-b.mass*18,b.mass*18);
  const fy=clamp(dy*stiffness+(drag.targetV.y-v.y)*damping,-b.mass*18,b.mass*18);
  b.vx=clamp(b.vx+fx/b.mass*dt,-32,32);b.vy=clamp(b.vy+fy/b.mass*dt,-32,32);
  b.spin=clamp(b.spin+(drag.point.x*fy-drag.point.y*fx)/inertia(b)*dt,-1.2,1.2);
  b.sleep=0;
 }
 function axes(b){const c=Math.cos(b.angle),s=Math.sin(b.angle);return[[c,s],[-s,c]]}
 function bounds(b){
  const ax=axes(b),ex=Math.abs(ax[0][0])*b.w/2+Math.abs(ax[1][0])*b.h/2,ey=Math.abs(ax[0][1])*b.w/2+Math.abs(ax[1][1])*b.h/2;
  return{minX:Math.floor(b.x-ex-1),maxX:Math.ceil(b.x+ex+1),minY:Math.floor(b.y-ey-1),maxY:Math.ceil(b.y+ey+1)};
 }
 function projectRadius(b,axis){const a=axes(b);return Math.abs(axis[0]*a[0][0]+axis[1]*a[0][1])*b.w/2+Math.abs(axis[0]*a[1][0]+axis[1]*a[1][1])*b.h/2}
 function collisionForCell(b,x,y){
  const cx=x+.5,cy=y+.5,dx=b.x-cx,dy=b.y-cy,ax=axes(b),tests=[[1,0],[0,1],ax[0],ax[1]];
  // Pixel terrain contacts should resolve against the dominant world direction.
  // Choosing the shallowest SAT axis for every edge pixel causes sideways jitter on floors.
  const axis=Math.abs(dx)>Math.abs(dy)+1.25?[Math.sign(dx)||1,0]:[0,Math.sign(dy)||1];
  const depth=projectRadius(b,axis)+.5-Math.abs(dx*axis[0]+dy*axis[1]);
  if(depth<=0)return null;
  return{depth,nx:axis[0],ny:axis[1],cx,cy};
 }
 function impulseAgainstWorld(b,c){
  // Grid contacts aggregate many tiny pixel supports; applying torque from one selected pixel
  // makes a resting box spin continuously. Keep terrain impulses through the body centre.
  const rx=0,ry=0;
  const pvx=b.vx-b.spin*ry,pvy=b.vy+b.spin*rx,vn=pvx*c.nx+pvy*c.ny;
  if(vn>=0)return;
  const rn=rx*c.ny-ry*c.nx,den=invMass(b)+rn*rn/inertia(b),j=-(1+b.restitution)*vn/den;
  b.vx+=c.nx*j*invMass(b);b.vy+=c.ny*j*invMass(b);b.spin+=(rx*c.ny-ry*c.nx)*j/inertia(b);
  const tx=-c.ny,ty=c.nx,vt=pvx*tx+pvy*ty,jt=clamp(-vt/(invMass(b)+(rx*ty-ry*tx)**2/inertia(b)),-j*b.friction,j*b.friction);
  b.vx+=tx*jt*invMass(b);b.vy+=ty*jt*invMass(b);b.vx*=.985;b.spin=clamp(b.spin,-.38,.38);
 }
 function resolveTerrain(b){
  const w=getWidth(),h=getHeight();let contacts=0;
  for(let pass=0;pass<SOLVER_PASSES;pass++){
   const box=bounds(b);let deepest=null;
   for(let y=Math.max(0,box.minY);y<=Math.min(h-1,box.maxY);y++)for(let x=Math.max(0,box.minX);x<=Math.min(w-1,box.maxX);x++){
    const material=getCell(x,y);if(!material)continue;
    const local=localPoint(b,x+.5,y+.5);
    // The bucket is a U-shaped container, not a closed rectangle.
    if(b.type==='bucket'&&(local.y< -7.15||(Math.abs(local.x)<5.65&&local.y<7.2)))continue;
    // The car's underside is open so the independently simulated wheels carry it.
    if(b.type==='car'&&local.y>2.7&&Math.abs(local.x)<14.5)continue;
    const c=collisionForCell(b,x,y);if(!c)continue;
    if(movable.has(material)&&displaceCell?.(x,y,-c.nx,-c.ny,b.vx,b.vy))continue;
    if(!deepest||c.depth>deepest.depth)deepest=c;
   }
   if(!deepest)break;
   const correction=Math.min(deepest.depth+.015,2.5);
   b.x+=deepest.nx*correction;b.y+=deepest.ny*correction;
   impulseAgainstWorld(b,deepest);contacts++;
  }
  // Keep bodies inside the world without injecting large bounce impulses.
  const ex=b.w/2,ey=b.h/2;
  if(b.x<ex){b.x=ex;b.vx=Math.max(0,b.vx)*.2;contacts++}
  if(b.x> w-ex){b.x=w-ex;b.vx=Math.min(0,b.vx)*.2;contacts++}
  if(b.y<ey){b.y=ey;b.vy=Math.max(0,b.vy)*.2;contacts++}
  if(b.y>h-ey){b.y=h-ey;b.vy=Math.min(0,b.vy)*.18;contacts++}
  if(contacts){if(Math.hypot(b.vx,b.vy)<.16&&Math.abs(b.spin)<.018)b.sleep++;else b.sleep=0}else b.sleep=0;
 }
 function bucketAllowsMove(b,from,to){
  const a=localPoint(b,from.x,from.y),z=localPoint(b,to.x,to.y);
  const inside=p=>Math.abs(p.x)<5.65&&p.y>-7.15&&p.y<7.2;
  const ai=inside(a),zi=inside(z);
  if(ai&&zi)return true;
  if(ai&&!zi)return false;
  if(!ai&&zi)return a.y< -7.15&&z.y>a.y&&Math.abs(z.x)<5.65;
  return !(Math.abs(z.x)<7.05&&z.y>-8.15&&z.y<8.8);
 }
 function blocksParticleMove(x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.3));
  for(const b of bodies)for(let i=1;i<=steps;i++){
   const t=i/steps,x=x1+dx*t,y=y1+dy*t,p=localPoint(b,x,y);
   if(b.type==='bucket'){if(!bucketAllowsMove(b,{x:x1+dx*(i-1)/steps,y:y1+dy*(i-1)/steps},{x,y}))return true;continue}
   if(b.type==='ball'){if(Math.hypot(p.x,p.y)<b.w*.49)return true}
   else if(Math.abs(p.x)<b.w/2&&Math.abs(p.y)<b.h/2)return true;
  }
  return false;
 }
 function wheelGround(b,index){
  const lx=index===0?-10.5:10.5,anchor=worldPoint(b,lx,6.4),r=3.15;
  const base=worldPoint(b,lx,6.4+b.wheelY[index]),cx=base.x,cy=base.y;
  let groundY=Infinity,materialAt=null,bestDistance=Infinity;
  // Sweep around the wheel instead of checking one row; fast falls cannot tunnel through a one-cell floor.
  for(let k=-3;k<=3;k++){
   const x=Math.floor(cx+k*.82);if(x<0||x>=getWidth())continue;
   for(let oy=-8;oy<=8;oy++){
    const y=Math.floor(cy+oy);if(y<0||y>=getHeight())continue;
    const m=getCell(x,y);if(!m)continue;
    if(movable.has(m)&&displaceCell?.(x,y,0,-1,b.vx,b.vy))continue;
    const distance=Math.abs((y+.5)-(cy+r));if(distance<bestDistance){bestDistance=distance;groundY=y;materialAt={x,y,m}}
   }
  }
  if(!materialAt)return null;
  const target=clamp(groundY+.5-r-anchor.y,-3.8,2.2);
  return{target,groundY,material:materialAt.m,r};
 }
 function solveSuspension(b,dt){
  if(b.type!=='car')return;
  for(let i=0;i<2;i++){
   const hit=wheelGround(b,i),old=b.wheelY[i];
   const wheelAccel=hit?clamp((hit.target-old)*.24-b.wheelV[i]*.48,-1.4,1.8):clamp(-old*.16-b.wheelV[i]*.32,-.7,.7);
   b.wheelV[i]=clamp(b.wheelV[i]+wheelAccel*dt,-8,8);
   b.wheelY[i]=clamp(old+b.wheelV[i]*dt,-4,2.5);
   // Compression and damping transfer force back into the chassis.
   const springForce=clamp(-b.wheelY[i]*.24-b.wheelV[i]*.48,-1.4,1.8);
   b.vy-=springForce*.9*dt;
   b.spin+=(i===0?1:-1)*springForce*.0009*dt;
   const contact=!!hit&&b.wheelY[i]>=hit.target-.12;
   b.wheelGround[i]=contact;
   if(contact){
    b.wheelY[i]=Math.min(b.wheelY[i],hit.target);
    if(b.wheelV[i]>0)b.wheelV[i]*=-.12;
    const wheelV=b.vx+(i===0?-1:1)*b.spin*10;
    b.wheelSpin[i]+=wheelV*.12;
    // Rolling resistance and a little grounded traction.
    b.vx*=.999;
   }else b.wheelSpin[i]+=(b.vx+(i===0?-1:1)*b.spin*10)*.12;
  }
 }
 function collideAirborne(b){
  const particles=getAirborne();if(!Array.isArray(particles)||!particles.length)return;
  const box=bounds(b);
  for(const p of particles){
   if(p.x<box.minX-1||p.x>box.maxX+1||p.y<box.minY-1||p.y>box.maxY+1)continue;
   const q=localPoint(b,p.x,p.y),hx=b.w/2,hy=b.h/2;
   if(b.type==='bucket'&&Math.abs(q.x)<5.65&&q.y<7.2)continue;
   if(Math.abs(q.x)>hx+.5||Math.abs(q.y)>hy+.5)continue;
   let nx=0,ny=0,depth;
   const ox=hx+.5-Math.abs(q.x),oy=hy+.5-Math.abs(q.y);
   if(ox<oy){nx=q.x<0?-1:1;depth=ox}else{ny=q.y<0?-1:1;depth=oy}
   const normal=rotate(nx,ny,b.angle),correct=worldPoint(b,q.x+nx*(depth+.01),q.y+ny*(depth+.01));
   p.x=correct.x;p.y=correct.y;
   const surface=pointVelocity(b,q.x,q.y),rvx=p.vx-surface.x,rvy=p.vy-surface.y,vn=rvx*normal.x+rvy*normal.y;
   if(vn<0){const j=-(1.12)*vn;p.vx+=normal.x*j;p.vy+=normal.y*j;b.vx-=normal.x*j*.012;b.vy-=normal.y*j*.012}
  }
 }
 function solveBodyPairs(){
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y,aa=axes(a),ba=axes(b),tests=[[1,0],[0,1],aa[0],aa[1],ba[0],ba[1]];
   let depth=Infinity,nx=0,ny=0,separated=false;
   for(const axis of tests){
    const overlap=projectRadius(a,axis)+projectRadius(b,axis)-Math.abs(dx*axis[0]+dy*axis[1]);
    if(overlap<=0){separated=true;break}
    if(overlap<depth){depth=overlap;const sign=dx*axis[0]+dy*axis[1]>=0?1:-1;nx=axis[0]*sign;ny=axis[1]*sign}
   }
   if(separated)continue;
   const ia=invMass(a),ib=invMass(b),sum=ia+ib,correction=Math.min(2,Math.max(0,depth-.01)*.72/sum);
   a.x-=nx*correction*ia;a.y-=ny*correction*ia;b.x+=nx*correction*ib;b.y+=ny*correction*ib;
   const px=(a.x+b.x)/2,py=(a.y+b.y)/2,rax=px-a.x,ray=py-a.y,rbx=px-b.x,rby=py-b.y;
   const avx=a.vx-a.spin*ray,avy=a.vy+a.spin*rax,bvx=b.vx-b.spin*rby,bvy=b.vy+b.spin*rbx,rvx=bvx-avx,rvy=bvy-avy,vn=rvx*nx+rvy*ny;
   a.sleep=b.sleep=0;
   if(vn>=0)continue;
   const ran=rax*ny-ray*nx,rbn=rbx*ny-rby*nx,den=sum+ran*ran/inertia(a)+rbn*rbn/inertia(b),e=Math.min(a.restitution,b.restitution),impulse=-(1+e)*vn/den,ix=impulse*nx,iy=impulse*ny;
   a.vx-=ix*ia;a.vy-=iy*ia;b.vx+=ix*ib;b.vy+=iy*ib;
   a.spin=clamp(a.spin-(rax*iy-ray*ix)/inertia(a),-.45,.45);b.spin=clamp(b.spin+(rbx*iy-rby*ix)/inertia(b),-.45,.45);
   const tx=-ny,ty=nx,jt=clamp(-(rvx*tx+rvy*ty)/den,-impulse*.25,impulse*.25);
   a.vx-=tx*jt*ia;a.vy-=ty*jt*ia;b.vx+=tx*jt*ib;b.vy+=ty*jt*ib;
   if(Math.abs(vn)>3){a.damage=Math.min(1,a.damage+Math.abs(vn)*.004);b.damage=Math.min(1,b.damage+Math.abs(vn)*.004)}
   a.sleep=b.sleep=0;
  }
 }
 function step(){
  const gravity=clamp(getGravity(),0,3),w=getWidth(),h=getHeight(),dt=1/SUBSTEPS;
  for(let sub=0;sub<SUBSTEPS;sub++){
   for(const b of [...bodies]){
    if(b.sleep>12&&(!drag||drag.body!==b)){b.vx=0;b.vy=0;b.spin=0;collideAirborne(b);continue;}
    applyGrab(b,dt);
    b.vy=clamp(b.vy+.16*gravity*dt,-26,26);
    b.vx*=.9995;b.spin*=.96;
    b.spin=clamp(b.spin,-.38,.38);b.vx=clamp(b.vx,-22,22);b.vy=clamp(b.vy,-22,22);
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;
    solveSuspension(b,dt);resolveTerrain(b);collideAirborne(b);
    if(b.y>h+35||b.x<-35||b.x>w+35)remove(b.id);
    if(Math.hypot(b.vx,b.vy)<.1&&Math.abs(b.spin)<.01&&(!drag||drag.body!==b))b.sleep++;
   }
   solveBodyPairs();
  }
  // Wake a body when a nearby object is moving into it.
  for(const b of bodies)if(b.sleep>0&&Math.hypot(b.vx,b.vy)>.12)b.sleep=0;
 }
 function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function draw(ctx){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const b of bodies){
   ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
   if(b.type==='ball'){
    const g=ctx.createRadialGradient(-3,-4,1,0,0,6.5);g.addColorStop(0,'#fff4d1');g.addColorStop(.28,'#ffbd59');g.addColorStop(1,'#b94b2b');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,5.7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#612d27';ctx.lineWidth=1;ctx.stroke();
   }else if(b.type==='car'){
    ctx.fillStyle='#111923';roundRect(ctx,-16,-2.5,32,8,3);ctx.fillStyle='#e65355';roundRect(ctx,-15,-6.5,30,7,3);ctx.fillStyle='#f5b4a6';roundRect(ctx,-7.5,-11.5,15,6.5,2);ctx.fillStyle='#8ed7e8';roundRect(ctx,-5.8,-10.7,11.6,4.5,1);
    for(let i=0;i<2;i++){
     const x=i===0?-10.5:10.5,y=6.4+b.wheelY[i];ctx.save();ctx.translate(x,y);ctx.rotate(b.wheelSpin[i]);ctx.fillStyle='#20252d';ctx.beginPath();ctx.arc(0,0,3.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aeb9c7';ctx.beginPath();ctx.arc(0,0,1.35,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c8d1da';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-2.2,0);ctx.lineTo(2.2,0);ctx.stroke();ctx.restore();
     ctx.strokeStyle=b.wheelGround[i]?'#c5d3df':'#687786';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,1);ctx.lineTo(x,2.2+b.wheelY[i]);ctx.stroke();
    }
    if(b.damage>.08){ctx.strokeStyle='#702f35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-5.5);ctx.lineTo(-1,-2);ctx.lineTo(2,-5);ctx.stroke()}
   }else if(b.type==='bucket'){
    ctx.fillStyle='#b5c3cf';ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,-8);ctx.lineTo(5,9);ctx.lineTo(-5,9);ctx.closePath();ctx.fill();ctx.strokeStyle='#526575';ctx.lineWidth=1.5;ctx.stroke();ctx.strokeStyle='#dbe6ed';ctx.beginPath();ctx.arc(0,-7,7,Math.PI,Math.PI*2);ctx.stroke();
   }else if(b.type==='crate'){
    ctx.fillStyle='#a86b3e';roundRect(ctx,-7.5,-7.5,15,15,1);ctx.strokeStyle='#5e3827';ctx.lineWidth=1.5;ctx.strokeRect(-6,-6,12,12);ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke();
   }else{
    ctx.fillStyle='#447d91';roundRect(ctx,-6.5,-8.5,13,17,3);ctx.fillStyle='#9dc4ca';ctx.fillRect(-5,-5,10,2);ctx.fillStyle='#2c5264';ctx.fillRect(-6,5,12,2);
   }
   ctx.restore();
  }
  if(drag){const p=worldPoint(drag.body,drag.point.x,drag.point.y);ctx.strokeStyle='rgba(131,228,189,.8)';ctx.lineWidth=.8;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(drag.target.x,drag.target.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#83e4bd';ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill()}
  ctx.restore();
 }
 function serialize(){return bodies.map(b=>[b.id,b.type,+b.x.toFixed(2),+b.y.toFixed(2),+b.vx.toFixed(2),+b.vy.toFixed(2),+b.angle.toFixed(3),+b.spin.toFixed(3),+b.damage.toFixed(2),...(b.type==='car'?[...b.wheelY,...b.wheelV,...b.wheelSpin]:[])])}
 function restore(items){
  if(!Array.isArray(items))return;
  const old=new Map(bodies.map(b=>[b.id,b])),next=[];
  for(const p of items.slice(0,MAX_BODIES)){
   if(!Array.isArray(p)||p.length<9||typeof p[0]!=='string'||!defs[p[1]]||!p.slice(2,9).every(Number.isFinite))continue;
   const d=defs[p[1]];let b=old.get(p[0]);if(b&&b.type!==p[1])b=null;
   if(!b)b={id:p[0],type:p[1],x:p[2],y:p[3],vx:0,vy:0,angle:0,spin:0,w:d.w,h:d.h,mass:d.mass,restitution:d.restitution,friction:d.friction,damage:0,sleep:0,wheelY:[0,0],wheelV:[0,0],wheelSpin:[0,0],wheelGround:[false,false]};
   if(drag?.body===b){b.x+=(p[2]-b.x)*.18;b.y+=(p[3]-b.y)*.18;b.vx+=(p[4]-b.vx)*.18;b.vy+=(p[5]-b.vy)*.18;b.angle+=(p[6]-b.angle)*.18;b.spin+=(p[7]-b.spin)*.18}
   else{b.x=p[2];b.y=p[3];b.vx=p[4];b.vy=p[5];b.angle=p[6];b.spin=p[7]}
   b.damage=p[8];if(b.type==='car'&&p.length>=15)[b.wheelY[0],b.wheelY[1],b.wheelV[0],b.wheelV[1],b.wheelSpin[0],b.wheelSpin[1]]=p.slice(9,15);
   next.push(b);
  }
  bodies.splice(0,bodies.length,...next);if(drag&&!bodies.includes(drag.body))drag=null;
 }
 function apply(op){if(!op)return;if(op.type==='propAdd')spawn(op.kind,op.x,op.y,op.id);else if(op.type==='propDelete')remove(op.id);else if(op.type==='props')restore(op.items)}
 function clear(){bodies.length=0;drag=null}
 return{spawn,step,draw,grabAt,moveGrab,releaseGrab,blocksParticleMove,apply,serialize,restore,clear,get count(){return bodies.length},get dragging(){return !!drag}};
}