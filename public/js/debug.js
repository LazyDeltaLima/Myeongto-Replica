// Debug page (local NAS patch, docs/LOCAL-PATCH.md): /debug.html — per operator, the extracted official battle effects
// (render/fxplayer.js on a patch of board tiles under the game's battle camera), the unit / skill sounds of
// data/assets.json and the voice lines. ?op=<charId>&fx=<bundle>/<prefab> opens one directly; &auto=<s> steps an
// effect to that time and holds it (screenshots in tests).

import * as THREE from '../vendor/three.module.js';
import { fitCamera, syncThreeCamera } from './render/projection.js';
import { FxLibrary, FxInstance, fxStats } from './render/fxplayer.js';
import { fxBundleOf, effectGroups } from './render/fxmap.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const params = new URLSearchParams(location.search);

// ---- scene ------------------------------------------------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x16201d);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const ORIGIN = { row: 10, col: 5 }, TARGET = { row: 10, col: 7 };
for (let r = 7; r <= 13; r++) {
  for (let c = 1; c <= 9; c++) {
    const high = r === 12, h = high ? 0.32 : 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, 0.06 + h), new THREE.MeshBasicMaterial({ color: high ? 0x3b4a45 : (r + c) % 2 ? 0x2a3632 : 0x26312d }));
    m.position.set(c, r, (h - 0.06) / 2);
    scene.add(m);
  }
}
const marker = (row, col, color) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), new THREE.MeshBasicMaterial({ color }));
  m.rotation.x = Math.PI / 2;
  m.position.set(col, row, 0.45);
  scene.add(m);
};
marker(ORIGIN.row, ORIGIN.col, 0x5f7d73);
marker(TARGET.row, TARGET.col, 0x7d5f5f);
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  syncThreeCamera(fitCamera({ r0: 8, r1: 12, c0: 1, c1: 9 }, { width: w, height: h }, { tilt: 30, dist: 13, margin: 0.3, headroom: 1.4 }), camera, w, h);
}
window.addEventListener('resize', resize);
resize();

// ---- audio ------------------------------------------------------------------------------------------------------
let actx = null;
const bufs = new Map();
async function playSound(url, label) {
  if (!url) return;
  actx ||= new AudioContext();
  if (actx.state === 'suspended') await actx.resume();
  if (!bufs.has(url)) bufs.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b)).catch(() => null));
  const buf = await bufs.get(url);
  if (!buf) { $('now').textContent = `소리를 못 불러옴: ${url}`; return; }
  const s = actx.createBufferSource();
  s.buffer = buf;
  s.connect(actx.destination);
  s.start();
  $('now').textContent = `♪ ${label || ''} ${url.split('/').slice(-2).join('/')}`;
}

// ---- effects ----------------------------------------------------------------------------------------------------
const lib = new FxLibrary('/assets/local/fx/');
let fx = null, fxKey = null, fxAt = 'origin', seq = 0, simT = 0;
async function playFx(key, at = 'origin') {
  const s = ++seq;   // a later click wins; a slow load that finishes after it is dropped
  fxKey = key; fxAt = at; simT = 0;
  if (fx) { fx.dispose(); fx = null; }
  const [bundle, prefab] = key.split('/');
  const def = await lib.load(bundle, prefab);
  if (s !== seq) return;
  if (!def) { $('now').textContent = `이펙트 없음: ${key}`; return; }
  fx = new FxInstance(def, { quality: $('quality').value, facing: $('flip').checked ? -1 : 1 });
  const p = at === 'target' ? TARGET : ORIGIN;
  fx.object.position.set(p.col, p.row, 0);
  scene.add(fx.object);
  for (const b of document.querySelectorAll('button.it[data-fx]')) b.classList.toggle('on', b.dataset.fx === key);
  $('now').textContent = `✦ ${key}`;
  history.replaceState(null, '', `?op=${encodeURIComponent(current?.charId || '')}&fx=${encodeURIComponent(key)}`);
}
$('replay').onclick = () => fxKey && playFx(fxKey, fxAt);
$('quality').onchange = $('replay').onclick;
$('flip').onchange = $('replay').onclick;

const auto = Number(params.get('auto'));
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * Number($('speed').value);
  last = now;
  if (fx) {
    if (auto > 0) { while (simT < auto) { fx.update(1 / 60); simT += 1 / 60; } } else {
      fx.update(dt);
      if (fx.done) { const k = fxKey; fx.dispose(); fx = null; if ($('loop').checked && k) playFx(k, fxAt); }
    }
  }
  renderer.render(scene, camera);
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  const st = fxStats();
  $('stats').textContent = `${fps} fps · particles ${st.particles} · draw ${renderer.info.render.calls} · t ${fx ? fx.time.toFixed(2) : '-'}s`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- data -------------------------------------------------------------------------------------------------------
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [manifest, chess, diy, fxIndex, koData] = await Promise.all([
  getJson('/data/assets.json'), getJson('/data/chess.json'), getJson('/data/diy.json'), getJson('/assets/local/fx/index.json'), getJson('/i18n/ko/data.json')]);
