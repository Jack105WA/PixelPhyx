import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const websiteDir = 'Website/';
const read = path => readFile(websiteDir + path, 'utf8');
const [offlineHtml, mainSource, physicsSource, engineSource] = await Promise.all([
  read('offline.html'),
  read('js/main.js'),
  read('js/material-physics.js'),
  read('js/physics-engine.js')
]);
const stripExports = source => source.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
const physics = stripExports(physicsSource);
const engine = stripExports(engineSource);
if (/\bexport\s/.test(physics) || /\bexport\s/.test(engine)) {
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
  '/* Generated from main.js, material-physics.js and physics-engine.js. */',
  'window.__pixelphyxOfflineMultiplayer={createMultiplayer(){throw new Error("Multiplayer is unavailable in the offline edition.")}};',
  'const PixelPhyxMaterial=(()=>{', physics, 'return {stepMaterialPhysics,materialState,resetMaterialState};', '})();',
  'const PixelPhyxEngine=(()=>{', engine, 'return {createPhysicsEngine};', '})();',
  '(()=>{const firebaseConfig={};',
  'const {stepMaterialPhysics,materialState,resetMaterialState}=PixelPhyxMaterial;',
  'const {createPhysicsEngine}=PixelPhyxEngine;',
  offlineMain,
  '})();'
].join('\n');
new vm.Script(gameScript, { filename: 'offline-game.js' });

const scriptTag = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/i;
if (!scriptTag.test(offlineHtml)) throw new Error('Offline game script not found.');
const buildId = createHash('sha256').update(gameScript).digest('hex');
const updater = `<script id="pixelphyx-offline-updater">\n(async()=>{\n  const latestUrl='https://raw.githubusercontent.com/Jack105WA/PixelPhyx/main/Website/offline.html';\n  try{\n    const response=await fetch(latestUrl+'?t='+Date.now(),{cache:'no-store'});\n    if(!response.ok)return;\n    const latestHtml=await response.text();\n    const latestBuild=latestHtml.match(/<meta\\s+name=["']pixelphyx-offline-build["']\\s+content=["']([^"']+)["']/i)?.[1];\n    const currentBuild=document.querySelector('meta[name="pixelphyx-offline-build"]')?.content;\n    if(latestBuild&&currentBuild&&latestBuild!==currentBuild){document.open();document.write(latestHtml);document.close()}\n  }catch(error){console.info('PixelPhyx is running from the available offline copy.',error)}\n})();\n</script>`;
let builtHtml = offlineHtml.replace(scriptTag, '<script>\n' + gameScript + '\n</script>');
builtHtml = builtHtml.replace(/<meta\s+name=["']pixelphyx-offline-build["'][^>]*>\s*/i, '');
builtHtml = builtHtml.replace(/<script\s+id=["']pixelphyx-offline-updater["'][^>]*>[\s\S]*?<\/script>\s*/i, '');
builtHtml = builtHtml.replace(/<head\b[^>]*>/i, match => `${match}\n<meta name="pixelphyx-offline-build" content="${buildId}">`);
if (!/<head\b/i.test(builtHtml)) throw new Error('Offline document head not found.');
builtHtml = builtHtml.replace(/<\/body>/i, `${updater}\n</body>`);
if (builtHtml === offlineHtml) throw new Error('Could not update offline.html.');
await writeFile(websiteDir + 'offline.html', builtHtml, 'utf8');
console.log(`Built offline.html (${buildId}) with the unified physics engine and open-time updater.`);
