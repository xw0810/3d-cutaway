// Package the synced app with @electron/packager, one folder per platform/arch.
//
//   node scripts/package.mjs                     # host platform (win32-x64 here)
//   node scripts/package.mjs --all               # every target in TARGETS
//   node scripts/package.mjs --platform darwin --arch arm64
//   node scripts/package.mjs --all --out /tmp/dist   # custom output root
//
// Output: <repo>/dist/3D交互模型库-<platform>-<arch>/
// Cross-packaging works from any host; the macOS .app and Linux folder are not
// code-signed (do that on the target OS if you plan to distribute them).
// Windows cannot create the symlinks inside a macOS .app, so darwin targets
// need a Linux/macOS host (WSL is fine) — see the README.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as packagerModule from '@electron/packager';

const packager = packagerModule.packager || packagerModule.default;
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

const TARGETS = [
  { platform: 'win32', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
];

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return null;
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};

const outRoot = opt('out')
  ? path.resolve(process.cwd(), opt('out'))
  : path.resolve(appRoot, '..', 'dist');

if (!fs.existsSync(path.join(appRoot, 'catalog.json'))) {
  console.error('先运行 npm run sync');
  process.exit(1);
}

const all = argv.includes('--all');
const onlyPlatform = opt('platform');
const onlyArch = opt('arch');

const targets = all
  ? TARGETS
  : [{
      platform: onlyPlatform || process.platform,
      arch: onlyArch || process.arch,
    }];

console.log('targets:', targets.map(t => `${t.platform}-${t.arch}`).join(', '));

const built = [];
const failed = [];

for (const { platform, arch } of targets) {
  console.log(`\n==> ${platform}-${arch}`);
  try {
    const paths = await packager({
      dir: appRoot,
      out: outRoot,
      name: '3D交互模型库',
      executableName: '3D交互模型库',
      platform,
      arch,
      overwrite: true,
      asar: true,
      prune: true,
      ignore: [
        /^\/node_modules($|\/)/,
        /^\/scripts($|\/)/,
        /^\/smoke\.png$/,
        /^\/package-lock\.json$/,
      ],
      ...(platform === 'win32'
        ? {
            win32metadata: {
              CompanyName: 'Body Secrets',
              ProductName: '3D交互模型库',
              FileDescription: '3D 交互模型库',
              InternalName: 'body-secrets',
            },
          }
        : {}),
    });

    for (const p of paths) {
      console.log('packaged:', p);
      built.push(p);
      const exe = platform === 'win32' ? path.join(p, '3D交互模型库.exe') : null;
      if (exe && fs.existsSync(exe)) {
        console.log('  exe:', exe, `${(fs.statSync(exe).size / 1048576).toFixed(1)} MB`);
      }
      if (platform === 'darwin') {
        const app = path.join(p, '3D交互模型库.app');
        if (fs.existsSync(app)) console.log('  app:', app);
      }
      if (platform === 'linux') {
        const bin = path.join(p, '3D交互模型库');
        if (fs.existsSync(bin)) console.log('  bin:', bin);
      }
    }
  } catch (e) {
    failed.push(`${platform}-${arch}`);
    console.error(`FAILED ${platform}-${arch}: ${e.message}`);
  }
}

console.log(`\nbuilt ${built.length}/${targets.length} target(s)`);
if (failed.length) {
  console.error('failed:', failed.join(', '));
  process.exit(1);
}
