// Build step: copy every 3D page into app/pages/<category>/, rewrite its
// importmap to the vendored three build, and emit catalog.json for the shell.
//
// The pages share exactly one piece of code: the Three.js runtime, which used to
// be fetched from unpkg in all of them. It is now vendored once under /vendor.
// Everything else in a page is genuinely page-specific, so it is copied verbatim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '..');
const sourceRoot = path.join(repoRoot, 'pages');
const pagesRoot = path.join(appRoot, 'pages');
const vendorRoot = path.join(appRoot, 'vendor');

// file (repo root) -> catalog metadata
const CATALOG = {
  '人体解剖': [
    { file: '心脏3D解剖.html', slug: 'heart', title: '人体心脏', sub: '四个腔室 · 四组瓣膜 · 传导系统',
      tags: ['循环', '心肌', '瓣膜', '心动周期', '心房', '心室'], accent: '#e2454f' },
    { file: '人眼3D解剖.html', slug: 'eye', title: '人眼', sub: '角膜 · 虹膜 · 晶状体 · 视网膜',
      tags: ['视觉', '瞳孔', '晶状体', '视网膜', '光路', '睫状肌'], accent: '#4f8ef7' },
    { file: '人耳3D解剖.html', slug: 'ear', title: '人耳', sub: '声波 · 听小骨 · 耳蜗 · 听神经',
      tags: ['听觉', '鼓膜', '耳蜗', '听神经', '基底膜'], accent: '#35c7c7' },
    { file: '膝关节3D解剖.html', slug: 'knee', title: '膝关节', sub: '骨与软骨 · 半月板 · 韧带',
      tags: ['关节', '韧带', '半月板', '屈伸', '髌骨'], accent: '#7fd6e8' }
  ],
  '机械与工程': [
    { file: '弹子锁3D解剖.html', slug: 'lock', title: '弹子锁', sub: '五颗弹子 · 剪切线 · 错钥匙',
      tags: ['机械', '弹子', '锁芯', '剪切线', '钥匙'], accent: '#e0a45a' },
    { file: '四冲程发动机3D.html', slug: 'engine', title: '四冲程发动机', sub: '吸气 · 压缩 · 做功 · 排气',
      tags: ['内燃机', '活塞', '气门', '凸轮轴', '曲轴'], accent: '#ff8a3d' },
    { file: '单反相机3D解剖.html', slug: 'camera', title: '单反相机', sub: '光路 · 光圈 · 快门 · 传感器',
      tags: ['光学', '反光镜', '光圈', '快门', '五棱镜'], accent: '#9fb4c9' },
    { file: '机械硬盘3D解剖.html', slug: 'hdd', title: '机械硬盘', sub: '盘片 · 磁头 · 音圈电机',
      tags: ['存储', '磁盘', '磁道', '磁头', '寻道'], accent: '#69d6f0' },
    { file: '锁式线迹缝纫机3D.html', slug: 'sewing', title: '锁式线迹缝纫机', sub: '机针 · 旋梭 · 送布',
      tags: ['缝纫', '线迹', '旋梭', '送布牙', '挑线杆'], accent: '#d8b26a' }
  ],
  '自然与生活': [
    { file: '叶片光合作用3D.html', slug: 'leaf', title: '叶片光合作用', sub: '栅栏组织 · 叶绿体 · 气孔',
      tags: ['植物', '光合作用', '叶绿体', '气孔', '叶脉'], accent: '#8fd06a' },
    { file: '意式咖啡机3D.html', slug: 'espresso', title: '意式咖啡机', sub: '泵 · 锅炉 · 冲煮头 · 粉饼',
      tags: ['咖啡', '萃取', '锅炉', '压力', '粉饼'], accent: '#d99a5b' }
  ]
};

const CAT_ID = { '人体解剖': 'anatomy', '机械与工程': 'machine', '自然与生活': 'life' };

fs.rmSync(pagesRoot, { recursive: true, force: true });
fs.mkdirSync(pagesRoot, { recursive: true });

