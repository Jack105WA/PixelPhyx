// Reuse the cache-busting version from the entry URL for every local module.
const cacheVersion = new URL(import.meta.url).searchParams.get('v') || 'dev';
const [{ materialState, resetMaterialState }, { createPhysicsEngine }, { createWasmEngine }, { initializeUiShell }, { createLifeSystem, LIFE_MATERIALS }] = await Promise.all([
  import(`./material-physics.js?v=${encodeURIComponent(cacheVersion)}`),
  import(`./physics-engine.js?v=${encodeURIComponent(cacheVersion)}`),
  import(`./wasm-engine.js?v=${encodeURIComponent(cacheVersion)}`),
  import(`./ui.js?v=${encodeURIComponent(cacheVersion)}`),
  import(`./life.js?v=${encodeURIComponent(cacheVersion)}`)
]);
const wasmEngine = await createWasmEngine();

const CANVAS_SIZES={small:{width:160,height:90},medium:{width:320,height:180},large:{width:640,height:360}};
let canvasSize='medium',W=CANVAS_SIZES.medium.width,H=CANVAS_SIZES.medium.height,N=W*H;
// Allocate every WASM chemistry/physics state buffer for the initial world.
resetMaterialState(N);
const canvas=document.querySelector('#world');
let ctx=canvas.getContext('2d',{alpha:false}),canvasContextAvailable=!!ctx;
const particleInterpolationCanvas=document.createElement('canvas'),particleInterpolationCtx=particleInterpolationCanvas.getContext('2d');
particleInterpolationCanvas.className='particle-interpolation';canvas.parentElement.insertBefore(particleInterpolationCanvas,canvas.nextElementSibling);
let frameImage=ctx?.createImageData(W,H)||null;
canvas.addEventListener('contextlost',event=>{
 event.preventDefault();
 canvasContextAvailable=false;
});
canvas.addEventListener('contextrestored',()=>{
 ctx=canvas.getContext('2d',{alpha:false});
 canvasContextAvailable=!!ctx;
 if(canvasContextAvailable){
  frameImage=ctx.createImageData(W,H);
  ctx.imageSmoothingEnabled=false;
 }
});
function publishStrokeBatch(final=false){
 if(!activeStrokeMeta||activeStrokeMeta.material>LIFE_MAX_ID||!multiplayer?.joined)return;
 if(strokePublishTimer){clearTimeout(strokePublishTimer);strokePublishTimer=null}
 // Send each newly drawn segment immediately. Include the previous point so
 // every remote peer paints the exact segment instead of waiting for release.
 const start=lastPublishedStrokePoint>0?lastPublishedStrokePoint-1:0;
 const points=strokePoints.slice(start);
 if(!points.length)return;
 lastPublishedStrokePoint=strokePoints.length;
 lastStrokePublishAt=performance.now();
 multiplayer.publishStroke({
  type:'stroke',points,tool:activeStrokeMeta.tool,material:activeStrokeMeta.material,
  brush:activeStrokeMeta.brush,erase:activeStrokeMeta.erase
 },{reliable:true});
}
const M={EMPTY:0,SAND:1,WATER:2,STONE:3,WOOD:4,FIRE:5,OIL:6,ACID:7,STEAM:8,SMOKE:9,ICE:10,LAVA:11,TNT:12,LEGACY_PLANT:13,SALT:14,GLASS:15,CHARCOAL:16,FUSE:17};
const lifeSystem=createLifeSystem();
const LIFE_MAX_ID=28;
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
 {id:14,name:'Salt',icon:'✧',color:'#e8e8d9',rgb:[232,232,217],type:'powder'},
 {id:15,name:'Glass',icon:'◇',color:'#b8dce8',rgb:[184,220,232],type:'solid'},
 {id:16,name:'Charcoal',icon:'▪',color:'#34363a',rgb:[52,54,58],type:'powder'},
 {id:17,name:'Fuse',icon:'━',color:'#d68b48',rgb:[214,139,72],type:'solid'},
 {id:28,name:'Soil',icon:'▧',color:'#79543b',rgb:[121,84,59],type:'powder'}
];
let colorLut=new Uint8Array(256*3);
let simulationTick=0,cells=new Uint8Array(N),updated=new Uint8Array(N),movementBlocks=new Uint8Array(N),airborneParticles=[],movingParticles=[],moveByDestination=new Int32Array(N),movingDestinations=new Uint8Array(N),particleVelocityX=new Float32Array(N),particleVelocityY=new Float32Array(N),cellRenderAlpha=1,running=true,selected=1,tool='draw',brush=5,gravity=1,speed=1,ambient=20;
let snapshotMoves=new Map();
let temperatureUnit='C',lastAirTemperatureUpdate=0;
let leafblower={active:false,x:0,y:0,dx:1,dy:0,lastPublish:0};
let strokePoints=[],lastCursorPoint=null,activeErase=false,strokePublishTimer=null;
let remoteSnapshotReceivedAt=0,remoteSnapshotInterval=500,lastAppliedSnapshotAt=0,lastOperationAppliedAt=0,remoteLeafblowers={},lastRopePublish=0;
let activeStrokeMeta=null,lastStrokePublishAt=0,lastPublishedStrokePoint=0;
let ropes=[],room='',playerId='guest-'+Math.random().toString(36).slice(2,9),playerName=localStorage.getItem('pixelphyx-player-name')||'Lab guest',remoteApplying=false,lastRemoteWorldAt=0,lastCursorWrite=0,lastWorldPublish=0,remoteCursors={},remoteCursorTargets={},multiplayer=null,playerColor=localStorage.getItem('pixelphyx-player-color')||'#65d6ad';
const idx=(x,y)=>y*W+x,inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H,at=(x,y)=>inside(x,y)?cells[idx(x,y)]:M.STONE;
function log(message){}
function setConnection(state){const el=document.querySelector('#connection');el.className='status '+state}
const toolDefs=[['draw','✎','Draw'],['rope','⌁','Rope'],['grab','✋','Grab'],['leafblower','➤','Leafblower']];
const toolsEl=document.querySelector('#tools');
toolDefs.forEach(([id,icon,name])=>{const b=document.createElement('button');b.className='tool'+(id==='draw'?' active':'');b.innerHTML='<span class="ico">'+icon+'</span><span>'+name+'</span>';b.onclick=()=>selectTool(id,b);toolsEl.append(b)});
function selectTool(id,button){tool=id;document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));button.classList.add('active');if(id==='grab')log('Grab tool selected — drag a rope point to pull it.');if(id==='rope')log('Rope tool selected — drag to create; right-click a rope to delete it.');if(id==='leafblower')log('Leafblower selected — drag to aim and blow particles in that direction.');}

