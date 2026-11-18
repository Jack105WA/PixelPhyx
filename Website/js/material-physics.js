// JavaScript owns only sand displacement. Material chemistry and thermal state run in Rust/WASM.
let state={
 wetness:new Float32Array(0),heat:new Float32Array(0),heatInputs:new Float32Array(0),fuel:new Float32Array(0),
 burn:new Float32Array(0),age:new Uint16Array(0),corrosion:new Float32Array(0),
 airHeat:new Float32Array(0),airNext:new Float32Array(0)
};
export const materialState=state;

export function resetMaterialState(size){
 Object.assign(state,{
  wetness:new Float32Array(size),heat:new Float32Array(size),heatInputs:new Float32Array(size),fuel:new Float32Array(size),
  burn:new Float32Array(size),age:new Uint16Array(size),corrosion:new Float32Array(size),
  airHeat:new Float32Array(size),airNext:new Float32Array(size)
 });
}

function swap(cells,s,a,b,recordMove){
 const first=cells[a],second=cells[b];
 cells[a]=second;cells[b]=first;
 if(recordMove){
  if(first)recordMove(a,b,first);
  if(second)recordMove(b,a,second);
 }
 for(const key of ['wetness','heat','heatInputs','fuel','burn','age','corrosion']){
  const values=s[key],value=values[a];
  values[a]=values[b];values[b]=value;
 }
}

export function stepMaterialPhysics({cells,width,height,gravity,ropeBlocksMove,state:s=state,recordMove}){
 const M={SAND:1,WATER:2,OIL:6,EMPTY:0};
 const W=width,H=height,N=W*H;
 if(s.wetness.length!==N)resetMaterialState(N);
 const wet=s.wetness;
 const index=(x,y)=>y*W+x;
 const inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;

 // Sand displacement remains here until particle movement is migrated to WASM.
 for(let y=H-2;y>=0;y--){
  const start=Math.random()<.5?0:W-1,step=start===0?1:-1;
  for(let x=start;x>=0&&x<W;x+=step){
   const i=index(x,y),material=cells[i];
   if(material!==M.SAND)continue;
   const below=index(x,y+1),under=cells[below];
   if(under===M.WATER||under===M.OIL){
    if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below,recordMove);
   }else if(under===M.EMPTY&&Math.random()<Math.max(.04,Math.min(1,.95*(1-wet[i]*.82)*Math.max(.1,Math.min(2,gravity))))){
    if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below,recordMove);
   }else if(under!==M.EMPTY&&under!==M.WATER&&under!==M.OIL){
    const dx=Math.random()<.5?-1:1,nx=x+dx;
    if(inside(nx,y+1)){
     const target=index(nx,y+1),side=cells[target];
     if((side===M.EMPTY||side===M.WATER||side===M.OIL)&&!ropeBlocksMove(x+.5,y+.5,nx+.5,y+1.5)){
      swap(cells,s,i,target,recordMove);
     }
    }
   }
  }
 }
}
