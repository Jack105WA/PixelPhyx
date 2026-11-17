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
);
if (offlineMain === mainStart) throw new Error('Could not replace multiplayer import.');

const gameScript = [
  '/* Generated from main.js and the physics modules. */',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
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
new vm.Script(gameScript, { filename: 'offline-game.js' });

const scriptTag = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/i;
if (!scriptTag.test(offlineHtml)) throw new Error('Offline game script not found.');
let builtHtml = offlineHtml.replace(scriptTag, '<script>\n' + gameScript + '\n</script>');
builtHtml = builtHtml
  .replace('<span class="status-dot"></span>', '')
  .replace('<button class="btn" id="downloadOffline" type="button">Download offline copy</button>', '')
  .replace('<span class="room-pill">OFFLINE · SINGLE FILE</span>', '')
  .replace('cursor:none', 'cursor:crosshair')
  .replace('const canvasLayers=[canvas,localCursorCanvas,cursorNamesCanvas];', 'const canvasLayers=[canvas,particleInterpolationCanvas,localCursorCanvas,cursorNamesCanvas];')
  .replace(/<script>\s*\(\(\s*\)\s*=>\s*\{[\s\S]*?<\/script>\s*/, '');
await Promise.all([
  writeFile(offlineDir + 'offline.html', builtHtml, 'utf8'),
  writeFile(websiteDir + 'offline.html', builtHtml, 'utf8')
]);
console.log('Built offline.html with the unified physics engine.');
