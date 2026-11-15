import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const websiteDir = 'Website/';
const read = path => readFile(websiteDir + path, 'utf8');

const [offlineHtml, mainSource, physicsSource] = await Promise.all([
  read('offline.html'),
  read('js/main.js'),
  read('js/material-physics.js')
]);

const physics = physicsSource.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
if (/\bexport\s/.test(physics)) {
  throw new Error('Unsupported export syntax in Website/js/material-physics.js');
}

const mainStart = mainSource.replace(
  /^\/\/ Reuse the cache-busting version[\s\S]*?\n\]\);\s*/,
  ''
);
if (mainStart === mainSource) {
  throw new Error('Could not remove the module imports from Website/js/main.js');
}

const offlineMain = mainStart.replace(
  "const {createMultiplayer}=await import('./multiplayer.js?v='+encodeURIComponent(cacheVersion));",
  'const {createMultiplayer}=window.__pixelphyxOfflineMultiplayer;'
);
if (offlineMain === mainStart) {
  throw new Error('Could not replace the multiplayer import in Website/js/main.js');
}

const gameScript = [
  '/* Generated from Website/js/main.js and Website/js/material-physics.js. Do not edit this block manually. */',
  'window.__pixelphyxOfflineMultiplayer = {',
  '  createMultiplayer() {',
  "    throw new Error('Multiplayer is unavailable in the offline edition.');",
  '  }',
  '};',
  'const PixelPhyxMaterial = (() => {',
  physics,
  '  return { stepMaterialPhysics, materialState, resetMaterialState };',
  '})();',
  '(() => {',
  '  const firebaseConfig = {};',
  '  const { stepMaterialPhysics, materialState, resetMaterialState } = PixelPhyxMaterial;',
  offlineMain,
  '})();'
].join('\n');

new vm.Script(gameScript, { filename: 'offline-game.js' });

// Match the embedded script regardless of tag-name casing or attributes.
const firstScript = /<script\b[^>]*>[\s\S]*?<\/script\s*>/i;
if (!firstScript.test(offlineHtml)) {
  throw new Error('Could not find the embedded game script in Website/offline.html');
}

const updatedHtml = offlineHtml.replace(
  firstScript,
  '<script>\n' + gameScript + '\n</script>'
);

await writeFile(websiteDir + 'offline.html', updatedHtml, 'utf8');
console.log('Built Website/offline.html from the current website game and physics sources.');
