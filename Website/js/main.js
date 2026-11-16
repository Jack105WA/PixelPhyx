// Reuse the cache-busting version from the entry URL for every local module.
const cacheVersion = new URL(import.meta.url).searchParams.get('v') || 'dev';
const [{ firebaseConfig }, { stepMaterialPhysics, materialState, resetMaterialState }] = await Promise.all([
  import(`./firebase-config.js?v=${encodeURIComponent(cacheVersion)}`),
  import(`./material-physics.js?v=${encodeURIComponent(cacheVersion)}`)
]);

const CANVAS_SIZES={small:{width:160,height:90},medium:{width:320,height:180},large:{width:640,height:360}};
let canvasSize='medium',W=CANVAS_SIZES.medium.width,H=CANVAS_SIZES.medium.height,N=W*H;
const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d',{alpha:false});
const particleInterpolationCanvas=document.createElement('canvas'),particleInterpolationCtx=particleInterpolationCanvas.getContext('2d');
particleInterpolationCanvas.className='particle-interpolation';canvas.parentElement.insertBefore(particleInterpolationCanvas,canvas.nextElementSibling);
let frameImage=ctx.createImageData(W,H);
const bloomCanvas=document.createElement('canvas'),bloomCtx=bloomCanvas.getContext('2d');
let bloomImage=null,bloomPixels=null,bloomW=0,bloomH=0;
function resizeBloomBuffer(){
 bloomW=Math.max(1,Math.ceil(W/4));bloomH=Math.max(1,Math.ceil(H/4));
 bloomCanvas.width=bloomW;bloomCanvas.height=bloomH;
 bloomImage=bloomCtx.createImageData(bloomW,bloomH);bloomPixels=bloomImage.data;
}
resizeBloomBuffer();
const M={EMPTY:0,SAND:1,WATER:2,STONE:3,WOOD:4,FIRE:5,OIL:6,ACID:7,STEAM:8,SMOKE:9,ICE:10,LAVA:11,TNT:12,PLANT:13,SALT:14,GLASS:15,CHARCOAL:16};
const materials=[
 {id:1,name:'Sand',icon:'▨',color:'#d9b45f',rgb:[217,180,95],type:'powder'},
 {id:2,name:'Water',icon:'≈',color:'#398cdb',rgb:[57,140,219],type:'liquid'},
 {id:3,name:'Stone',icon:'◆',color:'#818995',rgb:[129,137,149],type:'solid'},
 {id:4,name:'Wood',icon:'▥',color:'#9b653d',rgb:[155,101,61],type:'solid'},
 {id:5,name:'Fire',icon:'♨',color:'#ff743d',rgb:[255,116,61],type:'gas'},
 {id:6,name:'Oil',icon:'◉',color:'#b6a13b',rgb:[182,161,59],type:'liquid'},
 {id:7,name:'Acid',icon:'☣',color:'#7ee45b',rgb:[126,228,91],type:'liquid'},
 {id:8,name:'Steam',icon:'≋',color:'#c5d6df',rgb:[197,214,223],type:'gas'},
 {id:9,name:'Smoke',icon:'☁',color:'#66717d',rgb:[102,113,125],type:'gas'},
 {id:10,name:'Ice',icon:'❄',color:'#9de8f2',rgb:[157,232,242],type:'solid'},
 {id:11,name:'Lava',icon:'◈',color:'#ff4d1c',rgb:[255,77,28],type:'liquid'},
 {id:12,name:'TNT',icon:'✹',color:'#d64b50',rgb:[214,75,80],type:'solid'},
 {id:13,name:'Plant',icon:'♣',color:'#55a85e',rgb:[85,168,94],type:'solid'},
 {id:14,name:'Salt',icon:'✧',color:'#e8e8d9',rgb:[232,232,217],type:'powder'},
 {id:15,name:'Glass',icon:'◇',color:'#b8dce8',rgb:[184,220,232],type:'solid'},
 {id:16,name:'Charcoal',icon:'▪',color:'#34363a',rgb:[52,54,58],type:'powder'}
];
const colors=[[12,16,24],...materials.map(m=>m.rgb)];
let cells=new Uint8Array(N),updated=new Uint8Array(N),movingParticles=[],moveByDestination=new Int32Array(N),movingDestinations=new Uint8Array(N),cellRenderAlpha=1,running=true,selected=1,tool='draw',brush=5,gravity=1,speed=1,ambient=20;
let temperatureUnit='C';
let strokePoints=[],lastCursorPoint=null,activeErase=false;
let ropes=[],room='',playerId='guest-'+Math.random().toString(36).slice(2,9),playerName=localStorage.getItem('pixelphyx-player-name')||'Lab guest',remoteApplying=false,lastCursorWrite=0,remoteCursors={},remoteCursorTargets={},multiplayer=null,onlinePlayerIds=[],playerColor=localStorage.getItem('pixelphyx-player-color')||'#65d6ad';
const idx=(x,y)=>y*W+x,inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H,at=(x,y)=>inside(x,y)?cells[idx(x,y)]:M.STONE;
function log(message){const el=document.querySelector('#feed'),d=document.createElement('div');d.className='log-entry';d.textContent=message;el.prepend(d);while(el.children.length>18)el.lastChild.remove()}
function setConnection(state,label){const el=document.querySelector('#connection');el.className='status '+state;document.querySelector('#connectionText').textContent=label}
const toolDefs=[['draw','✎','Draw'],['rope','⌁','Rope'],['grab','✋','Grab']];
const toolsEl=document.querySelector('#tools');
toolDefs.forEach(([id,icon,name])=>{const b=document.createElement('button');b.className='tool'+(id==='draw'?' active':'');b.innerHTML='<span class="ico">'+icon+'</span><span>'+name+'</span>';b.onclick=()=>selectTool(id,b);toolsEl.append(b)});
function selectTool(id,button){tool=id;document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));button.classList.add('active');document.querySelector('#toolHud').textContent='TOOL · '+id.toUpperCase();if(id==='grab')log('Grab tool selected — drag a rope point to pull it.');if(id==='rope')log('Rope tool selected — drag to create; right-click a rope to delete it.');}
const matEl=document.querySelector('#materials');
materials.forEach(m=>{const b=document.createElement('button');b.className='material'+(m.id===selected?' active':'');b.innerHTML='<span class="mico" style="color:'+m.color+'">'+m.icon+'</span><span class="mname">'+m.name+'</span>';b.title=m.name+' · '+m.type;b.onclick=()=>{selected=m.id;document.querySelectorAll('.material').forEach(x=>x.classList.remove('active'));b.classList.add('active')};matEl.append(b)});
document.querySelector('#materialCount').textContent=materials.length+' TYPES';
function resizeCanvas(size){
 const dimensions=CANVAS_SIZES[size];if(!dimensions||size===canvasSize)return false;
 W=dimensions.width;H=dimensions.height;N=W*H;canvasSize=size;resizeBloomBuffer();
 cells=new Uint8Array(N);updated=new Uint8Array(N);movingParticles=[];moveByDestination=new Int32Array(N);movingDestinations=new Uint8Array(N);carriedParticles=new Uint8Array(N);visualParticles.length=0;resetMaterialState(N);ropes=[];frameImage=ctx.createImageData(W,H);
 canvas.width=W;canvas.height=H;localCursorCanvas.width=W;localCursorCanvas.height=H;document.querySelector('#canvasSize').value=size;
 document.querySelector('#worldDimensions').textContent=W+' × '+H;
 strokePoints=[];drawing=false;ropeStart=null;ropeDrag=null;lastPoint=null;
 log('Canvas resized to '+size+' ('+W+' × '+H+') — world cleared');return true;
}
function recordParticleMove(from,to,material){
 const previous=moveByDestination[from];
 if(previous>=0&&movingParticles[previous]?.material===material){
  const move=movingParticles[previous];move.toIndex=to;move.toX=to%W;move.toY=(to/W)|0;moveByDestination[from]=-1;moveByDestination[to]=previous;
 }else{
  const moveIndex=movingParticles.length;
  movingParticles.push({fromX:from%W,fromY:(from/W)|0,toX:to%W,toY:(to/W)|0,toIndex:to,material});
  moveByDestination[to]=moveIndex;
 }
}
function put(x,y,m){if(inside(x,y))cells[idx(x,y)]=m}
function circle(x,y,r,m){for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r)put(x+xx,y+yy,m)}
function drawLine(x0,y0,x1,y1,m,r=0){let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;while(true){circle(x0,y0,r,m);if(x0===x1&&y0===y1)break;let e=2*err;if(e>=dy){err+=dy;x0+=sx}if(e<=dx){err+=dx;y0+=sy}}}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left)/r.width*W),y:Math.floor((e.clientY-r.top)/r.height*H)}}
let drawing=false,lastPoint=null,ropeStart=null,ropeDrag=null;
function act(p,e){if(!inside(p.x,p.y))return;const erase=activeErase||e.button===2||tool==='erase',mat=erase?M.EMPTY:selected;
 if(tool==='rope'||tool==='grab')return;
 if(erase){circle(p.x,p.y,brush,M.EMPTY);lastPoint=p;return}
 if(tool==='bomb'){circle(p.x,p.y,2,M.TNT);return}
 if(tool==='heat'){circle(p.x,p.y,brush,M.FIRE);return}
 if(tool==='cool'){circle(p.x,p.y,brush,M.ICE);return}
 if(tool==='line'&&lastPoint){drawLine(lastPoint.x,lastPoint.y,p.x,p.y,mat,Math.max(0,Math.floor(brush/4)));lastPoint=p;return}
 circle(p.x,p.y,brush,mat);lastPoint=p;
}
document.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
 const p=canvasPoint(e);if(!inside(p.x,p.y))return;
 if(tool==='rope'&&e.button===2){e.preventDefault();const hit=findRopeAt(p);if(hit){ropes=ropes.filter(r=>r.id!==hit.id);publishOperation({type:'ropeDelete',ropeId:hit.id});log('Rope deleted')}return}
 if(tool==='grab'&&e.button===0){const hit=findRopeGrab(p);if(hit){ropeDrag={kind:'rope',...hit,wasAnchor:hit.node.anchor};hit.node.anchor=true;hit.node.x=p.x;hit.node.y=p.y;hit.node.px=p.x;hit.node.py=p.y;drawing=true;canvas.setPointerCapture(e.pointerId);ropeDrag.lastPublish=0;log('Rope grabbed — pull to move it')}return}
 drawing=true;activeErase=e.button===2||tool==='erase';canvas.setPointerCapture(e.pointerId);strokePoints=[p];if(tool==='rope'){ropeStart=p;lastPoint=p;return}lastPoint=null;act(p,e)
});
canvas.addEventListener('pointermove',e=>{
 const p=canvasPoint(e);
 if(ropeDrag){const {node,rope,nodeIndex}=ropeDrag;node.x=p.x;node.y=p.y;node.px=p.x;node.py=p.y;const now=performance.now();if(now-(ropeDrag.lastPublish||0)>=1000/30){ropeDrag.lastPublish=now;publishOperation({type:'ropeNode',ropeId:rope.id,nodeIndex,x:+node.x.toFixed(2),y:+node.y.toFixed(2),anchor:!!node.anchor,predicted:true})}return}
 if(!drawing)return;
 if(!strokePoints.length||strokePoints[strokePoints.length-1].x!==p.x||strokePoints[strokePoints.length-1].y!==p.y)strokePoints.push(p);
 if(tool==='rope'){lastPoint=p;return}act(p,e)
});
canvas.addEventListener('pointerup',e=>{
 if(ropeDrag){const {rope,node,nodeIndex}=ropeDrag;node.anchor=ropeDrag.wasAnchor;publishOperation({type:'ropeNode',ropeId:rope.id,nodeIndex,x:+node.x.toFixed(2),y:+node.y.toFixed(2),anchor:!!node.anchor,predicted:false});ropeDrag=null;drawing=false;return}
 if(tool==='rope'&&ropeStart){const end=canvasPoint(e);if(Math.hypot(end.x-ropeStart.x,end.y-ropeStart.y)>3){const created=createRope(ropeStart,end);publishOperation({type:'rope',ropeId:created.id,a:ropeStart,b:end})}ropeStart=null}
 else if(strokePoints.length)publishOperation({type:'stroke',points:strokePoints,tool,material:selected,brush,erase:e.button===2||tool==='erase'});
 drawing=false;activeErase=false;lastPoint=null;strokePoints=[]
});
canvas.addEventListener('pointercancel',()=>{if(ropeDrag){ropeDrag.node.anchor=ropeDrag.wasAnchor;ropeDrag=null}drawing=false;ropeStart=null;lastPoint=null});
canvas.addEventListener('wheel',e=>{e.preventDefault();brush=Math.max(1,Math.min(22,brush+(e.deltaY<0?1:-1)));document.querySelector('#brush').value=brush;document.querySelector('#brushOut').textContent=brush+' px'},{passive:false});

