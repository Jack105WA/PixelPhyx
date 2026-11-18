import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const websiteDir = 'Website/';
const offlineDir = 'Offline/';
const read = path => readFile(websiteDir + path, 'utf8');
const [offlineHtml, mainSource, physicsSource, engineSource, uiSource, wasmGlueSource, wasmBinary] = await Promise.all([
  readFile(offlineDir + 'offline.html', 'utf8'),
  read('js/main.js'),
  read('js/material-physics.js'),
  read('js/physics-engine.js'),
  read('js/ui.js'),
  readFile('Website/pkg/pixelphyx_wasm.js', 'utf8'),
  readFile('Website/pkg/pixelphyx_wasm_bg.wasm')
]);
const stripExports = source => source.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
const physics = stripExports(physicsSource);
const engine = stripExports(engineSource);
const ui = stripExports(uiSource);
const wasmGlueUrl = 'data:text/javascript;base64,' + Buffer.from(wasmGlueSource).toString('base64');
const wasmBase64 = wasmBinary.toString('base64');
if (/\bexport\s/.test(physics) || /\bexport\s/.test(engine) || /\bexport\s/.test(ui)) {
  throw new Error('Unsupported export syntax in physics modules.');
}

const mainStart = mainSource.replace(
  /^\/\/ Reuse the cache-busting version[\s\S]*?\n\]\);\s*/,
  ''
);
if (mainStart === mainSource) throw new Error('Could not remove module imports from main.js.');
const offlineMain = mainStart.replace(
  "const {createMultiplayer}=await import('./netcode/multiplayer.js?v='+encodeURIComponent(cacheVersion));",
  'const {createMultiplayer}=window.__pixelphyxOfflineMultiplayer;'
);
if (offlineMain === mainStart) throw new Error('Could not replace multiplayer import.');

const gameScript = [
  '/* Generated from main.js and the physics modules. */',
  '(async()=>{',
  `const wasmGlue=await import(${JSON.stringify(wasmGlueUrl)});`,
  `const wasmBytes=Uint8Array.from(atob('${wasmBase64}'),c=>c.charCodeAt(0));`,
  'await wasmGlue.default(wasmBytes.buffer);',
  `const wasmExports=${JSON.stringify([...new Set([...mainSource.matchAll(/\\bwasmEngine\\.([A-Za-z_$][\\w$]*)\\s*\\(/g)].map(match=>match[1]))])};`,
  'const missingWasmExports=wasmExports.filter(name=>typeof wasmGlue[name]!=="function");if(missingWasmExports.length)throw new Error("Offline WASM build is missing required exports: "+missingWasmExports.join(", "));',
  'async function createWasmEngine(){return Object.freeze(Object.fromEntries(wasmExports.map(name=>[name,wasmGlue[name]])))}',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
  'const PixelPhyxMaterial=(()=>{', physics, 'return {stepMaterialPhysics,materialState,resetMaterialState};', '})();',
  'const PixelPhyxEngine=(()=>{', engine, 'return {createPhysicsEngine};', '})();',
  'const PixelPhyxUi=(()=>{', ui, 'return {initializeUiShell};', '})();',
  'const {initializeUiShell}=PixelPhyxUi;',
  '(async()=>{const firebaseConfig={};',
  'const {stepMaterialPhysics,materialState,resetMaterialState}=PixelPhyxMaterial;',
  'const {createPhysicsEngine}=PixelPhyxEngine;',
  offlineMain,
  '})();',
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
await writeFile(offlineDir + 'offline.html', builtHtml, 'utf8');
console.log('Built Offline/offline.html with the unified physics engine.');
