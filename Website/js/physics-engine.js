// Continuous airborne particle solver with a grid-backed material world.
export function createPhysicsEngine(){
 const BUCKET=4,RADIUS=1.35,MAX_POINTS=120,MAX_ROPES=20,MAX_AIRBORNE=5000;
 let buckets=new Map(),segments=[],candidates=new Set();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const key=(x,y)=>y*1000+x;
 const closest=(px,py,s)=>{
  const dx=s.bx-s.ax,dy=s.by-s.ay,l=dx*dx+dy*dy,t=l?clamp(((px-s.ax)*dx+(py-s.ay)*dy)/l,0,1):0;
  const x=s.ax+dx*t,y=s.ay+dy*t;return{x,y,t,dx:px-x,dy:py-y,distance:Math.hypot(px-x,py-y)};
 };
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
  const cross=(x1,y1,x2,y2)=>x1*y2-y1*x2,rx=bx-ax,ry=by-ay,sx=dx-cx,sy=dy-cy,den=cross(rx,ry,sx,sy);
  if(Math.abs(den)>1e-9){const qx=cx-ax,qy=cy-ay,t=cross(qx,qy,sx,sy)/den,u=cross(qx,qy,rx,ry)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return 0}
  const pd=(px,py,x1,y1,x2,y2)=>{const vx=x2-x1,vy=y2-y1,l=vx*vx+vy*vy,t=l?clamp(((px-x1)*vx+(py-y1)*vy)/l,0,1):0;return Math.hypot(px-x1-vx*t,py-y1-vy*t)};
  return Math.min(pd(ax,ay,cx,cy,dx,dy),pd(bx,by,cx,cy,dx,dy),pd(cx,cy,ax,ay,bx,by),pd(dx,dy,ax,ay,bx,by));
 }
 function blocksMove(x1,y1,x2,y2){
  if(!segments.length)return false;
  for(const s of nearby(Math.min(x1,x2)-RADIUS,Math.min(y1,y2)-RADIUS,Math.max(x1,x2)+RADIUS,Math.max(y1,y2)+RADIUS)){
   const rm=Math.max(Math.hypot(s.ax-s.oldAx,s.ay-s.oldAy),Math.hypot(s.bx-s.oldBx,s.by-s.oldBy)),pm=Math.hypot(x2-x1,y2-y1),steps=clamp(Math.ceil((rm+pm)/.3),2,64);
   for(let k=0;k<steps;k++){const t=(k+.5)/steps,px=x1+(x2-x1)*t,py=y1+(y2-y1)*t,ax=s.oldAx+(s.ax-s.oldAx)*t,ay=s.oldAy+(s.ay-s.oldAy)*t,bx=s.oldBx+(s.bx-s.oldBx)*t,by=s.oldBy+(s.by-s.oldBy)*t;if(closest(px,py,{ax,ay,bx,by}).distance<RADIUS)return true}
  }
  return false;
 }
 function collideRopeNode(n,cells,w,h){
  n.x=clamp(n.x,.5,w-.5);n.y=clamp(n.y,.5,h-.5);
  const x=Math.floor(n.x),y=Math.floor(n.y),m=cells[y*w+x];if(m!==3&&m!==4&&m!==10&&m!==12&&m!==15)return;
  const d=[n.x-x,x+1-n.x,n.y-y,y+1-n.y],side=d.indexOf(Math.min(...d));
  if(side===0){n.x=x-.002;n.px=n.x}else if(side===1){n.x=x+1.002;n.px=n.x}else if(side===2){n.y=y-.002;n.py=n.y}else{n.y=y+1.002;n.py=n.y}
 }
 function solveRopes(ropes,cells,w,h,gravity){
  const substeps=2,passes=10,dt=1/substeps;
  for(const rope of ropes){const p=rope.points;if(!Array.isArray(p)||p.length<2||p.length>MAX_POINTS)continue;
   for(const n of p)if(!n.dragMoved){n.ox=n.x;n.oy=n.y}
   const rest=Number.isFinite(rope.length)&&rope.length>0?rope.length:1;
   for(let sub=0;sub<substeps;sub++){
    for(const n of p){if(n.anchor){n.px=n.x;n.py=n.y;continue}const vx=(n.x-n.px)*.995,vy=(n.y-n.py)*.995;n.px=n.x;n.py=n.y;n.x+=vx;n.y+=vy+.22*gravity*dt*dt;collideRopeNode(n,cells,w,h)}
    for(let pass=0;pass<passes;pass++){
     for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],wa=a.anchor?0:1,wb=b.anchor?0:1,sum=wa+wb;if(!sum)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<1e-7)continue;const error=(d-rest)/d*.86;if(wa){a.x+=dx*error*wa/sum;a.y+=dy*error*wa/sum}if(wb){b.x-=dx*error*wb/sum;b.y-=dy*error*wb/sum}}
     for(let i=1;i<p.length-1;i++)collideRopeNode(p[i],cells,w,h);
    }
   }
  }
 }
 function solveGridContacts(ropes,cells,w,h,vx,vy){
  rebuildIndex(ropes);if(!segments.length)return;
  const mass=m=>m===1?1.6:m===2?1:m===3||m===15?2.7:m===4?.65:m===6?.82:m===7?1.1:m===10?.92:m===11?2.5:m===12?1.1:m===14?1.9:m===16?.85:.35,contacts=new Map();
  for(const s of segments){
   const old={ax:s.a.px+.5,ay:s.a.py+.5,bx:s.b.px+.5,by:s.b.py+.5};
   const x0=Math.max(0,Math.floor(Math.min(s.ax,s.bx,old.ax,old.bx)-1)),x1=Math.min(w-1,Math.ceil(Math.max(s.ax,s.bx,old.ax,old.bx)+1)),y0=Math.max(0,Math.floor(Math.min(s.ay,s.by,old.ay,old.by)-1)),y1=Math.min(h-1,Math.ceil(Math.max(s.ay,s.by,old.ay,old.by)+1));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x,m=cells[i];if(!m)continue;const q=closest(x+.5,y+.5,s);if(q.distance>=RADIUS)continue;const prev=contacts.get(i);if(!prev||q.distance<prev.q.distance)contacts.set(i,{i,m,s,q})}
  }
  for(const {i,m,s,q} of contacts.values()){
   let nx,ny;if(q.distance>1e-5){nx=q.dx/q.distance;ny=q.dy/q.distance}else{const dx=s.bx-s.ax,dy=s.by-s.ay,l=Math.hypot(dx,dy)||1;nx=-dy/l;ny=dx/l}
   const nvx=(s.a.x-s.a.px)*(1-q.t)+(s.b.x-s.b.px)*q.t,nvy=(s.a.y-s.a.py)*(1-q.t)+(s.b.y-s.b.py)*q.t,rvx=vx[i]-nvx,rvy=vy[i]-nvy,vn=rvx*nx+rvy*ny;if(vn>=0)continue;
   const pm=mass(m),impulse=-(1+.22)*vn/(1/pm+1/1.8);vx[i]+=impulse/pm*nx;vy[i]+=impulse/pm*ny;
   const tx=-ny,ty=nx,friction=clamp(-(rvx*tx+rvy*ty)*.12,-impulse*.18,impulse*.18);vx[i]=clamp(vx[i]+friction/pm*tx,-12,12);vy[i]=clamp(vy[i]+friction/pm*ty,-12,12);
  }
 }
 function pushParticlesFromRopeSweep(ropes,cells,w,h,vx,vy){
  // Transfer only the component of rope motion that is actually pushing into a particle.
  // This avoids giving every nearby particle the rope's full velocity in an arbitrary direction.
  for(const rope of ropes)for(let j=0;j<rope.points.length-1;j++){
   const a=rope.points[j],b=rope.points[j+1];
   const old={ax:(Number.isFinite(a.ox)?a.ox:a.x)+.5,ay:(Number.isFinite(a.oy)?a.oy:a.y)+.5,bx:(Number.isFinite(b.ox)?b.ox:b.x)+.5,by:(Number.isFinite(b.oy)?b.oy:b.y)+.5};
   const dax=a.x-(Number.isFinite(a.ox)?a.ox:a.x),day=a.y-(Number.isFinite(a.oy)?a.oy:a.y);
   const dbx=b.x-(Number.isFinite(b.ox)?b.ox:b.x),dby=b.y-(Number.isFinite(b.oy)?b.oy:b.y);
   const motion=Math.max(Math.hypot(dax,day),Math.hypot(dbx,dby));
   if(motion<.025)continue;
   const minX=Math.max(0,Math.floor(Math.min(old.ax,old.bx,a.x+.5,b.x+.5)-RADIUS-motion));
   const maxX=Math.min(w-1,Math.ceil(Math.max(old.ax,old.bx,a.x+.5,b.x+.5)+RADIUS+motion));
   const minY=Math.max(0,Math.floor(Math.min(old.ay,old.by,a.y+.5,b.y+.5)-RADIUS-motion));
   const maxY=Math.min(h-1,Math.ceil(Math.max(old.ay,old.by,a.y+.5,b.y+.5)+RADIUS+motion));
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const i=y*w+x;if(!cells[i])continue;
    const q=closest(x+.5,y+.5,old);
    if(q.distance>RADIUS+motion+.08)continue;
    let nx,ny;
    if(q.distance>1e-6){nx=q.dx/q.distance;ny=q.dy/q.distance}
    else{const dx=old.bx-old.ax,dy=old.by-old.ay,l=Math.hypot(dx,dy)||1;nx=-dy/l;ny=dx/l}
    const ropeVx=dax+(dbx-dax)*q.t,ropeVy=day+(dby-day)*q.t;
    const particleNormal=vx[i]*nx+vy[i]*ny;
    const ropeNormal=ropeVx*nx+ropeVy*ny;
    const closing=ropeNormal-particleNormal;
    if(closing<=.015)continue;
    const impulse=Math.min(12,closing*1.12);
    vx[i]=clamp(vx[i]+nx*impulse,-12,12);
    vy[i]=clamp(vy[i]+ny*impulse,-12,12);
    // A small tangential transfer lets a moving rope drag, rather than magnetically
    // attract, particles that are sliding along its surface.
    const tx=-ny,ty=nx,tangent=(ropeVx-vx[i])*tx+(ropeVy-vy[i])*ty;
    vx[i]=clamp(vx[i]+tx*tangent*.045,-12,12);
    vy[i]=clamp(vy[i]+ty*tangent*.045,-12,12);
   }
  }
 }
 function extractAirborne(cells,w,h,vx,vy,state,airborne,onExtract){
  if(!airborne)return;
  const keys=['wetness','heat','fuel','burn','age','corrosion'];
  for(let i=0;i<cells.length&&airborne.length<MAX_AIRBORNE;i++){const m=cells[i];if(!m)continue;const px=vx[i]||0,py=vy[i]||0;if(Math.hypot(px,py)<.65)continue;
   const p={x:i%w+.5,y:Math.floor(i/w)+.5,vx:px,vy:py,material:m,sleep:0};
   for(const k of keys)p[k]=state?.[k]?.[i]||0;
   cells[i]=0;vx[i]=0;vy[i]=0;for(const k of keys)if(state?.[k])state[k][i]=0;onExtract?.(i);airborne.push(p);
  }
 }
 function collideAirParticle(p,cells,w,h){
  let hit=false;
  const minX=Math.max(0,Math.floor(p.x-.8)),maxX=Math.min(w-1,Math.floor(p.x+.8)),minY=Math.max(0,Math.floor(p.y-.8)),maxY=Math.min(h-1,Math.floor(p.y+.8));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=y*w+x;if(!cells[i])continue;
   const qx=clamp(p.x,x,x+1),qy=clamp(p.y,y,y+1),dx=p.x-qx,dy=p.y-qy,d=Math.hypot(dx,dy);if(d>=.48)continue;
   let nx,ny,penetration;
   if(d>1e-7){nx=dx/d;ny=dy/d;penetration=.48-d}
   else{const faces=[{d:p.x-x,nx:-1,ny:0},{d:x+1-p.x,nx:1,ny:0},{d:p.y-y,nx:0,ny:-1},{d:y+1-p.y,nx:0,ny:1}].sort((a,b)=>a.d-b.d);nx=faces[0].nx;ny=faces[0].ny;penetration=faces[0].d+.48}
   p.x+=nx*penetration;p.y+=ny*penetration;const vn=p.vx*nx+p.vy*ny;if(vn<0){p.vx-=1.35*vn*nx;p.vy-=1.35*vn*ny;p.vx*=.88;p.vy*=.88}hit=true;
  }
  return hit;
 }
 function collideAirRopes(p,prevX=p.x,prevY=p.y){
  let hit=false;
  const travel=Math.hypot(p.x-prevX,p.y-prevY);
  for(const s of nearby(Math.min(prevX,p.x)-RADIUS,Math.min(prevY,p.y)-RADIUS,Math.max(prevX,p.x)+RADIUS,Math.max(prevY,p.y)+RADIUS)){
   const ropeMotion=Math.max(Math.hypot(s.ax-s.oldAx,s.ay-s.oldAy),Math.hypot(s.bx-s.oldBx,s.by-s.oldBy));
   const steps=clamp(Math.ceil((travel+ropeMotion)/.2),2,48);
   for(let k=1;k<=steps;k++){
    const t=k/steps,px=prevX+(p.x-prevX)*t,py=prevY+(p.y-prevY)*t;
    const segment={ax:s.oldAx+(s.ax-s.oldAx)*t,ay:s.oldAy+(s.ay-s.oldAy)*t,bx:s.oldBx+(s.bx-s.oldBx)*t,by:s.oldBy+(s.by-s.oldBy)*t};
    const q=closest(px,py,segment);
    if(q.distance>=RADIUS)continue;
    let nx,ny;
    if(q.distance>1e-7){nx=q.dx/q.distance;ny=q.dy/q.distance}
    else{const dx=segment.bx-segment.ax,dy=segment.by-segment.ay,l=Math.hypot(dx,dy)||1;nx=-dy/l;ny=dx/l}
    // Resolve at the first point of contact, not after the particle has crossed the rope.
    p.x=px+nx*(RADIUS-q.distance+.002);
    p.y=py+ny*(RADIUS-q.distance+.002);
    const ropeVx=(s.a.x-s.a.px)*(1-q.t)+(s.b.x-s.b.px)*q.t;
    const ropeVy=(s.a.y-s.a.py)*(1-q.t)+(s.b.y-s.b.py)*q.t;
    const rvx=p.vx-ropeVx,rvy=p.vy-ropeVy,vn=rvx*nx+rvy*ny;
    if(vn<0){p.vx-=1.28*vn*nx;p.vy-=1.28*vn*ny;p.vx*=.96;p.vy*=.96}
    hit=true;break;
   }
  }
  return hit;
 }
 function findLandingCell(p,cells,w,h){
  const cx=Math.floor(p.x),cy=Math.floor(p.y);let best=-1,bestD=Infinity;
  for(let r=0;r<=4;r++)for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
   if(x<0||x>=w||y<0||y>=h||Math.max(Math.abs(x-cx),Math.abs(y-cy))!==r)continue;
   const i=y*w+x;if(cells[i])continue;let ropeBlocked=false;for(const segment of nearby(x+.5-.6,y+.5-.6,x+.5+.6,y+.5+.6))if(closest(x+.5,y+.5,segment).distance<RADIUS){ropeBlocked=true;break}if(ropeBlocked)continue;const d=Math.hypot(x+.5-p.x,y+.5-p.y);if(d<bestD){bestD=d;best=i}
  }
  return best;
 }
 function advanceAirborne(airborne,cells,w,h,gravity,state,vx,vy){
  if(!airborne?.length)return;
  const keys=['wetness','heat','fuel','burn','age','corrosion'];
  for(let i=airborne.length-1;i>=0;i--){const p=airborne[i];p.vy=clamp(p.vy+.055*gravity,-16,16);p.vx*=.998;p.vy*=.998;
   const steps=clamp(Math.ceil(Math.max(Math.abs(p.vx),Math.abs(p.vy))/.3),1,64),dt=1/steps;let touched=false;
   for(let s=0;s<steps;s++){const prevX=p.x,prevY=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.x<.5){p.x=.5;p.vx=Math.abs(p.vx)*.35;touched=true}else if(p.x>w-.5){p.x=w-.5;p.vx=-Math.abs(p.vx)*.35;touched=true}
    if(p.y<.5){p.y=.5;p.vy=Math.abs(p.vy)*.35;touched=true}else if(p.y>h-.5){p.y=h-.5;p.vy=-Math.abs(p.vy)*.25;touched=true}
    if(collideAirRopes(p,prevX,prevY))touched=true;if(collideAirParticle(p,cells,w,h))touched=true;
   }
   const speed=Math.hypot(p.vx,p.vy);
   if(touched&&speed<.85)p.sleep++;else if(speed<.18)p.sleep++;else p.sleep=0;
   if(p.sleep>=5||speed<.09){const target=findLandingCell(p,cells,w,h);if(target>=0){cells[target]=p.material;for(const k of keys)if(state?.[k])state[k][target]=p[k]||0;vx[target]=0;vy[target]=0;airborne.splice(i,1);continue}p.vx*=.25;p.vy*=.25;p.sleep=4}
  }
 }
 function makeRope(a,b,id,w=640,h=360){
  if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))return null;
  const x0=clamp(a.x,0,w-1),y0=clamp(a.y,0,h-1),x1=clamp(b.x,0,w-1),y1=clamp(b.y,0,h-1),distance=Math.hypot(x1-x0,y1-y0);if(distance<.001)return null;
  const count=Math.max(3,Math.min(MAX_POINTS-1,Math.ceil(distance/1.5))),points=[];for(let i=0;i<=count;i++){const t=i/count,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;points.push({x,y,px:x,py:y,sx:x,sy:y,anchor:i===0||i===count,sweepAge:0})}
  return{id,points,length:distance/count,stiffness:1};
 }
 function step({ropes,cells,width,height,gravity=1,velocityX,velocityY,materialState,airborneParticles,onExtract}){
  if(!Array.isArray(ropes)||ropes.length>MAX_ROPES)return;
  solveRopes(ropes,cells,width,height,gravity);rebuildIndex(ropes);
  pushParticlesFromRopeSweep(ropes,cells,width,height,velocityX,velocityY,gravity);
  solveGridContacts(ropes,cells,width,height,velocityX,velocityY);
  extractAirborne(cells,width,height,velocityX,velocityY,materialState,airborneParticles,onExtract);
  advanceAirborne(airborneParticles,cells,width,height,gravity,materialState,velocityX,velocityY);
 }
 return{step,blocksMove,rebuildIndex,makeRope};
}