function findRopeGrab(p){let best=null,bestDistance=7;for(const rope of ropes){for(let nodeIndex=0;nodeIndex<rope.points.length;nodeIndex++){const node=rope.points[nodeIndex],d=Math.hypot(node.x-p.x,node.y-p.y);if(d<bestDistance){bestDistance=d;best={rope,node,nodeIndex}}}}return best}
function findRopeAt(p){let best=null,bestDistance=5;for(const rope of ropes){for(let i=0;i<rope.points.length-1;i++){const a=rope.points[i],b=rope.points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0,d=Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));if(d<bestDistance){bestDistance=d;best=rope}}}return best}
function createRope(a,b){
 const distance=Math.hypot(b.x-a.x,b.y-a.y),segments=Math.max(3,Math.ceil(distance/1.5)),points=[];
 for(let i=0;i<=segments;i++){const t=i/segments,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;points.push({x,y,px:x,py:y,anchor:i===0||i===segments})}
 const rope={id:newRopeId(),points,length:distance/segments,stiffness:1};ropes.push(rope);
 log('Rope attached with '+segments+' physics segments');return rope
}
function newRopeId(){return 'rope-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36))}
function ropeCellIsSolid(m){return m===M.STONE||m===M.WOOD||m===M.ICE||m===M.TNT||m===M.GLASS}
function ropeCellBlocks(m){return m!==M.EMPTY}
function findRopeFreeCell(gx,gy,dx=0,dy=0,maxRadius=6){
 let best=null,bestScore=Infinity;
 for(let radius=1;radius<=maxRadius;radius++){
  for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
   if(Math.max(Math.abs(ox),Math.abs(oy))!==radius)continue;
   const x=gx+ox,y=gy+oy;if(!inside(x,y))continue;
   const i=idx(x,y);if(cells[i]!==M.EMPTY)continue;
   const distance=ox*ox+oy*oy;
   const directional=dx||dy?-(ox*dx+oy*dy)*.65:0;
   const score=distance+directional;
   if(score<bestScore){bestScore=score;best={x,y,index:i}}
  }
  if(best)return best;
 }
 return null;
}
function resolveRopeNode(n,oldX=n.x,oldY=n.y){
 if(n.anchor)return false;
 const gx=Math.floor(n.x),gy=Math.floor(n.y);
 if(!inside(gx,gy))return false;
 const here=idx(gx,gy),material=cells[here];
 if(!ropeCellBlocks(material))return false;
 // Push movable matter out of the rope's occupied cell instead of letting the rope pass through it.
 let dx=n.x-oldX,dy=n.y-oldY;
 if(Math.hypot(dx,dy)<.001){dx=n.x-(gx+.5);dy=n.y-(gy+.5)}
 if(Math.hypot(dx,dy)<.001){dx=0;dy=-1}
 if(!ropeCellIsSolid(material)){
  const target=findRopeFreeCell(gx,gy,dx,dy,5);
  if(target){cells[target.index]=material;cells[here]=M.EMPTY;return false}
 }
 // A rope node cannot remain inside a solid cell. Remove its inward velocity to prevent jitter.
 const target=findRopeFreeCell(gx,gy,dx,dy,7);
 if(target){
  n.x=target.x+.5;n.y=target.y+.5;
  const vx=n.x-n.px,vy=n.y-n.py;
  n.px=n.x-vx*.15;n.py=n.y-vy*.15;
  return true;
 }
 n.x=oldX;n.y=oldY;n.px=oldX;n.py=oldY;
 return true;
}
function stepRopes(){
 for(const rope of ropes){
  const p=rope.points;if(p.length<2)continue;
  for(let i=0;i<p.length;i++){
   const n=p[i];n.sx=n.x;n.sy=n.y;if(n.anchor)continue;
   const oldX=n.x,oldY=n.y,vx=(n.x-n.px)*.985,vy=(n.y-n.py)*.985;
   n.px=n.x;n.py=n.y;n.x+=vx;n.y+=vy+.12*gravity;
   resolveRopeNode(n,oldX,oldY);
  }
  // Short segments plus repeated collision projection prevent ropes tunnelling through one-cell walls.
  for(let pass=0;pass<12;pass++){
   for(let i=0;i<p.length-1;i++){
    const a=p[i],b=p[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001;
    const diff=(d-rope.length)/d*.5*rope.stiffness;
    if(!a.anchor){a.x+=dx*diff;a.y+=dy*diff}
    if(!b.anchor){b.x-=dx*diff;b.y-=dy*diff}
   }
   for(let i=1;i<p.length-1;i++)resolveRopeNode(p[i],p[i].px,p[i].py);
  }
  for(const n of p){n.x=Math.max(.5,Math.min(W-.5,n.x));n.y=Math.max(.5,Math.min(H-.5,n.y))}
 }
 pushParticlesFromRopeSweep();
}
let ropeCollisionBuckets=new Map();
const ROPE_BUCKET_SIZE=4,ROPE_COLLISION_RADIUS=1.35;
function rebuildRopeCollisionIndex(){
 ropeCollisionBuckets.clear();
 if(!ropes.length)return;
 for(const rope of ropes){
  const points=rope.points;
  if(!points||points.length<2)continue;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],segment={ax:a.x+.5,ay:a.y+.5,bx:b.x+.5,by:b.y+.5};
   const minX=Math.floor((Math.min(segment.ax,segment.bx)-ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
   const maxX=Math.floor((Math.max(segment.ax,segment.bx)+ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
   const minY=Math.floor((Math.min(segment.ay,segment.by)-ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
   const maxY=Math.floor((Math.max(segment.ay,segment.by)+ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
   for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++){
    const key=by*1000+bx;let bucket=ropeCollisionBuckets.get(key);
    if(!bucket){bucket=[];ropeCollisionBuckets.set(key,bucket)}
    bucket.push(segment);
   }
  }
 }
}
const ropeCandidateSegments=new Set();
const orient=(ax,ay,bx,by,cx,cy)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
function pointSegmentDistance(px,py,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
 const t=len?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len)):0;
 return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function ropeBlocksMove(x1,y1,x2,y2){
 if(!ropeCollisionBuckets.size)return false;
 const minX=Math.floor((Math.min(x1,x2)-ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
 const maxX=Math.floor((Math.max(x1,x2)+ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
 const minY=Math.floor((Math.min(y1,y2)-ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
 const maxY=Math.floor((Math.max(y1,y2)+ROPE_COLLISION_RADIUS)/ROPE_BUCKET_SIZE);
 ropeCandidateSegments.clear();
 for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++){
  const bucket=ropeCollisionBuckets.get(by*1000+bx);
  if(bucket)for(const segment of bucket)ropeCandidateSegments.add(segment);
 }
 for(const s of ropeCandidateSegments){
  const {ax,ay,bx,by}=s;
  const o1=orient(x1,y1,x2,y2,ax,ay),o2=orient(x1,y1,x2,y2,bx,by);
  const o3=orient(ax,ay,bx,by,x1,y1),o4=orient(ax,ay,bx,by,x2,y2);
  if(o1*o2<=0&&o3*o4<=0&&
   Math.max(Math.min(x1,x2),Math.min(ax,bx))<=Math.min(Math.max(x1,x2),Math.max(ax,bx))+.0001&&
   Math.max(Math.min(y1,y2),Math.min(ay,by))<=Math.min(Math.max(y1,y2),Math.max(ay,by))+.0001)return true;
  if(Math.min(
   pointSegmentDistance(x1,y1,ax,ay,bx,by),
   pointSegmentDistance(x2,y2,ax,ay,bx,by),
   pointSegmentDistance(ax,ay,x1,y1,x2,y2),
   pointSegmentDistance(bx,by,x1,y1,x2,y2)
  )<ROPE_COLLISION_RADIUS)return true;
 }
 return false;
}
let carriedParticles=new Uint8Array(N);
function pushParticlesFromRopeSweep(){
 if(!ropes.length)return;
 const insideQuad=(px,py,ax,ay,bx,by,cx,cy,dx,dy)=>{
  const cross=(x1,y1,x2,y2)=>x1*y2-y1*x2,points=[[ax,ay],[bx,by],[cx,cy],[dx,dy]];let sign=0;
  for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],v=cross(b[0]-a[0],b[1]-a[1],px-a[0],py-a[1]);if(Math.abs(v)<.0001)continue;const s=Math.sign(v);if(sign&&s!==sign)return false;sign=s}
  return true;
 };
 const carried=carriedParticles;carried.fill(0);
 for(const rope of ropes){
  const p=rope.points;
  for(let i=0;i<p.length-1;i++){
   const a=p[i],b=p[i+1],ax=a.sx??a.x,ay=a.sy??a.y,bx=b.sx??b.x,by=b.sy??b.y;
   const daX=a.x-ax,daY=a.y-ay,dbX=b.x-bx,dbY=b.y-by;
   if(Math.max(Math.abs(daX),Math.abs(daY),Math.abs(dbX),Math.abs(dbY))<.01)continue;
   const minX=Math.max(0,Math.floor(Math.min(ax,bx,a.x,b.x)-1)),maxX=Math.min(W-1,Math.ceil(Math.max(ax,bx,a.x,b.x)+1));
   const minY=Math.max(0,Math.floor(Math.min(ay,by,a.y,b.y)-1)),maxY=Math.min(H-1,Math.ceil(Math.max(ay,by,a.y,b.y)+1));
   const candidates=[];
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const k=idx(x,y),m=cells[k];if(!m||ropeCellIsSolid(m)||carried[k])continue;
    const px=x+.5,py=y+.5;
    if(!insideQuad(px,py,ax,ay,bx,by,b.x,b.y,a.x,a.y))continue;
    const sx=bx-ax,sy=by-ay,len=sx*sx+sy*sy;
    const t=len?Math.max(0,Math.min(1,((px-ax)*sx+(py-ay)*sy)/len)):.5;
    const dx=daX+(dbX-daX)*t,dy=daY+(dbY-daY)*t;
    const tx=Math.round(x+dx),ty=Math.round(y+dy);
    if(!inside(tx,ty)||(!dx&&!dy))continue;
    candidates.push({k,m,x,y,tx,ty,dx,dy,order:dx*(x-ax)+dy*(y-ay)});
   }
   // Move the leading edge first so particles travel with the rope instead of being
   // scattered into arbitrary nearby empty cells.
   candidates.sort((u,v)=>v.order-u.order);
   for(const c of candidates){
    if(carried[c.k]||cells[c.k]!==c.m)continue;
    const target=idx(c.tx,c.ty);
    if(cells[target]!==M.EMPTY&&target!==c.k)continue;
    cells[target]=c.m;
    if(target!==c.k)cells[c.k]=M.EMPTY;
    carried[c.k]=1;carried[target]=1;
   }
  }
 }
}
// Small sub-cell particles add subtle material effects without obscuring the pixel world.
const visualParticles=[];
const MAX_VISUAL_PARTICLES=360;
function emitVisualParticle(x,y,kind){
 if(visualParticles.length>=MAX_VISUAL_PARTICLES)return;
 const settings={
  molten:{vx:.42,vy:.62,life:34,size:.38,color:'#ff5a18',gravity:.025},
  ember:{vx:.28,vy:.48,life:25,size:.28,color:'#ffe36a',gravity:.008},
  smoke:{vx:.16,vy:.24,life:55,size:.42,color:'#8b9299',gravity:-.008},
  splash:{vx:.32,vy:.38,life:17,size:.25,color:'#69baff',gravity:.018},
  acid:{vx:.3,vy:.36,life:20,size:.26,color:'#9bff58',gravity:.02},
  dust:{vx:.18,vy:.22,life:22,size:.24,color:'#c9b58a',gravity:-.004},
  steam:{vx:.15,vy:.2,life:35,size:.34,color:'#d5e3e9',gravity:-.006}
 };
 const cfg=settings[kind]||settings.dust;
 visualParticles.push({
  kind,x:x+.2+Math.random()*.6,y:y-.05,
  vx:(Math.random()-.5)*cfg.vx,
  vy:-(.04+Math.random()*cfg.vy),
  life:cfg.life*.65+Math.random()*cfg.life*.7,
  maxLife:cfg.life*1.35,
  size:cfg.size*(.7+Math.random()*.6),
  color:cfg.color,gravity:cfg.gravity,bounce:0
 });
}
function stepVisualParticles(){
 for(let i=visualParticles.length-1;i>=0;i--){
  const p=visualParticles[i];
  p.life--;
  p.vy+=p.gravity;
  p.vx+=(Math.random()-.5)*(p.kind==='smoke'||p.kind==='dust'?.006:.002);
  p.vx*=.992;p.vy*=.994;
  const nx=p.x+p.vx,ny=p.y+p.vy,gx=Math.floor(nx),gy=Math.floor(ny);
  let alive=inside(gx,gy);
  if(alive){
   const m=cells[idx(gx,gy)];
   if(m!==M.EMPTY){
    if(p.kind==='molten'&&(m===M.WATER||m===M.ICE)){
     if(Math.random()<.45)emitVisualParticle(p.x,p.y,'steam');
     alive=false;
    }else if(p.kind==='ember'&&(m===M.WOOD||m===M.PLANT||m===M.OIL||m===M.TNT)){
     const heatIndex=idx(gx,gy);materialState.heat[heatIndex]=Math.min(1600,materialState.heat[heatIndex]+12);alive=false;
    }else if(p.kind==='molten'&&p.bounce===0&&p.vy>.08){
     p.vy=-Math.abs(p.vy)*.12;p.vx*=.35;p.bounce=1;p.life=Math.min(p.life,8);
    }else alive=false;
   }else{p.x=nx;p.y=ny}
  }
  if(!alive||p.life<=0)visualParticles.splice(i,1);
 }
}
function drawVisualParticles(){
 for(const p of visualParticles){
  const fade=Math.max(0,Math.min(1,p.life/(p.maxLife*.3)));
  ctx.globalAlpha=(p.kind==='smoke'||p.kind==='dust'||p.kind==='steam'?.2:.72)*fade;
  ctx.fillStyle=p.color;
  ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
 }
 ctx.globalAlpha=1;
}
function explode(x,y){const radius=17;for(let yy=-radius;yy<=radius;yy++)for(let xx=-radius;xx<=radius;xx++){const d=Math.hypot(xx,yy),px=x+xx,py=y+yy;if(d<radius&&inside(px,py)){const i=idx(px,py);if(d<radius*(.4+Math.random()*.35)){cells[i]=M.EMPTY;if(Math.random()<.35)cells[i]=M.FIRE}else if(cells[i]!==M.STONE)cells[i]=Math.random()<.4?M.FIRE:M.SMOKE}}log('TNT detonation!')}
function reaction(){}
function tick(){movingParticles.length=0;moveByDestination.fill(-1);movingDestinations.fill(0);rebuildRopeCollisionIndex();updated.fill(0);for(let y=H-2;y>=0;y--){const dir=Math.random()<.5?1:-1;for(let k=0;k<W;k++){const x=dir===1?k:W-1-k;let i=idx(x,y),m=cells[i];if(!m||updated[i])continue;
 if(m===M.LAVA&&Math.random()<.00022)emitVisualParticle(x,y,'molten');
 else if(m===M.FIRE&&Math.random()<.00009)emitVisualParticle(x,y,'ember');
 else if(m===M.FIRE&&Math.random()<.00006)emitVisualParticle(x,y,'smoke');
 else if(m===M.WATER&&Math.random()<.000018)emitVisualParticle(x,y,'splash');
 else if(m===M.ACID&&Math.random()<.000035)emitVisualParticle(x,y,'acid');
 else if((m===M.SAND||m===M.SALT||m===M.CHARCOAL)&&Math.random()<.000012)emitVisualParticle(x,y,'dust');
 else if(m===M.STEAM&&Math.random()<.000025)emitVisualParticle(x,y,'steam');
 if(m===M.TNT&&(at(x,y+1)===M.FIRE||at(x+1,y)===M.FIRE||at(x-1,y)===M.FIRE)){explode(x,y);continue}
 if(m===M.ICE&&ambient>5&&Math.random()<Math.min(.02,(ambient-5)/5000)){cells[i]=M.WATER;continue}
 if(m===M.WATER&&ambient<0&&Math.random()<Math.min(.04,Math.abs(ambient)/3000)){cells[i]=M.ICE;continue}
 if(ambient>180&&m===M.WATER&&Math.random()<.012){cells[i]=M.STEAM;continue}
 if([M.SAND,M.SALT,M.CHARCOAL,M.WATER,M.OIL,M.ACID,M.LAVA,M.STEAM,M.SMOKE,M.FIRE].includes(m)){
 const gas=m===M.STEAM||m===M.SMOKE||m===M.FIRE,dy=gas?-1:1,ny=y+dy,ni=inside(x,ny)?idx(x,ny):-1;
 if(ni>=0&&cells[ni]===M.EMPTY&&!ropeBlocksMove(x+.5,y+.5,x+.5,ny+.5)){cells[ni]=m;cells[i]=M.EMPTY;recordParticleMove(i,ni,m);updated[ni]=1;i=ni;y=gas?y:y}
 else if([M.SAND,M.SALT,M.CHARCOAL,M.WATER,M.OIL,M.ACID,M.LAVA].includes(m)){const d=Math.random()<.5?-1:1,side=inside(x+d,y+dy)?idx(x+d,y+dy):-1;if(side>=0&&cells[side]===M.EMPTY&&!ropeBlocksMove(x+.5,y+.5,x+d+.5,y+dy+.5)){cells[side]=m;cells[i]=M.EMPTY;recordParticleMove(i,side,m);updated[side]=1}else if((m===M.WATER||m===M.OIL||m===M.ACID)&&at(x+d,y)===M.EMPTY&&!ropeBlocksMove(x+.5,y+.5,x+d+.5,y+.5)&&Math.random()<.4){const sideIndex=idx(x+d,y);cells[sideIndex]=m;cells[i]=M.EMPTY;recordParticleMove(i,sideIndex,m)}}
 
 if(m===M.STEAM&&Math.random()<.002)cells[i]=M.WATER;
 if(m===M.SMOKE&&Math.random()<.003)cells[i]=M.EMPTY;
 if(m===M.WATER&&ambient>100&&Math.random()<.0005)cells[i]=M.STEAM;
 }
 if(m===M.ACID||m===M.LAVA||m===M.SALT)reaction(i,x,y,m);
 }}
 stepMaterialPhysics({cells,width:W,height:H,ambient,gravity,ropes,ropeBlocksMove,materials:M,state:materialState,recordMove:recordParticleMove});
 stepVisualParticles();
 stepRopes()}
function rebuildCellInterpolation(){
 movingDestinations.fill(0);
 for(const move of movingParticles)if(cells[move.toIndex]===move.material)movingDestinations[move.toIndex]=1;
}
function drawInterpolatedCells(){
 const target=particleInterpolationCtx,rect=canvas.getBoundingClientRect(),scale=4;
 const width=W*scale,height=H*scale;
 if(particleInterpolationCanvas.width!==width||particleInterpolationCanvas.height!==height){
  particleInterpolationCanvas.width=width;particleInterpolationCanvas.height=height;
 }
 particleInterpolationCanvas.style.width=rect.width+'px';particleInterpolationCanvas.style.height=rect.height+'px';
 // Keep the interpolation surface on an exact integer multiple of the world grid.
 // This makes its pixels scale identically to the base canvas instead of creating
 // a second, device-pixel grid that can drift and form halos around landed cells.
 target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,width,height);
 const alpha=cellRenderAlpha;if(alpha>=.999||!movingParticles.length)return;
 for(const particle of movingParticles){
  if(cells[particle.toIndex]!==particle.material)continue;
  const material=particle.material,base=colors[material]||colors[0];
  const wet=materialState.wetness[particle.toIndex]||0,heat=materialState.heat[particle.toIndex]||0;
  let r=base[0],g=base[1],b=base[2];
  if(material===M.SAND&&wet){const f=1-wet*.38;r=Math.round(r*f);g=Math.round(g*f);b=Math.round(b*f)}
  if(heat>0&&material!==M.FIRE){const f=Math.min(.35,heat/900);r=Math.min(255,Math.round(r+(255-r)*f));g=Math.round(g+(100-g)*f);b=Math.round(b*(1-f*.7))}
  target.fillStyle=`rgb(${r},${g},${b})`;
  const x=Math.round((particle.fromX+(particle.toX-particle.fromX)*alpha)*scale);
  const y=Math.round((particle.fromY+(particle.toY-particle.fromY)*alpha)*scale);
  // Integer 4x-grid coordinates prevent fractional-edge antialiasing.
  target.fillRect(x,y,scale,scale);
 }
}
function drawPlayerCursor(c,isYou=false,targetCtx=ctx){
 if(!c||!Number.isFinite(c.x)||!Number.isFinite(c.y))return;
 const cursorColor=isYou?playerColor:(c.color||'#65d6ad');
 // Compact, solid pixel-art pointer with a continuous dark outline.
 const pixels=[
  '1000000',
  '1100000',
  '1110000',
  '1111000',
  '1111100',
  '1111110',
  '1111111',
  '1111100',
  '1101100',
  '1000110'
 ];
 const unit=1.25,cell=Math.max(1,Math.round(unit)),x0=Math.round(c.x),y0=Math.round(c.y);
 targetCtx.save();
 targetCtx.globalAlpha=1;
 targetCtx.globalCompositeOperation='source-over';
 targetCtx.fillStyle='rgba(5,10,16,.95)';
 for(let y=0;y<pixels.length;y++){
  for(let x=0;x<pixels[y].length;x++){
   if(pixels[y][x]!=='1')continue;
   for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    if(ox||oy)targetCtx.fillRect(x0+x*cell+ox,y0+y*cell+oy,cell,cell);
   }
  }
 }
 targetCtx.fillStyle=cursorColor;
 for(let y=0;y<pixels.length;y++){
  for(let x=0;x<pixels[y].length;x++){
   if(pixels[y][x]==='1')targetCtx.fillRect(x0+x*cell,y0+y*cell,cell,cell);
  }
 }
 targetCtx.restore();
}
function drawCursorName(c,targetCtx){
 if(!c||!c.name)return;
 const label=String(c.name).slice(0,16);
 targetCtx.save();
 targetCtx.font='600 10px Inter,Arial,sans-serif';
 targetCtx.textBaseline='middle';
 const width=targetCtx.measureText(label).width;
 const x=Math.max(3,Math.min(cursorNamesCanvas.clientWidth-width-3,c.x+13));
 let y=c.y+15;
 // Keep player names clear of the canvas HUD in the upper-left corner.
 if(x<170&&y<45)y=51;
 y=Math.max(9,Math.min(cursorNamesCanvas.clientHeight-8,y));
 targetCtx.lineJoin='round';
 targetCtx.lineWidth=2;
 targetCtx.strokeStyle='rgba(4,9,16,.98)';
 targetCtx.strokeText(label,x,y);
 targetCtx.fillStyle='#f4f7fb';
 targetCtx.fillText(label,x,y);
 targetCtx.restore();
}
function render(){
 let count=0;
 bloomPixels.fill(0);
 for(let i=0;i<N;i++){
  const m=cells[i],base=colors[m]||colors[0],p=i*4,wet=materialState.wetness[i]||0,heat=materialState.heat[i]||0;
  let r=base[0],g=base[1],b=base[2];
  if(m===M.SAND&&wet){const f=1-wet*.38;r=Math.round(r*f);g=Math.round(g*f);b=Math.round(b*f)}
  if(heat>0&&m!==M.FIRE){const f=Math.min(.35,heat/900);r=Math.min(255,Math.round(r+(255-r)*f));g=Math.round(g+(100-g)*f);b=Math.round(b*(1-f*.7))}
  frameImage.data[p]=r;frameImage.data[p+1]=g;frameImage.data[p+2]=b;frameImage.data[p+3]=255;
  if(m)count++;
  if(movingDestinations[i]){frameImage.data[p]=12;frameImage.data[p+1]=16;frameImage.data[p+2]=24;}
  let glow=0,gr=255,gg=135,gb=45;
  if(m===M.FIRE)glow=210;
  else if(m===M.LAVA){glow=190;gr=255;gg=65;gb=25}
  else if(heat>95&&m!==M.WATER&&m!==M.ICE&&m!==M.STEAM&&m!==M.SMOKE)glow=Math.min(150,Math.round((heat-95)*.22));
  if(glow>0){
   const x=i%W,y=(i/W)|0,bp=(((y>>2)*bloomW+(x>>2))*4);
   if(glow>bloomPixels[bp+3]){
    bloomPixels[bp]=gr;bloomPixels[bp+1]=gg;bloomPixels[bp+2]=gb;bloomPixels[bp+3]=glow;
   }
  }
 }
 bloomCtx.putImageData(bloomImage,0,0);
 ctx.putImageData(frameImage,0,0);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.58;ctx.imageSmoothingEnabled=true;
 ctx.drawImage(bloomCanvas,0,0,W,H);ctx.restore();
 drawInterpolatedCells();
 drawVisualParticles();
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const rope of ropes){const p=rope.points;if(p.length<2)continue;ctx.beginPath();ctx.moveTo(p[0].x+.5,p[0].y+.5);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x+.5,p[i].y+.5);ctx.strokeStyle='#c69b6b';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='#f1d2a4';ctx.lineWidth=.7;ctx.stroke()}
  for(const [id,target] of Object.entries(remoteCursorTargets)){
  let current=remoteCursors[id];
  if(!current){current=remoteCursors[id]={...target};continue}
  current.x+=(target.x-current.x)*.35;current.y+=(target.y-current.y)*.35;
  current.color=target.color;current.name=target.name;
 }
 for(const id of Object.keys(remoteCursors))if(!remoteCursorTargets[id])delete remoteCursors[id];
 const cursorCtx=localCursorCtx,nameCtx=cursorNamesCtx;
 const canvasRect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
 const nameWidth=Math.max(1,Math.round(canvasRect.width*dpr)),nameHeight=Math.max(1,Math.round(canvasRect.height*dpr));
 if(localCursorCanvas.width!==W||localCursorCanvas.height!==H){
  localCursorCanvas.width=W;
  localCursorCanvas.height=H;
 }
 cursorCtx.setTransform(1,0,0,1,0,0);
 cursorCtx.globalAlpha=1;
 cursorCtx.globalCompositeOperation='source-over';
 cursorCtx.clearRect(0,0,W,H);
 if(cursorNamesCanvas.width!==nameWidth||cursorNamesCanvas.height!==nameHeight){
  cursorNamesCanvas.width=nameWidth;
  cursorNamesCanvas.height=nameHeight;
 }
 nameCtx.setTransform(dpr,0,0,dpr,0,0);
 nameCtx.clearRect(0,0,canvasRect.width,canvasRect.height);
 // Draw the original multiplayer arrow in CSS pixels. Scaling against the
 // medium canvas width keeps its on-screen size identical at every world size.
 const cursorScale=canvasRect.width/320;
 for(const c of Object.values(remoteCursors)){
  const screenX=c.x/W*canvasRect.width,screenY=c.y/H*canvasRect.height;
  drawPlayerCursor({x:screenX,y:screenY,color:c.color},false,nameCtx);
  drawCursorName({x:screenX,y:screenY,name:c.name},nameCtx);
 }
 document.querySelector('#particleCount').textContent=count.toLocaleString();document.querySelector('#particleHud').textContent=count.toLocaleString()+' PARTICLES';document.querySelector('#ropeCount').textContent=ropes.length;document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×';
}
const SIMULATION_HZ=60,SIMULATION_STEP=1000/SIMULATION_HZ,MAX_STEPS_PER_FRAME=4,MP_SYNC_INTERVAL=1000;
let fpsAt=performance.now(),fpsCount=0,lastFrameAt=performance.now(),simulationAccumulator=0;
 function loop(now){
  const elapsed=Math.min(250,Math.max(0,now-lastFrameAt));lastFrameAt=now;
 if(running){simulationAccumulator+=elapsed*speed;let steps=0;while(simulationAccumulator>=SIMULATION_STEP&&steps<MAX_STEPS_PER_FRAME){tick();rebuildCellInterpolation();simulationAccumulator-=SIMULATION_STEP;steps++}if(steps===MAX_STEPS_PER_FRAME&&simulationAccumulator>SIMULATION_STEP)simulationAccumulator=0}
 cellRenderAlpha=Math.max(0,Math.min(1,simulationAccumulator/SIMULATION_STEP));
 render();fpsCount++;if(now-fpsAt>=1000){document.querySelector('#fps').textContent=fpsCount+' FPS';fpsCount=0;fpsAt=now}requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function formatTemperature(c){const value=temperatureUnit==='F'?c*9/5+32:c;return Math.round(value)+'°'+temperatureUnit}
function updateTemperature(){const slider=document.querySelector('#temperatureControl');document.querySelector('#tempOut').textContent=formatTemperature(ambient);document.querySelector('#tempBig').textContent=formatTemperature(ambient);slider.min=temperatureUnit==='F'?-148:-100;slider.max=temperatureUnit==='F'?2192:1200;slider.step=1;slider.value=temperatureUnit==='F'?Math.round(ambient*9/5+32):ambient;document.querySelector('#temperatureUnit').textContent='°'+temperatureUnit;document.querySelector('#temperatureUnit').title='Switch temperature units'}
document.querySelector('#canvasSize').addEventListener('change',e=>{const size=e.target.value;if(resizeCanvas(size))publishOperation({type:'canvasSize',size})});
document.querySelector('#play').onclick=()=>{running=!running;document.querySelector('#play').textContent=running?'Ⅱ Pause':'▶ Resume';document.querySelector('#worldState').textContent=running?'SIMULATION RUNNING':'SIMULATION PAUSED'};
document.querySelector('#step').onclick=()=>{if(!running){tick();rebuildCellInterpolation();cellRenderAlpha=0;render()}};
document.querySelector('#clear').onclick=()=>{cells.fill(0);movingParticles.length=0;movingDestinations.fill(0);moveByDestination.fill(-1);visualParticles.length=0;resetMaterialState(N);ropes=[];publishOperation({type:'clear'});render();log('World cleared')};
document.querySelector('#save').onclick=()=>{const a=document.createElement('a');a.download='pixelphyx-experiment.png';a.href=canvas.toDataURL();a.click()};

document.querySelector('#brush').oninput=e=>{brush=+e.target.value;document.querySelector('#brushOut').textContent=brush+' px'};
document.querySelector('#gravity').oninput=e=>{gravity=+e.target.value/10;document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×';publishOperation({type:'settings',gravity,ambient})};
document.querySelector('#speed').oninput=e=>{speed=+e.target.value;document.querySelector('#speedOut').textContent=speed+'×'};
document.querySelector('#temperatureControl').oninput=e=>{const value=+e.target.value;ambient=temperatureUnit==='F'?(value-32)*5/9:value;updateTemperature();publishOperation({type:'settings',gravity,ambient})};
document.querySelector('#temperatureUnit').onclick=()=>{temperatureUnit=temperatureUnit==='C'?'F':'C';updateTemperature()};
addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;
  if(e.code==='Space'){e.preventDefault();document.querySelector('#play').click()}
 });

const openModal=id=>document.querySelector('#'+id).classList.add('open');
document.querySelector('#firebaseBtn').onclick=async()=>{try{await connectFirebase(firebaseConfig)}catch(e){alert('Firebase connection failed: '+e.message)}};document.querySelector('#roomBtn').onclick=()=>openLobbyGallery();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modal').classList.remove('open'));
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}));
document.querySelector('#connectFirebase').onclick=async()=>{try{await connectFirebase(firebaseConfig);document.querySelector('#firebaseModal').classList.remove('open')}catch(e){setConnection('','SETUP ERROR');alert('Firebase setup failed: '+e.message)}};
let multiplayerLoading=null;
const pendingJoinRequests=new Map();
function queueJoinRequest(request){
 if(!request?.key)return;
 pendingJoinRequests.set(request.key,request);
 renderJoinRequests();
 log(request.name+' requested to join '+request.room);
}
function renderJoinRequests(){
 const list=document.querySelector('#joinRequests');if(!list)return;
 list.replaceChildren();
 if(!pendingJoinRequests.size){const empty=document.createElement('div');empty.className='lobby-empty';empty.textContent='No pending join requests';list.append(empty);return}
 for(const request of pendingJoinRequests.values()){
  const row=document.createElement('div');row.className='join-request';
  const label=document.createElement('span');label.textContent=request.name+' wants to join '+request.room;
  const actions=document.createElement('div');actions.className='join-request-actions';
  for(const [approved,text] of [[true,'Approve'],[false,'Decline']]){
   const button=document.createElement('button');button.className='btn'+(approved?' primary':'');button.textContent=text;
   button.onclick=async()=>{button.disabled=true;try{await multiplayer.respondToJoinRequest(request.key,approved);pendingJoinRequests.delete(request.key);renderJoinRequests();log((approved?'Approved ':'Declined ')+request.name+' join request')}catch(error){button.disabled=false;log('Could not process join request: '+error.message)}};
   actions.append(button);
  }
  row.append(label,actions);list.append(row);
 }
}
async function connectFirebase(config){
 if(!multiplayer){
  if(!multiplayerLoading){
   multiplayerLoading=(async()=>{
    const {createMultiplayer}=await import('./multiplayer.js?v='+encodeURIComponent(cacheVersion));
    multiplayer=createMultiplayer({
     onStatus:setConnection,onLog:log,onOperation:applyOperation,
     onPlayers:renderPlayers,
     onJoinRequest:request=>queueJoinRequest(request),
     onCursors:people=>{remoteCursorTargets={};for(const [id,p] of Object.entries(people||{})){if(id!==playerId&&Number.isFinite(p.x)&&Number.isFinite(p.y))remoteCursorTargets[id]={x:p.x,y:p.y,color:p.color||'#ffffff',name:p.name||'Guest'}}}
    });
   })().catch(error=>{multiplayerLoading=null;throw error});
  }
  await multiplayerLoading;
 }
 playerId=await multiplayer.connect(config);
 return playerId;
}
connectFirebase(firebaseConfig).catch(e=>{console.warn(e);log('Firebase connection unavailable: '+e.message)});
function updateCurrentRoomUI(){
 const section=document.querySelector('#currentRoomSection'),code=document.querySelector('#currentRoomCode');
 if(!section||!code)return;
 code.textContent=room||'Not connected';
 section.hidden=!room;
}
document.querySelector('#copyRoomCode').onclick=async()=>{
 if(!room)return;
 const button=document.querySelector('#copyRoomCode');
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(room);
  else{
   const field=document.createElement('textarea');field.value=room;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
   const copied=document.execCommand('copy');field.remove();if(!copied)throw new Error('Clipboard access is unavailable');
  }
  button.title='Copied';button.setAttribute('aria-label','Room code copied');
  setTimeout(()=>{button.title='Copy room code';button.setAttribute('aria-label','Copy room code')},1200);
 }catch(error){log('Could not copy room code: '+error.message)}
};
document.querySelector('#join').onclick=()=>requestAndJoinRoom(document.querySelector('#roomCode').value);
document.querySelector('#createLobby').onclick=async()=>{
 const button=document.querySelector('#createLobby');button.disabled=true;button.textContent='Creating…';
 try{
  await connectFirebase(firebaseConfig);
  room=await multiplayer.createLobby({name:playerName,color:playerColor});
  document.querySelector('#roomLabel').textContent='ROOM · '+room;
  document.querySelector('#roomCode').value=room;
  updateCurrentRoomUI();
  document.querySelector('#roomModal').classList.remove('open');
  log('Created server '+room+' — you are the host');
 }catch(error){alert(error.message);log('Server creation failed: '+error.message)}
 finally{button.disabled=false;button.textContent='+ Create server'}
};

