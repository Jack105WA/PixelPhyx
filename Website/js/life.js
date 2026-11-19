// Soil moisture, seed burial, germination, and gradual plant growth.
export const LIFE_MATERIALS = [
 {name:'Oak',icon:'♣',seedId:23,plantId:18,color:'#4f9b45',rgb:[79,155,69],growth:72,maxHeight:30,branchEvery:4,style:'tree'},
 {name:'Fern',icon:'❧',seedId:24,plantId:19,color:'#65bd62',rgb:[101,189,98],growth:42,maxHeight:13,branchEvery:3,style:'fern'},
 {name:'Flower',icon:'✿',seedId:25,plantId:20,color:'#e58cae',rgb:[229,140,174],growth:58,maxHeight:15,branchEvery:5,style:'flower'},
 {name:'Vine',icon:'〰',seedId:26,plantId:21,color:'#6fae55',rgb:[111,174,85],growth:48,maxHeight:22,branchEvery:3,style:'vine'},
 {name:'Cactus',icon:'♠',seedId:27,plantId:22,color:'#4caa86',rgb:[76,170,134],growth:105,maxHeight:17,branchEvery:5,style:'cactus'}
];
const bySeed=new Map(LIFE_MATERIALS.map(p=>[p.seedId,p]));
const byPlant=new Map(LIFE_MATERIALS.map(p=>[p.plantId,p]));
const EMPTY=0,WATER=2,FIRE=5,STEAM=8,SMOKE=9,LAVA=11,SOIL=28;
function noise(x,y,tick,salt=0){let v=(Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b)^tick^salt)>>>0;v^=v>>>16;v=Math.imul(v,0x7feb352d)>>>0;v^=v>>>15;v=Math.imul(v,0x846ca68b)>>>0;v^=v>>>16;return v/0xffffffff}
function swapState(cells,age,wetness,a,b){const c=cells[a];cells[a]=cells[b];cells[b]=c;let v=age[a];age[a]=age[b];age[b]=v;v=wetness[a];wetness[a]=wetness[b];wetness[b]=v}
function add(cells,age,x,y,id,w,h){if(x<0||x>=w||y<0||y>=h)return false;const i=y*w+x;if(cells[i]!==EMPTY)return false;cells[i]=id;age[i]=0;return true}
function soilMoisture(cells,wetness,w,h,tick){
 const len=Math.min(cells.length,wetness.length,w*h);
 {
  for(let i=0;i<len;i++)if(cells[i]===SOIL){
   const x=i%w,y=(i/w)|0;let water=false;
   for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
    const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h&&cells[ny*w+nx]===WATER){water=true;break}
   }
   if(water)wetness[i]=Math.min(1,(wetness[i]||0)+.12);
   else wetness[i]=Math.max(0,(wetness[i]||0)-.0008);
  }
  // Moisture slowly wicks through neighboring soil instead of instantly flooding it.
  for(let y=h-1;y>=0;y--)for(let x=0;x<w;x++){
   const i=y*w+x;if(cells[i]!==SOIL)continue;
   const own=wetness[i]||0;
   for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
    const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
    const n=ny*w+nx;if(cells[n]===SOIL&&own-(wetness[n]||0)>.08)wetness[n]=Math.min(1,(wetness[n]||0)+.008);
   }
  }
 }
}
function moistureNear(cells,wetness,x,y,w,h,r=4){
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.abs(dx)+Math.abs(dy)>r+1)continue;
  const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
  const i=ny*w+nx;if(cells[i]===WATER||(wetness[i]||0)>=.12)return true;
 }
 return false;
}
function grow(cells,age,x,y,p,w,h,tick,wetness){
 const i=y*w+x;if(age[i]<p.growth)return;
 let height=1;for(let py=y+1;py<h&&cells[py*w+x]===p.plantId;py++)height++;
 const stage=Math.floor(tick/p.growth),side=noise(x,y,stage,p.plantId)<.5?-1:1;
 if(height<p.maxHeight){
  const above=y>0?(y-1)*w+x:-1;
  if(above>=0&&cells[above]===SOIL){
   const push=noise(x,y,stage,0x5013)<.5?-1:1;
   for(const dx of [push,-push]){const nx=x+dx;if(nx>=0&&nx<w&&cells[(y-1)*w+nx]===EMPTY){const target=(y-1)*w+nx;cells[target]=SOIL;cells[above]=EMPTY;wetness[target]=wetness[above];wetness[above]=0;age[target]=age[above];age[above]=0;break}}
  }
  if(add(cells,age,x,y-1,p.plantId,w,h)){
   age[i]=0;
   if(p.style==='tree'&&stage%p.branchEvery===0){add(cells,age,x+side,y-1,p.plantId,w,h);if(stage%(p.branchEvery*2)===0)add(cells,age,x-side,y-2,p.plantId,w,h)}
   else if(p.style==='fern'&&stage%p.branchEvery===0){add(cells,age,x-1,y-1,p.plantId,w,h);add(cells,age,x+1,y-1,p.plantId,w,h)}
   else if(p.style==='flower'&&height>=p.maxHeight-2){add(cells,age,x-1,y-1,p.plantId,w,h);add(cells,age,x+1,y-1,p.plantId,w,h);add(cells,age,x,y-2,p.plantId,w,h)}
   else if(p.style==='vine'&&stage%p.branchEvery===0)add(cells,age,x+side,y,p.plantId,w,h);
   else if(p.style==='cactus'&&stage%p.branchEvery===0&&height>3){add(cells,age,x+side,y,p.plantId,w,h);add(cells,age,x+side,y-1,p.plantId,w,h)}
   return;
  }
 }
 age[i]=0;
}
export function createLifeSystem(){
 let seedBurrowDepth=new Uint8Array(0);
 function step({cells,age,wetness,width,height,tick}){
  const length=Math.min(cells.length,age.length,wetness.length,width*height);
  if(seedBurrowDepth.length!==length)seedBurrowDepth=new Uint8Array(length);
  soilMoisture(cells,wetness,width,height,tick);
  // Seeds fall normally, then displace one soil cell as they burrow into loose soil.
  for(let y=height-1;y>=0;y--){
   const reverse=(tick+y)&1;
   for(let k=0;k<width;k++){
    const x=reverse?width-1-k:k,i=y*width+x;if(i>=length)continue;
    const p=bySeed.get(cells[i]);if(!p)continue;
    const below=i+width;
    if(y+1<height&&cells[below]===EMPTY){
     cells[below]=cells[i];cells[i]=EMPTY;age[below]=age[i];age[i]=0;wetness[below]=wetness[i];wetness[i]=0;continue;
    }
    if(y+1<height&&cells[below]===SOIL&&y>0&&seedBurrowDepth[i]<2&&(cells[i-width]===EMPTY||cells[i-width]===SOIL)&&noise(x,y,tick,p.seedId)<.82){
     swapState(cells,age,wetness,i,below);seedBurrowDepth[below]=seedBurrowDepth[i]+1;seedBurrowDepth[i]=0;
     continue;
    }
    const support=y+1<height?cells[below]:FIRE;
    const buried=support===SOIL||((x>0&&cells[i-1]===SOIL)||(x+1<width&&cells[i+1]===SOIL));
    if(buried&&moistureNear(cells,wetness,x,y,width,height,3)&&age[i]<65535)age[i]++;
    if(buried&&age[i]>=90){
     cells[i]=p.plantId;age[i]=0;wetness[i]=Math.max(wetness[i]||0,.18);seedBurrowDepth[i]=0;
     // Establish a short root below the seed without deleting the surrounding soil.
     if(y+1<height&&cells[below]===SOIL){cells[below]=p.plantId;age[below]=0;wetness[below]=Math.max(wetness[below]||0,.18)}
    }
   }
  }
  // Only the growing tips advance. Dry plants pause rather than growing at a fixed rate.
  for(let y=height-1;y>=0;y--)for(let x=0;x<width;x++){
   const i=y*width+x;if(i>=length)continue;const p=byPlant.get(cells[i]);if(!p)continue;
   const above=y>0?cells[i-width]:EMPTY,below=y+1<height?cells[i+width]:EMPTY;
   const damp=moistureNear(cells,wetness,x,Math.min(height-1,y+2),width,height,4);
   if(above===p.plantId&&below===SOIL&&damp){
    if(age[i]<65535)age[i]++;
    if(age[i]>=p.growth*2){cells[i+width]=p.plantId;age[i+width]=0;wetness[i+width]=Math.max(wetness[i+width]||0,.12);age[i]=0;
     const side=noise(x,y,tick,p.plantId+91)<.5?-1:1,nx=x+side;
     if(nx>=0&&nx<width&&cells[i+side]===SOIL&&noise(x,y,tick,p.plantId+92)<.18){cells[i+side]=p.plantId;age[i+side]=0}
    }
   }
   if(above!==p.plantId&&damp){if(age[i]<65535)age[i]++;grow(cells,age,x,y,p,width,height,tick,wetness)}
  }
 }
 return Object.freeze({step,materials:LIFE_MATERIALS});
}