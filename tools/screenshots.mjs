// Capture one preview screenshot per 3D page into screenshots/<slug>.jpg.
//
//   node tools/screenshots.mjs                 # all pages
//   node tools/screenshots.mjs heart eye       # a subset
//
// The pages are ES modules with an importmap, so they are served over http
// (a throwaway loopback server) and rendered in real Chromium. GPU flags are
// required: SwiftShader renders these scenes at ~5 fps, which makes the intro
// tweens miss their end state in a still.
//
// puppeteer-core is resolved from the project first, then from $PUPPETEER_CORE,
// then from this machine's WorkBuddy workspace. Browser: $CHROME_PATH, else the
// usual Edge / Chrome install locations.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import module from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'screenshots');

const PAGES = [
  { slug: 'heart', file: 'pages/心脏3D解剖.html' },
  { slug: 'eye', file: 'pages/人眼3D解剖.html' },
  { slug: 'ear', file: 'pages/人耳3D解剖.html' },
  { slug: 'knee', file: 'pages/膝关节3D解剖.html' },
  { slug: 'lock', file: 'pages/弹子锁3D解剖.html' },
  { slug: 'engine', file: 'pages/四冲程发动机3D.html' },
  { slug: 'camera', file: 'pages/单反相机3D解剖.html' },
  { slug: 'hdd', file: 'pages/机械硬盘3D解剖.html' },
  { slug: 'sewing', file: 'pages/锁式线迹缝纫机3D.html' },
  { slug: 'leaf', file: 'pages/叶片光合作用3D.html' },
  { slug: 'espresso', file: 'pages/意式咖啡机3D.html' },
];

function loadPuppeteer() {
  const candidates = [
    process.env.PUPPETEER_CORE,
    'puppeteer-core',
    'C:/Users/xiongwei/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const req = module.createRequire(path.join(root, 'package.json'));
      return req(candidate);
    } catch { /* try next */ }
  }
  throw new Error('找不到 puppeteer-core：npm i puppeteer-core，或设置 PUPPETEER_CORE=/path/to/puppeteer-core');
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0].replace(/^\//, '')) || 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const puppeteer = loadPuppeteer();
const executablePath = CHROME_CANDIDATES.find(p => fs.existsSync(p));
if (!executablePath) throw new Error('找不到浏览器：设置 CHROME_PATH 指向 Chrome/Edge 可执行文件');

const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
const pages = wanted.length ? PAGES.filter(p => wanted.includes(p.slug)) : PAGES;
if (!pages.length) {
  console.error('没有匹配的页面，可选：', PAGES.map(p => p.slug).join(', '));
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const server = await serve(root);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: [
    '--enable-gpu',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

let failed = 0;
for (const { slug, file } of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    await page.goto(base + file.split('/').map(encodeURIComponent).join('/'), { waitUntil: 'networkidle2', timeout: 90000 });

    // Every page hides its loader once the scene is assembled.
    await page.waitForFunction(() => {
      const l = document.querySelector('#loading, #loader');
      if (!l) return true;
      return l.classList.contains('hide') || !l.offsetParent
        || Number(getComputedStyle(l).opacity) < 0.05;
    }, { timeout: 90000, polling: 200 });

    const failedLoad = await page.evaluate(() => {
      const err = document.getElementById('err');
      return !!err && getComputedStyle(err).display !== 'none';
    });
    if (failedLoad) throw new Error('页面显示「无法加载三维渲染库」');

    // Let the intro tweens settle and the first animation cycle reach a full frame.
    await sleep(3200);

    const out = path.join(outDir, `${slug}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`✓ ${slug.padEnd(9)} ${file} → screenshots/${slug}.jpg (${kb} KB)`);
    if (errors.length) console.log(`  console: ${errors.slice(0, 3).join(' | ')}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${slug}: ${e.message}`);
    const logs = errors.filter(Boolean).slice(0, 5);
    if (logs.length) console.error('  ' + logs.join('\n  '));
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
if (failed) {
  console.error(`\n${failed}/${pages.length} 个页面截图失败`);
  process.exit(1);
}
console.log(`\n完成：${pages.length} 张截图 → screenshots/`);