let stopLobbyGallery=null;
async function openLobbyGallery(){
 try{
  await connectFirebase(firebaseConfig);
  if(stopLobbyGallery)stopLobbyGallery();
  stopLobbyGallery=multiplayer.watchLobbies(renderLobbyGallery);
  updateCurrentRoomUI();
  openModal('roomModal');
 }catch(error){alert('Could not load lobbies: '+error.message)}
}
function renderLobbyGallery(lobbies){
 const gallery=document.querySelector('#lobbyGallery');
 document.querySelector('#lobbyCapacity').textContent=lobbies.length+' / 20 active servers';
 gallery.replaceChildren();
 if(!lobbies.length){const empty=document.createElement('div');empty.className='lobby-empty';empty.textContent='No active servers yet. Create one to become the host.';gallery.append(empty);return}
 for(const lobby of lobbies){
  const card=document.createElement('article');card.className='lobby-card';
  const top=document.createElement('div');top.className='lobby-card-top';
  const number=document.createElement('span');number.className='lobby-number';number.textContent=lobby.room;
  const count=document.createElement('span');count.className='lobby-count';count.textContent=(lobby.players||0)+' online';
  top.append(number,count);
  const host=document.createElement('div');host.className='lobby-host';host.textContent='HOST · ';
  const hostName=document.createElement('strong');hostName.textContent=lobby.hostName||'Unknown';host.append(hostName);
  const join=document.createElement('button');join.className='btn primary';join.textContent='Request to join';
  join.onclick=async()=>{
   join.disabled=true;join.textContent='Request sent…';
   try{await requestAndJoinRoom(lobby.room);document.querySelector('#roomModal').classList.remove('open')}
   catch(error){alert(error.message);join.disabled=false;join.textContent='Request to join'}
  };
  card.append(top,host,join);gallery.append(card);
 }
}
async function requestAndJoinRoom(code){
 const clean=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24);
 if(!clean){alert('Choose a lobby first');return}
 try{
  await connectFirebase(firebaseConfig);
  log('Sending join request to '+clean+'…');
  const approved=await multiplayer.requestJoin(clean,{name:playerName});
  if(!approved)throw new Error('The host declined your request');
  await joinRoom(clean,true);
 }catch(error){log('Could not join lobby: '+error.message);throw error}
}

