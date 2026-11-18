// PixelPhyx material simulation: density, capillary wetting, thermal transfer and combustion.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let state={wetness:new Float32Array(0),heat:new Float32Array(0),fuel:new Float32Array(0),burn:new Float32Array(0),age:new Uint16Array(0),corrosion:new Float32Array(0),airHeat:new Float32Array(0),airNext:new Float32Array(0)};
export const materialState=state;
export function resetMaterialState(size){
 Object.assign(state,{wetness:new Float32Array(size),heat:new Float32Array(size),fuel:new Float32Array(size),burn:new Float32Array(size),age:new Uint16Array(size),corrosion:new Float32Array(size),airHeat:new Float32Array(size),airNext:new Float32Array(size)});
}
const PROPERTIES={
 1:{density:1.6,conductivity:.08,porosity:.72,flammability:0,settle:.98},
 2:{density:1,conductivity:.58,viscosity:.16,heatCapacity:4.18},
 3:{density:2.7,conductivity:.18,flammability:0},
 4:{density:.65,conductivity:.12,flammability:.82,ignition:270,fuel:1},
 5:{density:.08,conductivity:.02},
 6:{density:.82,conductivity:.09,viscosity:.07,flammability:1,ignition:180,fuel:1},
 7:{density:1.2,conductivity:.3,viscosity:.22},
 8:{density:.0006,conductivity:.04},
 9:{density:.001,conductivity:.015},
 10:{density:.92,conductivity:.22},
 11:{density:2.8,conductivity:.8},
 12:{density:1.1,conductivity:.1,flammability:.95,ignition:180,fuel:1},
 13:{density:.45,conductivity:.12,flammability:.9,ignition:90,fuel:.65},
 14:{density:2.16,conductivity:.12},
 15:{density:2.5,conductivity:.9},
 16:{density:1.15,conductivity:.12,flammability:.12,ignition:520,fuel:.12}
};
function swap(cells,state,a,b,recordMove){
 const first=cells[a],second=cells[b];cells[a]=second;cells[b]=first;
 if(recordMove){if(first)recordMove(a,b,first);if(second)recordMove(b,a,second)}
 for(const key of ['wetness','heat','fuel','burn','age','corrosion']){const arr=state[key];const t=arr[a];arr[a]=arr[b];arr[b]=t}
}
function ignite(cells,state,i,m){
 const p=PROPERTIES[m];if(!p?.flammability)return false;
 if(!state.fuel[i])state.fuel[i]=p.fuel||1;
 state.burn[i]=Math.max(state.burn[i],1);
 state.heat[i]=Math.max(state.heat[i],p.ignition||100);
 return true;
}
export function stepMaterialPhysics({cells,width,height,ambient,gravity,ropes,ropeBlocksMove,materials,state:s=state,recordMove}){
 const M=materials,W=width,H=height,N=W*H;
 if(s.wetness.length!==N)resetMaterialState(N);
 const wet=s.wetness,heat=s.heat,fuel=s.fuel,burn=s.burn,age=s.age,corrosion=s.corrosion;
 const index=(x,y)=>y*W+x,inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
 const get=(x,y)=>inside(x,y)?cells[index(x,y)]:M.STONE;
 // Water displaces lighter grains; wet sand clumps, darkens and becomes heavier/slower.
 for(let y=H-2;y>=0;y--){
  const start=Math.random()<.5?0:W-1,step=start===0?1:-1;
  for(let x=start;x>=0&&x<W;x+=step){
   const i=index(x,y),m=cells[i];if(!m)continue;
   if(m===M.SAND){
    const below=index(x,y+1),under=cells[below];
    if(under===M.WATER||under===M.OIL){
     if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below,recordMove);
    }else if(under===M.EMPTY&&Math.random()<clamp((.95*(1-wet[i]*.82))*clamp(gravity,.1,2),.04,1)){
     if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below,recordMove);
    }else if(under!==M.EMPTY&&under!==M.WATER&&under!==M.OIL){
     const d=Math.random()<.5?-1:1,nx=x+d;
     if(inside(nx,y+1)){
      const ni=index(nx,y+1),side=cells[ni];
      if((side===M.EMPTY||side===M.WATER||side===M.OIL)&&!ropeBlocksMove(x+.5,y+.5,nx+.5,y+1.5))swap(cells,s,i,ni,recordMove);
     }
    }
   }
  }
 }
}
