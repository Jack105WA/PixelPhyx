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
   if(m===M.WATER){
    // Water flows around solids and gradually saturates porous sand and plant matter.
    for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
     const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
     const ni=index(nx,ny),other=cells[ni];
     if(other===M.SAND&&wet[ni]<1&&Math.random()<.12){
      // Sand absorbs moisture, not the water particle itself. Keep water in the
      // world so a pool cannot vanish just because it touches a large sand bed.
      const amount=Math.min(.025,1-wet[ni]);
      wet[ni]+=amount;
     }
     if(other===M.PLANT&&Math.random()<.08)wet[ni]=Math.min(1,wet[ni]+.15);
    }
   }
  }
 }
 // Air stores and transports heat independently of particles. Hot fire/lava warms nearby
 // air, rising air carries heat upward, and exposed materials absorb it without contact.
 const air=s.airHeat,nextAir=s.airNext;
 for(let i=0;i<N;i++){
  
  const m=cells[i],source=m===M.FIRE||m===M.LAVA;
  const target=source?Math.max(heat[i],m===M.LAVA?900:780):ambient;
  air[i]+=(target-air[i])*(source?.16:.0015);
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=index(x,y),here=air[i];
  const up=y>0?air[i-W]:ambient;
  const left=x>0?air[i-1]:ambient,right=x<W-1?air[i+1]:ambient;
  const down=y<H-1?air[i+W]:ambient;
  nextAir[i]=Math.max(ambient,here+(down-here)*.105+(left+right-2*here)*.018+(up-here)*.006);
 }
 air.set(nextAir);
 // Heat diffuses through adjacent matter. Combustion consumes fuel over time rather than
 // instantly deleting a flammable object; wood chars, oil burns hot, and wet matter resists ignition.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=index(x,y),m=cells[i];if(!m)continue;
  const p=PROPERTIES[m]||{};
  age[i]=Math.min(65535,age[i]+1);
  if(m===M.SALT&&get(x,y+1)===M.WATER&&Math.random()<.04)cells[i]=M.EMPTY;
  if(m===M.STEAM&&Math.random()<.003)cells[i]=M.WATER;
  if(m===M.SMOKE&&Math.random()<.002)cells[i]=M.EMPTY;
  if(m===M.SAND&&wet[i]>0)wet[i]=Math.max(0,wet[i]-.0008);
  // Conduct heat between neighboring cells, not just toward ambient temperature.
  if(heat[i]>ambient){
   for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
    const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
    const ni=index(nx,ny),other=cells[ni];if(!other)continue;
    const conductivity=Math.min(.08,(p.conductivity||.05)*(PROPERTIES[other]?.conductivity||.05)*1.5);
    const transfer=(heat[i]-heat[ni])*conductivity;
    if(Math.abs(transfer)>0.05){heat[i]-=transfer;heat[ni]+=transfer}
   }
  }
  if(heat[i]>ambient){
   const loss=(p.conductivity||.05)*.015;
   heat[i]=Math.max(ambient,heat[i]-loss);
  }else if(heat[i]<ambient)heat[i]=ambient;
 }
 // Air transfers heat to nearby exposed matter, even when a gap separates it from the source.
 for(let i=0;i<N;i++){
  
  const m=cells[i];if(!m)continue;
  const prop=PROPERTIES[m],airTemperature=air[i];
  if(airTemperature>heat[i])heat[i]+=(airTemperature-heat[i])*(m===M.WOOD?.055:.035);
  if(prop?.flammability&&heat[i]>(prop.ignition||220)){
   const moisture=wet[i]||0;
   const chance=(m===M.WOOD?.018:m===M.PLANT?.025:m===M.OIL?.04:m===M.TNT?.025:.008)*(1-moisture*.94);
   if(Math.random()<chance)ignite(cells,s,i,m);
  }
 }
 // Remove stale state when a particle has been erased or transformed.
 for(let i=0;i<N;i++)if(!cells[i]){wet[i]=0;heat[i]=0;fuel[i]=0;burn[i]=0;age[i]=0;corrosion[i]=0}
}
