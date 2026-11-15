import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(path, 'utf8');

const [offlineHtml, mainSource, physicsSource] = await Promise.all([
  read('offline.html'),
  read('js/main.js'),
  read('js/material-physics.js')
]);

const physics = physicsSource.replace(/\bexport\s+(?=(?:const|function)\b)/g, '');
if (/\bexport\s/.test(physics)) {
  throw new Error('Unsupported export syntax in js/material-physics.js');
}

const mainStart = mainSource.replace(
  /^\/\/ Reuse the cache-busting version[\s\S]*?\n\]\);\s*/,
  ''
);
if (mainStart === mainSource) {
  throw new Error('Could not remove the module imports from js/main.js');
}

const offlineMain = mainStart.replace(
  "const {createMultiplayer}=await import('./multiplayer.js?v='+encodeURIComponent(cacheVersion));",
  'const {createMultiplayer}=window.__pixelphyxOfflineMultiplayer;'
);
if (offlineMain === mainStart) {
  throw new Error('Could not replace the multiplayer import in js/main.js');
}

const gameScript = [
  '/* Generated from js/main.js and js/material-physics.js. Do not edit this block manually. */',
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

const firstScript = /<script>[\s\S]*?<\/script>/;
if (!firstScript.test(offlineHtml)) {
  throw new Error('Could not find the embedded game script in offline.html');
}

const updatedHtml = offlineHtml.replace(
  firstScript,
  '<script>\n' + gameScript + '\n</script>'
);

await writeFile('offline.html', updatedHtml, 'utf8');
console.log('Built offline.html from the current game and physics sources.');
