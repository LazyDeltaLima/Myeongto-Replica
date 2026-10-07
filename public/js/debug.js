// Debug page (local patch, docs/LOCAL-PATCH.md): /debug.html — a sandbag arena for each operator's skill sounds, impact
// sounds and effects. The game's battle view and audio run on a 7×7 tile island (js/debug/arena.js): the chosen
// operator (normal / elite, skill, module, direction) fights immortal sandbag enemies (js/debug/sandbag.js), simulated
// in the page, so every sound and effect comes through the same event path as in a match. The log lists each battle
// event with the effects (render/fxmap.js) and sounds it maps to, every sound / voice line actually started (or held
// back by the limiter / voice gate) and the data that is missing. The side panel keeps the per-operator sound / voice
// files and every extracted official effect (played on the operator, hits on the sandbag).
// URL: ?op=<charId>&elite=1&skill=<1-based>&module=<uniEquipId|none>&dir=<UP|RIGHT|DOWN|LEFT>&enemy=<key>&terrain=<flat|high>
// &fx=<bundle>/<prefab> (played on the operator once it stands).

import { data } from './data.js';
import { audio, kitHitKey, normalAttackSfx } from './audio.js';
import { loopGain } from './audioOfficial.js';
import { installResources } from './resources.js';
import { voiceStore, setVoiceLang } from './voice.js';
import { fxBundleOf, effectGroups, effectsFor, attackMode, boundEffects } from './render/fxmap.js';
import { loadoutOptions } from '../../shared/protocol.js';
import { diyRecord, diyTokenOwner } from '../../shared/diy.js';
import { localDiyPool } from '../../shared/local-diy.js';
import { createArena } from './debug/arena.js';
import { TERRAINS, SANDBAG_DEFAULT, DEFAULT_OP, SANDBAG_HP, HURT, inArena, defaultBags, ownTokens, autoTokens, rangeOf } from './debug/sandbag.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v === true) e.setAttribute(k, ''); else if (v != null && v !== false) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const params = new URLSearchParams(location.search);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const file = (url) => String(url || '').split('/').slice(-2).join('/');
const DIRS = ['RIGHT', 'DOWN', 'LEFT', 'UP'];
const DIR_LABEL = { RIGHT: '→', DOWN: '↓', LEFT: '←', UP: '↑' };
const VOICE_SLOTS = { start: '행동 출발', faceEnemy: '행동 개시', select: '선택', place: '배치', skill1: '작전 중 1', skill2: '작전 중 2', skill3: '작전 중 3', skill4: '작전 중 4' };

