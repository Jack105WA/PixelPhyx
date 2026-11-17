// Lightweight rigid-body props for the PixelPhyx sandbox.
export function createObjectSystem({getWidth,getHeight,getGravity,getCell,onPublish=()=>{}}){
 const bodies=[];let nextId=1,drag=null,lastStatePublish=0;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const defs={
  car:{w:34,h:13,mass:2.8,restitution:.28,friction:.82},
  bucket:{w:16,h:18,mass:1.15,restitution:.18,friction:.9},
  ball:{w:12,h:12,mass:.55,restitution:.72,friction:.985},
  crate:{w:15,h:15,mass:1.5,restitution:.24,friction:.86},
  barrel:{w:13,h:17,mass:1.3,restitution:.32,friction:.9}
 };
 function spawn(type,x=getWidth()/2,y=18,providedId){
  const d=defs[type];if(!d||bodies.length>=60)return null;
  const b={id:providedId||'prop-'+(nextId++),type,x:clamp(x,2,getWidth()-2),y:clamp(y,2,getHeight()-2),vx:0,vy:0,angle:0,spin:0,w:d.w,h:d.h,mass:d.mass,restitution:d.restitution,friction:d.friction,damage:0,sleep:0};
  bodies.push(b);return b;
 }
 function remove(id){const i=bodies.findIndex(b=>b.id===id);if(i>=0)bodies.splice(i,1);if(drag?.body.id===id)drag=null}
 function localPoint(b,x,y){const dx=x-b.x,dy=y-b.y,c=Math.cos(b.angle),s=Math.sin(b.angle);return{x:dx*c+dy*s,y:-dx*s+dy*c}}
 function worldPoint(b,p){const c=Math.cos(b.angle),s=Math.sin(b.angle);return{x:b.x+p.x*c-p.y*s,y:b.y+p.x*s+p.y*c}}
 function hit(b,x,y){const p=localPoint(b,x,y);if(b.type==='ball')return Math.hypot(p.x,p.y)<=b.w*.7;return Math.abs(p.x)<=b.w/2+2&&Math.abs(p.y)<=b.h/2+2}
 function grabAt(x,y){let best=null,dist=Infinity;for(const b of bodies){if(!hit(b,x,y))continue;const d=Math.hypot(x-b.x,y-b.y);if(d<dist){best=b;dist=d}}if(!best)return false;const point=localPoint(best,x,y);drag={body:best,point,target:{x,y},last:{x,y},vx:0,vy:0};best.sleep=0;return true}
 function moveGrab(x,y){if(!drag)return;drag.vx=clamp(x-drag.last.x,-8,8);drag.vy=clamp(y-drag.last.y,-8,8);drag.last={x,y};drag.target={x,y}}
 function releaseGrab(){if(!drag)return;const b=drag.body;b.vx=clamp(b.vx+drag.vx*.45,-18,18);b.vy=clamp(b.vy+drag.vy*.45,-18,18);drag=null;onPublish({type:'props',items:serialize()})}
 function terrainContact(b){
  const w=getWidth(),h=getHeight(),c=Math.cos(b.angle),s=Math.sin(b.angle),hw=b.w/2,hh=b.h/2;
  const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  let minY=Infinity,hitX=0,hitY=0,hitCount=0;
  for(const [lx,ly] of corners){const x=b.x+lx*c-ly*s,y=b.y+lx*s+ly*c;minY=Math.max(minY,y);const gx=Math.floor(x),gy=Math.floor(y);
   if(gx<0||gx>=w||gy<0||gy>=h){if(x<0||x>=w){b.x=clamp(b.x,hw,w-hw);b.vx*=-b.restitution*.6}if(y>=h){b.y=h-hh;b.vy=-Math.abs(b.vy)*b.restitution;b.spin*=.72}continue}
   if(getCell(gx,gy)!==0){hitCount++;hitX+=x;hitY+=y}
  }
  if(hitCount){hitX/=hitCount;hitY/=hitCount;const penetration=Math.max(.15,minY-(Math.floor(hitY)+.5)+.7);b.y-=Math.min(2.5,penetration*.45);const impact=Math.abs(b.vy);b.vy=-Math.abs(b.vy)*b.restitution;b.vx*=b.friction;b.spin+=clamp((hitX-b.x)*.008,-.16,.16);if(impact>2.2){b.damage=Math.min(1,b.damage+impact*.012);b.vx+=clamp((b.x-hitX)*.025,-1.5,1.5)}if(impact<.35){b.vy=0;b.sleep++}else b.sleep=0}
 }
 function solveBodyContacts(){
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],ra=Math.min(a.w,a.h)*.5,rb=Math.min(b.w,b.h)*.5;
   let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),minimum=ra+rb;
   if(d>=minimum)continue;
   if(d<1e-5){dx=1;dy=0;d=1}
   const nx=dx/d,ny=dy/d,overlap=minimum-d,total=1/a.mass+1/b.mass;
   a.x-=nx*overlap*(1/a.mass)/total;b.x+=nx*overlap*(1/b.mass)/total;
   a.y-=ny*overlap*(1/a.mass)/total;b.y+=ny*overlap*(1/b.mass)/total;
   const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
   if(relative>=0)continue;
   const impulse=-(1+Math.min(a.restitution,b.restitution))*relative/total;
   const ix=impulse*nx,iy=impulse*ny;
   a.vx-=ix/a.mass;a.vy-=iy/a.mass;b.vx+=ix/b.mass;b.vy+=iy/b.mass;
   const crash=Math.abs(relative);
   if(crash>2){a.damage=Math.min(1,a.damage+crash*.006);b.damage=Math.min(1,b.damage+crash*.006)}
   const tangentImpulse=clamp((b.vx-a.vx)*(-ny)+(b.vy-a.vy)*nx,-impulse*.18,impulse*.18);
   a.spin-=tangentImpulse*.006/a.mass;b.spin+=tangentImpulse*.006/b.mass;
   a.sleep=b.sleep=0;
  }
 }
 function step(){
  const gravity=getGravity(),w=getWidth(),h=getHeight();
  for(const b of bodies){
   if(drag?.body===b){
    const p=worldPoint(b,drag.point),dx=drag.target.x-p.x,dy=drag.target.y-p.y;
    const impulse=clamp(Math.hypot(dx,dy)*.24,0,5),fx=dx*.22,fy=dy*.22;
    b.vx=clamp(b.vx+fx/b.mass,-20,20);b.vy=clamp(b.vy+fy/b.mass,-20,20);
    b.spin=clamp(b.spin+(drag.point.x*fy-drag.point.y*fx)*.0007,-.35,.35);
   }
   b.vy=clamp(b.vy+.16*gravity,-18,18);b.vx*=.997;b.spin*=.995;
   b.x+=b.vx;b.y+=b.vy;b.angle+=b.spin;
   terrainContact(b);
   if(b.y>h+30||b.x<-30||b.x>w+30)remove(b.id);
   if(b.sleep>8&&Math.abs(b.vx)<.08&&Math.abs(b.vy)<.08&&Math.abs(b.spin)<.008){b.vx=0;b.vy=0;b.spin=0}
  }
  solveBodyContacts();
  if(drag){const p=worldPoint(drag.body,drag.point),dx=drag.target.x-p.x,dy=drag.target.y-p.y;if(Math.hypot(dx,dy)>80){drag.body.x+=dx*.35;drag.body.y+=dy*.35}}
 }
 function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
 function draw(ctx){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const b of bodies){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
   if(b.type==='ball'){const g=ctx.createRadialGradient(-3,-4,1,0,0,7);g.addColorStop(0,'#fff4d1');g.addColorStop(.28,'#ffbd59');g.addColorStop(1,'#b94b2b');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#612d27';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(-1,-1,3.5,-.9,1.2);ctx.strokeStyle='#ffe0a0';ctx.stroke()}
   else if(b.type==='car'){
    ctx.fillStyle='#111923';roundRect(ctx,-17,-3,34,13,3);ctx.fillStyle='#e65355';roundRect(ctx,-16,-7,32,9,3);ctx.fillStyle='#f5b4a6';roundRect(ctx,-8,-12,16,7,2);ctx.fillStyle='#8ed7e8';roundRect(ctx,-6,-11,12,5,1);ctx.fillStyle='#ffd36a';ctx.fillRect(12,-5,3,2);ctx.fillStyle='#fff1b2';ctx.fillRect(-15,-5,2,2);
    for(const x of [-10,10]){ctx.fillStyle='#20252d';ctx.beginPath();ctx.arc(x,5,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aeb9c7';ctx.beginPath();ctx.arc(x,5,1.7,0,Math.PI*2);ctx.fill()}
    if(b.damage>.08){ctx.strokeStyle='#702f35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-6);ctx.lineTo(-1,-2);ctx.lineTo(2,-5);ctx.stroke()}
   }else if(b.type==='bucket'){
    ctx.fillStyle='#b5c3cf';ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,-8);ctx.lineTo(5,9);ctx.lineTo(-5,9);ctx.closePath();ctx.fill();ctx.strokeStyle='#526575';ctx.lineWidth=1.5;ctx.stroke();ctx.strokeStyle='#dbe6ed';ctx.beginPath();ctx.arc(0,-7,7,Math.PI,Math.PI*2);ctx.stroke();ctx.fillStyle='#71899b';ctx.fillRect(-5,-5,10,2)
   }else if(b.type==='crate'){ctx.fillStyle='#a86b3e';roundRect(ctx,-7.5,-7.5,15,15,1);ctx.strokeStyle='#5e3827';ctx.lineWidth=1.5;ctx.strokeRect(-6,-6,12,12);ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke()}
   else{ctx.fillStyle='#447d91';roundRect(ctx,-6.5,-8.5,13,17,3);ctx.fillStyle='#9dc4ca';ctx.fillRect(-5,-5,10,2);ctx.fillStyle='#2c5264';ctx.fillRect(-6,5,12,2);ctx.strokeStyle='#b6d7dc';ctx.lineWidth=1;ctx.strokeRect(-4,-7,8,14)}
   ctx.restore();
  }
  if(drag){const p=worldPoint(drag.body,drag.point);ctx.strokeStyle='rgba(131,228,189,.8)';ctx.lineWidth=.8;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(drag.target.x,drag.target.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#83e4bd';ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill()}
  ctx.restore();
 }
 function serialize(){return bodies.map(b=>[b.id,b.type,+b.x.toFixed(2),+b.y.toFixed(2),+b.vx.toFixed(2),+b.vy.toFixed(2),+b.angle.toFixed(3),+b.spin.toFixed(3),+b.damage.toFixed(2)])}
 function restore(items){if(!Array.isArray(items))return;bodies.length=0;for(const p of items.slice(0,60)){if(!Array.isArray(p)||p.length<9||typeof p[0]!=='string'||!defs[p[1]]||!p.slice(2,9).every(Number.isFinite))continue;const b=spawn(p[1],p[2],p[3],p[0]);if(!b)continue;[b.vx,b.vy,b.angle,b.spin,b.damage]=p.slice(4,9);}}
 function apply(op){if(!op)return;if(op.type==='propAdd')spawn(op.kind,op.x,op.y,op.id);else if(op.type==='propDelete')remove(op.id);else if(op.type==='props')restore(op.items)}
 function clear(){bodies.length=0;drag=null}
 return{spawn,step,draw,grabAt,moveGrab,releaseGrab,apply,serialize,restore,clear,get count(){return bodies.length},get dragging(){return !!drag}};
}
