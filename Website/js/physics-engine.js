// Unified particle and rope solver. All rope constraints and particle contacts share this step.
export function createPhysicsEngine(){
 const BUCKET=4,RADIUS=1.35,MAX_POINTS=120,MAX_ROPES=20;
 let buckets=new Map(),segments=[],candidates=new Set();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const key=(x,y)=>y*1000+x;
 function closest(px,py,s){
  const dx=s.bx-s.ax,dy=s.by-s.ay,l=dx*dx+dy*dy,t=l?clamp(((px-s.ax)*dx+(py-s.ay)*dy)/l,0,1):0;
  const x=s.ax+dx*t,y=s.ay+dy*t;return{x,y,t,dx:px-x,dy:py-y,distance:Math.hypot(px-x,py-y)};
 }
 function rebuildIndex(ropes){
  buckets.clear();segments.length=0;
  for(const rope of ropes){const p=rope.points;if(!Array.isArray(p)||p.length<2||p.length>MAX_POINTS)continue;
   for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];if(![a.x,a.y,b.x,b.y].every(Number.isFinite))continue;
    const s={ax:a.x+.5,ay:a.y+.5,bx:b.x+.5,by:b.y+.5,oldAx:(Number.isFinite(a.ox)?a.ox:a.x)+.5,oldAy:(Number.isFinite(a.oy)?a.oy:a.y)+.5,oldBx:(Number.isFinite(b.ox)?b.ox:b.x)+.5,oldBy:(Number.isFinite(b.oy)?b.oy:b.y)+.5,a,b};segments.push(s);
    for(let y=Math.floor((Math.min(s.ay,s.by,s.oldAy,s.oldBy)-RADIUS)/BUCKET);y<=Math.floor((Math.max(s.ay,s.by,s.oldAy,s.oldBy)+RADIUS)/BUCKET);y++)
     for(let x=Math.floor((Math.min(s.ax,s.bx,s.oldAx,s.oldBx)-RADIUS)/BUCKET);x<=Math.floor((Math.max(s.ax,s.bx,s.oldAx,s.oldBx)+RADIUS)/BUCKET);x++){
      const k=key(x,y);let list=buckets.get(k);if(!list)buckets.set(k,list=[]);list.push(s);
     }
   }
  }
 }
 function nearby(minX,minY,maxX,maxY){
  candidates.clear();
  for(let y=Math.floor(minY/BUCKET);y<=Math.floor(maxY/BUCKET);y++)for(let x=Math.floor(minX/BUCKET);x<=Math.floor(maxX/BUCKET);x++){
   const list=buckets.get(key(x,y));if(list)for(const s of list)candidates.add(s);
  }
  return candidates;
 }
 function segmentDistance(ax,ay,bx,by,cx,cy,dx,dy){
  const cross=(x1,y1,x2,y2)=>x1*y2-y1*x2;
  const rx=bx-ax,ry=by-ay,sx=dx-cx,sy=dy-cy,den=cross(rx,ry,sx,sy);
  if(Math.abs(den)>1e-9){
   const qx=cx-ax,qy=cy-ay,t=cross(qx,qy,sx,sy)/den,u=cross(qx,qy,rx,ry)/den;
   if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  const pointDistance=(px,py,x1,y1,x2,y2)=>{
   const vx=x2-x1,vy=y2-y1,l=vx*vx+vy*vy,t=l?clamp(((px-x1)*vx+(py-y1)*vy)/l,0,1):0;
   return Math.hypot(px-(x1+vx*t),py-(y1+vy*t));
  };
  return Math.min(pointDistance(ax,ay,cx,cy,dx,dy),pointDistance(bx,by,cx,cy,dx,dy),pointDistance(cx,cy,ax,ay,bx,by),pointDistance(dx,dy,ax,ay,bx,by));
 }
 function blocksMove(x1,y1,x2,y2){
  if(!segments.length)return false;
  const minX=Math.min(x1,x2)-RADIUS,minY=Math.min(y1,y2)-RADIUS,maxX=Math.max(x1,x2)+RADIUS,maxY=Math.max(y1,y2)+RADIUS;
  const travel=Math.hypot(x2-x1,y2-y1);
  for(const s of nearby(minX,minY,maxX,maxY)){
   // Treat both the particle and rope as swept capsules. This is deliberately
   // conservative: a particle cannot step across a rope, even during fast motion.
   const ropeTravel=Math.max(Math.hypot(s.ax-s.oldAx,s.ay-s.oldAy),Math.hypot(s.bx-s.oldBx,s.by-s.oldBy));
   const steps=Math.max(1,Math.min(48,Math.ceil((travel+ropeTravel)*4)));
   for(let i=0;i<=steps;i++){
    const t=i/steps;
    const ax=s.oldAx+(s.ax-s.oldAx)*t,ay=s.oldAy+(s.ay-s.oldAy)*t;
    const bx=s.oldBx+(s.bx-s.oldBx)*t,by=s.oldBy+(s.by-s.oldBy)*t;
    if(segmentDistance(x1,y1,x2,y2,ax,ay,bx,by)<=RADIUS)return true;
   }
  }
  return false;
 }
 function collideSolid(n,cells,w,h){
  n.x=clamp(n.x,.5,w-.5);n.y=clamp(n.y,.5,h-.5);
  const x=Math.floor(n.x),y=Math.floor(n.y),m=cells[y*w+x];
  if(m!==3&&m!==4&&m!==10&&m!==12&&m!==15)return;
  const d=[n.x-x,x+1-n.x,n.y-y,y+1-n.y],side=d.indexOf(Math.min(...d));
  if(side===0){n.x=x-.002;n.px=n.x}else if(side===1){n.x=x+1.002;n.px=n.x}
  else if(side===2){n.y=y-.002;n.py=n.y}else{n.y=y+1.002;n.py=n.y}
 }
 function solveRopes(ropes,cells,w,h,gravity){
  const substeps=2,passes=40,dt=1/substeps;
  for(const rope of ropes){const p=rope.points;if(!Array.isArray(p)||p.length<2||p.length>MAX_POINTS)continue;
   for(const n of p){n.ox=n.x;n.oy=n.y}
   const rest=Number.isFinite(rope.length)&&rope.length>0?rope.length:1;
   for(let sub=0;sub<substeps;sub++){
    for(const n of p){if(n.anchor){n.px=n.x;n.py=n.y;continue}
     const vx=(n.x-n.px)*.995,vy=(n.y-n.py)*.995;n.px=n.x;n.py=n.y;
     n.x+=vx;n.y+=vy+.22*gravity*dt*dt;collideSolid(n,cells,w,h);
    }
    for(let pass=0;pass<passes;pass++){
     for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],wa=a.anchor?0:1,wb=b.anchor?0:1,sum=wa+wb;if(!sum)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<1e-7)continue;
      const error=(d-rest)/d*.86;
      if(wa){a.x+=dx*error*wa/sum;a.y+=dy*error*wa/sum}
      if(wb){b.x-=dx*error*wb/sum;b.y-=dy*error*wb/sum}
     }
     for(let i=1;i<p.length-1;i++)collideSolid(p[i],cells,w,h);
    }
   }
  }
 }
 function solveContacts(ropes,cells,w,h,vx,vy){
  rebuildIndex(ropes);if(!segments.length)return;
  const mass=m=>m===1?1.6:m===2?1:m===3||m===15?2.7:m===4?.65:m===6?.82:m===7?1.1:m===10?.92:m===11?2.5:m===12?1.1:m===14?1.9:m===16?.85:.35;
  const contacts=new Map();
  for(const s of segments){
   const oldSegment={ax:s.a.px+.5,ay:s.a.py+.5,bx:s.b.px+.5,by:s.b.py+.5};
   const x0=Math.max(0,Math.floor(Math.min(s.ax,s.bx,oldSegment.ax,oldSegment.bx)-1)),x1=Math.min(w-1,Math.ceil(Math.max(s.ax,s.bx,oldSegment.ax,oldSegment.bx)+1));
   const y0=Math.max(0,Math.floor(Math.min(s.ay,s.by,oldSegment.ay,oldSegment.by)-1)),y1=Math.min(h-1,Math.ceil(Math.max(s.ay,s.by,oldSegment.ay,oldSegment.by)+1));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x,m=cells[i];if(!m)continue;
    const px=x+.5,py=y+.5,qOld=closest(px,py,oldSegment);let qBest=null;
    for(let sample=0;sample<=6;sample++){const t=sample/6,interpolated={ax:oldSegment.ax+(s.ax-oldSegment.ax)*t,ay:oldSegment.ay+(s.ay-oldSegment.ay)*t,bx:oldSegment.bx+(s.bx-oldSegment.bx)*t,by:oldSegment.by+(s.by-oldSegment.by)*t};const q=closest(px,py,interpolated);if(!qBest||q.distance<qBest.distance)qBest=q}
    if(!qBest||qBest.distance>=RADIUS)continue;
    const q=qOld.distance>1e-5&&qBest.distance>1e-5&&qOld.dx*qBest.dx+qOld.dy*qBest.dy<0?qOld:qBest;
    const old=contacts.get(i);if(!old||qBest.distance<old.distance)contacts.set(i,{i,m,s,q,distance:qBest.distance});
   }
  }
  for(const {i,m,s,q} of contacts.values()){
   let nx,ny;if(q.distance>1e-5){nx=q.dx/q.distance;ny=q.dy/q.distance}
   else{
    const dx=s.bx-s.ax,dy=s.by-s.ay,l=Math.hypot(dx,dy)||1;nx=-dy/l;ny=dx/l;
    const nodeVx=(s.a.x-s.a.px)*(1-q.t)+(s.b.x-s.b.px)*q.t;
    const nodeVy=(s.a.y-s.a.py)*(1-q.t)+(s.b.y-s.b.py)*q.t;
    if((vx[i]-nodeVx)*nx+(vy[i]-nodeVy)*ny>0){nx=-nx;ny=-ny}
   }
   const rvx=vx[i]-((s.a.x-s.a.px)*(1-q.t)+(s.b.x-s.b.px)*q.t);
   const rvy=vy[i]-((s.a.y-s.a.py)*(1-q.t)+(s.b.y-s.b.py)*q.t);
   const vn=rvx*nx+rvy*ny;if(vn>=0)continue;
   const pm=mass(m),rm=1.8,e=(m===2||m===6||m===7)?.12:(m===1||m===14||m===16)?.28:.2;
   const impulse=-(1+e)*vn/(1/pm+1/rm);vx[i]+=impulse/pm*nx;vy[i]+=impulse/pm*ny;
   const tx=-ny,ty=nx,friction=clamp(-(rvx*tx+rvy*ty)*.12,-impulse*.18,impulse*.18);
   vx[i]=clamp(vx[i]+friction/pm*tx,-10,10);vy[i]=clamp(vy[i]+friction/pm*ty,-10,10);
  }
 }
 function makeRope(a,b,id,w=640,h=360){
  if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))return null;
  const x0=clamp(a.x,0,w-1),y0=clamp(a.y,0,h-1),x1=clamp(b.x,0,w-1),y1=clamp(b.y,0,h-1),distance=Math.hypot(x1-x0,y1-y0);
  if(distance<.001)return null;
  const count=Math.max(3,Math.min(MAX_POINTS-1,Math.ceil(distance/1.5))),points=[];
  for(let i=0;i<=count;i++){const t=i/count,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;points.push({x,y,px:x,py:y,sx:x,sy:y,anchor:i===0||i===count,sweepAge:0})}
  return{id,points,length:distance/count,stiffness:1};
 }
 function step({ropes,cells,width,height,gravity=1,velocityX,velocityY}){if(!Array.isArray(ropes)||ropes.length>MAX_ROPES)return;solveRopes(ropes,cells,width,height,gravity);solveContacts(ropes,cells,width,height,velocityX,velocityY)}
 return{step,blocksMove,rebuildIndex,makeRope};
}