function encodeCells(data){let raw='';for(let i=0;i<data.length;i+=0x8000)raw+=String.fromCharCode(...data.subarray(i,Math.min(i+0x8000,data.length)));return btoa(raw)}
function decodeCells(value,packed=false){if(Array.isArray(value))return Uint8Array.from(value);const raw=atob(value);if(packed){const out=new Uint8Array(raw.length*2);for(let i=0;i<raw.length;i++){const byte=raw.charCodeAt(i);out[i*2]=byte&15;out[i*2+1]=byte>>4}return out}const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function encodeMaterialField(values,scale=1){const bytes=new Uint8Array(values.length);for(let i=0;i<values.length;i++)bytes[i]=Math.max(0,Math.min(255,Math.round(values[i]*scale)));let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(raw)}
function decodeMaterialField(value,target,scale=1){if(typeof value!=='string')return;try{const raw=atob(value);if(raw.length!==target.length)return;for(let i=0;i<raw.length;i++)target[i]=raw.charCodeAt(i)/scale}catch{}}
function serialize(){return{width:W,height:H,canvasSize,cells:encodeCells(cells),packed:false,materialState:{wetness:encodeMaterialField(materialState.wetness,255),heat:encodeMaterialField(materialState.heat,1/5),fuel:encodeMaterialField(materialState.fuel,255),burn:encodeMaterialField(materialState.burn,1),corrosion:encodeMaterialField(materialState.corrosion,1),airHeat:encodeMaterialField(materialState.airHeat,1/4)},ropes:ropes.map(r=>({id:r.id,points:r.points.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2),p.anchor?1:0])})),gravity,ambient,updatedAt:Date.now(),by:playerId}}
function applyWorld(data){if(!data||data.by===playerId||drawing||ropeDrag)return;if(typeof data.canvasSize==='string'&&CANVAS_SIZES[data.canvasSize])resizeCanvas(data.canvasSize);else if(Number.isInteger(data.width)&&Number.isInteger(data.height)){const matching=Object.entries(CANVAS_SIZES).find(([,d])=>d.width===data.width&&d.height===data.height);if(matching)resizeCanvas(matching[0])}let incoming;try{incoming=decodeCells(data.cells,!!data.packed)}catch(e){return}if(incoming.length!==N)return;lastRemoteWorldAt++;remoteApplying=true;cells.set(incoming);if(data.materialState){decodeMaterialField(data.materialState.wetness,materialState.wetness,255);decodeMaterialField(data.materialState.heat,materialState.heat,1/5);decodeMaterialField(data.materialState.fuel,materialState.fuel,255);decodeMaterialField(data.materialState.burn,materialState.burn,1);decodeMaterialField(data.materialState.corrosion,materialState.corrosion,1);decodeMaterialField(data.materialState.airHeat,materialState.airHeat,1/4)}if(Array.isArray(data.ropes))ropes=data.ropes.slice(0,100).map(entry=>{const points=Array.isArray(entry)?entry:entry?.points||[];return{id:!Array.isArray(entry)&&entry.id?String(entry.id):newRopeId(),length:1.5,stiffness:1,points:Array.isArray(points)?points.map(p=>({x:+p[0],y:+p[1],px:+p[0],py:+p[1],anchor:!!p[2]})):[]}}).filter(r=>r.points.length>1);if(Number.isFinite(data.gravity))gravity=data.gravity;if(Number.isFinite(data.ambient))ambient=data.ambient;document.querySelector('#gravity').value=Math.round(gravity*10);document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×';updateTemperature();remoteApplying=false}
async function joinRoom(code,approved=false){
 const clean=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24);
 if(!clean){alert('Enter a room code');return}
 try{
  await connectFirebase(firebaseConfig);
  if(!multiplayer)throw new Error('Multiplayer failed to initialize');
  await multiplayer.joinRoom(clean,{name:playerName,color:playerColor},approved,false);room=clean;publishOperation({type:'snapshotRequest'});
  document.querySelector('#roomLabel').textContent='ROOM · '+room;
  document.querySelector('#roomCode').value=room;
  updateCurrentRoomUI();
  log('Joined room '+room+' — shared world synchronization active');
 }catch(e){log('Could not join room: '+e.message);alert('Could not join room: '+e.message)}
}
function publishOperation(operation){multiplayer?.publishOperation(operation)}
function renderPlayers(people){
 const el=document.querySelector('#players'),entries=Object.entries(people||{});
 onlinePlayerIds=entries.map(([id])=>id);
 document.querySelector('#playerCount').textContent=entries.length+' online';el.replaceChildren();
 if(!entries.length){el.textContent='No players connected';return}
 for(const [id,p] of entries){
  const d=document.createElement('div');d.className='player';
  const av=document.createElement('span');av.className='avatar';av.style.background=p.color||'#29443e';av.style.color='#101923';av.textContent=(p.name||'G').slice(0,1).toUpperCase();
  const nm=document.createElement('span');nm.textContent=p.name||'Guest';
  const you=document.createElement('span');you.className='you';you.textContent=id===playerId?'YOU':'';
  d.append(av,nm,you);el.append(d);
 }
}
function applyOperation(op){if(!op||remoteApplying)return;if(op.type==='snapshotRequest'){const peers=onlinePlayerIds.filter(id=>id!==op.by).sort();if(peers[0]===playerId)publishOperation({type:'worldSnapshot',target:op.by,world:serialize()});return}if(op.type==='worldSnapshot'){if(op.target===playerId&&op.world)applyWorld(op.world);return}remoteApplying=true;try{if(op.type==='clear'){cells.fill(0);resetMaterialState(N);ropes=[]}else if(op.type==='ropeDelete'&&typeof op.ropeId==='string'){ropes=ropes.filter(r=>r.id!==op.ropeId)}else if(op.type==='canvasSize'&&CANVAS_SIZES[op.size]){resizeCanvas(op.size)}else if(op.type==='settings'){if(Number.isFinite(op.gravity)){gravity=op.gravity;document.querySelector('#gravity').value=Math.round(gravity*10);document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×'}if(Number.isFinite(op.ambient)){ambient=op.ambient;updateTemperature()}}else if(op.type==='rope'&&op.a&&op.b){const a=op.a,b=op.b,distance=Math.hypot(b.x-a.x,b.y-a.y),segments=Math.max(3,Math.ceil(distance/1.5)),points=[];for(let i=0;i<=segments;i++){const t=i/segments,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;points.push({x,y,px:x,py:y,anchor:i===0||i===segments})}const id=String(op.ropeId||newRopeId());if(!ropes.some(r=>r.id===id))ropes.push({id,points,length:distance/segments,stiffness:1})}else if(op.type==='ropeNode'&&typeof op.ropeId==='string'&&Number.isInteger(op.nodeIndex)&&Number.isFinite(op.x)&&Number.isFinite(op.y)){const rope=ropes.find(r=>r.id===op.ropeId),node=rope?.points[op.nodeIndex];if(node){node.x=op.x;node.y=op.y;node.px=op.x;node.py=op.y;if(typeof op.anchor==='boolean')node.anchor=op.anchor}}else if(op.type==='ropeEdit'&&Number.isInteger(op.index)&&Array.isArray(op.points)&&ropes[op.index]){const rope=ropes[op.index];if(op.points.length===rope.points.length)rope.points=op.points.map((p,i)=>({x:+p[0],y:+p[1],px:+p[0],py:+p[1],anchor:!!p[2]}))}else if(op.type==='stroke'&&Array.isArray(op.points)){const pts=op.points.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&inside(p.x,p.y)),bs=Math.max(1,Math.min(22,op.brush||1)),r=Math.floor(bs/4),mat=op.erase?M.EMPTY:Math.max(0,Math.min(16,op.material|0));if(op.erase){for(const p of pts)circle(p.x,p.y,bs,M.EMPTY)}else if(op.tool==='bomb'){for(const p of pts)circle(p.x,p.y,2,M.TNT)}else if(op.tool==='heat'||op.tool==='cool'){for(const p of pts)circle(p.x,p.y,bs,op.tool==='heat'?M.FIRE:M.ICE)}else if(op.tool==='line'){for(let k=0;k<pts.length;k++){if(k===0)circle(pts[k].x,pts[k].y,r,mat);else drawLine(pts[k-1].x,pts[k-1].y,pts[k].x,pts[k].y,mat,r)}}else for(const p of pts)circle(p.x,p.y,bs,mat)}}finally{remoteApplying=false}}
let localCursor=null;
canvas.addEventListener('pointermove',e=>{const p=canvasPoint(e);if(!inside(p.x,p.y))return;localCursor=p;if(!room||!multiplayer?.joined)return;const now=Date.now();if(now-lastCursorWrite<33)return;if(lastCursorPoint&&Math.abs(p.x-lastCursorPoint.x)+Math.abs(p.y-lastCursorPoint.y)<1)return;lastCursorWrite=now;lastCursorPoint=p;multiplayer.updateCursor(p,playerColor,playerName)});
const localCursorCanvas=document.querySelector('#localCursor'),localCursorCtx=localCursorCanvas.getContext('2d');
const cursorNamesCanvas=document.querySelector('#cursorNames'),cursorNamesCtx=cursorNamesCanvas.getContext('2d');
const canvasShell=document.querySelector('#canvasShell');
const canvasLayers=[canvas,localCursorCanvas,cursorNamesCanvas];
function fitCanvasToShell(){
 const shellWidth=canvasShell.clientWidth,shellHeight=canvasShell.clientHeight;
 const scale=Math.min(shellWidth/16,shellHeight/9);
 const width=Math.max(1,Math.floor(scale*16)),height=Math.max(1,Math.floor(scale*9));
 for(const layer of canvasLayers){layer.style.width=width+'px';layer.style.height=height+'px'}
}
fitCanvasToShell();
if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitCanvasToShell).observe(canvasShell);
else window.addEventListener('resize',fitCanvasToShell);
canvas.addEventListener('pointerleave',()=>{localCursor=null;localCursorCtx.clearRect(0,0,localCursorCanvas.width,localCursorCanvas.height)});
document.querySelector('#playerName').value=playerName;
document.querySelector('#playerColor').value=playerColor;
document.querySelector('#playerName').addEventListener('change',e=>{playerName=e.target.value.trim().slice(0,20)||'Lab guest';e.target.value=playerName;localStorage.setItem('pixelphyx-player-name',playerName);multiplayer?.updateIdentity(playerName,playerColor);if(localCursor)multiplayer?.updateCursor(localCursor,playerColor,playerName)});
document.querySelector('#playerColor').addEventListener('input',e=>{playerColor=e.target.value;localStorage.setItem('pixelphyx-player-color',playerColor);multiplayer?.updateIdentity(playerName,playerColor);if(localCursor)multiplayer?.updateCursor(localCursor,playerColor,playerName)});
updateTemperature();