const customMaterialsEl=document.querySelector('#customMaterials');
const customMaterialCountEl=document.querySelector('#customMaterialCount');
const CUSTOM_STORAGE_KEY='pixelphyx-custom-materials-v1';
const customMaterials=[],customMaterialById=Array(256).fill(null),customDensityById=new Float32Array(256);
const customParticleChoices=[...materials,...LIFE_MATERIALS.map(p=>({id:p.plantId,name:p.name,icon:p.icon}))].map(m=>({id:m.id,name:m.name,icon:m.icon}));
function getCustomParticleChoices(excludeId){return [...customParticleChoices,...customMaterials.filter(m=>m.id!==excludeId).map(m=>({id:m.id,name:m.name,icon:m.icon||'■'}))]}
function validCustomMaterial(m){return m&&Number.isInteger(m.id)&&m.id>=29&&m.id<=255&&typeof m.name==='string'&&Array.isArray(m.rgb)&&m.rgb.length===3&&m.rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=255)&&['gas','liquid','solid'].includes(m.state)&&Array.isArray(m.particles||[])&&(m.particles||[]).every(id=>Number.isInteger(id)&&id>=1&&id<=255&&id!==m.id)}
function syncColorLut(){colorLut=new Uint8Array(256*3);customDensityById.fill(0);customMaterialById.fill(null);for(const m of materials)colorLut.set(m.rgb,m.id*3);colorLut.set([85,168,94],M.LEGACY_PLANT*3);for(const m of LIFE_MATERIALS){colorLut.set(m.rgb.map(v=>Math.min(255,Math.round(v*.55+90))),m.seedId*3);colorLut.set(m.rgb,m.plantId*3)}for(const m of customMaterials){colorLut.set(m.rgb,m.id*3);customMaterialById[m.id]=m;customDensityById[m.id]=Math.max(.05,Number(m.density)||.05)}}
function materialRgb(id){const offset=id*3;return offset+2<colorLut.length?[colorLut[offset],colorLut[offset+1],colorLut[offset+2]]:[27,38,52]}
function refreshCustomMaterialButtons(){customMaterialsEl.querySelectorAll('.custom-material-button').forEach(b=>b.remove());for(const m of customMaterials){const b=document.createElement('button');b.type='button';b.className='material custom-material-button'+(m.id===selected?' active':'');const icon=document.createElement('span');icon.className='mico';icon.style.color=m.color;icon.textContent=m.icon||'■';const name=document.createElement('span');name.className='mname';name.textContent=m.name;b.append(icon,name);b.title=m.name+' · '+m.type+' · '+m.state;b.addEventListener('click',()=>{selected=m.id;document.querySelectorAll('.material').forEach(x=>x.classList.remove('active'));b.classList.add('active')});customMaterialsEl.append(b)}customMaterialCountEl.textContent=String(customMaterials.length)}
function saveCustomMaterials(){try{localStorage.setItem(CUSTOM_STORAGE_KEY,JSON.stringify(customMaterials))}catch(error){console.warn('Could not save custom materials',error)}}
syncColorLut();
function nextCustomMaterialId(){for(let id=29;id<=255;id++)if(!customMaterials.some(m=>m.id===id))return id;return -1}
function addCustomMaterial(definition,save=true){if(!validCustomMaterial(definition)||customMaterials.some(m=>m.id===definition.id)||customMaterials.length>=227)return false;const m={...definition,particles:[...new Set(definition.particles||[])],rgb:definition.rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))))};customMaterials.push(m);syncColorLut();refreshCustomMaterialButtons();if(save)saveCustomMaterials();return true}
function loadCustomMaterials(){try{const saved=JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY)||'[]');if(!Array.isArray(saved))return;const occupied=new Set(saved.filter(m=>Number.isInteger(m?.id)&&m.id>=28&&m.id<=255).map(m=>m.id)),remap=new Map();let next=29;for(const raw of saved){if(Number.isInteger(raw?.id)&&raw.id>=18&&raw.id<=28){while(occupied.has(next)&&next<=255)next++;if(next<=255){remap.set(raw.id,next);occupied.add(next++)}}}for(const raw of saved){const m={...raw,id:remap.get(raw?.id)||raw.id,particles:(Array.isArray(raw.particles)?raw.particles:[]).map(id=>remap.get(id)||id)};if(validCustomMaterial(m)&&!customMaterials.some(x=>x.id===m.id))addCustomMaterial(m,false)}}catch(error){console.warn('Could not load custom materials',error)}}
function downloadCustomMaterials(list,name='pixelphyx-materials.json'){const blob=new Blob([JSON.stringify({format:'PixelPhyx Custom Materials',version:1,materials:list},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)}
function openCustomMaterialEditor(existing=null){
 const modal=document.createElement('div');modal.className='modal open';const dialog=document.createElement('form');dialog.className='dialog custom-material-dialog';
 const m=existing||{name:'',icon:'',color:'#b58cff',type:'Metallic',state:'solid',density:1,flammable:false,affectedByGravity:true,particles:[]};
 const particleChoices=getCustomParticleChoices(existing?.id);
 dialog.innerHTML=`<h2></h2><div class="custom-form-grid">
 <div class="control full"><label>Name</label><input name="name" type="text" maxlength="24" required></div>
 <div class="control"><label>Icon <span class="muted">Optional</span></label><input name="icon" type="text" maxlength="4"></div>
 <div class="control"><label>Color</label><input name="color" type="color"></div>
 <div class="control full"><label>Weight / Density <output id="customDensityOut"></output></label><input id="customDensity" name="density" type="range" min="0" max="3" step="0.1"></div>
 <div class="control"><label>Type</label><select name="type"><option>Metallic</option><option>Wood</option><option>Stone</option><option>Organic</option><option>Plastic</option><option>Other</option></select></div>
 <div class="control"><label>State</label><select name="state"><option value="solid">Solid</option><option value="liquid">Liquid</option><option value="gas">Gas</option></select></div>
 <div class="control full"><label>Properties</label><div class="custom-properties"><label><input type="checkbox" name="flammable"> Flammable</label><label><input type="checkbox" name="affectedByGravity"> Affected by gravity</label></div></div>
 <div class="control full"><label>Particles</label><div class="custom-particle-picker"><select id="customParticleChoice"><option value="">Select a particle…</option></select><button class="btn" type="button" id="addCustomParticle">Add particle</button></div><div id="customParticleList" class="custom-particle-list"></div></div></div>
 <div class="dialog-actions"><button class="btn ghost" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit"></button></div>`;
 const heading=dialog.querySelector('h2');
 heading.textContent=existing?'Edit Material':'Create Material';
 dialog.querySelector('button[type="submit"]').textContent=existing?'Save Changes':'Create Material';
 const particleSelect=dialog.querySelector('#customParticleChoice');
 for(const particle of particleChoices){
  const option=document.createElement('option');
  option.value=String(particle.id);
  option.textContent=(particle.icon||'')+' '+particle.name;
  particleSelect.append(option);
 }
 modal.append(dialog);document.body.append(modal);dialog.elements.name.value=m.name;dialog.elements.icon.value=m.icon||'';dialog.elements.color.value=m.color||'#b58cff';dialog.elements.density.value=Number(m.density??1);dialog.elements.type.value=m.type||'Other';dialog.elements.state.value=m.state||'solid';dialog.elements.flammable.checked=!!m.flammable;dialog.elements.affectedByGravity.checked=m.affectedByGravity!==false;
 let particles=[...new Set(m.particles||[])];const list=dialog.querySelector('#customParticleList'),density=dialog.querySelector('#customDensity');
 const paint=()=>{list.replaceChildren();if(!particles.length){const e=document.createElement('span');e.className='muted';e.textContent='No particles added';list.append(e)}for(const id of particles){const p=particleChoices.find(x=>x.id===id);if(!p)continue;const chip=document.createElement('span');chip.className='custom-particle-chip';chip.textContent=p.icon+' '+p.name;const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.addEventListener('click',()=>{particles=particles.filter(x=>x!==id);paint()});chip.append(remove);list.append(chip)}};
 density.addEventListener('input',()=>dialog.querySelector('#customDensityOut').textContent=Number(density.value).toFixed(1)+'×');density.dispatchEvent(new Event('input'));paint();dialog.querySelector('#addCustomParticle').addEventListener('click',()=>{const id=Number(dialog.querySelector('#customParticleChoice').value);if(id&&!particles.includes(id)){particles.push(id);paint()}});
 const close=()=>modal.remove();modal.addEventListener('pointerdown',e=>{if(e.target===modal)close()});dialog.querySelector('[data-cancel]').addEventListener('click',close);
 dialog.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(dialog),name=String(data.get('name')||'').trim();if(!name)return;const hex=String(data.get('color')||'#b58cff'),rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const def={id:existing?existing.id:nextCustomMaterialId(),name,icon:String(data.get('icon')||'').trim(),color:hex,rgb,type:String(data.get('type')||'Other'),state:String(data.get('state')||'solid'),density:Number(data.get('density')||1),flammable:data.get('flammable')==='on',affectedByGravity:data.get('affectedByGravity')==='on',particles};if(def.id<29){alert('Custom material limit reached.');return}if(existing){const i=customMaterials.findIndex(x=>x.id===existing.id);if(i<0)return;customMaterials[i]=def;syncColorLut();refreshCustomMaterialButtons();saveCustomMaterials()}else if(!addCustomMaterial(def)){alert('Could not create material.');return}close();openCustomMaterialManager()});dialog.querySelector('[name="name"]').focus()
}
function openCustomMaterialManager(){
 const modal=document.createElement('div');modal.className='modal open';const dialog=document.createElement('div');dialog.className='dialog custom-material-dialog';
 dialog.innerHTML='<h2>Custom Materials</h2><div class="custom-manager-actions"><button class="btn primary" id="managerCreate" type="button">+ Create</button><button class="btn" id="managerImport" type="button">Import JSON</button><button class="btn" id="managerExportAll" type="button">Export All</button><input id="managerFile" type="file" accept=".json,application/json" hidden></div><div id="customManagerList" class="custom-manager-list"></div><div class="dialog-actions"><button class="btn ghost" data-close-manager type="button">Close</button></div>';
 modal.append(dialog);document.body.append(modal);const list=dialog.querySelector('#customManagerList'),close=()=>modal.remove();dialog.querySelector('[data-close-manager]').addEventListener('click',close);modal.addEventListener('pointerdown',e=>{if(e.target===modal)close()});
 const draw=()=>{list.replaceChildren();if(!customMaterials.length){const e=document.createElement('div');e.className='custom-manager-empty';e.textContent='No custom materials yet.';list.append(e)}for(const m of customMaterials){const row=document.createElement('div');row.className='custom-manager-row';const label=document.createElement('div');label.className='custom-manager-name';label.textContent=(m.icon||'■')+' '+m.name;const actions=document.createElement('div');actions.className='custom-manager-buttons';for(const [caption,fn] of [['Edit',()=>{close();openCustomMaterialEditor(m)}],['Export',()=>downloadCustomMaterials([m],m.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json')],['Delete',()=>{if(!confirm('Delete '+m.name+'?'))return;for(let i=0;i<cells.length;i++)if(cells[i]===m.id)cells[i]=M.EMPTY;if(selected===m.id)selected=M.SAND;customMaterials.splice(customMaterials.indexOf(m),1);for(const other of customMaterials)other.particles=(other.particles||[]).filter(id=>id!==m.id);syncColorLut();saveCustomMaterials();refreshCustomMaterialButtons();draw()}]]){const b=document.createElement('button');b.type='button';b.className='btn'+(caption==='Delete'?' danger':'');b.textContent=caption;b.addEventListener('click',fn);actions.append(b)}row.append(label,actions);list.append(row)}};
 dialog.querySelector('#managerCreate').addEventListener('click',()=>{close();openCustomMaterialEditor()});dialog.querySelector('#managerExportAll').addEventListener('click',()=>downloadCustomMaterials(customMaterials));const file=dialog.querySelector('#managerFile');dialog.querySelector('#managerImport').addEventListener('click',()=>file.click());
 file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{const parsed=JSON.parse(await f.text()),incoming=Array.isArray(parsed)?parsed:parsed.materials;if(!Array.isArray(incoming))throw new Error('JSON must contain a materials array.');let added=0;for(const raw of incoming){if(!raw||typeof raw.name!=='string'||!Array.isArray(raw.rgb)||raw.rgb.length!==3||!['gas','liquid','solid'].includes(raw.state))continue;const id=nextCustomMaterialId();if(id<29)break;const def={...raw,id,particles:Array.isArray(raw.particles)?raw.particles.filter(x=>Number.isInteger(x)&&x>=1&&x<=255&&x!==id):[]};if(addCustomMaterial(def,false))added++}saveCustomMaterials();draw();alert(added?'Imported '+added+' custom material(s).':'No valid materials found.')}catch(error){alert('Import failed: '+error.message)}file.value=''});
 draw()
}
const manageButton=document.querySelector('#createMaterial');manageButton.querySelector('.mico').textContent='⚙';manageButton.querySelector('.mname').textContent='Manage';manageButton.setAttribute('aria-label','Manage custom materials');manageButton.addEventListener('click',openCustomMaterialManager);loadCustomMaterials();

const matEl=document.querySelector('#materials');
materials.forEach(m=>{const b=document.createElement('button');b.className='material'+(m.id===selected?' active':'');b.innerHTML='<span class="mico" style="color:'+m.color+'">'+m.icon+'</span><span class="mname">'+m.name+'</span>';b.title=m.name+' · '+m.type;b.onclick=()=>{selected=m.id;document.querySelectorAll('.material').forEach(x=>x.classList.remove('active'));b.classList.add('active')};matEl.append(b)});
document.querySelector('#materialCount').textContent=materials.length+' TYPES';
const lifeSeedsEl=document.querySelector('#lifeSeeds');
for(const plant of LIFE_MATERIALS){
 const button=document.createElement('button');button.type='button';button.className='material life-seed';
 const icon=document.createElement('span');icon.className='mico';icon.style.color=plant.color;icon.textContent=plant.icon;
 const name=document.createElement('span');name.className='mname';name.textContent=plant.name+' Seed';
 button.append(icon,name);button.title=plant.name+' seeds grow into '+plant.name.toLowerCase()+' plants';
 button.addEventListener('click',()=>{selected=plant.seedId;document.querySelectorAll('.material').forEach(item=>item.classList.remove('active'));button.classList.add('active')});
 lifeSeedsEl.append(button);
}

refreshCustomMaterialButtons();
function resizeCanvas(size){
 const dimensions=CANVAS_SIZES[size];if(!dimensions||size===canvasSize)return false;
 W=dimensions.width;H=dimensions.height;N=W*H;canvasSize=size;
 cells=new Uint8Array(N);updated=new Uint8Array(N);movementBlocks=new Uint8Array(N);particleVelocityX=new Float32Array(N);particleVelocityY=new Float32Array(N);movingParticles=[];snapshotMoves.clear();moveByDestination=new Int32Array(N);movingDestinations=new Uint8Array(N);visualParticles.length=0;airborneParticles.length=0;resetMaterialState(N);ropes=[];frameImage=ctx.createImageData(W,H);
 canvas.width=W;canvas.height=H;localCursorCanvas.width=W;localCursorCanvas.height=H;document.querySelector('#canvasSize').value=size;
 document.querySelector('#canvasSize').title='Current resolution: '+W+' × '+H;
 strokePoints=[];drawing=false;ropeStart=null;ropeDrag=null;lastPoint=null;
 log('Canvas resized to '+size+' ('+W+' × '+H+') — world cleared');return true;
}
function recordParticleMove(from,to,material,transferVelocity=true){
 const carried=snapshotMoves.get(from);
 if(transferVelocity){const velocityX=particleVelocityX[from],velocityY=particleVelocityY[from];particleVelocityX[from]=0;particleVelocityY[from]=0;particleVelocityX[to]=velocityX;particleVelocityY[to]=velocityY;}
 if(carried&&carried.material===material){snapshotMoves.delete(from);carried.toX=to%W;carried.toY=(to/W)|0;snapshotMoves.set(to,carried)}
 else snapshotMoves.set(to,{fromX:from%W,fromY:(from/W)|0,toX:to%W,toY:(to/W)|0,material});
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
function circle(x,y,r,m){wasmEngine.paint_segment(cells,x,y,x,y,r,m,W,H)}
function drawLine(x0,y0,x1,y1,m,r=0){wasmEngine.paint_segment(cells,x0,y0,x1,y1,r,m,W,H)}
function canvasPoint(e){const r=canvasShell.getBoundingClientRect();const p=wasmEngine.map_pointer(e.clientX,e.clientY,r.left,r.top,r.width,r.height,W,H);return{x:p[0],y:p[1]}}
let drawing=false,lastPoint=null,ropeStart=null,ropeDrag=null;
function act(p,e){if(!inside(p.x,p.y))return;const erase=activeErase||e.button===2||tool==='erase',mat=erase?M.EMPTY:selected;
 if(tool==='rope'||tool==='grab')return;
 if(erase){circle(p.x,p.y,brush,M.EMPTY);lastPoint=p;return}
 if(tool==='bomb'){circle(p.x,p.y,2,M.TNT);return}
 if(tool==='heat'){circle(p.x,p.y,brush,M.FIRE);return}
 if(tool==='cool'){circle(p.x,p.y,brush,M.ICE);return}
 if(tool==='line'&&lastPoint){drawLine(lastPoint.x,lastPoint.y,p.x,p.y,mat,Math.max(0,Math.floor(brush/4)));lastPoint=p;return}
 if(lastPoint)drawLine(lastPoint.x,lastPoint.y,p.x,p.y,mat,brush);else circle(p.x,p.y,brush,mat);lastPoint=p;
}
document.addEventListener('contextmenu',e=>e.preventDefault());
canvas.parentElement.addEventListener('pointerdown',e=>{
 const p=canvasPoint(e);if(!inside(p.x,p.y))return;
 if(tool==='rope'&&e.button===2){e.preventDefault();const hit=findRopeAt(p);if(hit){ropes=ropes.filter(r=>r.id!==hit.id);publishOperation({type:'ropeDelete',ropeId:hit.id});log('Rope deleted')}return}
 if(tool==='grab'&&e.button===0){
  const hit=findRopeGrab(p);
  if(hit){ropeDrag={kind:'rope',...hit,wasAnchor:hit.node.anchor};hit.node.anchor=true;hit.node.x=p.x;hit.node.y=p.y;hit.node.px=p.x;hit.node.py=p.y;drawing=true;canvas.parentElement.setPointerCapture(e.pointerId);ropeDrag.lastX=p.x;ropeDrag.lastY=p.y;ropeDrag.lastTime=performance.now();ropeDrag.velocityX=0;ropeDrag.velocityY=0;log('Rope grabbed — pull to move it')}
  return;
 }
 if(tool==='leafblower'&&e.button===0){drawing=true;activeErase=false;leafblower.active=true;leafblower.x=p.x;leafblower.y=p.y;leafblower.lastPublish=0;lastPoint=p;canvas.parentElement.setPointerCapture(e.pointerId);return}
 drawing=true;activeErase=e.button===2||tool==='erase';canvas.parentElement.setPointerCapture(e.pointerId);strokePoints=[p];if(tool==='rope'){ropeStart=p;lastPoint=p;return}activeStrokeMeta={tool,material:selected,brush,erase:activeErase};lastPublishedStrokePoint=0;lastStrokePublishAt=0;lastPoint=null;act(p,e);publishStrokeBatch(true)
});
canvas.parentElement.addEventListener('pointermove',e=>{
 const p=canvasPoint(e);
 if(ropeDrag){const {node,rope,nodeIndex}=ropeDrag;const now=performance.now(),elapsed=Math.max(1,now-(ropeDrag.lastTime||now)),scale=Math.min(2,16.667/elapsed);ropeDrag.velocityX=Math.max(-8,Math.min(8,(p.x-ropeDrag.lastX)*scale));ropeDrag.velocityY=Math.max(-8,Math.min(8,(p.y-ropeDrag.lastY)*scale));ropeDrag.lastX=p.x;ropeDrag.lastY=p.y;ropeDrag.lastTime=now;if(!node.dragMoved){node.sx=node.x;node.sy=node.y;node.ox=node.x;node.oy=node.y;node.dragMoved=true}node.x=p.x;node.y=p.y;node.px=p.x;node.py=p.y;return}
 if(tool==='leafblower'&&drawing){const dx=p.x-lastPoint.x,dy=p.y-lastPoint.y,distance=Math.hypot(dx,dy);if(distance>.35){leafblower.dx=dx/distance;leafblower.dy=dy/distance}leafblower.x=p.x;leafblower.y=p.y;lastPoint=p;const now=performance.now();if(now-leafblower.lastPublish>=33){leafblower.lastPublish=now;multiplayer?.publishLeafblower({active:true,x:p.x,y:p.y,dx:leafblower.dx,dy:leafblower.dy})}return}
 if(!drawing)return;
 if(!strokePoints.length||strokePoints[strokePoints.length-1].x!==p.x||strokePoints[strokePoints.length-1].y!==p.y)strokePoints.push(p);
 if(tool==='rope'){lastPoint=p;return}const previous=lastPoint;act(p,e);publishStrokeBatch(false)
});
canvas.parentElement.addEventListener('pointerup',e=>{
 if(ropeDrag){const {rope,node,nodeIndex}=ropeDrag;node.anchor=ropeDrag.wasAnchor;if(!node.anchor){node.px=node.x-ropeDrag.velocityX;node.py=node.y-ropeDrag.velocityY}publishOperation({type:'ropeNode',ropeId:rope.id,nodeIndex,x:+node.x.toFixed(2),y:+node.y.toFixed(2),anchor:!!node.anchor,vx:ropeDrag.velocityX,vy:ropeDrag.velocityY,predicted:false});ropeDrag=null;drawing=false;return}
 if(tool==='leafblower'){leafblower.active=false;drawing=false;lastPoint=null;return}
 if(tool==='rope'&&ropeStart){const end=canvasPoint(e);if(Math.hypot(end.x-ropeStart.x,end.y-ropeStart.y)>3){const created=createRope(ropeStart,end);if(created)publishOperation({type:'rope',ropeId:created.id,a:ropeStart,b:end})}ropeStart=null}
 else if(strokePoints.length){publishStrokeBatch(true);activeStrokeMeta=null}
 drawing=false;activeErase=false;lastPoint=null;strokePoints=[];activeStrokeMeta=null;lastPublishedStrokePoint=0
});
canvas.parentElement.addEventListener('pointercancel',()=>{if(ropeDrag){ropeDrag.node.anchor=ropeDrag.wasAnchor;ropeDrag=null}if(strokePublishTimer){clearTimeout(strokePublishTimer);strokePublishTimer=null}leafblower.active=false;drawing=false;ropeStart=null;lastPoint=null;strokePoints=[];activeStrokeMeta=null;lastPublishedStrokePoint=0;activeErase=false});
canvas.parentElement.addEventListener('wheel',e=>{e.preventDefault();brush=Math.max(1,Math.min(22,brush+(e.deltaY<0?1:-1)));document.querySelector('#brush').value=brush;document.querySelector('#brushOut').textContent=brush+' px'},{passive:false});

function findRopeGrab(p){let best=null,bestDistance=7;for(const rope of ropes){for(let nodeIndex=0;nodeIndex<rope.points.length;nodeIndex++){const node=rope.points[nodeIndex],d=Math.hypot(node.x-p.x,node.y-p.y);if(d<bestDistance){bestDistance=d;best={rope,node,nodeIndex}}}}return best}
function findRopeAt(p){let best=null,bestDistance=5;for(const rope of ropes){for(let i=0;i<rope.points.length-1;i++){const a=rope.points[i],b=rope.points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0,d=Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));if(d<bestDistance){bestDistance=d;best=rope}}}return best}
const MAX_ROPES=20,MAX_ROPE_SEGMENTS=119,MAX_ROPE_POINTS=120;
function createRope(a,b,ropeId=newRopeId()){
 if(ropes.length>=MAX_ROPES){log('Rope limit reached — delete a rope before adding another');return null}
 const rope=physicsEngine.makeRope(a,b,ropeId,W,H);
 if(!rope)return null;
 ropes.push(rope);
 log('Rope attached with '+rope.points.length+' physics points');return rope
}
function newRopeId(){return 'rope-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36))}
const physicsEngine=createPhysicsEngine();
function ropeBlocksMove(x1,y1,x2,y2){return physicsEngine.blocksMove(x1,y1,x2,y2)}

function wasmRandom(seed,index,salt){
 let value=(seed^Math.imul(index,0x9E3779B9)^salt)>>>0;
 value^=value>>>16;value=Math.imul(value,0x7FEB352D)>>>0;
 value^=value>>>15;value=Math.imul(value,0x846CA68B)>>>0;
 value^=value>>>16;
 return Math.fround(Math.fround(value)/Math.fround(0xFFFFFFFF));
}
function buildMovementBlocks(seed){
 movementBlocks.fill(0);
 if(!ropes.length)return;
 const movable=m=>m===1||m===2||m===6||m===7||m===11||m===14||m===16;
 const canSwap=(m,target)=>target===M.EMPTY||(m===M.SAND&&(target===M.WATER||target===M.OIL));
 for(let i=0;i<N;i++){
  const material=cells[i];if(!material)continue;
  const x=i%W,y=(i/W)|0;
  let vx=particleVelocityX[i],vy=particleVelocityY[i];
  if(Math.abs(vx)+Math.abs(vy)<.12){vx=0;vy=0}
  else{const acceleration=.055*Math.max(0,Math.min(3,gravity));vx=Math.max(-16,Math.min(16,vx*.965));vy=Math.max(-16,Math.min(16,(vy+acceleration)*.965))}
  const sx=Math.abs(vx)>.42?Math.sign(vx):0,sy=Math.abs(vy)>.42?Math.sign(vy):0;
  if(sx||sy){
   const tx=x+sx,ty=y+sy;
   if(inside(tx,ty)&&cells[idx(tx,ty)]===M.EMPTY&&ropeBlocksMove(x+.5,y+.5,tx+.5,ty+.5))movementBlocks[i]|=1;
  }
  const gas=material===M.STEAM||material===M.SMOKE||material===M.FIRE;
  if(!gas&&!movable(material))continue;
  const dy=gas?-1:1,verticalY=y+dy;
  if(inside(x,verticalY)&&canSwap(material,cells[idx(x,verticalY)])&&ropeBlocksMove(x+.5,y+.5,x+.5,verticalY+.5))movementBlocks[i]|=2;
  if(gas)continue;
  const side=wasmRandom(seed,i,0x51DE)<.5?-1:1,diagonalX=x+side,diagonalY=y+dy;
  if(inside(diagonalX,diagonalY)&&canSwap(material,cells[idx(diagonalX,diagonalY)])&&ropeBlocksMove(x+.5,y+.5,diagonalX+.5,diagonalY+.5))movementBlocks[i]|=4;
  if((material===M.WATER||material===M.OIL||material===M.ACID)&&wasmRandom(seed,i,0x51DE2)<.4){
   const horizontalX=x+side;
   if(inside(horizontalX,y)&&cells[idx(horizontalX,y)]===M.EMPTY&&ropeBlocksMove(x+.5,y+.5,horizontalX+.5,y+.5))movementBlocks[i]|=8;
  }
 }
}
function stepRopes(){
 let total=0;const offsets=[0],lengths=[];
 for(const rope of ropes){total+=rope.points.length;offsets.push(total);lengths.push(Number.isFinite(rope.length)&&rope.length>0?rope.length:1)}
 if(total>1){
  const x=new Float32Array(total),y=new Float32Array(total),px=new Float32Array(total),py=new Float32Array(total),ox=new Float32Array(total),oy=new Float32Array(total),anchors=new Uint8Array(total),drag=new Uint8Array(total);
  let k=0;for(const rope of ropes)for(const node of rope.points){x[k]=node.x;y[k]=node.y;px[k]=node.px;py[k]=node.py;ox[k]=Number.isFinite(node.ox)?node.ox:node.x;oy[k]=Number.isFinite(node.oy)?node.oy:node.y;anchors[k]=node.anchor?1:0;drag[k]=node.dragMoved?1:0;k++}
  wasmEngine.step_ropes(x,y,px,py,ox,oy,anchors,drag,new Uint32Array(offsets),new Float32Array(lengths),cells,W,H,gravity);
  k=0;for(const rope of ropes)for(const node of rope.points){node.x=x[k];node.y=y[k];node.px=px[k];node.py=py[k];node.ox=ox[k];node.oy=oy[k];node.dragMoved=false;k++}
 }
 physicsEngine.step({ropes,cells,width:W,height:H,gravity,velocityX:particleVelocityX,velocityY:particleVelocityY,materialState,airborneParticles,materialDensity:customDensityById,onExtract:i=>snapshotMoves.delete(i),recordMove:recordParticleMove});
}
function applyLeafblowerImpulse(x,y,dx,dy,radius=46,strength=4.2){
 const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
 // A broad forward jet: the nozzle is at the pointer and the airflow travels
 // outward in a cone rather than pushing particles in a small circular patch.
 const minX=Math.max(0,Math.floor(x-radius)),maxX=Math.min(W-1,Math.ceil(x+radius));
 const minY=Math.max(0,Math.floor(y-radius)),maxY=Math.min(H-1,Math.ceil(y+radius));
 for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
  const i=idx(px,py);if(cells[i]===M.EMPTY)continue;
  const ox=px+.5-x,oy=py+.5-y,distance=Math.hypot(ox,oy);
  if(distance>radius||distance<1)continue;
  const forward=(ox*dx+oy*dy)/distance;
  if(forward<-.2)continue;
  const falloff=1-distance/radius;
  const force=strength*Math.pow(falloff,.65)*(.35+Math.max(0,forward)*.9);
  // Add a little outward spread so the jet fans out naturally.
  const spread=force*.16;
  particleVelocityX[i]=Math.max(-12,Math.min(12,particleVelocityX[i]+dx*force+(ox/distance)*spread));
  particleVelocityY[i]=Math.max(-12,Math.min(12,particleVelocityY[i]+dy*force+(oy/distance)*spread));
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
    }else if(p.kind==='ember'&&(m===M.WOOD||m===M.LEGACY_PLANT||(m>=18&&m<=22)||m===M.OIL||m===M.TNT)){
     const heatIndex=idx(gx,gy);materialState.heatInputs[heatIndex]+=12;alive=false;
    }else if(p.kind==='molten'&&p.bounce===0&&p.vy>.08){
     p.vy=-Math.abs(p.vy)*.12;p.vx*=.35;p.bounce=1;p.life=Math.min(p.life,8);
    }else alive=false;
   }else{p.x=nx;p.y=ny}
  }
  if(!alive||p.life<=0)visualParticles.splice(i,1);
 }
}
function drawAirborneParticles(){
 for(const p of airborneParticles){const base=materialRgb(p.material);let r=base[0],g=base[1],b=base[2];if(p.heat>0){const f=Math.min(.35,p.heat/900);r=Math.min(255,Math.round(r+(255-r)*f));g=Math.round(g+(100-g)*f);b=Math.round(b*(1-f*.7))}ctx.fillStyle='rgb('+r+','+g+','+b+')';ctx.fillRect(p.x-.5,p.y-.5,1,1)}
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
const baseMaterialDensity=[0,1.6,1,2.7,.65,.05,.82,1.1,.04,.04,.92,2.5,1.1,.65,1.9,2.7,.85,.9];
function getMaterialDensity(id){const custom=customMaterialById[id];return custom?Math.max(.05,Number(custom.density)||.05):(baseMaterialDensity[id]??1)}
function swapMaterialCells(from,to,movingId){const displaced=cells[to],keys=['wetness','heat','heatInputs','fuel','burn','age','corrosion'];cells[to]=movingId;cells[from]=displaced;for(const key of keys){const values=materialState[key],value=values[from];values[from]=values[to];values[to]=value}const vx=particleVelocityX[from],vy=particleVelocityY[from];particleVelocityX[from]=particleVelocityX[to];particleVelocityY[from]=particleVelocityY[to];particleVelocityX[to]=vx;particleVelocityY[to]=vy;updated[from]=1;updated[to]=1;recordParticleMove(from,to,movingId,false);if(displaced)recordParticleMove(to,from,displaced,false)}
function moveCustomMaterial(from,to,id){if(to<0||to>=N)return false;const target=cells[to];if(target===id)return false;if(target===M.EMPTY){cells[to]=id;cells[from]=M.EMPTY;for(const key of ['wetness','heat','heatInputs','fuel','burn','age','corrosion']){materialState[key][to]=materialState[key][from];materialState[key][from]=0}particleVelocityX[to]=particleVelocityX[from];particleVelocityY[to]=particleVelocityY[from];particleVelocityX[from]=particleVelocityY[from]=0;updated[from]=updated[to]=1;recordParticleMove(from,to,id,false);return true}const targetCustom=customMaterialById[target],targetIsMovable=targetCustom?targetCustom.state!=='solid':[1,2,6,7,11,14,16].includes(target);if(!targetIsMovable||getMaterialDensity(id)<=getMaterialDensity(target))return false;swapMaterialCells(from,to,id);return true}
function emitCustomMaterialParticle(x,y,material){if(!material.particles?.length||airborneParticles.length>=5000)return;const id=material.particles[(Math.random()*material.particles.length)|0];airborneParticles.push({x:x+.5,y:y-.55,vx:(Math.random()-.5)*.6,vy:-.4-Math.random()*.3,material:id,wetness:0,heat:0,fuel:0,burn:0,age:0,corrosion:0,sleep:0,customSource:true})}
function stepCustomMaterials(){for(let y=H-1;y>=0;y--){const reverse=((simulationTick+y)&1)!==0;for(let k=0;k<W;k++){const x=reverse?W-1-k:k,i=y*W+x,id=cells[i];if(id<18||updated[i])continue;const m=customMaterialById[id];if(!m)continue;if(m.flammable){let burning=false;for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){const nx=x+dx,ny=y+dy;if(inside(nx,ny)&&cells[idx(nx,ny)]===M.FIRE){burning=true;break}}if(burning){cells[i]=M.FIRE;updated[i]=1;continue}}if(m.particles?.length&&Math.random()<.00012)emitCustomMaterialParticle(x,y,m);if(!m.affectedByGravity)continue;const gas=m.state==='gas',liquid=m.state==='liquid',dy=gas?-1:1,verticalY=y+dy;if(inside(x,verticalY)&&moveCustomMaterial(i,idx(x,verticalY),id))continue;const side=wasmRandom(simulationTick,i,0xC0570)<.5?-1:1;for(const dx of [side,-side]){const nx=x+dx,ny=y+dy;if(inside(nx,ny)&&moveCustomMaterial(i,idx(nx,ny),id))break}if(updated[i]||!liquid)continue;for(const dx of [side,-side]){const nx=x+dx;if(inside(nx,y)&&moveCustomMaterial(i,idx(nx,y),id))break}}}}
function tick(){movingParticles.length=0;moveByDestination.fill(-1);movingDestinations.fill(0);updated.fill(0);if(leafblower.active)applyLeafblowerImpulse(leafblower.x,leafblower.y,leafblower.dx,leafblower.dy,46,4.2);if(multiplayer?.isHost){const now=performance.now();for(const [id,blower] of Object.entries(remoteLeafblowers)){if(!blower.active||now-blower.receivedAt>500){if(now-blower.receivedAt>1200)delete remoteLeafblowers[id];continue}const blend=.42;blower.x+=(blower.targetX-blower.x)*blend;blower.y+=(blower.targetY-blower.y)*blend;let dx=blower.targetDx,dy=blower.targetDy;const directionLength=Math.hypot(dx,dy)||1;dx/=directionLength;dy/=directionLength;let mixedX=blower.dx+(dx-blower.dx)*.38,mixedY=blower.dy+(dy-blower.dy)*.38;const mixedLength=Math.hypot(mixedX,mixedY)||1;blower.dx=mixedX/mixedLength;blower.dy=mixedY/mixedLength;applyLeafblowerImpulse(blower.x,blower.y,blower.dx,blower.dy,46,4.2)}}stepRopes();const seed=++simulationTick;buildMovementBlocks(seed);const moveTriples=wasmEngine.step_particles(cells,updated,particleVelocityX,particleVelocityY,materialState.wetness,materialState.heat,materialState.heatInputs,materialState.fuel,materialState.burn,materialState.age,materialState.corrosion,movementBlocks,W,H,gravity,seed);
 for(let move=0;move+2<moveTriples.length;move+=3)recordParticleMove(moveTriples[move],moveTriples[move+1],moveTriples[move+2],false);
 stepCustomMaterials();
 try{lifeSystem.step({cells,age:materialState.age,wetness:materialState.wetness,width:W,height:H,tick:simulationTick})}catch(error){console.error('PixelPhyx Life simulation error:',error)}
 for(let i=0;i<N;i++){const m=cells[i];if(!m)continue;const x=i%W,y=(i/W)|0;
  if(m===M.LAVA&&Math.random()<.00022)emitVisualParticle(x,y,'molten');
  else if(m===M.FIRE&&Math.random()<.00009)emitVisualParticle(x,y,'ember');
  else if(m===M.FIRE&&Math.random()<.00006)emitVisualParticle(x,y,'smoke');
  else if(m===M.WATER&&Math.random()<.000018)emitVisualParticle(x,y,'splash');
  else if(m===M.ACID&&Math.random()<.000035)emitVisualParticle(x,y,'acid');
  else if((m===M.SAND||m===M.SALT||m===M.CHARCOAL)&&Math.random()<.000012)emitVisualParticle(x,y,'dust');
  else if(m===M.STEAM&&Math.random()<.000025)emitVisualParticle(x,y,'steam');
 }
  const detonations=wasmEngine.step_chemistry(cells,materialState.wetness,materialState.heat,materialState.heatInputs,materialState.airHeat,materialState.airNext,materialState.fuel,materialState.burn,materialState.age,materialState.corrosion,ambient,W,H);
 if(detonations)log('TNT detonation!');
 stepVisualParticles();
}
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
  const material=particle.material,base=materialRgb(material);
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
 const cursorColor=c.color||'#65d6ad';
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
 const cell=1,x0=Math.round(c.x),y0=Math.round(c.y);
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
const particleCountElement=document.querySelector('#particleCount'),ropeCountElement=document.querySelector('#ropeCount'),gravityReadElement=document.querySelector('#gravityRead');
function render(){
 if(!canvasContextAvailable||!ctx||!frameImage)return;
 if(multiplayer?.joined&&!multiplayer.isHost){for(const rope of ropes)for(const node of rope.points){if(node===ropeDrag?.node)continue;if(Number.isFinite(node.targetX)){node.x+=(node.targetX-node.x)*.42;node.y+=(node.targetY-node.y)*.42;if(Math.abs(node.targetX-node.x)<.015)node.x=node.targetX;if(Math.abs(node.targetY-node.y)<.015)node.y=node.targetY}}}
 let count=0;
 frameImage.data.set(wasmEngine.render_composited_frame(cells,materialState.wetness,materialState.heat,colorLut,movingDestinations,W,H));
  for(const move of movingParticles)if(cells[move.toIndex]===move.material){const p=move.toIndex*4;frameImage.data[p]=27;frameImage.data[p+1]=38;frameImage.data[p+2]=52;}
 count=wasmEngine.count_particles(cells);
 ctx.putImageData(frameImage,0,0);
 drawInterpolatedCells();
 drawAirborneParticles();
 drawVisualParticles();
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const rope of ropes){const p=rope.points;if(p.length<2)continue;ctx.beginPath();ctx.moveTo(p[0].x+.5,p[0].y+.5);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x+.5,p[i].y+.5);ctx.strokeStyle='#c69b6b';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='#f1d2a4';ctx.lineWidth=.7;ctx.stroke()}
  for(const [id,target] of Object.entries(remoteCursorTargets)){
  if(target.receivedAt&&performance.now()-target.receivedAt>1800){delete remoteCursorTargets[id];delete remoteCursors[id];continue}
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
 count+=airborneParticles.length;
 if(particleCountElement)particleCountElement.textContent=count.toLocaleString();if(ropeCountElement)ropeCountElement.textContent=ropes.length;if(gravityReadElement)gravityReadElement.textContent=gravity.toFixed(1)+'×';
}
const SIMULATION_HZ=60,SIMULATION_STEP=1000/SIMULATION_HZ,MAX_STEPS_PER_FRAME=8;
let fpsAt=performance.now(),fpsCount=0,lastFrameAt=performance.now(),simulationAccumulator=0;
const fpsHud=document.querySelector('#fpsHud');
 function loop(now){
  fpsCount++;
  if(now-fpsAt>=500){if(fpsHud)fpsHud.textContent=Math.round(fpsCount*1000/(now-fpsAt))+' FPS';fpsCount=0;fpsAt=now;}
  if(now-lastAirTemperatureUpdate>=250){lastAirTemperatureUpdate=now;updateCurrentAirTemperature()}
  const elapsed=Math.min(250,Math.max(0,now-lastFrameAt));lastFrameAt=now;
 // Multiplayer uses a single authoritative simulation: only the host advances physics.
 // Clients render host snapshots and apply local edits optimistically until the host confirms them.
 if(running){simulationAccumulator+=elapsed*speed;let steps=0;while(simulationAccumulator>=SIMULATION_STEP&&steps<MAX_STEPS_PER_FRAME){tick();rebuildCellInterpolation();simulationAccumulator-=SIMULATION_STEP;steps++}}
 cellRenderAlpha=Math.max(0,Math.min(1,simulationAccumulator/SIMULATION_STEP));
 if(multiplayer?.joined&&multiplayer.isHost){
  const network=multiplayer.networkSettings;
  const syncInterval=network.snapshotIntervalMs;
  remoteSnapshotInterval=syncInterval;
  if(now-lastWorldPublish>=syncInterval){lastWorldPublish=now;multiplayer.publishWorld(serialize())}
  if(now-lastRopePublish>=network.ropeUpdateIntervalMs){lastRopePublish=now;multiplayer.publishRopes(ropes.map(r=>({id:r.id,points:r.points.map(p=>[p.x,p.y,!!p.anchor])})))}
 }
 render();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function formatTemperature(c){const value=temperatureUnit==='F'?c*9/5+32:c;return Math.round(value)+'°'+temperatureUnit}
function updateTemperature(){const slider=document.querySelector('#temperatureControl');document.querySelector('#tempOut').textContent=formatTemperature(ambient);slider.min=temperatureUnit==='F'?-148:-100;slider.max=temperatureUnit==='F'?2192:1200;slider.step=1;slider.value=temperatureUnit==='F'?Math.round(ambient*9/5+32):ambient;document.querySelector('#temperatureUnit').textContent='°'+temperatureUnit;document.querySelector('#temperatureUnit').title='Switch temperature units';updateCurrentAirTemperature()}
function updateCurrentAirTemperature(){let total=0;for(let i=0;i<materialState.airHeat.length;i++)total+=materialState.airHeat[i];const average=materialState.airHeat.length?total/materialState.airHeat.length:0;const value=document.querySelector('#currentAirTemp');if(value)value.textContent=formatTemperature(ambient+average)}
document.querySelector('#canvasSize').title='Current resolution: '+W+' × '+H;
document.querySelector('#canvasSize').addEventListener('change',e=>{const size=e.target.value;if(resizeCanvas(size))publishOperation({type:'canvasSize',size});else e.target.title='Current resolution: '+W+' × '+H});
document.querySelector('#play').onclick=()=>{running=!running;document.querySelector('#play').textContent=running?'Ⅱ Pause':'▶ Resume';publishOperation({type:'simulation',running})};
document.querySelector('#step').onclick=()=>{if(!running){if(multiplayer?.joined&&!multiplayer.isHost)publishOperation({type:'simulationStep'});else{tick();rebuildCellInterpolation();cellRenderAlpha=0;render();publishOperation({type:'simulationStep'})}}};
document.querySelector('#clear').onclick=()=>{cells.fill(0);particleVelocityX.fill(0);particleVelocityY.fill(0);movingParticles.length=0;airborneParticles.length=0;snapshotMoves.clear();movingDestinations.fill(0);moveByDestination.fill(-1);visualParticles.length=0;resetMaterialState(N);ropes=[];publishOperation({type:'clear'});render();log('World cleared')};
document.querySelector('#save').onclick=()=>{const a=document.createElement('a');a.download='pixelphyx-experiment.png';a.href=canvas.toDataURL();a.click()};

document.querySelector('#brush').oninput=e=>{brush=+e.target.value;document.querySelector('#brushOut').textContent=brush+' px'};
document.querySelector('#gravity').oninput=e=>{gravity=+e.target.value/10;document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×';publishOperation({type:'settings',gravity,ambient})};
document.querySelector('#speed').oninput=e=>{speed=+e.target.value;document.querySelector('#speedOut').textContent=speed+'×'};
document.querySelector('#temperatureControl').oninput=e=>{const value=+e.target.value;ambient=temperatureUnit==='F'?(value-32)*5/9:value;updateTemperature();publishOperation({type:'settings',gravity,ambient})};
document.querySelector('#defaultTemperature').onclick=()=>{ambient=20;updateTemperature();publishOperation({type:'settings',gravity,ambient})};
document.querySelector('#temperatureUnit').onclick=()=>{temperatureUnit=temperatureUnit==='C'?'F':'C';updateTemperature()};
const {openModal,closeOnlineModal}=initializeUiShell({
 onToggleSimulation:()=>document.querySelector('#play').click(),
 onRoomModalClosed:()=>{if(stopLobbyGallery){stopLobbyGallery();stopLobbyGallery=null}}
});
document.querySelector('#roomBtn').onclick=()=>openLobbyGallery();

let multiplayerLoading=null;
const pendingJoinRequests=new Map();
function queueJoinRequest(request){
 if(!request?.key)return;
 pendingJoinRequests.set(request.key,request);
 renderJoinRequests();
 log(request.name+' requested to join '+request.room);
}
function renderJoinRequests(){
 const section=document.querySelector('#joinApprovalSection');if(section)section.hidden=!room;const list=document.querySelector('#joinRequests');if(!list)return;
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
async function connectLocalServer(){
  if(!multiplayer){
   if(!multiplayerLoading){
    multiplayerLoading=(async()=>{
     const {createMultiplayer}=await import('./netcode/multiplayer.js?v='+encodeURIComponent(cacheVersion));
     multiplayer=createMultiplayer({
      onStatus:setConnection,onLog:log,onOperation:applyOperation,onWorld:applyWorld,onRopes:applyRopeState,
      getWorld:()=>serialize(),
      getRopes:()=>({by:playerId,updatedAt:Date.now(),ropes:ropes.map(r=>({id:r.id,points:r.points.map(p=>[p.x,p.y,!!p.anchor])}))}),
      onPlayers:renderPlayers,
      onCursor:cursor=>{
       if(!cursor?.id)return;
       if(cursor.active===false){delete remoteCursorTargets[cursor.id];delete remoteCursors[cursor.id];return}
       if(Number.isFinite(cursor.x)&&Number.isFinite(cursor.y)){
        remoteCursorTargets[cursor.id]={x:cursor.x,y:cursor.y,color:cursor.color||'#65d6ad',name:cursor.name||'Guest',receivedAt:performance.now()};
       }
      },
      onJoinRequest:request=>queueJoinRequest(request)
     });
    })().catch(error=>{multiplayerLoading=null;throw error});
   }
   await multiplayerLoading;
  }
  playerId=await multiplayer.connect();
  return playerId;
}
// local server connects only after the user selects Online.
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
const leaveRoomButton=document.querySelector('#leaveRoom');if(leaveRoomButton)leaveRoomButton.onclick=async()=>{
 const button=document.querySelector('#leaveRoom');button.disabled=true;
 try{
  await multiplayer?.leaveRoom();
  room='';
  pendingJoinRequests.clear();renderJoinRequests();updateCurrentRoomUI();
  document.querySelector('#roomLabel').textContent='ROOM · LOCAL';
  document.querySelector('#playerCount').textContent='0 online';
  log('Left the server. Your local experiment is still open.');
 }catch(error){log('Could not leave server: '+error.message)}
 finally{button.disabled=false}
};
document.querySelector('#join').onclick=()=>requestAndJoinRoom(document.querySelector('#roomCode').value);
document.querySelector('#createLobby').onclick=async()=>{
 const button=document.querySelector('#createLobby');button.disabled=true;button.textContent='Creating…';
 try{
  await connectLocalServer();
  
  room=await multiplayer.createLobby({name:playerName,color:playerColor});
  renderJoinRequests();
  document.querySelector('#roomLabel').textContent='ROOM · '+room;
  document.querySelector('#roomCode').value=room;
  updateCurrentRoomUI();
  closeOnlineModal(document.querySelector('#roomModal'));
  log('Created server '+room+' — you are the host'+' using local server relay');
 }catch(error){alert(error.message);log('Server creation failed: '+error.message)}
 finally{button.disabled=false;button.textContent='+ Create server'}
};

let stopLobbyGallery=null;
async function openLobbyGallery(){
 updateCurrentRoomUI();
 openModal('roomModal');
 document.querySelector('#lobbyGallery').innerHTML='<div class="lobby-empty">Enter a server IP or address, then connect.</div>';
 document.querySelector('#lobbyCapacity').textContent='Not connected';
}
async function connectToEnteredServer(){
 const input=document.querySelector('#serverAddress');
 const button=document.querySelector('#connectServer');
 const raw=input.value.trim();
 if(!raw){alert('Enter the server IP address first.');input.focus();return}
 let address=raw;
 if(/^https:\/\//i.test(address))address='wss://'+address.slice(8);
 else if(/^http:\/\//i.test(address))address='ws://'+address.slice(7);
 else if(!/^wss?:\/\//i.test(address))address='ws://'+address;
 try{
  const parsed=new URL(address);
  if(!['ws:','wss:'].includes(parsed.protocol))throw new Error();
  if(!parsed.port)parsed.port='3000';
  parsed.pathname='';
  parsed.search='';
  parsed.hash='';
  address=parsed.origin;
 }catch{alert('Enter a valid IP or address, for example 192.168.1.25:3000');input.focus();return}
 const previous=localStorage.getItem('pixelphyx-server-address')||'';
 if(previous!==address&&multiplayer){await multiplayer.disconnect();multiplayer=null;multiplayerLoading=null}
 localStorage.setItem('pixelphyx-server-address',address);
 button.disabled=true;button.textContent='Connecting…';
 try{
  await connectLocalServer();
  if(stopLobbyGallery)stopLobbyGallery();
  stopLobbyGallery=multiplayer.watchLobbies(renderLobbyGallery);
  document.querySelector('#join').disabled=false;
  document.querySelector('#createLobby').disabled=false;
  updateCurrentRoomUI();
  log('Connected to '+address);
 }catch(error){alert('Could not connect to '+address+': '+error.message)}
 finally{button.disabled=false;button.textContent='Connect to server'}
}
document.querySelector('#connectServer').onclick=connectToEnteredServer;
function renderLobbyGallery(lobbies){
 const gallery=document.querySelector('#lobbyGallery');
 document.querySelector('#lobbyCapacity').textContent=lobbies.length+' lobbies listed';
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
  const join=document.createElement('button');join.className='btn primary lobby-join';join.textContent='Request to join';join.disabled=false;
  join.onclick=async()=>{
   join.disabled=true;join.textContent='Request sent…';
   try{await requestAndJoinRoom(lobby.room);closeOnlineModal(document.querySelector('#roomModal'))}
   catch(error){alert(error.message);join.disabled=false;join.textContent='Request to join'}
  };
  card.append(top,host,join);gallery.append(card);
 }
}
async function requestAndJoinRoom(code){
 const clean=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24);
 if(!clean){alert('Choose a lobby first');return}
 try{
  await connectLocalServer();
  
  log('Sending join request to '+clean+'…');
  const approved=await multiplayer.requestJoin(clean,{name:playerName,color:playerColor});
  if(!approved)throw new Error('The host declined your request');
  await joinRoom(clean,true);
 }catch(error){log('Could not join lobby: '+error.message);throw error}
}

function encodeCells(data){let raw='';for(let i=0;i<data.length;i+=0x8000)raw+=String.fromCharCode(...data.subarray(i,Math.min(i+0x8000,data.length)));return btoa(raw)}
function decodeCells(value,packed=false,rle=false){if(Array.isArray(value))return Uint8Array.from(value);const raw=atob(value);if(rle){const out=new Uint8Array(N);let offset=0;for(let i=0;i+1<raw.length;i+=2){const count=raw.charCodeAt(i),material=raw.charCodeAt(i+1);if(!count||offset+count>N)throw new Error('Invalid compressed world snapshot');out.fill(material,offset,offset+count);offset+=count}if(offset!==N)throw new Error('Incomplete compressed world snapshot');return out}if(packed){const out=new Uint8Array(raw.length*2);for(let i=0;i<raw.length;i++){const byte=raw.charCodeAt(i);out[i*2]=byte&15;out[i*2+1]=byte>>4}return out}const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function encodeMaterialField(values,scale=1){const bytes=new Uint8Array(values.length);for(let i=0;i<values.length;i++)bytes[i]=Math.max(0,Math.min(255,Math.round(values[i]*scale)));let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(raw)}
function decodeMaterialField(value,target,scale=1){if(typeof value!=='string')return;try{const raw=atob(value);if(raw.length!==target.length)return;for(let i=0;i<raw.length;i++)target[i]=raw.charCodeAt(i)/scale}catch{}}
function serialize(){const networkCells=cells.slice();for(let i=0;i<networkCells.length;i++)if(networkCells[i]>LIFE_MAX_ID)networkCells[i]=M.EMPTY;const moves=Array.from(snapshotMoves.values(),p=>[p.fromX,p.fromY,p.toX,p.toY,p.material]).filter(p=>p[4]<=LIFE_MAX_ID);snapshotMoves.clear();return{width:W,height:H,canvasSize,simulationTick,cells:encodeCells(networkCells),packed:false,moves,airborne:airborneParticles.filter(p=>!p.customSource&&p.material<=LIFE_MAX_ID).slice(0,5000).map(p=>[p.x,p.y,p.vx,p.vy,p.material,p.wetness,p.heat,p.fuel,p.burn,p.age,p.corrosion]),materialState:{wetness:encodeMaterialField(materialState.wetness,255),heat:encodeMaterialField(materialState.heat,1/5),fuel:encodeMaterialField(materialState.fuel,255),burn:encodeMaterialField(materialState.burn,1),corrosion:encodeMaterialField(materialState.corrosion,1),airHeat:encodeMaterialField(materialState.airHeat,1/4)},gravity,ambient,running,updatedAt:Date.now(),by:playerId}}
function applyRopeState(data){
 if(!data||data.by===playerId||!Array.isArray(data.ropes))return;
 const next=[];
 for(const entry of data.ropes.slice(0,MAX_ROPES)){
  if(!entry||typeof entry.id!=='string'||!Array.isArray(entry.points)||entry.points.length<2)continue;
  const points=entry.points.slice(0,MAX_ROPE_POINTS).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]));
  if(points.length<2)continue;
  let rope=ropes.find(r=>r.id===entry.id);
  if(!rope||rope.points.length!==points.length){
   rope={id:entry.id,length:Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])||1.5,stiffness:1,points:points.map(p=>({x:+p[0],y:+p[1],px:+p[0],py:+p[1],sx:+p[0],sy:+p[1],ox:+p[0],oy:+p[1],targetX:+p[0],targetY:+p[1],anchor:!!p[2],dragMoved:false,sweepAge:0}))};
  }else{
   for(let i=0;i<points.length;i++){
    const node=rope.points[i],p=points[i];
    node.targetX=Math.max(0,Math.min(W-1,+p[0]));
    node.targetY=Math.max(0,Math.min(H-1,+p[1]));
    node.anchor=!!p[2];
   }
  }
  next.push(rope);
 }
 ropes=next;
}
function applyWorld(data){if(!data||data.by===playerId)return true;const snapshotAt=Number.isFinite(data.updatedAt)?data.updatedAt:0;if(snapshotAt&&snapshotAt<=lastAppliedSnapshotAt)return false;if(typeof data.canvasSize==='string'&&CANVAS_SIZES[data.canvasSize])resizeCanvas(data.canvasSize);else if(Number.isInteger(data.width)&&Number.isInteger(data.height)){const matching=Object.entries(CANVAS_SIZES).find(([,d])=>d.width===data.width&&d.height===data.height);if(matching)resizeCanvas(matching[0])}let incoming;try{incoming=decodeCells(data.cells,!!data.packed,!!data.rle)}catch(e){return false}if(incoming.length!==N)return false;for(let i=0;i<incoming.length;i++)if(incoming[i]>LIFE_MAX_ID)incoming[i]=M.EMPTY;if(snapshotAt)lastAppliedSnapshotAt=snapshotAt;if(Number.isInteger(data.simulationTick))simulationTick=data.simulationTick;lastRemoteWorldAt++;remoteSnapshotReceivedAt=performance.now();remoteSnapshotInterval=N>100000?1000:N>30000?750:500;remoteApplying=true;const isPredicting=multiplayer?.joined&&!multiplayer.isHost,predictionEnabled=multiplayer?.networkSettings?.predictionEnabled===true;for(let i=0;i<N;i++){if(predictionEnabled&&isPredicting&&movingDestinations[i]&&cells[i]!==M.EMPTY){incoming[i]=cells[i];continue}if(incoming[i]===M.EMPTY){particleVelocityX[i]=0;particleVelocityY[i]=0}}cells.set(incoming);airborneParticles=Array.isArray(data.airborne)?data.airborne.slice(0,5000).filter(p=>Array.isArray(p)&&p.length>=5&&p.slice(0,5).every(Number.isFinite)&&p[4]>0&&p[4]<=LIFE_MAX_ID&&p[0]>=0&&p[0]<W&&p[1]>=0&&p[1]<H).map(p=>({x:p[0],y:p[1],vx:p[2],vy:p[3],material:p[4],wetness:p[5]||0,heat:p[6]||0,fuel:p[7]||0,burn:p[8]||0,age:p[9]||0,corrosion:p[10]||0,sleep:0})):[];movingParticles=Array.isArray(data.moves)?data.moves.slice(0,W*H).filter(p=>Array.isArray(p)&&p.length>=5&&p.every(Number.isFinite)&&inside(p[0],p[1])&&inside(p[2],p[3])&&p[4]>0&&p[4]<=LIFE_MAX_ID).map(p=>({fromX:p[0],fromY:p[1],toX:p[2],toY:p[3],toIndex:idx(p[2],p[3]),material:p[4]})):[]);moveByDestination.fill(-1);rebuildCellInterpolation();if(data.materialState){decodeMaterialField(data.materialState.wetness,materialState.wetness,255);decodeMaterialField(data.materialState.heat,materialState.heat,1/5);decodeMaterialField(data.materialState.fuel,materialState.fuel,255);decodeMaterialField(data.materialState.burn,materialState.burn,1);decodeMaterialField(data.materialState.corrosion,materialState.corrosion,1);decodeMaterialField(data.materialState.airHeat,materialState.airHeat,1/4)}if(Number.isFinite(data.gravity))gravity=data.gravity;if(Number.isFinite(data.ambient))ambient=data.ambient;if(typeof data.running==='boolean'){running=data.running;document.querySelector('#play').textContent=running?'Ⅱ Pause':'▶ Resume';}document.querySelector('#gravity').value=Math.round(gravity*10);document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×';updateTemperature();remoteApplying=false;return true}
async function joinRoom(code,approved=false){
 const clean=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24);
 if(!clean){alert('Enter a room code');return}
 try{
  await connectLocalServer();
  if(!multiplayer)throw new Error('Multiplayer failed to initialize');
  lastRemoteWorldAt=0;lastAppliedSnapshotAt=0;lastWorldPublish=0;
  await multiplayer.joinRoom(clean,{name:playerName,color:playerColor},approved,false);room=clean;
  renderJoinRequests();
  document.querySelector('#roomLabel').textContent='ROOM · '+room;
  document.querySelector('#roomCode').value=room;
  updateCurrentRoomUI();
  log('Joined room '+room+' — local server world synchronization active');
 }catch(e){log('Could not join room: '+e.message);alert('Could not join room: '+e.message)}
}
function publishOperation(operation){lastOperationAppliedAt=performance.now();multiplayer?.publishOperation(operation)}
function renderPlayers(people){
 const el=document.querySelector('#players'),entries=Object.entries(people||{});
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
function applyOperation(op){if(!op||remoteApplying)return;lastOperationAppliedAt=performance.now();remoteApplying=true;try{if(op.type==='clear'){cells.fill(0);particleVelocityX.fill(0);particleVelocityY.fill(0);airborneParticles.length=0;resetMaterialState(N);ropes=[]}else if(op.type==='ropeDelete'&&typeof op.ropeId==='string'){ropes=ropes.filter(r=>r.id!==op.ropeId)}else if(op.type==='canvasSize'&&CANVAS_SIZES[op.size]){resizeCanvas(op.size)}else if(op.type==='settings'){if(Number.isFinite(op.gravity)){gravity=op.gravity;document.querySelector('#gravity').value=Math.round(gravity*10);document.querySelector('#gravityOut').textContent=gravity.toFixed(1)+'×';document.querySelector('#gravityRead').textContent=gravity.toFixed(1)+'×'}if(Number.isFinite(op.ambient)){ambient=op.ambient;updateTemperature()}}else if(op.type==='simulation'&&typeof op.running==='boolean'){running=op.running;document.querySelector('#play').textContent=running?'Ⅱ Pause':'▶ Resume';}else if(op.type==='simulationStep'){if(multiplayer?.isHost&&!running){tick();rebuildCellInterpolation();cellRenderAlpha=0}}else if(op.type==='rope'&&op.a&&op.b){const a=op.a,b=op.b,id=String(op.ropeId||newRopeId());if(!ropes.some(r=>r.id===id))createRope(a,b,id)}else if(op.type==='ropeNode'&&typeof op.ropeId==='string'&&Number.isInteger(op.nodeIndex)&&Number.isFinite(op.x)&&Number.isFinite(op.y)){const rope=ropes.find(r=>r.id===op.ropeId),node=rope?.points[op.nodeIndex];if(node){node.ox=node.x;node.oy=node.y;node.dragMoved=true;node.x=op.x;node.y=op.y;node.px=op.x-(Number.isFinite(op.vx)&&!op.predicted?op.vx:0);node.py=op.y-(Number.isFinite(op.vy)&&!op.predicted?op.vy:0);if(typeof op.anchor==='boolean')node.anchor=op.anchor}}else if(op.type==='ropeEdit'&&Number.isInteger(op.index)&&Array.isArray(op.points)&&ropes[op.index]){const rope=ropes[op.index];if(op.points.length===rope.points.length)rope.points=op.points.map((p,i)=>({x:+p[0],y:+p[1],px:+p[0],py:+p[1],sx:+p[0],sy:+p[1],sweepAge:0,anchor:!!p[2]}))}else if(op.type==='stroke'&&Array.isArray(op.points)&&(!Number.isFinite(op.material)||op.material<=LIFE_MAX_ID)){const pts=op.points.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&inside(p.x,p.y)),bs=Math.max(1,Math.min(22,op.brush||1)),r=Math.floor(bs/4),mat=op.erase?M.EMPTY:Math.max(0,Math.min(LIFE_MAX_ID,op.material|0));if(op.erase){for(const p of pts)circle(p.x,p.y,bs,M.EMPTY)}else if(op.tool==='bomb'){for(const p of pts)circle(p.x,p.y,2,M.TNT)}else if(op.tool==='heat'||op.tool==='cool'){for(const p of pts)circle(p.x,p.y,bs,op.tool==='heat'?M.FIRE:M.ICE)}else if(op.tool==='line'){for(let k=0;k<pts.length;k++){if(k===0)circle(pts[k].x,pts[k].y,r,mat);else drawLine(pts[k-1].x,pts[k-1].y,pts[k].x,pts[k].y,mat,r)}}else if(pts.length){circle(pts[0].x,pts[0].y,bs,mat);for(let k=1;k<pts.length;k++)drawLine(pts[k-1].x,pts[k-1].y,pts[k].x,pts[k].y,mat,bs)}}}finally{remoteApplying=false}}
let localCursor=null;
canvas.parentElement.addEventListener('pointermove',e=>{const p=canvasPoint(e);if(!inside(p.x,p.y))return;localCursor=p;if(!room||!multiplayer?.joined)return;multiplayer.updateCursor(p,playerColor,playerName)});
const localCursorCanvas=document.querySelector('#localCursor'),localCursorCtx=localCursorCanvas.getContext('2d');
const cursorNamesCanvas=document.querySelector('#cursorNames'),cursorNamesCtx=cursorNamesCanvas.getContext('2d');
const canvasShell=document.querySelector('#canvasShell');
const canvasLayers=[canvas,particleInterpolationCanvas,localCursorCanvas,cursorNamesCanvas];
function fitCanvasToShell(){
 for(const layer of canvasLayers){
  layer.style.left='0';
  layer.style.top='0';
  layer.style.transform='none';
  layer.style.width='100%';
  layer.style.height='100%';
 }
}
fitCanvasToShell();
if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitCanvasToShell).observe(canvasShell);
else window.addEventListener('resize',fitCanvasToShell);
canvas.addEventListener('pointerleave',()=>{localCursor=null;multiplayer?.updateCursor(null,playerColor,playerName);localCursorCtx.clearRect(0,0,localCursorCanvas.width,localCursorCanvas.height)});
document.querySelector('#playerName').value=playerName;
const serverAddressInput=document.querySelector('#serverAddress');
if(serverAddressInput)serverAddressInput.value=localStorage.getItem('pixelphyx-server-address')||'';
document.querySelector('#playerColor').value=playerColor;
document.querySelector('#playerName').addEventListener('change',e=>{playerName=e.target.value.trim().slice(0,20)||'Lab guest';e.target.value=playerName;localStorage.setItem('pixelphyx-player-name',playerName);multiplayer?.updateIdentity(playerName,playerColor);if(localCursor)multiplayer?.updateCursor(localCursor,playerColor,playerName)});
document.querySelector('#playerColor').addEventListener('input',e=>{playerColor=e.target.value;localStorage.setItem('pixelphyx-player-color',playerColor);multiplayer?.updateIdentity(playerName,playerColor);if(localCursor)multiplayer?.updateCursor(localCursor,playerColor,playerName)});
updateTemperature();
const simulationParams=new URLSearchParams(location.search);
if(simulationParams.has('pixelphyx-sim')){
 document.documentElement.style.visibility='hidden';
 (async()=>{try{await connectLocalServer();await multiplayer.connectSimulation(simulationParams.get('room'),simulationParams.get('pixelphyx-sim'));room=multiplayer.room;document.documentElement.dataset.pixelphyxSimulation='ready';log('Authoritative server simulation active for '+room+'.');}catch(error){console.error('PixelPhyx headless simulation failed:',error);document.documentElement.dataset.pixelphyxSimulation='error';}})();
}else if(simulationParams.get('join')==='1')setTimeout(()=>document.querySelector('#roomBtn')?.click(),0);
// Trigger offline bundle rebuild for swept rope collision handling.
