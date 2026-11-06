// Catalog shell: renders the manifest, filters locally, and mounts the selected
// page in the iframe. Nothing here touches the pages themselves.

const $ = s => document.querySelector(s);
const app = $('#app');
const listEl = $('#list');
const qEl = $('#q');
const view = $('#view');
const emptyEl = $('#empty');
const loadingEl = $('#loading');
const titleEl = $('#title');
const catEl = $('#cat');

const STORE = { last: 'i3d.last', collapsed: 'i3d.collapsed', cats: 'i3d.closed-cats' };

let catalog = null;
let flat = [];          // every item, in display order
let visible = [];       // filtered items
let cursor = -1;
let activeId = null;
let closedCats = new Set(JSON.parse(localStorage.getItem(STORE.cats) || '[]'));

const norm = s => (s || '').toLowerCase().replace(/\s+/g, '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

function matches(item, q, catName = '') {
  if (!q) return true;
  const n = norm(q);
  return norm([item.title, item.sub, item.docTitle, catName, ...item.tags].join(' ')).includes(n);
}

function render() {
  const q = qEl.value.trim();
  listEl.innerHTML = '';
  visible = [];
  cursor = -1;

  for (const cat of catalog.categories) {
    const items = cat.items.filter(it => matches(it, q, cat.name));
    if (!items.length) continue;
    visible.push(...items);

    const sec = document.createElement('section');
    sec.className = 'cat' + (closedCats.has(cat.id) ? ' closed' : '');
    sec.dataset.cat = cat.id;

    const head = document.createElement('button');
    head.className = 'cat-head';
    head.type = 'button';
    head.innerHTML = `<span>${esc(cat.name)}</span><span class="n">${items.length}</span><span class="chev">▾</span>`;
    head.onclick = () => {
      if (closedCats.has(cat.id)) closedCats.delete(cat.id); else closedCats.add(cat.id);
      localStorage.setItem(STORE.cats, JSON.stringify([...closedCats]));
      sec.classList.toggle('closed');
    };
    sec.appendChild(head);

    const box = document.createElement('div');
    box.className = 'cat-items';
    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item' + (it.id === activeId ? ' active' : '');
      btn.dataset.id = it.id;
      btn.style.setProperty('--dot', it.accent);
      btn.innerHTML = `<span class="t">${highlight(it.title, q)}</span>
        <span class="s">${highlight(it.sub, q)}</span>
        <span class="tags">${it.tags.slice(0, 4).map(t => `<span class="tag">${highlight(t, q)}</span>`).join('')}</span>`;
      btn.onclick = () => select(it);
      box.appendChild(btn);
    }
    sec.appendChild(box);
    listEl.appendChild(sec);
  }

  if (!visible.length) {
    listEl.innerHTML = `<div class="empty-result">没有匹配「${esc(q)}」的模型<br/>试试「瓣膜」「光圈」「耳蜗」</div>`;
  }
  $('#count').textContent = `${visible.length} / ${flat.length} 个模型`;
}

function setActive(id) {
  activeId = id;
  document.querySelectorAll('.item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
}

function select(item, { remember = true } = {}) {
  if (!item) return;
  setActive(item.id);
  titleEl.textContent = item.title;
  catEl.textContent = catalog.categories.find(c => c.items.some(i => i.id === item.id))?.name || '';
  if (remember) localStorage.setItem(STORE.last, item.id);
  emptyEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  view.classList.remove('off');
  view.src = item.file;
  clearTimeout(select.timer);
  // a page that fails to boot (WebGL unavailable) must not leave the veil up forever
  select.timer = setTimeout(() => loadingEl.classList.add('hidden'), 15000);
  if (window.innerWidth < 1100) collapse(true);
}

view.addEventListener('load', () => {
  if (!view.src) return;
  clearTimeout(select.timer);
  setTimeout(() => loadingEl.classList.add('hidden'), 300);
});

function collapse(on) {
  app.classList.toggle('collapsed', on);
  localStorage.setItem(STORE.collapsed, on ? '1' : '0');
}

function moveCursor(delta) {
  if (!visible.length) return;
  cursor = (cursor + delta + visible.length) % visible.length;
  document.querySelectorAll('.item').forEach(el => el.classList.remove('cursor'));
  const el = document.querySelector(`.item[data-id="${visible[cursor].id}"]`);
  if (el) { el.classList.add('cursor'); el.scrollIntoView({ block: 'nearest' }); }
}

// ── events ────────────────────────────────────────────────────────────────
qEl.addEventListener('input', render);
qEl.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); if (visible[Math.max(0, cursor)]) select(visible[Math.max(0, cursor)]); }
  else if (e.key === 'Escape') { qEl.value = ''; render(); qEl.blur(); }
});

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qEl.focus(); qEl.select(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); collapse(!app.classList.contains('collapsed')); return; }
  if (typing) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); qEl.focus(); moveCursor(1); }
  if (e.key === 'ArrowUp') { e.preventDefault(); qEl.focus(); moveCursor(-1); }
});

$('#collapse').onclick = () => collapse(true);
$('#expand').onclick = () => collapse(false);
$('#reload').onclick = () => {
  if (!view.src) return;
  loadingEl.classList.remove('hidden');
  try { view.contentWindow.location.reload(); } catch { view.src = view.src; }
};
$('#full').onclick = () => {
  const el = $('#frame-wrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.().catch(() => {});
};

// ── boot ──────────────────────────────────────────────────────────────────
(async function boot() {
  catalog = await (await fetch('/catalog.json')).json();
  flat = catalog.categories.flatMap(c => c.items);
  const hero = $('#hero-title');
  if (hero) hero.textContent = `${flat.length} 个可交互的 3D 剖切模型`;
  if (localStorage.getItem(STORE.collapsed) === '1') app.classList.add('collapsed');
  render();

  const last = localStorage.getItem(STORE.last);
  const keep = flat.find(i => i.id === last);
  if (keep) select(keep, { remember: false });
  else { emptyEl.classList.remove('hidden'); view.classList.add('off'); }
})();
