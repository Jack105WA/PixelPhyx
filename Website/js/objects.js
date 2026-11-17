import {drawObjectBodies} from './object-renderer.js';
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
 function hit(b,x,y){const p=localPoint(b,x,y);if(b.type==='ball')return Math.hypot(p.x,p.y)<=b.w*.56;if(Math.abs(p.x)<=b.w/2&&Math.abs(p.y)<=b.h/2)return true;if(b.type==='car')for(let i=0;i<2;i++){const wx=i===0?-10.5:10.5,wy=7.5+b.wheelY[i];if(Math.hypot(p.x-wx,p.y-wy)<=3.15)return true}return false}
 function grabAt(x,y){
  let chosen=null,best=-Infinity;
  for(let i=bodies.length-1;i>=0;i--){const b=bodies[i],p=localPoint(b,x,y);if(!hit(b,x,y))continue;let score=b.type==='ball'?b.w*.56-Math.hypot(p.x,p.y):Math.min(b.w/2-Math.abs(p.x),b.h/2-Math.abs(p.y));if(b.type==='car')for(let k=0;k<2;k++){const wx=k===0?-10.5:10.5,wy=7.5+b.wheelY[k];score=Math.max(score,3.15-Math.hypot(p.x-wx,p.y-wy))}if(score>best){best=score;chosen=b}}
  if(!chosen)return false;
  const p=localPoint(chosen,x,y),now=Date.now();
  drag={body:chosen,point:p,target:{x,y},targetV:{x:0,y:0},last:{x,y},lastAt:now};
  chosen.sleep=0;return true;
 }
 function moveGrab(x,y){
  if(!drag||!Number.isFinite(x)||!Number.isFinite(y))return;
  const now=Date.now(),dt=clamp((now-drag.lastAt)/1000,1/240,.08);
  drag.targetV={x:clamp((x-drag.last.x)/dt/60,-20,20),y:clamp((y-drag.last.y)/dt/60,-20,20)};
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
  const stiffness=.28,damping=.95;
  const fx=clamp(dx*stiffness+(drag.targetV.x-v.x)*damping,-b.mass*5,b.mass*5);
  const fy=clamp(dy*stiffness+(drag.targetV.y-v.y)*damping,-b.mass*4,b.mass*4);
  b.vx=clamp(b.vx+fx/b.mass*dt,-32,32);b.vy=clamp(b.vy+fy/b.mass*dt,-32,32);
  b.spin=clamp(b.spin+(drag.point.x*fy-drag.point.y*fx)/inertia(b)*dt,-.8,.8);
  // Pointer velocity is a short-lived target, not a force that persists after the mouse stops.
  drag.targetV.x*=.72;drag.targetV.y*=.72;
  b.sleep=0;
 }
 function axes(b){const c=Math.cos(b.angle),s=Math.sin(b.angle);return[[c,s],[-s,c]]}
 function bounds(b){
  const ax=axes(b),minY=b.type==='car'?-b.h/2:-b.h/2,maxY=b.type==='car'?Math.max(b.h/2,7.5+Math.max(...b.wheelY)+3.15):b.h/2;
  const centerY=(minY+maxY)/2,halfY=(maxY-minY)/2,c=worldPoint(b,0,centerY);
  const ex=Math.abs(ax[0][0])*b.w/2+Math.abs(ax[1][0])*halfY,ey=Math.abs(ax[0][1])*b.w/2+Math.abs(ax[1][1])*halfY;
  return{minX:Math.floor(c.x-ex-1),maxX:Math.ceil(c.x+ex+1),minY:Math.floor(c.y-ey-1),maxY:Math.ceil(c.y+ey+1)};
 }
 function projectRadius(b,axis){const a=axes(b),x=axis.x??axis[0],y=axis.y??axis[1];return Math.abs(x*a[0][0]+y*a[0][1])*b.w/2+Math.abs(x*a[1][0]+y*a[1][1])*b.h/2}
 function collisionForCell(b,x,y){
  const cx=x+.5,cy=y+.5,dx=b.x-cx,dy=b.y-cy,bodyAxes=axes(b);
  // Full OBB-vs-grid-cell SAT. A grid cell is a square, so its projected
  // radius changes with the axis; using a fixed .5 misses rotated contacts.
  const tests=[[0,1],[1,0],bodyAxes[0],bodyAxes[1]];
  let depth=Infinity,nx=0,ny=0;
  for(const axis of tests){
   const ax=axis[0],ay=axis[1];
   const cellRadius=.5*(Math.abs(ax)+Math.abs(ay));
   const overlap=projectRadius(b,axis)+cellRadius-Math.abs(dx*ax+dy*ay);
   if(overlap<=0)return null;
   if(overlap<depth){
    depth=overlap;
    const projection=dx*ax+dy*ay;
    const sign=projection>1e-8?1:projection< -1e-8?-1:(Math.abs(ay)>.5?-1:1);
    nx=ax*sign;ny=ay*sign;
   }
  }
  return{depth,nx,ny,cx,cy};
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
  const wallX=y=>7-(y+8)*2/17;
  const inside=p=>p.y> -7.5&&p.y<8.5&&Math.abs(p.x)<wallX(p.y)-.35;
  const ai=inside(a),zi=inside(z);
  if(ai&&zi)return true;
  if(ai&&!zi)return false;
  if(!ai&&z.y<= -7.5&&Math.abs(z.x)<6.5)return true;
  if(!ai&&zi)return a.y< -7.5&&z.y>a.y&&Math.abs(z.x)<wallX(z.y)-.35;
  return !(Math.abs(z.x)<8&&z.y> -8&&z.y<9.2);
 }
 function blocksParticleMove(x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.3));
  for(const b of bodies){
   if(b.type==='bucket'){let prev={x:x1,y:y1};for(let i=1;i<=steps;i++){const t=i/steps,next={x:x1+dx*t,y:y1+dy*t};if(!bucketAllowsMove(b,prev,next))return true;prev=next}continue}
   const solid=q=>{if(b.type==='ball')return Math.hypot(q.x,q.y)<b.w*.49;if(Math.abs(q.x)<b.w/2&&Math.abs(q.y)<b.h/2)return true;if(b.type==='car')for(let k=0;k<2;k++){const wx=k===0?-10.5:10.5,wy=7.5+b.wheelY[k];if(Math.hypot(q.x-wx,q.y-wy)<3.15)return true}return false};
   const from=localPoint(b,x1,y1),to=localPoint(b,x2,y2),starts=solid(from),ends=solid(to);
   if(starts&&!ends)continue;
   if(!starts&&ends)return true;
   for(let i=1;i<steps;i++){const t=i/steps;if(solid(localPoint(b,x1+dx*t,y1+dy*t)))return true}
  }
  return false;
 }
 function wheelGround(b,index){
  const lx=index===0?-10.5:10.5,r=3.15;
  const anchor=worldPoint(b,lx,7.5),wheel=worldPoint(b,lx,7.5+b.wheelY[index]);
  const cx=wheel.x,cy=wheel.y;
  let groundY=Infinity,material=null;
  const minX=Math.max(0,Math.floor(cx-r)),maxX=Math.min(getWidth()-1,Math.floor(cx+r));
  const minY=Math.max(0,Math.floor(cy-r-8)),maxY=Math.min(getHeight()-1,Math.ceil(cy+r+8));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const m=getCell(x,y);if(!m)continue;
   const nearestX=clamp(cx,x,x+1),horizontal=cx-nearestX,vertical=y-cy;
   if(Math.abs(horizontal)>=r||vertical>r+.5)continue;
   // A wheel may already have crossed the surface during a fast fall. Accept
   // that penetration only while descending so the suspension can recover it.
   if(vertical<0){if(b.vy<=0)continue}
   else if(vertical<.25||horizontal*horizontal+vertical*vertical>r*r+.35)continue;
   if(movable.has(m)&&displaceCell?.(x,y,0,1,b.vx,b.vy))continue;
   if(y<groundY){groundY=y;material=m}
  }
  if(!material)return null;
  const rawTarget=groundY-r-anchor.y;
  return{rawTarget,target:clamp(rawTarget,-3.8,2.2),groundY,material,r};
 }
 function solveSuspension(b,dt){
  if(b.type!=='car')return;
  const hits=[wheelGround(b,0),wheelGround(b,1)];
  let correction=0;
  for(const hit of hits)if(hit)correction=Math.min(correction,hit.rawTarget+3.8);
  if(correction<0){
   b.y+=correction;
   if(b.vy>0)b.vy=0;
  }
  for(let i=0;i<2;i++){
   const hit=hits[i],old=b.wheelY[i];
   const target=hit?clamp(hit.rawTarget-correction,-3.8,2.2):0;
   const wheelAccel=hit?clamp((target-old)*.3-b.wheelV[i]*.62,-1.2,1.4):clamp(-old*.18-b.wheelV[i]*.38,-.7,.7);
   b.wheelV[i]=clamp(b.wheelV[i]+wheelAccel*dt,-5,5);
   b.wheelY[i]=clamp(old+b.wheelV[i]*dt,-4,2.5);
   if(hit&&b.wheelY[i]>target){b.wheelY[i]=target;if(b.wheelV[i]>0)b.wheelV[i]=0}
   const springForce=clamp(-b.wheelY[i]*.18-b.wheelV[i]*.24,-.8,.8);
   // Match chassis support to the world's per-frame gravity, avoiding the
   // weak spring force that previously let the car sink through flat ground.
   b.vy-=springForce*.4*dt;
   b.wheelGround[i]=!!hit;
   if(hit&&b.wheelV[i]>0)b.wheelV[i]*=-.08;
   b.wheelSpin[i]+=(b.vx+(i===0?-1:1)*b.spin*10)*.12;
  }
 }
 function collideAirborne(b){
  const particles=getAirborne();if(!Array.isArray(particles)||!particles.length)return;
  const box=bounds(b);
  for(const p of particles){
   if(p.x<box.minX-1||p.x>box.maxX+1||p.y<box.minY-1||p.y>box.maxY+1)continue;
   const q=localPoint(b,p.x,p.y),hx=b.w/2,hy=b.h/2;
   if(b.type==='bucket'){
    const wallX=7-(q.y+8)*2/17,inside=q.y> -7.5&&Math.abs(q.x)<wallX;
    if(q.y> -7.5&&q.y<8.5&&Math.abs(q.x)>wallX-.55){
     const side=Math.sign(q.x)||1,limit=wallX+(inside?-.56:.56);
     q.x=side*limit;
     const normal=rotate(side*(inside?-1:1),0,b.angle),surface=pointVelocity(b,q.x,q.y),vn=(p.vx-surface.x)*normal.x+(p.vy-surface.y)*normal.y;
     if(vn<0){p.vx-=1.08*vn*normal.x;p.vy-=1.08*vn*normal.y}
     const corrected=worldPoint(b,q.x,q.y);p.x=corrected.x;p.y=corrected.y;continue;
    }
    if(inside&&q.y>8){
     q.y=8;const normal=rotate(0,-1,b.angle),surface=pointVelocity(b,q.x,q.y),vn=(p.vx-surface.x)*normal.x+(p.vy-surface.y)*normal.y;
     if(vn<0){p.vx-=1.08*vn*normal.x;p.vy-=1.08*vn*normal.y}
     const corrected=worldPoint(b,q.x,q.y);p.x=corrected.x;p.y=corrected.y;continue;
    }
    if(inside)continue;
   }
   if(b.type==='car'){
    let wheelHit=false;
    for(let wheel=0;wheel<2;wheel++){
     const wx=wheel===0?-10.5:10.5,wy=7.5+b.wheelY[wheel],dx=q.x-wx,dy=q.y-wy,distance=Math.hypot(dx,dy);
     if(distance>=3.65)continue;
     const nx=distance>1e-7?dx/distance:0,ny=distance>1e-7?dy/distance:-1;
     const normal=rotate(nx,ny,b.angle),surface=pointVelocity(b,wx,wy);
     const corrected=worldPoint(b,wx+nx*3.66,wy+ny*3.66);p.x=corrected.x;p.y=corrected.y;
     const rvx=p.vx-surface.x,rvy=p.vy-surface.y,vn=rvx*normal.x+rvy*normal.y;
     if(vn<0){const impulse=-1.12*vn;p.vx+=normal.x*impulse;p.vy+=normal.y*impulse;b.vx-=normal.x*impulse*.012;b.vy-=normal.y*impulse*.012}
     wheelHit=true;break;
    }
    if(wheelHit)continue;
   }
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
   const ra=projectRadius(a,[nx,ny]),rb=projectRadius(b,[nx,ny]);
   const px=(a.x+nx*ra+b.x-nx*rb)/2,py=(a.y+ny*ra+b.y-ny*rb)/2;
   const rax=px-a.x,ray=py-a.y,rbx=px-b.x,rby=py-b.y;
   const avx=a.vx-a.spin*ray,avy=a.vy+a.spin*rax,bvx=b.vx-b.spin*rby,bvy=b.vy+b.spin*rbx,rvx=bvx-avx,rvy=bvy-avy,vn=rvx*nx+rvy*ny;
   a.sleep=b.sleep=0;
   if(vn>=0)continue;
   const ran=rax*ny-ray*nx,rbn=rbx*ny-rby*nx,den=sum+ran*ran/inertia(a)+rbn*rbn/inertia(b),e=Math.min(a.restitution,b.restitution),impulse=-(1+e)*vn/den,ix=impulse*nx,iy=impulse*ny;
   a.vx-=ix*ia;a.vy-=iy*ia;b.vx+=ix*ib;b.vy+=iy*ib;
   a.spin=clamp(a.spin-(rax*iy-ray*ix)/inertia(a),-.45,.45);b.spin=clamp(b.spin+(rbx*iy-rby*ix)/inertia(b),-.45,.45);
   const tx=-ny,ty=nx,rat=rax*ty-ray*tx,rbt=rbx*ty-rby*tx;
   const tangentDen=sum+rat*rat/inertia(a)+rbt*rbt/inertia(b);
   const jt=clamp(-(rvx*tx+rvy*ty)/tangentDen,-impulse*.25,impulse*.25);
   a.vx-=tx*jt*ia;a.vy-=ty*jt*ia;b.vx+=tx*jt*ib;b.vy+=ty*jt*ib;
   a.spin=clamp(a.spin-rat*jt/inertia(a),-.45,.45);b.spin=clamp(b.spin+rbt*jt/inertia(b),-.45,.45);
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
 function draw(ctx){drawObjectBodies(ctx,bodies,drag,worldPoint)}
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