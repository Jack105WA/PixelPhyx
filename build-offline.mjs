import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const websiteDir = 'Website/';
const read = path => readFile(websiteDir + path, 'utf8');
const [offlineHtml, mainSource, physicsSource, engineSource, objectsSource] = await Promise.all([
  read('offline.html'),
  read('js/main.js'),
  read('js/material-physics.js'),
  read('js/physics-engine.js'),
  read('js/objects.js')
]);
const stripExports = source => source.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
const physics = stripExports(physicsSource);
const engine = stripExports(engineSource);
const objects = stripExports(objectsSource);
if (/\bexport\s/.test(physics) || /\bexport\s/.test(engine) || /\bexport\s/.test(objects)) {
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
);
if (offlineMain === mainStart) throw new Error('Could not replace multiplayer import.');

const gameScript = [
  '/* Generated from main.js and the physics modules. */',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
  'const PixelPhyxMaterial=(()=>{', physics, 'return {stepMaterialPhysics,materialState,resetMaterialState};', '})();',
  'const PixelPhyxEngine=(()=>{', engine, 'return {createPhysicsEngine};', '})();',
  'const PixelPhyxObjects=(()=>{', objects, 'return {createObjectSystem};', '})();',
  '(()=>{const firebaseConfig={};',
  'const {stepMaterialPhysics,materialState,resetMaterialState}=PixelPhyxMaterial;',
  'const {createPhysicsEngine}=PixelPhyxEngine;',
  'const {createObjectSystem}=PixelPhyxObjects;',
  offlineMain,
  '})();'
].join('\n');
new vm.Script(gameScript, { filename: 'offline-game.js' });

const scriptTag = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/i;
if (!scriptTag.test(offlineHtml)) throw new Error('Offline game script not found.');
await writeFile(
  websiteDir + 'offline.html',
  offlineHtml.replace(scriptTag, '<script>\n' + gameScript + '\n</script>'),
  'utf8'
);
console.log('Built offline.html with the unified physics engine.');
