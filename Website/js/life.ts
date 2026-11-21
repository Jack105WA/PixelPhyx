// Distinct, large-form plants for the cellular life simulation.
export const LIFE_MATERIALS = [
 {name:'Oak',icon:'♣',seedId:23,plantId:18,accentId:29,color:'#4f9b45',accentColor:'#9bd36b',rgb:[79,155,69],accentRgb:[155,211,107],growth:54,maxHeight:48,branchEvery:4,style:'tree'},
 {name:'Fern',icon:'❧',seedId:24,plantId:19,accentId:30,color:'#4b9d55',accentColor:'#a9df78',rgb:[75,157,85],accentRgb:[169,223,120],growth:32,maxHeight:31,branchEvery:3,style:'fern'},
 {name:'Flower',icon:'✿',seedId:25,plantId:20,accentId:31,color:'#ed7eaa',accentColor:'#ffd65e',rgb:[237,126,170],accentRgb:[255,214,94],growth:40,maxHeight:29,branchEvery:5,style:'flower'},
 {name:'Vine',icon:'〰',seedId:26,plantId:21,accentId:32,color:'#4e9a48',accentColor:'#b1d96a',rgb:[78,154,72],accentRgb:[177,217,106],growth:34,maxHeight:43,branchEvery:3,style:'vine'},
 {name:'Cactus',icon:'♠',seedId:27,plantId:22,accentId:33,color:'#329d83',accentColor:'#d9e99a',rgb:[50,157,131],accentRgb:[217,233,154],growth:62,maxHeight:35,branchEvery:5,style:'cactus'}
];
const bySeed=new Map(LIFE_MATERIALS.map(p=>[p.seedId,p]));
const byPlant=new Map(LIFE_MATERIALS.map(p=>[p.plantId,p]));
const EMPTY=0,WATER=2,FIRE=5,SOIL=28;
function noise(x,y,tick,salt=0){let v=(Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b)^tick^salt)>>>0;v^=v>>>16;v=Math.imul(v,0x7feb352d)>>>0;v^=v>>>15;v=Math.imul(v,0x846ca68b)>>>0;v^=v>>>16;return v/0xffffffff}
function swapState(cells,age,wetness,a,b){const c=cells[a];cells[a]=cells[b];cells[b]=c;let v=age[a];age[a]=age[b];age[b]=v;v=wetness[a];wetness[a]=wetness[b];wetness[b]=v}
function add(cells,age,x,y,id,w,h){if(x<0||x>=w||y<0||y>=h)return false;const i=y*w+x;if(cells[i]!==EMPTY)return false;cells[i]=id;age[i]=0;return true}
function soilMoisture(cells,wetness,w,h){
 const len=Math.min(cells.length,wetness.length,w*h);
 for(let i=0;i<len;i++)if(cells[i]===SOIL){
  const x=i%w,y=(i/w)|0;let water=false;
  for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h&&cells[ny*w+nx]===WATER){water=true;break}}
  wetness[i]=water?Math.min(1,(wetness[i]||0)+.12):Math.max(0,(wetness[i]||0)-.0008);
 }
 // Slow lateral and vertical moisture transfer through connected soil.
 for(let y=h-1;y>=0;y--)for(let x=0;x<w;x++){
  const i=y*w+x;if(cells[i]!==SOIL)continue;const own=wetness[i]||0;
  for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const n=ny*w+nx;if(cells[n]===SOIL&&own-(wetness[n]||0)>.08)wetness[n]=Math.min(1,(wetness[n]||0)+.008)}
 }
}