const rewrite = html => html
  .replaceAll('https://unpkg.com/three@0.160.0/build/three.module.js', '/vendor/three.module.js')
  .replaceAll('https://unpkg.com/three@0.160.0/examples/jsm/', '/vendor/addons/')
  // the offline error copy no longer makes sense now that three is bundled
  .replaceAll('请检查网络后刷新页面（需要访问 unpkg.com）', '本地运行库加载失败，请刷新页面重试');

const categories = [];
const missing = [];
const addonEntries = new Set();

for (const [catName, items] of Object.entries(CATALOG)) {
  const out = [];
  for (const item of items) {
    const src = path.join(sourceRoot, item.file);
    if (!fs.existsSync(src)) { missing.push(item.file); continue; }
    const html = fs.readFileSync(src, 'utf8');
    const docTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || item.title;
    for (const m of html.matchAll(/three\/addons\/([\w./-]+\.js)/g)) addonEntries.add(m[1]);
    const dir = path.join(pagesRoot, CAT_ID[catName]);
    fs.mkdirSync(dir, { recursive: true });
    const rel = `${CAT_ID[catName]}/${item.slug}.html`;
    fs.writeFileSync(path.join(dir, `${item.slug}.html`), rewrite(html));
    out.push({
      id: item.slug, title: item.title, sub: item.sub, tags: item.tags,
      accent: item.accent, docTitle, file: `/pages/${rel}`, source: `pages/${item.file}`,
      sizeKB: Math.round(Buffer.byteLength(html) / 1024),
    });
  }
  categories.push({ id: CAT_ID[catName], name: catName, items: out });
}

// vendor the shared runtime once: the three core build plus exactly the addons
// the pages import, followed through their own relative imports.
const threeDir = path.join(appRoot, 'node_modules', 'three');
if (!fs.existsSync(threeDir)) {
  console.error('缺少 node_modules/three —— 先运行 npm install');
  process.exit(1);
}
fs.rmSync(vendorRoot, { recursive: true, force: true });
fs.mkdirSync(vendorRoot, { recursive: true });
fs.copyFileSync(path.join(threeDir, 'build', 'three.module.js'), path.join(vendorRoot, 'three.module.js'));

const jsmRoot = path.join(threeDir, 'examples', 'jsm');
const copied = new Set();
const copyAddon = rel => {
  const abs = path.join(jsmRoot, rel);
  if (copied.has(abs)) return;
  if (!fs.existsSync(abs)) { console.warn('  missing addon:', rel); return; }
  copied.add(abs);
  const code = fs.readFileSync(abs, 'utf8');
  const dest = path.join(vendorRoot, 'addons', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, code);
  // follow relative imports only; bare "three" is resolved by the importmap
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    copyAddon(path.normalize(path.join(path.dirname(rel), m[1])));
  }
};
for (const entry of addonEntries) copyAddon(entry);

const total = categories.reduce((n, c) => n + c.items.length, 0);
fs.writeFileSync(
  path.join(appRoot, 'catalog.json'),
  JSON.stringify({
    app: '3D交互模型库', three: '0.160.0', builtAt: new Date().toISOString(),
    count: total, categories,
  }, null, 2)
);

console.log(`catalog: ${total} pages in ${categories.length} categories`);
for (const c of categories) console.log(`  ${c.name}: ${c.items.map(i => i.title).join(' / ')}`);
if (missing.length) console.log('MISSING:', missing.join(', '));

// no page may still point at the CDN
const leftovers = categories.flatMap(c => c.items)
  .filter(i => fs.readFileSync(path.join(appRoot, i.file.replace(/^\//, '')), 'utf8').includes('https://unpkg.com'));
if (leftovers.length) {
  console.error('IMPORTMAP REWRITE FAILED:', leftovers.map(i => i.id).join(', '));
  process.exit(1);
}
console.log('vendor: three.module.js + addons copied, no CDN references left');
