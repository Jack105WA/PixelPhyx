// PixelPhyx material simulation: density, capillary wetting, thermal transfer and combustion.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let state={wetness:new Float32Array(0),heat:new Float32Array(0),fuel:new Float32Array(0),burn:new Float32Array(0),age:new Uint16Array(0),corrosion:new Float32Array(0)};
export const materialState=state;
export function resetMaterialState(size){
 Object.assign(state,{wetness:new Float32Array(size),heat:new Float32Array(size),fuel:new Float32Array(size),burn:new Float32Array(size),age:new Uint16Array(size),corrosion:new Float32Array(size)});
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
function swap(cells,state,a,b){
 const v=cells[a];cells[a]=cells[b];cells[b]=v;
 for(const key of ['wetness','heat','fuel','burn','age','corrosion']){const arr=state[key];const t=arr[a];arr[a]=arr[b];arr[b]=t}
}
function ignite(cells,state,i,m){
 const p=PROPERTIES[m];if(!p?.flammability)return false;
 if(!state.fuel[i])state.fuel[i]=p.fuel||1;
 state.burn[i]=Math.max(state.burn[i],1);
 state.heat[i]=Math.max(state.heat[i],p.ignition||100);
 return true;
}
export function stepMaterialPhysics({cells,width,height,ambient,gravity,ropes,ropeBlocksMove,materials,state:s=state}){
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
     if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below);
    }else if(under===M.EMPTY&&Math.random()<clamp((.95*(1-wet[i]*.82))*clamp(gravity,.1,2),.04,1)){
     if(!ropeBlocksMove(x+.5,y+.5,x+.5,y+1.5))swap(cells,s,i,below);
    }else if(under!==M.EMPTY&&under!==M.WATER&&under!==M.OIL){
     const d=Math.random()<.5?-1:1,nx=x+d;
     if(inside(nx,y+1)){
      const ni=index(nx,y+1),side=cells[ni];
      if((side===M.EMPTY||side===M.WATER||side===M.OIL)&&!ropeBlocksMove(x+.5,y+.5,nx+.5,y+1.5))swap(cells,s,i,ni);
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
 // Heat diffuses through adjacent matter. Combustion consumes fuel over time rather than
 // instantly deleting a flammable object; wood chars, oil burns hot, and wet matter resists ignition.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=index(x,y),m=cells[i];if(!m)continue;
  const p=PROPERTIES[m]||{};
  age[i]=Math.min(65535,age[i]+1);
  if(m===M.WATER&&ambient<0&&Math.random()<clamp(-ambient/9000,0,.12))cells[i]=M.ICE;
  if(m===M.ICE&&ambient>0&&Math.random()<clamp(ambient/14000,0,.1))cells[i]=M.WATER;
  if(m===M.WATER&&ambient>100&&Math.random()<clamp((ambient-100)/18000,0,.05)){cells[i]=M.STEAM;continue}
  if(m===M.FIRE){
   heat[i]=Math.max(heat[i],700+Math.random()*250);
   const lifetime=100+Math.random()*100;
   burn[i]+=1;
   if(burn[i]>lifetime){cells[i]=M.SMOKE;heat[i]=120;burn[i]=0;continue}
   for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1]]){
    const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
    const ni=index(nx,ny),target=cells[ni],tp=PROPERTIES[target];
    if(target===M.WATER||target===M.ICE){
     if(Math.random()<.22){cells[i]=M.STEAM;heat[i]=0;burn[i]=0;break}
     continue;
    }
    if(tp?.flammability){
     const moisture=wet[ni]||0;
     const chance=(target===M.OIL ? .62 : target===M.PLANT ? .38 : target===M.WOOD ? .28 : .12)*(1-moisture*.94);
     heat[ni]=Math.min(1600,heat[ni]+(target===M.OIL?85:target===M.WOOD?55:target===M.PLANT?45:28));
     if(heat[ni]>(tp.ignition||200)&&Math.random()<chance)ignite(cells,s,ni,target);
    }
   }
   if(Math.random()<.006){cells[i]=M.SMOKE;heat[i]=0;burn[i]=0;}
   continue;
  }
  if(m===M.LAVA){
   heat[i]=Math.max(heat[i],850);
   for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
    const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
    const ni=index(nx,ny),other=cells[ni];
    if(other===M.WATER||other===M.ICE){cells[i]=M.STONE;cells[ni]=M.STEAM;heat[ni]=180;break}
    if(PROPERTIES[other]?.flammability){heat[ni]=Math.min(1600,heat[ni]+(other===M.OIL?100:other===M.WOOD?70:55));if(heat[ni]>(PROPERTIES[other].ignition||200)&&Math.random()<(other===M.OIL?.58:other===M.PLANT?.35:.24))ignite(cells,s,ni,other)}
   }
  }
  if(m===M.WOOD||m===M.PLANT||m===M.OIL||m===M.TNT){
   if(heat[i]>0){
    const cooling=(m===M.WOOD?1.2:m===M.PLANT?2.4:.7)+(wet[i]*8);
    heat[i]=Math.max(ambient,heat[i]-cooling);
   }
   if(heat[i]>(p.ignition||220)&&Math.random()<(m===M.TNT?.22:m===M.OIL?.16:m===M.PLANT?.12:.075)*(1-(wet[i]||0)*.94))ignite(cells,s,i,m);
   if(burn[i]>0){
    burn[i]+=1;
    const consume=(m===M.WOOD?.003:m===M.PLANT?.012:m===M.OIL?.025:.018)*(1-(wet[i]||0)*.8);
    fuel[i]=Math.max(0,(fuel[i]||p.fuel||1)-consume);
    if(fuel[i]<=0){
     if(m===M.WOOD){cells[i]=M.CHARCOAL;heat[i]=0;burn[i]=0;fuel[i]=0}
     else if(m===M.PLANT){cells[i]=Math.random()<.55?M.EMPTY:M.SMOKE;heat[i]=0;burn[i]=0}
     else if(m===M.TNT){cells[i]=M.FIRE;heat[i]=650;burn[i]=0}
     else {cells[i]=M.FIRE;heat[i]=650;burn[i]=0}
    }
   }
  }
  if(m===M.ACID){
   // Acid corrodes by contact over time. Each material has a different resistance.
   const resistance={[M.SAND]:18,[M.PLANT]:24,[M.WOOD]:42,[M.STONE]:95,[M.GLASS]:125,[M.ICE]:10,[M.SALT]:8};
   for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
    const nx=x+dx,ny=y+dy;if(!inside(nx,ny))continue;
    const ni=index(nx,ny),other=cells[ni],limit=resistance[other];
    if(limit){
     corrosion[ni]+=other===M.SAND||other===M.SALT?1.2:.65;
     if(corrosion[ni]>=limit){cells[ni]=M.EMPTY;corrosion[ni]=0;burn[ni]=0;heat[ni]=0;wet[ni]=0;fuel[ni]=0;age[ni]=0}
    }
   }
   if(age[i]>1800){cells[i]=M.EMPTY;continue}
  }
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
 // Remove stale state when a particle has been erased or transformed.
 for(let i=0;i<N;i++)if(!cells[i]){wet[i]=0;heat[i]=0;fuel[i]=0;burn[i]=0;age[i]=0;corrosion[i]=0}
}
