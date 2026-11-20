import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const websiteDir = 'Website/';
const offlineDir = 'Offline/';
const read = path => readFile(websiteDir + path, 'utf8');

const [
  offlineHtml,
  mainSource,
  physicsSource,
  engineSource,
  uiSource,
  lifeSource,
  wasmEngineSource,
  wasmGlueSource,
  wasmBinary
] = await Promise.all([
  readFile(offlineDir + 'offline.html', 'utf8'),
  read('js/main.js'),
  read('js/material-physics.js'),
  read('js/physics-engine.js'),
  read('js/ui.js'),
  read('js/life.js'),
  read('js/wasm-engine.js'),
  readFile('Website/pkg/pixelphyx_wasm.js', 'utf8'),
  readFile('Website/pkg/pixelphyx_wasm_bg.wasm')
]);

const stripExports = source => source.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
const physics = stripExports(physicsSource);
const engine = stripExports(engineSource);
const ui = stripExports(uiSource);
const life = stripExports(lifeSource);

if (/\bexport\s/.test(physics) || /\bexport\s/.test(engine) ||
    /\bexport\s/.test(ui) || /\bexport\s/.test(life)) {
  throw new Error('Unsupported export syntax in offline physics modules.');
}

const mainStart = mainSource.replace(
  /^\/\/ Reuse the cache-busting version[\s\S]*?\n\]\);\s*/,
  ''
);
if (mainStart === mainSource) {
  throw new Error('Could not remove the online module imports from main.js.');
}

// Replace every lazy-loaded multiplayer import with the offline adapter.
const multiplayerImportPattern = /const\s*\{\s*createMultiplayer\s*\}\s*=\s*await\s+import\(\s*(['"])\.\/netcode\/multiplayer\.js\?v=\1\s*\+\s*encodeURIComponent\(cacheVersion\)\s*\)/g;
const multiplayerImportMatches = [...mainStart.matchAll(multiplayerImportPattern)];
if (multiplayerImportMatches.length !== 1) {
  throw new Error(`Expected one multiplayer import for offline adaptation; found ${multiplayerImportMatches.length}. Update Offline/build-offline.mjs for the current main.js source.`);
}
const offlineMain = mainStart.replace(
  multiplayerImportPattern,
  'const {createMultiplayer}=window.__pixelphyxOfflineMultiplayer'
);

const wasmImport = wasmEngineSource.match(/import\s+init,\s*\{([\s\S]*?)\}\s*from/);
if (!wasmImport) throw new Error('Could not read the online WASM engine exports.');

const wasmExports = wasmImport[1].split(',').map(name => name.trim()).filter(Boolean);
const mainWasmMethods = [...new Set(
  [...mainSource.matchAll(/\bwasmEngine\.([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])
)];
const missingMainMethods = mainWasmMethods.filter(name => !wasmExports.includes(name));
if (missingMainMethods.length) {
  throw new Error('Online game uses WASM methods missing from wasm-engine.js: ' + missingMainMethods.join(', '));
}

const wasmGlueUrl = 'data:text/javascript;base64,' + Buffer.from(wasmGlueSource).toString('base64');
const wasmBase64 = wasmBinary.toString('base64');

const gameScript = [
  '/* Generated from the shared PixelPhyx source modules. Do not edit this output. */',
  '(async()=>{',
  `const wasmGlue=await import(${JSON.stringify(wasmGlueUrl)});`,
  `const wasmBytes=Uint8Array.from(atob('${wasmBase64}'),c=>c.charCodeAt(0));`,
  'await wasmGlue.default({module_or_path:wasmBytes.buffer});',
  `const wasmExports=${JSON.stringify(wasmExports)};`,
  'const missingWasmExports=wasmExports.filter(name=>typeof wasmGlue[name]!=="function");',
  'if(missingWasmExports.length)throw new Error("Offline WASM build is missing required exports: "+missingWasmExports.join(", "));',
  'async function createWasmEngine(){return Object.freeze(Object.fromEntries(wasmExports.map(name=>[name,wasmGlue[name]])))}',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
  'const PixelPhyxMaterial=(()=>{', physics, 'return {materialState,resetMaterialState};', '})();',
  'const PixelPhyxEngine=(()=>{', engine, 'return {createPhysicsEngine};', '})();',
  'const PixelPhyxUi=(()=>{', ui, 'return {initializeUiShell};', '})();',
  'const PixelPhyxLife=(()=>{', life, 'return {createLifeSystem,LIFE_MATERIALS};', '})();',
  'const {createLifeSystem,LIFE_MATERIALS}=PixelPhyxLife;',
  'const {initializeUiShell}=PixelPhyxUi;',
  '(async()=>{const firebaseConfig={};',
  'const {materialState,resetMaterialState}=PixelPhyxMaterial;',
  'const {createPhysicsEngine}=PixelPhyxEngine;',
  offlineMain,
  '})();',
  '})();'
].join('\n');

// Parse the complete generated application before writing anything.
new vm.Script(gameScript, { filename: 'pixelphyx-offline.js' });

const scriptTag = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/i;
if (!scriptTag.test(offlineHtml)) throw new Error('Offline HTML template has no application script.');

const withoutUpdater = offlineHtml.replace(
  /<script\s+id=["']pixelphyx-offline-updater["'][^>]*>[\s\S]*?<\/script\s*>/i,
  ''
);
if (withoutUpdater === offlineHtml) {
  console.warn('No online updater script was present in the offline template.');
}

let builtHtml = withoutUpdater.replace(
  scriptTag,
  '<script>\n' + gameScript + '\n</script>'
);

builtHtml = builtHtml
  .replace('<span class="status-dot"></span>', '')
  .replace('<button class="btn" id="downloadOffline" type="button">Download offline copy</button>', '')
  .replace('<span class="room-pill">OFFLINE · SINGLE FILE</span>', '')
  .replace('cursor:none', 'cursor:crosshair');

const buildId = createHash('sha256')
  .update(mainSource)
  .update(physicsSource)
  .update(engineSource)
  .update(uiSource)
  .update(lifeSource)
  .update(wasmGlueSource)
  .update(wasmBinary)
  .digest('hex')
  .slice(0, 16);

builtHtml = builtHtml.replace(
  /(<meta\s+name=["']pixelphyx-offline-build["']\s+content=["'])[^"']*(["'])/i,
  (_match, before, after) => before + buildId + after
);

if (/<script\b[^>]*\bsrc=/i.test(builtHtml)) {
  throw new Error('Offline output contains an external script dependency.');
}
if (/pixelphyx-offline-updater|raw\.githubusercontent\.com/i.test(builtHtml)) {
  throw new Error('Offline output still contains an online auto-updater.');
}
if (!builtHtml.includes('pixelphyx-offline-build') || !builtHtml.includes('wasmBytes')) {
  throw new Error('Offline output failed its required build markers.');
}

await writeFile(offlineDir + 'offline.html', builtHtml, 'utf8');
console.log(`Built standalone offline edition (${buildId}).`);