const ko = (s) => (koData && koData[s]) || s;
const allChess = { ...(chess || {}), ...(diy?.chess || {}) };
const ops = new Map();   // charId → { charId, name, diy, chessIds: [], skills }
for (const c of Object.values(allChess)) {
  if (!c?.charId || c.isGolden) continue;
  const o = ops.get(c.charId) || { charId: c.charId, name: c.name, diy: !!c.diyPick, chess: c, tier: c.tier };
  ops.set(c.charId, o);
}
const list = [...ops.values()].sort((a, b) => (b.diy - a.diy) || (b.tier - a.tier) || String(a.name).localeCompare(String(b.name), 'zh'));
const avatar = (id) => manifest?.chars?.[id]?.avatar || '';
let current = null;

function renderOps() {
  const q = $('q').value.trim().toLowerCase();
  const box = $('ops');
  box.replaceChildren();
  let lastGroup = null;
  for (const o of list) {
    const hay = `${o.name} ${ko(o.name)} ${o.charId}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const group = o.diy ? '선발 오퍼레이터' : `${o.tier}단계`;
    if (group !== lastGroup) { box.append(el('h2', {}, group)); lastGroup = group; }
    const hasFx = !!fxIndex?.bundles?.[fxBundleOf(o.charId)];
    box.append(el('button', { class: 'op' + (current === o ? ' on' : ''), onclick: () => select(o) },
      el('img', { src: avatar(o.charId), alt: '' }), `${ko(o.name)}${hasFx ? ' ✦' : ''}`));
  }
}
$('q').oninput = renderOps;

function select(o) {
  current = o;
  renderOps();
  const d = $('detail');
  d.replaceChildren();
  const u = manifest?.audio?.sfx?.units?.[o.charId] || {};
  const voiceLang = $('voice').value;
  const v = manifest?.audio?.voice?.[voiceLang]?.[o.charId] || {};
  const bundle = fxBundleOf(o.charId);
  const prefabs = fxIndex?.bundles?.[bundle] || [];
  const groups = effectGroups(prefabs);
  const skills = o.chess.skills || [];
  d.append(el('h2', {}, `${ko(o.name)} · ${o.charId}`));
  // skill buttons: start effect + skill sound + voice line together
  d.append(el('h2', {}, '스킬 (이펙트 + 소리 + 대사)'));
  const row = el('div', { class: 'row' });
  for (const s of skills) {
    const n = s.index + 1;
    row.append(el('button', { class: 'chip skill', onclick: () => {
      const start = groups[`skill${n}`]?.find((p) => /start/.test(p)) || groups[`skill${n}`]?.[0];
      if (start) playFx(`${bundle}/${start}`);
      playSound(u.skills?.[s.index] || (s.index === (o.chess.skill?.index) ? u.skill : null), `S${n}`);
      const lines = v.skill || [];
      if (lines.length) playSound(lines[Math.floor(Math.random() * lines.length)], '대사');
    } }, `S${n} ${ko(s.name)}`));
  }
  d.append(row);
  // sounds
  d.append(el('h2', {}, '소리'));
  const snd = el('div', { class: 'row' });
  for (const [k, label] of [['attack', '공격'], ['hit', '타격'], ['skill', '스킬(기본)'], ['die', '퇴각'], ['born', '배치']]) {
    if (typeof u[k] === 'string') snd.append(el('button', { class: 'chip', onclick: () => playSound(u[k], label) }, label));
  }
  for (const [i, url] of Object.entries(u.skills || {})) snd.append(el('button', { class: 'chip', onclick: () => playSound(url, `S${+i + 1}`) }, `S${+i + 1} 소리`));
  if (!snd.childNodes.length) snd.append(el('span', { class: 'muted' }, '소리 없음'));
  d.append(snd);
  d.append(el('h2', {}, `대사 (${voiceLang === 'kr' ? '한국어' : '일본어'})`));
  const vo = el('div', { class: 'row' });
  for (const [role, label] of [['start', '작전 개시'], ['select', '선택'], ['deploy', '배치'], ['skill', '작전 중']]) {
    (v[role] || []).forEach((url, i) => vo.append(el('button', { class: 'chip', onclick: () => playSound(url, `${label} ${i + 1}`) }, `${label} ${i + 1}`)));
  }
  if (!vo.childNodes.length) vo.append(el('span', { class: 'muted' }, '대사 없음'));
  d.append(vo);
  // effects
  d.append(el('h2', {}, `이펙트 (${prefabs.length})`));
  if (!prefabs.length) d.append(el('p', { class: 'muted' }, '추출된 이펙트 없음 (tools/local-extract/fx_extract.py --bundle ' + bundle + ')'));
  for (const [g, names] of Object.entries(groups)) {
    if (!names.length) continue;
    d.append(el('div', { class: 'muted' }, { attack: '일반 공격', skill1: '스킬 1', skill2: '스킬 2', skill3: '스킬 3', birth: '배치', other: '기타' }[g] || g));
    for (const p of names) {
      const at = /hit/.test(p) ? 'target' : 'origin';
      d.append(el('button', { class: 'it', 'data-fx': `${bundle}/${p}`, onclick: () => playFx(`${bundle}/${p}`, at) }, p, el('span', { class: 'k' }, at === 'target' ? '대상' : '')));
    }
  }
}
$('voice').onchange = () => current && select(current);

renderOps();
const pre = params.get('op') && ops.get(params.get('op'));
if (pre) select(pre); else if (list[0]) select(list[0]);
if (params.get('fx')) playFx(params.get('fx'), /hit/.test(params.get('fx')) ? 'target' : 'origin');
window.__debug = { playFx, playSound, get fx() { return fx; } };