// ---- data ---------------------------------------------------------------------------------------------------------
// the game page's resource worker answers /assets/ from its cache by path: sync that cache with the current list first, as
// the game does on load (public/js/resources.js reconcile) — else a rebuilt fx/index.json or fx/modes.json stays its old copy
try { await Promise.race([installResources(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* the page works without it */ }
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [, fxIndex, koData, koDiy, fxModes] = await Promise.all([data.loadAll('chess', 'enemies', 'tokens', 'assets', 'local', 'stages', 'backups'), getJson('/assets/local/fx/index.json'),
  getJson('/i18n/ko/data.json'), getJson('/i18n/ko/diy.json'), getJson('/assets/local/fx/modes.json')]);
const manifest = data.get('assets');
const ko = (s) => (koData && koData[s]) || (koDiy && koDiy[s]) || s;
const chessOf = (id) => data.lookup('chess', id);
const unitSfx = (id) => manifest?.audio?.sfx?.units?.[id] || {};
const prefabsOf = (spine) => fxIndex?.bundles?.[fxBundleOf(spine)] || [];

const ops = new Map(); // charId → { charId, name, diy, chess, tier }
for (const c of data.list('chess')) {
  if (!c?.charId || c.isGolden || c.isDiy || ops.has(c.charId)) continue;
  ops.set(c.charId, { charId: c.charId, name: c.name, diy: false, chess: c, tier: c.tier });
}
// the 自选 picks (data/backups.json diy.ownedPool): fielded in the tier-VI slot as the match does (shared/diy.js)
const DIY_SLOT = 'chess_char_6_diy1_a';
const backups = data.get('backups');
const diyData = { chess: Object.fromEntries(data.list('chess').map((c) => [c.chessId, c])), backups };
/** The composed record of a 自选 pick (normal / elite) with skill / module — null when the slot or pick is unknown. */
const diyRec = (charId, { elite = false, skillIndex = 0, uniEquipId = null } = {}) => {
  try { return diyRecord(DIY_SLOT, { charId, skillIndex, uniEquipId }, { elite, data: diyData }); } catch { return null; }
};
for (const charId of localDiyPool(backups?.diy?.ownedPool || [])) {
  const rec = diyRec(charId);
  if (rec && !ops.has(charId)) ops.set(charId, { charId, name: rec.name || backups.units?.[charId]?.name || charId, diy: true, chess: rec, tier: 6 });
}
const list = [...ops.values()].sort((a, b) => (b.diy - a.diy) || (b.tier - a.tier) || String(a.name).localeCompare(String(b.name), 'zh'));
const avatar = (id) => manifest?.chars?.[id]?.avatar || '';
const RANK = { BOSS: 0, ELITE: 1, NORMAL: 2 };
const enemies = data.list('enemies').filter((e) => e?.key && manifest?.enemies?.[e.key]?.spine)
  .sort((a, b) => ((RANK[a.rank] ?? 3) - (RANK[b.rank] ?? 3)) || String(a.key).localeCompare(String(b.key)));

// ---- settings -----------------------------------------------------------------------------------------------------
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const st = {
  op: null, elite: params.get('elite') === '1', skill: num(params.get('skill')) != null ? num(params.get('skill')) - 1 : null,
  module: params.get('module') || null, dir: DIRS.includes(params.get('dir')) ? params.get('dir') : 'RIGHT',
  // bags: the sandbag tiles; autoBags = still the operator's default placement (defaultBags: follows its range / direction)
  opTile: { ...DEFAULT_OP }, bags: [], autoBags: true,
  enemyKey: enemies.some((e) => e.key === params.get('enemy')) ? params.get('enemy') : SANDBAG_DEFAULT,
  bag: { def: 0, res: 0, atk: 0, fixed: true }, terrain: TERRAINS[params.get('terrain')] ? params.get('terrain') : 'flat',
  // tokens: the operator's hand-placed pieces on the island ({ tokenId, row, col }); autoTokens = still the default placement
  tokens: [], autoTokens: true,
  spAuto: true, hurt: false, place: 'op',
};
let pendingFx = params.get('fx');

/** The loadout choices of the selected operator: base / elite records and loadoutOptions. */
function loadout() {
  const base = st.op?.chess;
  const golden = st.op?.diy ? diyRec(st.op.charId, { elite: true }) : base?.goldenId ? chessOf(base.goldenId) : null;
  const opt = base ? loadoutOptions(base, golden) : { skills: [], modules: [] };
  return { base, golden, opt };
}
/** The record a battle config fields (a 自选 pick composed from its slot) and its hand-placed pieces. */
const cfgRecord = (cfg) => (cfg.diy ? diyRec(cfg.diy.charId, { elite: cfg.chessId.endsWith('_b'), skillIndex: cfg.diy.skillIndex, uniEquipId: cfg.diy.uniEquipId }) : chessOf(cfg.chessId));
const cfgTokens = (cfg) => (cfg.diy ? ownTokens(diyTokenOwner(cfg.diy.charId, cfgRecord(cfg)?.status), Object.values(backups?.tokens || {})) : ownTokens(cfg.chessId, data.list('tokens')));

/** The battle config of the current settings (js/debug/sandbag.js createSandbagBattle). */
function battleConfig() {
  const { base, golden, opt } = loadout();
  const elite = st.elite && !!golden;
  const skill = opt.skills.includes(st.skill) ? st.skill : opt.defaultSkill;
  const module = elite && opt.modules.includes(st.module) ? st.module : null;
  const chessId = elite ? golden.chessId : base.chessId;
  // a 自选 pick: the slot's id + the pick (the sim composes it, simdata getDiy); its summons are owned by charId@status
  const diy = st.op.diy ? { charId: st.op.charId, skillIndex: Number.isInteger(skill) ? skill : 0, uniEquipId: module } : null;
  const rec = diy ? diyRec(st.op.charId, { elite, skillIndex: diy.skillIndex, uniEquipId: module }) : chessOf(chessId);
  const grid = (rec || base).rangeGrid;
  if (st.autoBags) st.bags = defaultBags(st.opTile, st.dir, grid);
  const own = diy ? ownTokens(diyTokenOwner(st.op.charId, rec?.status), Object.values(backups?.tokens || {})) : ownTokens(chessId, data.list('tokens'));
  if (st.autoTokens) st.tokens = autoTokens(st.opTile, st.dir, grid, own, st.bags);
  st.tokens = st.tokens.filter((t) => own.some((o) => o.tokenId === t.tokenId));
  return {
    chessId, skillIndex: Number.isInteger(skill) ? skill : null, moduleId: module, diy,
    dir: st.dir, op: st.opTile, bags: st.bags, enemyKey: st.enemyKey, bag: { ...st.bag, hp: SANDBAG_HP }, terrain: st.terrain,
    tokens: st.tokens, spAuto: () => st.spAuto, hurt: () => st.hurt,
  };
}
function syncUrl() {
  const q = new URLSearchParams();
  if (st.op) q.set('op', st.op.charId);
  if (st.elite) q.set('elite', '1');
  if (Number.isInteger(st.skill)) q.set('skill', String(st.skill + 1));
  if (st.elite && st.module) q.set('module', st.module);
  if (st.dir !== 'RIGHT') q.set('dir', st.dir);
  if (st.enemyKey !== SANDBAG_DEFAULT) q.set('enemy', st.enemyKey);
  if (st.terrain !== 'flat') q.set('terrain', st.terrain);
  history.replaceState(null, '', `?${q}`);
}

// ---- arena --------------------------------------------------------------------------------------------------------
let arena = null;
let arenaError = null;
const infos = new Map();   // battle unit id → UnitInfo (spawn tuples)
const told = new Set();    // missing-data notes already logged in this run
let dmgTotal = 0, dmgHits = 0, dmgWin = [], t0 = null, lastGt = 0;
try {
  arena = await createArena($('field'), { onEvents, onRestart });
} catch (err) {
  arenaError = err;
  console.error('[debug] arena unavailable', err);
  $('field').append(el('p', { class: 'warn', style: 'padding:60px 16px' }, `전투 화면을 만들지 못했습니다: ${err?.message || err}`));
}

function restart() {
  if (!arena || !st.op) return;
  syncUrl();
  try { arena.start(battleConfig()); } catch (err) { log('other', 'blocked', `전투 생성 실패: ${err?.message || err}`); console.error(err); }
}
function onRestart(battle) {
  infos.clear(); told.clear();
  dmgTotal = 0; dmgHits = 0; dmgWin = []; t0 = null;
  const c = arena.config();
  log('other', 'skill', `── 전투 시작: ${ko(st.op?.name)} ${c.chessId}${c.skillIndex != null ? ` S${c.skillIndex + 1}` : ''}${c.moduleId ? ` · ${c.moduleId}` : ''} · ${DIR_LABEL[c.dir]} · 샌드백 ${c.bags.length}× ${c.enemyKey} (${battle.fieldId})`);
}

// ---- log ----------------------------------------------------------------------------------------------------------
const logEl = $('log');
const LOG_MAX = 500;
function log(kind, cls, text, gt = lastGt) {
  const li = el('li', { class: `k-${kind} ${cls || ''}` }, el('span', { class: 't' }, `${(Number(gt) || 0).toFixed(2).padStart(6)}s`), text);
  logEl.append(li);
  while (logEl.childElementCount > LOG_MAX) logEl.firstElementChild.remove();
  if ($('logfollow').checked) logEl.scrollTop = logEl.scrollHeight;
}
for (const cb of document.querySelectorAll('#logbar input[data-k]')) {
  const apply = () => logEl.classList.toggle(`hide-${cb.dataset.k}`, !cb.checked);
  cb.onchange = apply;
  apply();
}
$('logclear').onclick = () => logEl.replaceChildren();

const info = (id) => infos.get(id) || null;
const nm = (id) => { const u = info(id); return u ? `${ko(u.name)}#${id}` : `#${id}`; };
const isOpUnit = (u) => !!u && u.side === 'ally' && u.kind === 'op';
/** A missing-data note, once per run and key. */
function note(key, text) { if (told.has(key)) return; told.add(key); log('other', 'miss', `⚠ ${text}`); }
/** The effects of one event kind for a unit (render/fxmap.js effectsFor — what render/fxgame.js plays). */
function fxText(u, kind, skillIndex = 0) {
  const prefabs = prefabsOf(u.spine || u.defId);
  if (!prefabs.length) return null;
  const names = effectsFor(prefabs, kind, skillIndex);
  return names.length ? names.join(', ') : '';
}

function onEvents(ev, gt) {
  lastGt = gt;
  if (t0 == null) t0 = gt;
  for (const e of ev) {
    if (!Array.isArray(e)) continue;
    switch (e[0]) {
      case 'spawn': if (e[1] && e[1].id != null) infos.set(e[1].id, e[1]); break;
      case 'deploy': {
        const u = info(e[1]);
        log('other', '', `배치 ${nm(e[1])}`);
        if (isOpUnit(u)) {
          if (!prefabsOf(u.spine).length) note('fxb', `공식 이펙트 번들 없음: ${fxBundleOf(u.spine)} (fx.js 절차 이펙트만 나옴 — tools/local-extract/fx_extract.py --bundle ${fxBundleOf(u.spine)})`);
          if (pendingFx) { const k = pendingFx; pendingFx = null; setTimeout(() => playFx(k), 0); }
        }
        break;
      }
      case 'skill': {
        const u = info(e[1]);
        const idx = Number.isInteger(u?.skillIndex) ? u.skillIndex : 0;
        if (!e[2]) { log('skill', 'skill', `■ 스킬 종료 ${nm(e[1])}`); break; }
        log('skill', 'skill', `▶ 스킬 시작 ${nm(e[1])} S${idx + 1}`);
        if (isOpUnit(u)) {
          const sfx = unitSfx(u.spine);
          const url = sfx.skills?.[idx] ?? sfx.skill;
          if (typeof url !== 'string') note(`ss${idx}`, `스킬 효과음 데이터 없음: audio.sfx.units.${u.spine}.skills[${idx}] / .skill`);
          const lp = sfx.loops?.[idx];   // its looping bank while it runs (audioOfficial.js startSkillLoop)
          if (lp) log('snd', 'snd', `  ♪ S${idx + 1} 스킬 중 루프음 ${file(lp.url)} · 볼륨 ${loopGain(lp).toFixed(2)}`);
          const md = sfx.modes?.[idx];   // the skill's own attack / impact sounds (audioOfficial.js, tools/assets/skill-mode-sfx.mjs)
          if (md) log('snd', 'snd', `  ♪ S${idx + 1} 스킬 중 소리 — 공격: ${md.attack ? file(md.attack) : '일반'} · 타격: ${md.hit ? file(md.hit) : '일반'}${md.deferStart ? ' · 시작음은 공격이 없을 때만' : ''}`);
          else note(`sm${idx}`, `S${idx + 1} 스킬 중 전용 공격·타격음 없음 (일반 소리 그대로)`);
          const bind = fxModes?.[u.spine], pre = prefabsOf(u.spine), mn = attackMode(bind, true, idx);
          const bc = boundEffects(bind, pre, mn, 'cast'), bh = boundEffects(bind, pre, mn, 'hit');
          if (bc.length || bh.length) log('fx', '', `  ✦ S${idx + 1} 모드 ${bind.modes[mn]} — 공격마다 시전: ${bc.join(', ') || '없음'} · 타격: ${bh.join(', ') || '이름 매핑'} · 버프: ${fxText(u, 'skillBuff', idx) || '없음'}`);
          else {
            const s = fxText(u, 'skillStart', idx), b = fxText(u, 'skillBuff', idx), h = fxText(u, 'skillHit', idx);
            if (s != null) log('fx', '', `  ✦ S${idx + 1} 이펙트 (이름 매핑) — start: ${s || '없음'} · buff: ${b || '없음'} · hit: ${h || '없음'}`);
          }
        }
        break;
      }
      case 'atk': {
        const src = info(e[1]);
        log('atk', '', `⚔ ${nm(e[1])} → ${nm(e[2])}${e[3] ? ` [${e[3]}]` : ''}`);
        if (isOpUnit(src) && info(e[2])?.side === 'enemy') {   // a heal "attack" on an ally has no impact sound
          const sfx = unitSfx(src.spine);
          if (typeof sfx.attack !== 'string') note('sa', `공격음 데이터 없음: audio.sfx.units.${src.spine}.attack`);
          else if (!normalAttackSfx(src.spine, sfx.attack)) note('sa', `공격음이 스킬 모드 파일이라 일반 공격엔 안 남: ${file(sfx.attack)}`);
          if (typeof sfx.hit !== 'string') note('sh', `타격음 데이터 없음: audio.sfx.units.${src.spine}.hit`);
          else if (!normalAttackSfx(src.spine, sfx.hit)) note('sh', `타격음이 스킬 모드 파일이라 일반 공격엔 안 남: ${file(sfx.hit)}`);
          const bind = fxModes?.[src.spine], pre = prefabsOf(src.spine);
          const bc = boundEffects(bind, pre, 0, 'cast'), bh = boundEffects(bind, pre, 0, 'hit');
          const a = bc.length ? bc.join(', ') : fxText(src, 'attackStart'), h = bh.length ? bh.join(', ') : fxText(src, 'attackHit');
          if (a != null && !told.has('fxa')) { told.add('fxa'); log('fx', '', `  ✦ 일반 공격 이펙트${bc.length ? ' (공식 바인딩)' : ' (이름 매핑)'} — 시전: ${a || '없음'} · 타격: ${h || '없음'}`); }
        }
        break;
      }
      case 'dmg': {
        const t = info(e[1]);
        if (t && t.side === 'enemy') { dmgTotal += Number(e[2]) || 0; dmgHits++; dmgWin.push([gt, Number(e[2]) || 0]); }
        log('dmg', '', `✷ ${nm(e[1])} −${fmt(e[2])} ${e[3] || ''}`);
        break;
      }
      case 'heal': log('dmg', '', `✚ ${nm(e[1])} +${fmt(e[2])}`); break;
      case 'engage': log('other', '', `교전 ${nm(e[1])}`); break;
      case 'status': log('status', '', `상태 ${nm(e[1])} ${e[2]} ${e[3] ? '+' : '−'}`); break;
      case 'fx': {
        const ex = e[4] && typeof e[4] === 'object' ? e[4] : null;
        const brief = ex ? JSON.stringify(ex).slice(0, 90) : '';
        let tail = '';
        const hk = kitHitKey(e[1], ex, (id) => audio.units.get(id));
        if (hk) { const url = manifest?.audio?.sfx?.kit?.[hk]; tail = typeof url === 'string' ? ` · 키트 타격음 ${hk}` : ` · ⚠ 키트 타격음 매핑 없음 (sfx.kit.${hk})`; }
        log('fx', hk && !manifest?.audio?.sfx?.kit?.[hk] ? 'miss' : '', `fx ${e[1]} ${brief}${tail}`);
        break;
      }
      case 'die': {
        const u = info(e[1]);
        log('other', '', `퇴장 ${nm(e[1])} (${e[2] || ''})${u && u.side === 'enemy' ? ' → 샌드백 재생성' : ''}`);
        break;
      }
      case 'leak': log('other', 'blocked', `이탈 ${nm(e[1])}`); break;
      default: log('other', '', JSON.stringify(e).slice(0, 120));
    }
  }
}

// every sound and voice line the audio manager starts — or the limiter / voice gate holds back — goes to the log
function soundLabel(key) {
  const s = String(key ?? '');
  let m;
  if ((m = /^(\d+):attack$/.exec(s))) return `공격음 ${nm(+m[1])}`;
  if ((m = /^h(\d+):hit$/.exec(s))) return `타격음 → ${nm(+m[1])}`;
  if ((m = /^(\d+):boom:hit$/.exec(s))) return `소모 폭발음 ${nm(+m[1])}`;
  if ((m = /^(\d+):skill$/.exec(s))) return `스킬음 ${nm(+m[1])}`;
  if ((m = /^kit:(.+)$/.exec(s))) return `키트 타격음 ${m[1]}`;
  if ((m = /^(\d+):die$/.exec(s)) || (m = /^die:(\d+)$/.exec(s))) return `퇴장음 ${nm(+m[1])}`;
  if ((m = /^(\d+):born$/.exec(s))) return `배치음 ${nm(+m[1])}`;
  if ((m = /^(\d+):atk$/.exec(s))) return `적 공격음(공용) ${nm(+m[1])}`;
  if ((m = /^heal:(\d+)$/.exec(s))) return `치유음 ${nm(+m[1])}`;
  if (s === 'deploy') return '배치음(공용)';
  if (s.startsWith('b:')) return `전투음 ${s.slice(2)}`;
  return s || '소리';
}
const rawPlay = audio._play.bind(audio);
const rawTry = audio.limiter.tryAcquire.bind(audio.limiter);
let verdict = true;
audio.limiter.tryAcquire = (...a) => (verdict = rawTry(...a));
audio._play = (url, o = {}) => {
  verdict = true;
  const r = rawPlay(url, o);
  if (o.limited || o.unitKey != null) {
    const ok = o.limited ? verdict : true;
    const vol = Number.isFinite(o.volume) ? ` · 볼륨 ${o.volume.toFixed(2)}` : '';
    log('snd', ok ? 'snd' : 'blocked', `♪ ${soundLabel(o.unitKey)} ${file(url)}${vol}${ok ? '' : ' — 동시 재생 제한으로 생략'}`);
  }
  return r;
};
const rawVoice = audio.voice.bind(audio);
audio.voice = (charId, slot, o = {}) => {
  const ok = rawVoice(charId, slot, o);
  const has = !!audio.voiceTable?.()?.[charId]?.[slot];
  const why = ok ? '' : voiceStore.get().lang === 'off' ? ' — 음성 끔' : !has ? ' — 대사 파일 없음' : !audio.unlocked ? ' — 소리 잠김' : ' — 음성 게이트(우선순위·쿨다운)로 생략';
  log('voice', ok ? 'voice' : has ? 'blocked' : 'miss', `🗣 ${VOICE_SLOTS[slot] || slot} (${slot}) ${charId}${why}`);
  return ok;
};
function preview(url, label) {
  if (!url) return;
  if (!audio.unlocked) { $('now').textContent = '먼저 화면을 한 번 클릭해 소리를 켜세요'; return; }
  rawPlay(url, { volume: 0.9 });
  $('now').textContent = `♪ ${label || ''} ${file(url)}`;
}
async function playFx(key) {
  if (!arena) return;
  const hit = /hit/.test(key.split('/')[1] || '');
  const target = hit ? arena.bags()[0] : arena.op();
  const ok = target ? await arena.playFx(key, target.id) : false;
  $('now').textContent = ok ? `✦ ${key} (${hit ? '샌드백' : '오퍼레이터'})` : `이펙트를 못 띄움: ${key}${$('quality').value === 'low' ? ' (품질 low = 공식 이펙트 끔)' : target ? '' : ' (대상 없음)'}`;
  for (const b of document.querySelectorAll('button.it[data-fx]')) b.classList.toggle('on', b.dataset.fx === key);
}

// ---- operator list ------------------------------------------------------------------------------------------------
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
    box.append(el('button', { class: 'op' + (st.op === o ? ' on' : ''), onclick: () => select(o) },
      el('img', { src: avatar(o.charId), alt: '' }), `${ko(o.name)}${prefabsOf(o.charId).length ? ' ✦' : ''}`));
  }
}
$('q').oninput = renderOps;

function select(o, keep = false) {
  if (st.op !== o && !keep) { st.skill = null; st.module = null; }
  st.op = o;
  renderOps();
  renderDetail();
  restart();
}

// ---- detail panel -------------------------------------------------------------------------------------------------
function chip(label, on, onclick, extra = {}) { return el('button', { class: `chip${on ? ' on' : ''}`, onclick, ...extra }, label); }
function renderDetail() {
  const d = $('detail');
  d.replaceChildren();
  const o = st.op;
  if (!o) { d.append(el('p', { class: 'muted' }, '왼쪽에서 오퍼레이터를 고르세요.')); return; }
  const { base, golden, opt } = loadout();
  const cfg = battleConfig();
  const rec = cfgRecord(cfg) || base;
  d.append(el('h2', {}, `${ko(o.name)} · ${o.charId}`));
  if (arenaError) d.append(el('p', { class: 'warn' }, '전투 화면 없음 — 소리·대사·이펙트 목록만 쓸 수 있습니다.'));

  // loadout
  d.append(el('h2', {}, '전투 설정'));
  const lr = el('div', { class: 'row' });
  lr.append(chip('일반', !(st.elite && golden), () => { st.elite = false; renderDetail(); restart(); }));
  lr.append(chip('정예', st.elite && !!golden, () => { st.elite = true; renderDetail(); restart(); }, { disabled: !golden, title: golden ? golden.chessId : '정예 기록 없음' }));
  lr.append(el('span', { class: 'muted' }, cfg.chessId));
  d.append(lr);
  const sr = el('div', { class: 'row' });
  for (const i of opt.skills) {
    const s = (rec.skills || []).find((k) => k.index === i) || (base.skills || []).find((k) => k.index === i);
    sr.append(chip(`S${i + 1} ${ko(s?.name || '')}`, cfg.skillIndex === i, () => { st.skill = i; renderDetail(); restart(); }, { class: `chip skill${cfg.skillIndex === i ? ' on' : ''}`, title: '이 스킬로 다시 시작' }));
  }
  if (!opt.skills.length) sr.append(el('span', { class: 'muted' }, '스킬 없음'));
  d.append(sr);
  if (st.elite && golden && opt.modules.length) {
    const sel = el('select', { onchange: (ev) => { st.module = ev.target.value; restart(); } });
    for (const m of opt.modules) {
      const rm = (golden.modules || []).find((x) => x.uniEquipId === m);
      sel.append(el('option', { value: m, selected: cfg.moduleId === m || (!cfg.moduleId && m === opt.defaultModule) }, m === 'none' ? '모듈 없음' : `${rm?.typeName || ''} ${ko(rm?.name || m)}`));
    }
    d.append(el('div', { class: 'row' }, el('span', { class: 'muted' }, '모듈'), sel));
  }
  const dr = el('div', { class: 'row' }, el('span', { class: 'muted' }, '방향'));
  for (const k of ['LEFT', 'UP', 'DOWN', 'RIGHT']) dr.append(chip(DIR_LABEL[k], st.dir === k, () => { st.dir = k; renderDetail(); restart(); }));
  d.append(dr);
  const tr = el('div', { class: 'row' }, el('span', { class: 'muted' }, '지형'));
  for (const [k, label] of Object.entries(TERRAINS)) tr.append(chip(label, st.terrain === k, () => { st.terrain = k; renderDetail(); restart(); }));
  d.append(tr);
  const pr = el('div', { class: 'row' }, el('span', { class: 'muted' }, '빈 타일 클릭'));
  pr.append(chip('오퍼레이터 이동', st.place === 'op', () => { st.place = 'op'; renderDetail(); }));
  pr.append(chip('샌드백 추가/제거', st.place === 'bag', () => { st.place = 'bag'; renderDetail(); }));
  const own = cfgTokens(cfg);
  if (own.length) pr.append(chip('기물 놓기/치우기', st.place === 'token', () => { st.place = 'token'; renderDetail(); }));
  pr.append(chip('배치 초기화', false, () => { st.opTile = { ...DEFAULT_OP }; st.autoBags = true; st.autoTokens = true; restart(); }));
  d.append(pr);
  d.append(el('div', { class: 'muted' }, '오퍼레이터를 클릭하면 방향이 돌아갑니다. 샌드백 모드에서 샌드백을 클릭하면 제거, 오퍼레이터 칸을 누르면 저지된 샌드백을 둡니다. 직접 고치기 전까지 샌드백은 사거리·방향에 맞춰 자동 배치(사거리가 자기 칸뿐이면 오퍼레이터 칸에 저지).'));

  // sandbag
  d.append(el('h2', {}, '샌드백'));
  const es = el('select', { onchange: (ev) => { st.enemyKey = ev.target.value; restart(); } });
  let grp = null, og = null;
  for (const e of enemies) {
    const g = { BOSS: '보스', ELITE: '정예', NORMAL: '일반' }[e.rank] || e.rank;
    if (g !== grp) { og = el('optgroup', { label: g }); es.append(og); grp = g; }
    og.append(el('option', { value: e.key, selected: e.key === st.enemyKey }, `${ko(e.name)}${e.stats?.motion === 'FLY' ? ' (비행)' : ''} · ${e.key}`));
  }
  d.append(el('div', { class: 'row' }, es));
  const raw = data.lookup('enemies', st.enemyKey);
  const numIn = (k, label, title) => el('label', { class: 'f', title }, label, el('input', { type: 'number', min: '0', step: '50', value: String(st.bag[k]),
    onchange: (ev) => { st.bag[k] = Math.max(0, Number(ev.target.value) || 0); restart(); } }));
  d.append(el('div', { class: 'row' },
    numIn('def', '방어', `원래 ${raw?.stats?.def ?? '?'}`), numIn('res', '저항', `원래 ${raw?.stats?.res ?? '?'}`), numIn('atk', '공격', '0 = 공격하지 않음')));
  d.append(el('div', { class: 'row' },
    el('label', { class: 'f' }, el('input', { type: 'checkbox', checked: st.bag.fixed, onchange: (ev) => { st.bag.fixed = ev.target.checked; restart(); } }), '밀려나지 않음'),
    el('span', { class: 'muted' }, `체력 ${SANDBAG_HP.toExponential(0)} · 절반 아래면 회복 · 쓰러지면 재생성`)));

  // hand-placed pieces (tokens.json placeable: 望's 棋子, 赫默's 医疗探机, 凯瑟琳's 防护单元 …)
  if (own.length) {
    d.append(el('h2', {}, '기물 (손패에서 직접 놓는 소환물·함정)'));
    for (const t of own) {
      const n = cfg.tokens.filter((x) => x.tokenId === t.tokenId).length;
      d.append(el('div', { class: 'row' }, el('span', {}, `${ko(t.name)} ${n}/${t.limit}`), el('span', { class: 'muted' }, t.tokenId + (t.ownerRange ? ' · 공격 범위 안에만' : ''))));
    }
    d.append(el('div', { class: 'row' },
      chip('자동 배치', st.autoTokens, () => { st.autoTokens = true; renderDetail(); restart(); }),
      chip('모두 치우기', false, () => { st.autoTokens = false; st.tokens = []; renderDetail(); restart(); }),
      el('span', { class: 'muted' }, '「기물 놓기/치우기」 모드에서 빈 타일 = 놓기, 기물 = 치우기')));
  }

  // skill controls
  d.append(el('h2', {}, '스킬 조작'));
  d.append(el('div', { class: 'row' },
    chip('SP 채우기', false, () => arena?.fillSp(), { title: '발동은 원래 조건(자동 시전 규칙)대로' }),
    chip('지금 발동', false, () => arena?.castNow(), { class: 'chip skill', title: 'SP를 채우고 바로 시전 (조건·조작 쿨다운 무시)' }),
    el('label', { class: 'f', title: '끄면 SP가 스스로 차지 않음 — 버튼으로만 시전' }, el('input', { type: 'checkbox', checked: st.spAuto, onchange: (ev) => { st.spAuto = ev.target.checked; } }), 'SP 자동 회복'),
    el('label', { class: 'f', title: `메딕 치유 확인용: ${HURT.every}초마다 최대 체력 ${HURT.frac * 100}% 고정 피해 (${HURT.floor * 100}% 아래로는 안 깎음)` },
      el('input', { type: 'checkbox', checked: st.hurt, onchange: (ev) => { st.hurt = ev.target.checked; } }), '아군 부상')));
  d.append(el('div', { id: 'sp' }, '-'));

  // sounds
  const u = unitSfx(o.charId);
  d.append(el('h2', {}, '효과음 파일'));
  const snd = el('div', { class: 'row' });
  for (const [k, label] of [['attack', '공격'], ['hit', '타격'], ['skill', '스킬(기본)'], ['die', '퇴각'], ['born', '배치']]) {
    if (typeof u[k] === 'string') snd.append(chip(label, false, () => preview(u[k], label), { title: file(u[k]) + ((k === 'attack' || k === 'hit') && !normalAttackSfx(o.charId, u[k]) ? ' (스킬 모드 파일: 일반 공격엔 안 남)' : '') }));
  }
  for (const [i, url] of Object.entries(u.skills || {})) snd.append(chip(`S${+i + 1}`, false, () => preview(url, `S${+i + 1}`), { title: file(url) }));
  if (!snd.childNodes.length) snd.append(el('span', { class: 'muted' }, '소리 없음'));
  d.append(snd);
  const voiceLang = voiceStore.get().lang === 'jp' ? 'jp' : 'kr';
  const v = (voiceLang === 'jp' ? manifest?.audio?.voiceJp : manifest?.audio?.voice)?.[o.charId] || {};
  d.append(el('h2', {}, `대사 파일 (${voiceLang === 'kr' ? '한국어' : '일본어'})`));
  const vo = el('div', { class: 'row' });
  for (const [role, label] of [...Object.entries(VOICE_SLOTS), ['resultFour', '고난도 완료'], ['resultThree', '3성'], ['resultTwo', '비3성'], ['resultLose', '실패']]) {
    [].concat(v[role] || []).forEach((url, i) => vo.append(chip(`${label} ${i + 1}`, false, () => preview(url, `${label} ${i + 1}`), { title: file(url) })));
  }
  if (!vo.childNodes.length) vo.append(el('span', { class: 'muted' }, '대사 없음'));
  d.append(vo);

  // effects
  const bundle = fxBundleOf(o.charId);
  const prefabs = prefabsOf(o.charId);
  d.append(el('h2', {}, `이펙트 (${prefabs.length}) — 오퍼레이터 / hit는 샌드백에`));
  if (!prefabs.length) d.append(el('p', { class: 'muted' }, `추출된 이펙트 없음 (tools/local-extract/fx_extract.py --bundle ${bundle})`));
  for (const [g, names] of Object.entries(effectGroups(prefabs))) {
    if (!names.length) continue;
    d.append(el('div', { class: 'muted' }, { attack: '일반 공격', skill1: '스킬 1', skill2: '스킬 2', skill3: '스킬 3', birth: '배치', other: '기타' }[g] || g));
    for (const p of names) {
      const key = `${bundle}/${p}`;
      d.append(el('button', { class: 'it', 'data-fx': key, onclick: () => playFx(key) }, p, el('span', { class: 'k' }, /hit/.test(p) ? '샌드백' : '')));
    }
  }
}

// ---- field clicks -------------------------------------------------------------------------------------------------
const tileEq = (a, r, c) => Math.round(a.row) === r && Math.round(a.col) === c;
/** 기물 모드의 타일: 기물이 있으면 치우고, 없으면 (한도·공격 범위 규칙 안에서) 고른 오퍼레이터의 기물을 놓는다. */
function placeToken(row, col) {
  const cfg = battleConfig();
  const own = cfgTokens(cfg);
  if (!own.length) return;
  st.autoTokens = false;
  if (st.tokens.some((t) => tileEq(t, row, col))) { st.tokens = st.tokens.filter((t) => !tileEq(t, row, col)); renderDetail(); restart(); return; }
  if (tileEq(st.opTile, row, col)) return;
  const grid = (cfgRecord(cfg) || st.op.chess).rangeGrid;
  const inRange = rangeOf(st.opTile, st.dir, grid).some((t) => t.row === row && t.col === col);
  const t = own.find((o) => st.tokens.filter((x) => x.tokenId === o.tokenId).length < o.limit && (!o.ownerRange || inRange));
  if (!t) { $('now').textContent = own.some((o) => o.ownerRange) && !inRange ? '이 기물은 오퍼레이터 공격 범위 안에만 놓을 수 있습니다' : '기물을 더 놓을 수 없습니다 (한도)'; return; }
  st.tokens = [...st.tokens, { tokenId: t.tokenId, row, col }];
  renderDetail();
  restart();
}
/** A sandbag on the operator's own tile, blocked (defaultBags with a block-only range). */
const blockedBag = () => defaultBags(st.opTile, st.dir, [[0, 0]])[0];
if (arena) {
  arena.view.on('tileClick', ({ row, col }) => {
    if (!inArena(row, col)) return;
    if (st.place === 'token') { placeToken(row, col); return; }
    if (st.place === 'op') {
      st.bags = st.bags.filter((b) => !tileEq(b, row, col));
      st.tokens = st.tokens.filter((t) => !tileEq(t, row, col));
      st.opTile = { row, col };
    } else {
      st.autoBags = false;
      if (st.bags.some((b) => tileEq(b, row, col))) st.bags = st.bags.filter((b) => !tileEq(b, row, col));
      else if (st.bags.length < 8) st.bags = [...st.bags, tileEq(st.opTile, row, col) ? blockedBag() : { row, col }];
    }
    restart();
  });
  arena.view.on('pieceClick', ({ unitId, unit }) => {
    if (unit?.side === 'ally') {
      if (unit.kind === 'token' && st.place === 'token') { // a placed piece: take it back
        const e = arena.battle()?.units.find((x) => x.id === unitId);
        if (e) placeToken(Math.round(e.tileR ?? e.y), Math.round(e.tileC ?? e.x));
        return;
      }
      if (unit.kind !== 'op') return;
      st.dir = DIRS[(DIRS.indexOf(st.dir) + 1) % DIRS.length];
      renderDetail();
      restart();
    } else if (st.place === 'bag') {
      const e = arena.battle()?.units.find((x) => x.id === unitId);
      if (!e) return;
      const r = Math.round(e.spawnY), c = Math.round(e.spawnX);
      st.autoBags = false;
      st.bags = st.bags.filter((b) => !tileEq(b, r, c));
      restart();
    }
  });
}

// ---- bar ----------------------------------------------------------------------------------------------------------
function setPaused(v) { arena?.setPaused(v); $('pause').textContent = v ? '▶' : '⏸'; }
$('pause').onclick = () => setPaused(!arena?.paused);
$('step').onclick = () => { setPaused(true); arena?.stepOnce(0.1); };
$('restart').onclick = restart;
$('speed').onchange = (ev) => arena?.setSpeed(ev.target.value);
$('quality').onchange = (ev) => arena?.setQuality(ev.target.value);
$('voice').value = voiceStore.get().lang;
$('voice').onchange = (ev) => { setVoiceLang(ev.target.value); renderDetail(); };
const vols = () => audio.setVolumes({ bgm: 0, sfx: Number($('vsfx').value), voice: Number($('vvoice').value), muted: false });
$('vsfx').oninput = vols;
$('vvoice').oninput = vols;
vols();
$('range').onchange = (ev) => arena?.showRange(ev.target.checked);
$('lock').onclick = () => $('lock').classList.remove('on');
window.addEventListener('keydown', (ev) => {
  if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
  if (ev.key === ' ') { ev.preventDefault(); setPaused(!arena?.paused); } else if (ev.key === 'r' || ev.key === 'R') restart();
});

// ---- live status --------------------------------------------------------------------------------------------------
function status() {
  $('lock').classList.toggle('on', !audio.unlocked);
  if (!arena) return;
  const b = arena.battle();
  const u = arena.op();
  const sp = $('sp');
  if (sp) {
    const s = u?.skill;
    if (!u) sp.textContent = '오퍼레이터 없음';
    else if (!s || s.noSkill) sp.textContent = '스킬 없음';
    else if (s.kind === 'passive') sp.textContent = `패시브 스킬 ${s.name || s.id}`;
    else {
      const run = s.active ? (s.isTimed ? (s.kind === 'ammo' ? `발동 중 · 탄약 ${s.ammoLeft}/${s.ammoMax}${Number.isFinite(s.timeLeft) ? ` · ${s.timeLeft.toFixed(1)}s` : ''}` : `발동 중 · ${s.timeLeft.toFixed(1)}s 남음`) : s.pending ? '다음 공격에 발동' : '발동') : '대기';
      sp.textContent = `${s.name || s.id} (${s.kind}, ${s.rule})\nSP ${s.sp.toFixed(1)} / ${s.spCost}  충전 ${s.charges}/${s.maxCharges}  ${st.spAuto ? '' : '[자동 회복 끔]'}\n${run} · 시전 ${s.activations}회`;
    }
  }
  const now = Number(b?.time) || 0;
  dmgWin = dmgWin.filter(([t]) => t >= now - 5);
  const win = dmgWin.reduce((a, [, n]) => a + n, 0) / Math.min(5, Math.max(0.001, now - (t0 ?? now)));
  const all = t0 != null && now > t0 ? dmgTotal / (now - t0) : 0;
  const vs = arena.stats().view;
  for (const r of vs?.fxGame?.recent || []) { // the effects the layer actually started (render/fxgame.js stats().recent)
    if (r.seq <= fxSeen) continue;
    fxSeen = r.seq;
    log('fx', 'skill', `✦ 이펙트 재생 ${r.n}`);
  }
  $('stats').textContent = `t ${now.toFixed(1)}s · ${vs?.fps ?? '-'} fps${arena.paused ? ' · 정지' : ''}\n피해 ${fmt(dmgTotal)} (${dmgHits}타)\nDPS 5초 ${fmt(win)} · 전체 ${fmt(all)}${arena.errors.length ? `\nsim 오류 ${arena.errors.length}건` : ''}`;
}
let fxSeen = 0;
setInterval(status, 100);

renderOps();
const pre = params.get('op') && ops.get(params.get('op'));
select(pre || list[0], true);
window.__debug = { arena, st, restart, playFx, preview, select: (id) => ops.get(id) && select(ops.get(id)) };