const GRASS=34,GRASS_TIP=35;
function grassNoise(x,y,tick,salt=0){
 let v=(Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b)^tick^salt)>>>0;
 v^=v>>>16;v=Math.imul(v,0x7feb352d)>>>0;v^=v>>>15;
 v=Math.imul(v,0x846ca68b)>>>0;v^=v>>>16;return v/0xffffffff;
}
function hasSunlight(cells,x,y,w,h){
 for(let py=y-1;py>=Math.max(0,y-18);py--){
  const id=cells[py*w+x];
  if(id!==EMPTY&&id!==5&&id!==8&&id!==9&&id!==2)return false;
 }
 return true;
}
function stepGrass(cells,age,wetness,w,h,tick,ambient){
 const len=Math.min(cells.length,age.length,wetness.length,w*h);
 const temperatureOk=ambient>=5&&ambient<=42;
 for(let y=h-1;y>=0;y--)for(let x=0;x<w;x++){
  const i=y*w+x;if(i>=len)continue;
  if(cells[i]===GRASS||cells[i]===GRASS_TIP){
   const below=y+1<h?cells[i+w]:EMPTY;
   if(below!==SOIL&&below!==GRASS&&below!==GRASS_TIP){cells[i]=EMPTY;age[i]=0}
   continue;
  }
  if(cells[i]!==SOIL||y===0)continue;
  const above=i-w;if(cells[above]!==EMPTY)continue;
  const moisture=wetness[i]||0,sunny=hasSunlight(cells,x,y,w,h);
  if(!temperatureOk||!sunny||moisture<.18){
   if(age[i]>0)age[i]=Math.max(0,age[i]-2);
   continue;
  }
  if(age[i]<65535)age[i]++;
  const threshold=360+Math.floor(grassNoise(x,y,0,0x6A455)*240);
  if(age[i]<threshold||grassNoise(x,y,tick,0x6A456)>.56)continue;
  cells[above]=GRASS;age[above]=0;
  const lean=grassNoise(x,y,tick,0x6A457)<.5?-1:1;
  if(y>1&&grassNoise(x,y,tick,0x6A458)>.24&&cells[above-w]===EMPTY){
   cells[above-w]=GRASS_TIP;age[above-w]=0;
  }
  const side=x+lean;
  if(side>=0&&side<w&&cells[(y-1)*w+side]===EMPTY&&grassNoise(x,y,tick,0x6A459)>.32){
   cells[(y-1)*w+side]=GRASS_TIP;age[(y-1)*w+side]=0;
  }
  age[i]=0;
 }
}

