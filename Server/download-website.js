'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPOSITORY = 'Jack105WA/PixelPhyx';
const BRANCH = 'local-server';
const USER_AGENT = 'PixelPhyx-Local-Server';

async function request(url) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Download failed (' + response.status + '): ' + url);
  return response;
}

async function downloadWebsite(destination) {
  const treeResponse = await request('https://api.github.com/repos/' + REPOSITORY + '/git/trees/' + BRANCH + '?recursive=1');
  const tree = await treeResponse.json();
  if (tree.truncated) throw new Error('GitHub returned an incomplete website file list.');

  const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path.startsWith('Website/'));
  if (!files.some(item => item.path === 'Website/index.html')) throw new Error('The repository does not contain Website/index.html.');

  const marker = path.join(destination, '.pixelphyx-website-tree');
  try {
    if (fs.readFileSync(marker, 'utf8').trim() === tree.sha && fs.existsSync(path.join(destination, 'index.html'))) return;
  } catch {}

  fs.mkdirSync(destination, { recursive: true });
  let next = 0;
  const workers = Array.from({ length: Math.min(4, files.length) }, async () => {
    while (next < files.length) {
      const item = files[next++];
      const relative = item.path.slice('Website/'.length);
      const target = path.resolve(destination, relative);
      if (target !== destination && !target.startsWith(destination + path.sep)) throw new Error('Unsafe website path from repository.');
      const rawUrl = 'https://raw.githubusercontent.com/' + REPOSITORY + '/' + BRANCH + '/' + item.path.split('/').map(encodeURIComponent).join('/');
      const response = await request(rawUrl);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== item.size) throw new Error('Incomplete download for ' + item.path + '.');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = target + '.download';
      fs.writeFileSync(temporary, bytes);
      fs.renameSync(temporary, target);
    }
  });
  await Promise.all(workers);
  const wasmJs = path.join(destination, 'pkg', 'pixelphyx_wasm.js');
  const wasmBinary = path.join(destination, 'pkg', 'pixelphyx_wasm_bg.wasm');
  if (!fs.existsSync(wasmJs) || !fs.existsSync(wasmBinary)) {
    const build = spawnSync('wasm-pack', ['build', 'Website/wasm', '--target', 'web', '--release', '--out-dir', '../pkg'], {
      cwd: path.resolve(destination, '..', '..'), encoding: 'utf8', windowsHide: true
    });
    if (build.error || build.status !== 0 || !fs.existsSync(wasmJs) || !fs.existsSync(wasmBinary)) {
      const detail = build.error ? build.error.message : (build.stderr || build.stdout || 'wasm-pack did not produce the required files.');
      throw new Error('Website sources downloaded, but the compiled WASM engine is missing. Install Rust and wasm-pack, then run: wasm-pack build Website/wasm --target web --release --out-dir ../pkg. ' + detail.trim());
    }
  }

  fs.writeFileSync(marker, tree.sha + '\n');
  console.log('Downloaded ' + files.length + ' PixelPhyx website files into ' + destination + '.');
}

module.exports = { downloadWebsite };
