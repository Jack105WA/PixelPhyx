'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPOSITORY = 'Jack105WA/PixelPhyx';
const BRANCH = 'local-server';
const USER_AGENT = 'PixelPhyx-Local-Server';

async function request(url) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Download failed (' + response.status + '): ' + url);
  return response;
}


function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error ? result.error.message : (result.stderr || result.stdout || command + ' failed with exit code ' + result.status).trim());
  }
  return result;
}

async function ensureWasmPack() {
  const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo');
  const cargoBin = path.join(cargoHome, 'bin');
  const executable = name => path.join(cargoBin, process.platform === 'win32' ? name + '.exe' : name);
  const rustup = executable('rustup');
  const cargo = executable('cargo');

  if (!fs.existsSync(cargo) || !fs.existsSync(rustup)) {
    const platform = process.platform;
    const arch = process.arch;
    const target = platform === 'win32'
      ? (arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc')
      : platform === 'darwin'
        ? (arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin')
        : (arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu');
    if (!['win32','darwin','linux'].includes(platform) || !['x64','arm64'].includes(arch)) {
      throw new Error('Automatic Rust setup is not supported on ' + platform + '/' + arch + '. Install Rust using https://rustup.rs/.');
    }

    const installer = path.join(os.tmpdir(), 'pixelphyx-rustup-init' + (platform === 'win32' ? '.exe' : ''));
    const response = await request('https://static.rust-lang.org/rustup/dist/' + target + '/rustup-init' + (platform === 'win32' ? '.exe' : ''));
    fs.writeFileSync(installer, Buffer.from(await response.arrayBuffer()));
    try {
      run(installer, ['-y','--profile','minimal','--default-toolchain','stable','--target','wasm32-unknown-unknown']);
    } finally {
      try { fs.rmSync(installer,{force:true}); } catch {}
    }
  } else {
    run(rustup, ['target','add','wasm32-unknown-unknown']);
  }

  const env = { ...process.env, PATH: cargoBin + path.delimiter + (process.env.PATH || '') };
  if (!fs.existsSync(executable('wasm-pack'))) {
    console.log('Installing wasm-pack (this can take several minutes on first startup)...');
    run(cargo, ['install','wasm-pack','--locked'], { env });
  }
  return { wasmPack: executable('wasm-pack'), env };
}

async function downloadWebsite(destination) {
  const treeResponse = await request('https://api.github.com/repos/' + REPOSITORY + '/git/trees/' + BRANCH + '?recursive=1');
  const tree = await treeResponse.json();
  if (tree.truncated) throw new Error('GitHub returned an incomplete website file list.');

  const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path.startsWith('Website/'));
  if (!files.some(item => item.path === 'Website/index.html')) throw new Error('The repository does not contain Website/index.html.');

  const websiteVersion = crypto.createHash('sha256').update(files.map(item => item.path + ':' + item.sha).sort().join('\n')).digest('hex');
  const marker = path.join(destination, '.pixelphyx-website-tree');
  try {
    if (fs.readFileSync(marker, 'utf8').trim() === websiteVersion &&
        fs.existsSync(path.join(destination, 'index.html')) &&
        fs.existsSync(path.join(destination, 'pkg', 'pixelphyx_wasm.js')) &&
        fs.existsSync(path.join(destination, 'pkg', 'pixelphyx_wasm_bg.wasm'))) return;
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
    console.log('Preparing the Rust WebAssembly build tools (one-time setup)...');
    const tools = await ensureWasmPack();
    run(tools.wasmPack, ['build', 'Website/wasm', '--target', 'web', '--release', '--out-dir', '../pkg'], {
      cwd: path.resolve(destination, '..', '..'),
      env: tools.env
    });
    if (!fs.existsSync(wasmJs) || !fs.existsSync(wasmBinary)) {
      throw new Error('The WebAssembly build completed without producing the required files in ' + path.join(destination, 'pkg') + '.');
    }
  }

  fs.writeFileSync(marker, websiteVersion + '\n');
  console.log('Downloaded ' + files.length + ' PixelPhyx website files into ' + destination + '.');
}

module.exports = { downloadWebsite };
