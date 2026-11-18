import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const websiteDir = 'Website/';
const offlineDir = 'Offline/';
const read = path => readFile(websiteDir + path, 'utf8');
const [offlineHtml, mainSource, physicsSource, engineSource, objectsSource, rendererSource] = await Promise.all([
  readFile(offlineDir + 'offline.html', 'utf8'),
  read('js/main.js'),
  read('js/material-physics.js'),
  read('js/physics-engine.js'),
  read('js/objects.js'),
  read('js/object-renderer.js')
]);
const stripExports = source => source.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
const physics = stripExports(physicsSource);
const engine = stripExports(engineSource);
const renderer = stripExports(rendererSource);
const objects = stripExports(objectsSource.replace("import {drawObjectBodies} from './object-renderer.js';", ''));
if (/\bexport\s/.test(physics) || /\bexport\s/.test(engine) || /\bexport\s/.test(objects) || /\bexport\s/.test(renderer)) {
  throw new Error('Unsupported export syntax in physics modules.');
}

const mainStart = mainSource.replace(
  /^\/\/ Reuse the cache-busting version[\s\S]*?\n\]\);\s*/,
  ''
);
if (mainStart === mainSource) throw new Error('Could not remove module imports from main.js.');
const offlineMain = mainStart.replace(
  "const {createMultiplayer}=await import('./multiplayer.js?v='+encodeURIComponent(cacheVersion));",
  'const {createMultiplayer}=window.__pixelphyxOfflineMultiplayer;'
).replace(/\blocalStorage\.getItem\(/g, 'offlineReadSetting(')
 .replace(/\blocalStorage\.setItem\(/g, 'offlineWriteSetting(');
if (offlineMain === mainStart) throw new Error('Could not replace multiplayer import.');

const gameScript = [
  '/* Generated from main.js and the physics modules. */',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
  'const offlineStorage=(()=>{try{return window.localStorage}catch{return null}})();',
  'const offlineReadSetting=key=>{try{return offlineStorage?.getItem(key)||null}catch{return null}};',
  'const offlineWriteSetting=(key,value)=>{try{offlineStorage?.setItem(key,value)}catch(error){console.info("Offline preferences could not be saved.",error)}};',
  'const PixelPhyxMaterial=(()=>{', physics, 'return {stepMaterialPhysics,materialState,resetMaterialState};', '})();',
  'const PixelPhyxEngine=(()=>{', engine, 'return {createPhysicsEngine};', '})();',
  'const PixelPhyxRenderer=(()=>{', renderer, 'return {drawObjectBodies};', '})();',
  'const PixelPhyxObjects=(()=>{const {drawObjectBodies}=PixelPhyxRenderer;', objects, 'return {createObjectSystem};', '})();',
  '(()=>{const firebaseConfig={};',
  'const {stepMaterialPhysics,materialState,resetMaterialState}=PixelPhyxMaterial;',
  'const {createPhysicsEngine}=PixelPhyxEngine;',
  'const {createObjectSystem}=PixelPhyxObjects;',
  offlineMain,
  '})();'
].join('\n');

// Route canvas input through its shell so every visual layer shares one reliable
// pointer target. Pointer capture stays on the shell for the full drag.
const offlineGameScript = gameScript
  .replaceAll("canvas.addEventListener('pointerdown',", "canvas.parentElement.addEventListener('pointerdown',")
  .replaceAll("canvas.addEventListener('pointermove',", "canvas.parentElement.addEventListener('pointermove',")
  .replaceAll("canvas.addEventListener('pointerup',", "canvas.parentElement.addEventListener('pointerup',")
  .replaceAll("canvas.addEventListener('pointercancel',", "canvas.parentElement.addEventListener('pointercancel',")
  .replaceAll("canvas.addEventListener('wheel',", "canvas.parentElement.addEventListener('wheel',")
  .replaceAll("canvas.setPointerCapture(", "canvas.parentElement.setPointerCapture(")
  .replace("function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left)/r.width*W),y:Math.floor((e.clientY-r.top)/r.height*H)}}", "function canvasPoint(e){const r=canvasShell.getBoundingClientRect();if(!r.width||!r.height)return{x:-1,y:-1};return{x:Math.floor((e.clientX-r.left)/r.width*W),y:Math.floor((e.clientY-r.top)/r.height*H)}}")
  .replace("const canvasLayers=[canvas,localCursorCanvas,cursorNamesCanvas];", "const canvasLayers=[canvas,particleInterpolationCanvas,localCursorCanvas,cursorNamesCanvas];");
new vm.Script(offlineGameScript, { filename: 'offline-game.js' });

const scriptTag = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/i;
if (!scriptTag.test(offlineHtml)) throw new Error('Offline game script not found.');
let builtHtml = offlineHtml.replace(scriptTag, '<script>\n' + offlineGameScript + '\n</script>');
builtHtml = builtHtml
  .replace('<span class="status-dot"></span>', '')
  .replace('<button class="btn" id="downloadOffline" type="button">Download offline copy</button>', '')
  .replace('<span class="room-pill">OFFLINE · SINGLE FILE</span>', '')
  .replace('cursor:none', 'cursor:crosshair')
  .replace('const canvasLayers=[canvas,localCursorCanvas,cursorNamesCanvas];', 'const canvasLayers=[canvas,particleInterpolationCanvas,localCursorCanvas,cursorNamesCanvas];')
  .replace(/<script>\s*\(\(\s*\)\s*=>\s*\{[\s\S]*?<\/script>\s*/, '');
// The downloadable entrypoint must itself contain the complete game. A file:// page
// cannot fetch a sibling HTML file, and an online updater defeats offline use.
builtHtml = builtHtml
  .replace('<div class="brandtag">ONLINE PHYSICS LAB</div>', '<div class="brandtag">OFFLINE PHYSICS LAB</div>')
  .replace('<title>PixelPhyx — Online Physics Lab</title>', '<title>PixelPhyx — Offline Physics Lab</title>')
  .replace('name="description" content="A multiplayer pixel physics and chemistry sandbox. Build, experiment, and break things together."', 'name="description" content="A standalone offline pixel physics and chemistry sandbox. Save and load your experiments locally."')
  .replace('<button class="btn" id="save">Export PNG</button>', '<button class="btn" id="save">Export PNG</button>');
if (!builtHtml.includes('id="saveWorld"')) builtHtml = builtHtml.replace('<button class="btn" id="save">Export PNG</button>', '<button class="btn" id="save">Export PNG</button><button class="btn" id="saveWorld" type="button">Save World</button><button class="btn" id="loadWorld" type="button">Load World</button><input id="loadWorldFile" type="file" accept="application/json,.json" hidden>');
builtHtml = builtHtml.replace(/<script id="pixelphyx-offline-updater">[\s\S]*?<\/script>\s*/i, '');
const persistenceCode = String.raw`
// Local world files preserve pixels, material state, props, ropes and simulation settings.
const saveWorldButton=document.querySelector('#saveWorld');
const loadWorldButton=document.querySelector('#loadWorld');
const loadWorldFile=document.querySelector('#loadWorldFile');
saveWorldButton.addEventListener('click',()=>{
 const snapshot=serialize();
 snapshot.format='pixelphyx-world';snapshot.version=1;
 snapshot.ropes=ropes.map(rope=>({id:rope.id,points:rope.points.map(p=>[p.x,p.y,!!p.anchor])}));
 const blob=new Blob([JSON.stringify(snapshot)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='pixelphyx-world.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
loadWorldButton.addEventListener('click',()=>loadWorldFile.click());
loadWorldFile.addEventListener('change',async()=>{
 const file=loadWorldFile.files?.[0];if(!file)return;
 try{
  if(file.size>12*1024*1024)throw new Error('World file is too large (12 MB maximum).');
  const snapshot=JSON.parse(await file.text());
  if(snapshot?.format!=='pixelphyx-world'||snapshot.version!==1||typeof snapshot.cells!=='string')throw new Error('This is not a supported PixelPhyx world file.');
  const imported={...snapshot,by:'offline-file',updatedAt:Date.now()+1};
  if(!applyWorld(imported))throw new Error('The world data could not be loaded.');
  applyRopeState({by:'offline-file',ropes:Array.isArray(snapshot.ropes)?snapshot.ropes:[]});
  running=snapshot.running!==false;
  document.querySelector('#play').textContent=running?'Ⅱ Pause':'▶ Play';
  render();log('World loaded from '+file.name);
 }catch(error){alert('Could not load world: '+error.message);log('World load failed: '+error.message)}
 finally{loadWorldFile.value=''}
});
`;
const closingIife = /\n\}\)\(\);\s*$/;
if (!closingIife.test(offlineGameScript)) throw new Error('Could not find the offline game entrypoint.');
const finalGameScript=offlineGameScript.replace(closingIife, '\n'+persistenceCode+'\n})();');
new vm.Script(finalGameScript, { filename: 'offline-game.js' });
builtHtml = builtHtml.replace(/<script>\n[\s\S]*?<\/script>/i, '<script>\n'+finalGameScript+'\n</script>');
await Promise.all([
  writeFile(offlineDir + 'offline.html', builtHtml, 'utf8'),
  writeFile(websiteDir + 'offline.html', builtHtml, 'utf8'),
  writeFile(offlineDir + 'PixelPhyx-Offline.html', builtHtml, 'utf8')
]);
console.log('Built fully standalone offline game with local world save/load.');
