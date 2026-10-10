// Build locally and package the Windows installer. Never fetch Rust dependencies.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = 'x86_64-pc-windows-msvc';

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, CARGO_NET_OFFLINE: 'true', ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}).`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  if (process.platform !== 'win32') throw new Error('Build the Windows installer on Windows.');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const cargo = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  const rustVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || pkg.version !== config.version || pkg.version !== rustVersion) {
    throw new Error('Release versions must match in package.json, tauri.conf.json and Cargo.toml.');
  }
  if (config.bundle.active !== true) throw new Error('The installer release requires bundle.active: true.');
  if (config.bundle.targets?.join(',') !== 'nsis') throw new Error('The installer release requires bundle.targets: ["nsis"].');
  if (config.bundle.windows?.webviewInstallMode?.type !== 'skip') {
    throw new Error('webviewInstallMode must stay "skip": the installer never downloads WebView2.');
  }

  // Remove stale bundles so the hash below can only describe this build.
  const bundleDir = join(root, 'src-tauri', 'target', target, 'release', 'bundle', 'nsis');
  rmSync(bundleDir, { recursive: true, force: true });

  // Invoke the installed CLI directly: no npx and no npm install. Cargo stays offline;
  // the NSIS bundler itself downloads its toolchain once into the Tauri cache, so the
  // first run of this script on a new machine needs network access.
  run(process.execPath, [join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'build', '--target', target]);
  run(process.execPath, [join(root, 'scripts', 'offline-audit.mjs')]);

  const built = readdirSync(bundleDir).filter((name) => name.endsWith('-setup.exe'));
  if (built.length !== 1) throw new Error(`Expected one NSIS installer in ${bundleDir}, found ${built.length}.`);

  const output = join(root, 'release');
  mkdirSync(output, { recursive: true });
  const setupName = `woTask-${pkg.version}-windows-x64-setup.exe`;
  const setup = join(output, setupName);
  copyFileSync(join(bundleDir, built[0]), setup);
  writeFileSync(join(output, 'SHA256SUMS.txt'), `${sha256(setup)}  ${setupName}\n`, 'utf8');

  console.log(`\nInstaller ready in ${output}\n` +
    `Publish ${setupName} and SHA256SUMS.txt as GitHub Release assets.\n` +
    'It installs per user, needs no admin rights, and expects WebView2 to be present.');
}

try {
  main();
} catch (error) {
  console.error(`Installer release failed: ${error.message}`);
  process.exitCode = 1;
}
