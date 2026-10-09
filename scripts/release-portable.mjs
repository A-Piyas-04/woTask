// Build locally and package only the finished executable. Never fetch build dependencies.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
  if (process.platform !== 'win32') throw new Error('Build the portable Windows release on Windows.');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const cargo = readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  const rustVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || pkg.version !== config.version || pkg.version !== rustVersion) {
    throw new Error('Release versions must match in package.json, tauri.conf.json and Cargo.toml.');
  }
  if (config.bundle.active !== false) throw new Error('Portable releases require bundle.active: false.');

  // Invoke the installed CLI directly: no npx, npm install or automatic tool downloads.
  run(process.execPath, [join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'build', '--no-bundle', '--target', target]);
  run(process.execPath, [join(root, 'scripts', 'offline-audit.mjs')]);

  const binary = join(root, 'src-tauri', 'target', target, 'release', 'wotask.exe');
  const output = join(root, 'release');
  mkdirSync(output, { recursive: true });
  const staging = mkdtempSync(join(output, '.portable-'));
  try {
    const contents = join(staging, 'contents');
    mkdirSync(contents);
    const exeName = `woTask-${pkg.version}-windows-x64.exe`;
    const zipName = `woTask-${pkg.version}-windows-x64.zip`;
    const zip = join(staging, zipName);
    copyFileSync(binary, join(contents, 'wotask.exe'));
    copyFileSync(binary, join(staging, exeName));

    // Paths travel through the environment, never interpolated into shell code.
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:WOTASK_RELEASE_EXE -DestinationPath $env:WOTASK_RELEASE_ZIP -CompressionLevel Optimal"], {
      WOTASK_RELEASE_EXE: join(contents, 'wotask.exe'),
      WOTASK_RELEASE_ZIP: zip,
    });
    writeFileSync(join(staging, 'SHA256SUMS.txt'),
      `${sha256(join(staging, exeName))}  ${exeName}\n${sha256(zip)}  ${zipName}\n`, 'utf8');
    for (const name of [exeName, zipName, 'SHA256SUMS.txt']) {
      renameSync(join(staging, name), join(output, name));
    }
    console.log(`\nPortable release ready in ${output}\n` +
      `Publish ${exeName}, ${zipName} and SHA256SUMS.txt as GitHub Release assets.\n` +
      'The ZIP contains only wotask.exe. WebView2 must already be installed.');
  } finally {
    // Remove only the unique staging directory created by this invocation.
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Portable release failed: ${error.message}`);
  process.exitCode = 1;
}