function moistureNear(cells,wetness,x,y,w,h,r=4){
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.abs(dx)+Math.abs(dy)>r+1)continue;const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
  const i=ny*w+nx;if(cells[i]===WATER||(wetness[i]||0)>=.12)return true;
 }
 return false;
}
function leafCluster(cells,age,cx,cy,p,w,h,r=2){
 for(let dy=-r;dy<=r;dy++)for(let dx=-r*2;dx<=r*2;dx++){
  const shape=(Math.abs(dx)/(r*2+0.01))**2+(Math.abs(dy)/(r+0.01))**2;
  if(shape<=1.12&&noise(cx+dx,cy+dy,r,p.plantId)<.88)add(cells,age,cx+dx,cy+dy,p.accentId,w,h);
 }
}
function decorate(cells,age,x,y,p,w,h,tick,height){
 const stage=Math.floor(tick/p.growth),side=noise(x,height,stage,p.plantId)<.5?-1:1;
 if(p.style==='tree'){
  // Alternating, rising limbs with broad, irregular crowns.
  if(height>4&&height%p.branchEvery===0){
   const length=3+Math.floor(noise(x,y,stage,17)*4);
   for(let k=1;k<=length;k++)add(cells,age,x+side*k,y-Math.ceil(k*.62),p.plantId,w,h);
   leafCluster(cells,age,x+side*length,y-Math.ceil(length*.62),p,w,h,2+Math.floor(noise(x,y,stage,18)*2));
   if(height%8===0){for(let k=1;k<=length-1;k++)add(cells,age,x-side*k,y-Math.ceil(k*.55),p.plantId,w,h);leafCluster(cells,age,x-side*length,y-Math.ceil(length*.55),p,w,h,2)}
  }
  // Exposed roots and a thick lower trunk make the tree read as a tree.
  if(height<8){add(cells,age,x-1,y,p.plantId,w,h);add(cells,age,x+1,y,p.plantId,w,h)}
  if(height>p.maxHeight-8)leafCluster(cells,age,x,y-1,p,w,h,3);
 }else if(p.style==='fern'){
  // Repeated feathered fronds arch out from a central stem.
  if(height>2&&height%3===0){
   const length=5+Math.floor(noise(x,y,stage,23)*5);
   for(const dir of [-1,1]){
    for(let k=1;k<=length;k++){
     const fx=x+dir*k,fy=y-Math.floor(k*.58);
     add(cells,age,fx,fy,p.plantId,w,h);
     for(const feather of [-1,1])if(k>1)add(cells,age,fx+dir,fy+feather,p.accentId,w,h);
     add(cells,age,fx,fy-1,p.accentId,w,h);
    }
   }
  }
 }else if(p.style==='flower'){
  // Broad alternating leaves along a sturdy stem.
  if(height>3&&height%6===0){
   for(let k=1;k<=4;k++){add(cells,age,x+side*k,y-Math.floor(k*.35),p.plantId,w,h);add(cells,age,x+side*k,y-Math.floor(k*.35)-1,p.accentId,w,h)}
  }
  if(height>=p.maxHeight-2){
   // A layered 13x9 blossom with a bright, multi-cell centre.
   for(let dy=-4;dy<=4;dy++)for(let dx=-6;dx<=6;dx++){
    const ellipse=(dx*dx)/36+(dy*dy)/16;
    if(ellipse<=1.18&&Math.max(Math.abs(dx),Math.abs(dy))>1)add(cells,age,x+dx,y-2+dy,p.plantId,w,h);
   }
   for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])add(cells,age,x+dx,y-2+dy,p.accentId,w,h);
  }
 }else if(p.style==='vine'){
  // Long looping tendrils, alternating paired leaves, and side shoots.
  if(height>2&&height%3===0){
   for(let k=1;k<=4;k++){const bend=side*Math.floor(k/2);add(cells,age,x+bend,y-k,p.plantId,w,h)}
   for(const dir of [-1,1]){
    const leafX=x+dir*(2+(height%4)),leafY=y-2;
    add(cells,age,leafX,leafY,p.accentId,w,h);add(cells,age,leafX+dir,leafY-1,p.accentId,w,h);add(cells,age,leafX-dir,leafY-1,p.accentId,w,h);
   }
  }
 }else if(p.style==='cactus'){
  // Ribbed, broad column with unmistakable upward arms.
  add(cells,age,x-1,y,p.plantId,w,h);add(cells,age,x+1,y,p.plantId,w,h);
  if(height%3===0){add(cells,age,x-2,y,p.accentId,w,h);add(cells,age,x+2,y,p.accentId,w,h)}
  if(height>9&&height%8===0){
   const dir=side;
   for(let k=1;k<=4;k++)add(cells,age,x+dir*2,y-k,p.plantId,w,h);
   add(cells,age,x+dir*3,y-4,p.plantId,w,h);add(cells,age,x+dir*4,y-4,p.plantId,w,h);
   for(let k=1;k<=3;k++)add(cells,age,x+dir*4,y-4-k,p.plantId,w,h);
   add(cells,age,x+dir*4,y-6,p.accentId,w,h);
  }
 }
}
function grow(cells,age,x,y,p,w,h,tick,wetness){
 const i=y*w+x;if(age[i]<p.growth)return;
 let height=1;for(let py=y+1;py<h&&cells[py*w+x]===p.plantId;py++)height++;
 const above=y>0?(y-1)*w+x:-1;
 if(height<p.maxHeight&&above>=0&&cells[above]===SOIL){
  const push=noise(x,y,tick,0x5013)<.5?-1:1;
  for(const dx of [push,-push]){const nx=x+dx;if(nx>=0&&nx<w&&cells[(y-1)*w+nx]===EMPTY){const target=(y-1)*w+nx;cells[target]=SOIL;cells[above]=EMPTY;wetness[target]=wetness[above];wetness[above]=0;age[target]=age[above];age[above]=0;break}}
 }
 if(height<p.maxHeight&&add(cells,age,x,y-1,p.plantId,w,h)){
  age[i]=0;decorate(cells,age,x,y-1,p,w,h,tick,height);return;
 }
 age[i]=0;
}
export function createLifeSystem(){
 let seedBurrowDepth=new Uint8Array(0);
 function step({cells,age,wetness,width,height,tick,ambient=20}){
  const length=Math.min(cells.length,age.length,wetness.length,width*height);
  if(seedBurrowDepth.length!==length)seedBurrowDepth=new Uint8Array(length);
  soilMoisture(cells,wetness,width,height);
  stepGrass(cells,age,wetness,width,height,tick,ambient);
  // Seeds settle, burrow into loose soil, then germinate only in damp earth.
  for(let y=height-1;y>=0;y--){
   const reverse=(tick+y)&1;
   for(let k=0;k<width;k++){
    const x=reverse?width-1-k:k,i=y*width+x;if(i>=length)continue;
    const p=bySeed.get(cells[i]);if(!p)continue;const below=i+width;
    if(y+1<height&&cells[below]===EMPTY){cells[below]=cells[i];cells[i]=EMPTY;age[below]=age[i];age[i]=0;wetness[below]=wetness[i];wetness[i]=0;seedBurrowDepth[below]=seedBurrowDepth[i];seedBurrowDepth[i]=0;continue}
    if(y+1<height&&cells[below]===SOIL&&y>0&&seedBurrowDepth[i]<2&&(cells[i-width]===EMPTY||cells[i-width]===SOIL)&&noise(x,y,tick,p.seedId)<.82){swapState(cells,age,wetness,i,below);seedBurrowDepth[below]=seedBurrowDepth[i]+1;seedBurrowDepth[i]=0;continue}
    const support=y+1<height?cells[below]:FIRE;
    const buried=support===SOIL||((x>0&&cells[i-1]===SOIL)||(x+1<width&&cells[i+1]===SOIL));
    if(buried&&moistureNear(cells,wetness,x,y,width,height,3)&&age[i]<65535)age[i]++;
    if(buried&&age[i]>=90){cells[i]=p.plantId;age[i]=0;wetness[i]=Math.max(wetness[i]||0,.18);seedBurrowDepth[i]=0;if(y+1<height&&cells[below]===SOIL){cells[below]=p.plantId;age[below]=0;wetness[below]=Math.max(wetness[below]||0,.18)}}
   }
  }
  // Tips grow slowly and pause whenever the surrounding soil is dry.
  for(let y=height-1;y>=0;y--)for(let x=0;x<width;x++){
   const i=y*width+x;if(i>=length)continue;const p=byPlant.get(cells[i]);if(!p)continue;
   const above=y>0?cells[i-width]:EMPTY,below=y+1<height?cells[i+width]:EMPTY;
   const damp=moistureNear(cells,wetness,x,Math.min(height-1,y+2),width,height,5);
   if(above===p.plantId&&below===SOIL&&damp){
    if(age[i]<65535)age[i]++;
    if(age[i]>=p.growth*2){cells[i+width]=p.plantId;age[i+width]=0;wetness[i+width]=Math.max(wetness[i+width]||0,.12);age[i]=0}
   }
   if(above!==p.plantId&&damp){if(age[i]<65535)age[i]++;grow(cells,age,x,y,p,width,height,tick,wetness)}
  }
 }
 return Object.freeze({step,materials:LIFE_MATERIALS});
}
