#!/usr/bin/env node
// tools/i18n/build-ko-pack.mjs — local patch: the Korean language pack from OUR translations (한글 패치 → upstream 언어 팩).
//
// Writes, in upstream's pack formats (docs/I18N.md):
//   public/i18n/ko.json   UI strings: Chinese msgid (`ctx::msgid` for a context) → Korean
//   data/i18n/ko.json     game texts: upstream's official-KR overlay (tools/build-i18n.mjs --lang ko) plus our data
//                         dictionaries for what the KR tables lack (passed to it as --dict, tried after the KR client)
//
// Sources
//   ours   public/i18n/ko/{official,data,manual,diy,ui,patterns}.json — the dictionaries of our display-only translator
//          (keyed by the Chinese text, later files win, `{0}` patterns). --ours <dir>, else the working tree's
//          public/i18n/ko/, else `git show <--ours-ref, default nas-local>:public/i18n/ko/<file>.json`.
//   base   upstream's machine-translated pack: `git show <--base-ref>:public/i18n/ko.json` (default: the newest v* tag
//          merged into HEAD) or --base <file>. It gives the msgid list (with public/i18n/en.json, the complete pack) and
//          the text of every msgid our dictionaries do not have.
//
// Per msgid, the first that applies:
//   1. KEEP_UPSTREAM / FIXES  explicit decisions (below), each with its reason
//   2. ours exact             our dictionary has the Chinese msgid (a `ctx::` key looks up its plain msgid; a plain msgid
//                             that also has a context key keeps upstream's text — our single entry is the context's sense)
//   3. ours pattern           one of our `{0}` patterns has the msgid's shape: its `{i}` become the msgid's named
//                             placeholders, in order
//   4. upstream normalized    upstream's machine text with our terms (TERMS: only when the msgid has the Chinese term)
//                             and our style (…하세요, no final period unless the msgid ends a sentence, 「」 kept)
//   Our texts get the runtime post-processing of our translator (full-width punctuation → Korean, 【】 → [ ]) and the
//   leading / trailing spaces of upstream's text (upstream knows how the code joins the pieces). Every text is checked
//   with shared/i18n.js checkTranslation; one that drops or invents a placeholder falls to the next step.
//
// Usage: node tools/i18n/build-ko-pack.mjs [--ours <dir> | --ours-ref <ref>] [--base <file> | --base-ref <ref>]
//                                          [--no-data] [--offline] [--check] [--report <file>] [--quiet]
//   --check   build in memory; exit 1 when public/i18n/ko.json differs (data/i18n/ko.json: build-i18n --check)
//   --report  default .cache/build-ko-pack-report.json: per-msgid source, the term substitutions, the data texts of
//             our dictionaries that could not be mapped to a record
// Afterwards: node tools/i18n.mjs check ko --strict

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTranslation } from '../../shared/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUR_FILES = ['official', 'data', 'manual', 'diy', 'ui', 'patterns']; // later files win (public/js/i18n/i18n.js)
const DATA_FILES = ['data', 'manual', 'diy']; // the dictionaries of game texts (official = the client's string_map: UI)
const CJK = /[一-鿿]/;
const PH = /\{([A-Za-z0-9_$]+)((?:\|[^{}|]*){2,})?\}/g; // shared/i18n.js PLACEHOLDER

// ===== decisions =====================================================================================================

/** msgid → reason: upstream's text stays (our only entry is from another context). */
const KEEP_UPSTREAM = {
  返回: 'a back button; official.json (string_map, context-free) has 취소 ("cancel")',
  // user decisions 2026-10-07
  上: 'a direction label (ui/facing.js DIR_LABEL): 위, beside 왼쪽 / 오른쪽; official.json has 상 (another context)',
  下: 'a direction label (ui/facing.js DIR_LABEL): 아래; official.json has 하',
  全部: 'the "all" filter chip: 전체 (official KR uses 전체 in 3 of its 4 全部 keys); official.json has 전부',
  进阶: 'the elite-equipment tag (detailPanel / equipReplace): 승급; official.json has 랭크업 (another context)',
};

/** msgid → our text, fixed (our dictionary has a typo or a wrong sense). */
const FIXES = {
  敌方攻击强度到达极限的模拟训练: ['적의 공격 강도가 한계를 뛰어넘은 시뮬레이션', 'typo 강도하 in the official KR table'],
  // user decisions 2026-10-07
  全部显示: ['전체 표시', '全部 = 전체 (the damage-number setting; ui.json has 전부 표시)'],
  '；2 件相同装备自动合成进阶装备': [' ; 같은 장비 2개는 자동으로 승급 장비로 합성', '进阶(装备) = 승급, as the elite-equipment tag (ui.json has 상위 장비)'],
  '冻结 / 解冻商店': ['상점 동결 / 해동', '解冻 = 해동 (the official shop button of this mode); upstream 상점 동결 / 해제'],
  助战及自选编队: ['지원과 선발 편성', '自选编队 = 선발 편성 (ui.json has 자유 편성)'],
  // 自选 on this server: only the five 선발 operators (shared/local-diy.js), no prototypes — the Korean promises none
  '5阶与6阶各有两个自选名额：选择持有的 6★ 干员（任选技能与模组）或原型干员（技能锁定）。自选干员只出现在你自己的商店里，调度中心达到该阶等级后才会刷新，价格与同阶干员相同；盟约按干员实际所属阵营分配，没有特质。': [
    '5티어와 6티어에는 각각 선발 칸이 2개 있습니다. 보유한 6★ 오퍼레이터를 고르고 스킬과 모듈을 정하세요. 선발 오퍼레이터는 자신의 상점에만 등장하며, 보급센터가 해당 티어 레벨에 도달해야 갱신되고, 가격은 같은 티어의 오퍼레이터와 같습니다. 맹약은 오퍼레이터의 실제 소속 진영에 따라 배정되며 특질은 없습니다.',
    '自选 = 선발; no prototypes on this server (upstream: 보유한 6★ 오퍼레이터 … 또는 프로토타입 오퍼레이터(스킬 고정))'],
  '5阶、6阶的自选名额：持有的 6★ 干员或原型干员': ['5·6티어 선발 칸: 보유한 6★ 오퍼레이터', '自选名额 = 선발 칸; no prototypes on this server'],
  '6★ 原型干员与持有的 6★ 干员，另有 4★ 原型干员（先锋、特种除外）': ['보유한 6★ 오퍼레이터', 'the 自选 picker\'s tier-5 note; no prototypes on this server'],
  '6★ 原型干员与持有的 6★ 干员': ['보유한 6★ 오퍼레이터', 'the 自选 picker\'s tier-6 note; no prototypes on this server'],
};

/**
 * Our terms over upstream's machine text. `zh`: the rule applies only when the msgid has it (and not `not`); `from` →
 * `to` (a string is replaced with the Korean particle after it fitted to the new word; a RegExp is a plain replace).
 */
const TERMS = [
  { zh: /作战/, not: /战斗/, from: '전투', to: '작전', why: '作战 = 작전 (official KR data says 전투; our UI says 작전)' },
  { zh: /独立模拟|独立/, from: '독립 시뮬레이션', to: '단독 시뮬레이션', why: '独立模拟' },
  { zh: /独立/, from: /\(독립\)/g, to: '(단독)', why: '独立模拟 (short)' },
  { zh: /同盟模拟|联合模拟/, from: '동맹 시뮬레이션', to: '연합 시뮬레이션', why: '同盟模拟 / 联合模拟 = 연합 (同盟 alone stays 동맹)' },
  { zh: /创建者|房主/, from: '방장', to: '생성자', why: '创建者 = 생성자' },
  { zh: /机变/, from: '기회', to: '결정', why: '机变 = 결정' },
  { zh: /隐秘核心/, from: '숨겨진 핵심', to: '히든 코어', why: '隐秘核心 = 히든 코어' },
  { zh: /精锐/, not: /精英/, from: '정예화', to: '정예', why: '精锐 = 정예 (정예화 is 精英化)' },
  { zh: /禁用/, from: /금지된 /g, to: '결석 ', why: '禁用 = 결석' },
  { zh: /禁用/, from: /금지되어/g, to: '결석해', why: '禁用 = 결석' },
  { zh: /禁用/, from: '금지', to: '결석', why: '禁用 = 결석' },
  { zh: /调配/, not: /设置|设定/, from: '설정', to: '구성', why: '(干员)调配 = 구성' },
  { zh: /销毁/, from: '파기', to: '폐기', why: '销毁 = 폐기' },
  { zh: /晋升/, from: /(?<!정예 )승진 (횟수|보상|가능)/g, to: '정예 승진 $1', why: '晋升 (noun) = 정예 승진' },
  { zh: /阶(?!段)/, from: /(\}|\d)단계/g, to: '$1티어', why: '(N)阶 = 티어' },
  { zh: /维维美/, from: '위위메이', to: '비비미', why: '维维美 = 비비미 (emote set)' },
  // user decisions 2026-10-07: 自选 = 선발 (our old UI's word), longest first
  { zh: /自选/, from: '자유 선택 오퍼레이터', to: '선발 오퍼레이터', why: '自选干员 = 선발 오퍼레이터' },
  { zh: /自选/, from: '자유 선택 슬롯', to: '선발 칸', why: '自选名额 = 선발 칸' },
  { zh: /自选/, from: '자유 편성', to: '선발 편성', why: '自选编队 = 선발 편성' },
  { zh: /自选/, from: '자유 선택', to: '선발', why: '自选 = 선발' },
  { zh: /解冻/, from: '동결 해제', to: '해동', why: '解冻 = 해동 (official shop button)' },
  { zh: /招募/, from: '구매', to: '모집', why: '招募 = 모집' },
  { zh: /头像/, from: '아이콘', to: '초상화', why: '头像 = 초상화' },
  { zh: /延迟/, from: '핑', to: '지연', why: '延迟 = 지연' },
  { zh: /生命/, not: /目标生命/, from: /목표 HP/g, to: 'HP', why: '生命 (not 目标生命值) = HP' },
  { zh: /移除/, from: '제거', to: '제외', why: '移除 = 제외' },
  { zh: /暂离/, from: '자리 비움', to: '잠시 비우기', why: '暂离 = 잠시 비우기' },
  { zh: /托管/, from: /AI 대리 플레이/g, to: 'AI 대리', why: '托管 = AI 대리' },
  { zh: /界面/, from: '인터페이스', to: '화면', why: '界面 = 화면' },
  { zh: /调整/, not: /更改|修改/, from: /변경(됨|된|한|할|하)/g, to: '조정$1', why: '调整 = 조정' },
  { zh: /修改/, from: /변경 사항/g, to: '수정 내용', why: '修改 = 수정' },
  { zh: /查看/, not: /确认/, from: /확인할 수 (없|있)/g, to: '볼 수 $1', why: '查看 = 보기' },
  { zh: /突破防线/, from: /방어선을 돌파한/g, to: '방어선을 뚫은', why: '突破防线 = 방어선을 뚫다' },
  { zh: /点击|点/, from: /탭해서/g, to: '눌러서', why: '点击 = 누르기' },
  { zh: /点击|点/, from: /탭하여|탭해/g, to: '눌러', why: '点击 = 누르기' },
  { zh: /点击|点/, from: /탭하면/g, to: '누르면', why: '点击 = 누르기' },
  { zh: /点击|点/, from: /탭하세요/g, to: '누르세요', why: '点击 = 누르기' },
  { zh: /点击|点/, from: /클릭하여|클릭해/g, to: '눌러', why: '点击 = 누르기' },
  { zh: /点击|点/, from: /탭(?![가-힣])/g, to: '누르기', why: '点击 = 누르기' },
  { zh: /拖/, from: /드래그하세요/g, to: '끌어다 놓으세요', why: '拖拽 = 끌어다 놓기' },
  { zh: /拖/, from: /드래그하면/g, to: '끌어다 놓으면', why: '拖拽 = 끌어다 놓기' },
  { zh: /拖/, from: /드래그해/g, to: '끌어다 놓아', why: '拖拽 = 끌어다 놓기' },
  { zh: /拖/, from: /드래그로/g, to: '끌어서', why: '拖拽 = 끌어다 놓기' },
];

/** Our style over upstream's machine text, every msgid. */
const STYLE = [
  { from: /해 주세요/g, to: '하세요', why: '…해 주세요 → …하세요' },
  { from: /나가 주세요/g, to: '나가세요', why: '…해 주세요 → …하세요' },
  { from: /열어 주세요/g, to: '여세요', why: '…해 주세요 → …하세요' },
];

// ===== helpers =======================================================================================================

const parseArgs = (argv) => {
  const o = { ours: null, oursRef: 'nas-local', base: null, baseRef: null, data: true, offline: false, check: false, report: path.join(ROOT, '.cache', 'build-ko-pack-report.json'), quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ours') o.ours = path.resolve(argv[++i]);
    else if (a === '--ours-ref') o.oursRef = argv[++i];
    else if (a === '--base') o.base = path.resolve(argv[++i]);
    else if (a === '--base-ref') o.baseRef = argv[++i];
    else if (a === '--no-data') o.data = false;
    else if (a === '--offline') o.offline = true;
    else if (a === '--check') o.check = true;
    else if (a === '--report') o.report = path.resolve(argv[++i]);
    else if (a === '--quiet') o.quiet = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
};

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
const readJson = (abs) => JSON.parse(readFileSync(abs, 'utf8'));

/** Our dictionaries: { file: { zh: ko } } in OUR_FILES order. */
function loadOurs(o) {
  const dir = o.ours || path.join(ROOT, 'public', 'i18n', 'ko');
  const out = {};
  const fromDir = existsSync(path.join(dir, 'ui.json'));
  for (const f of OUR_FILES) {
    out[f] = fromDir ? readJson(path.join(dir, `${f}.json`)) : JSON.parse(git('show', `${o.oursRef}:public/i18n/ko/${f}.json`));
    for (const k of Object.keys(out[f])) if (k.startsWith('//')) delete out[f][k]; // comment entries
  }
  return { dicts: out, where: fromDir ? path.relative(ROOT, dir) || '.' : `${o.oursRef}:public/i18n/ko/` };
}

function loadBase(o) {
  if (o.base) return { json: readJson(o.base), where: path.relative(ROOT, o.base) };
  const ref = o.baseRef || git('tag', '--merged', 'HEAD', '--list', 'v*', '--sort=-v:refname').split('\n')[0].trim();
  if (!ref) throw new Error('no v* tag in HEAD: pass --base-ref <upstream ref> or --base <file>');
  return { json: JSON.parse(git('show', `${ref}:public/i18n/ko.json`)), where: `${ref}:public/i18n/ko.json` };
}

/** Hangul syllable with a final consonant (받침); ㄹ separately for 으로/로. */
const jong = (ch) => { const c = ch ? ch.charCodeAt(0) - 0xac00 : -1; return c >= 0 && c < 11172 ? c % 28 : -1; };
const PARTICLES = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'] };
/** Replace a word, fitting a particle right after it (이/가, 은/는, 을/를, 과/와, 으로/로) to the new word's last syllable. */
function swapWord(text, from, to) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const j = jong(to.at(-1));
  return text.replace(new RegExp(`${esc}(으로|이|가|은|는|을|를|과|와|로)?(?=[^가-힣]|$|[가-힣])`, 'g'), (w, p, off, s) => {
    if (!p) return to;
    // a particle only when the syllables after it are not the rest of a word (이번, 가능 …): followed by a non-Hangul
    const next = s[off + w.length];
    if (next && /[가-힣]/.test(next)) return to + p;
    if (p === '으로' || p === '로') return to + (j > 0 && j !== 8 ? '으로' : '로');
    if (j < 0) return to + p;
    return to + PARTICLES[p][j > 0 ? 0 : 1];
  });
}

/** Our translator's runtime post-processing (public/js/i18n/i18n.js fixPunct), and 【】 → [ ] (viaBrackets). */
const PUNCT = { '。': '. ', '，': ', ', '、': ', ', '；': '; ', '：': ': ', '？': '? ', '！': '! ', '（': '(', '）': ')' };
function finishOurs(s) {
  let out = s.replace(/【([^【】]*)】/g, '[$1]');
  if (!CJK.test(out)) out = out.replace(/[。，、；：？！（）]/g, (c) => PUNCT[c]).replace(/ {2,}/g, ' ').replace(/ ([)\]」』])/g, '$1');
  return out;
}

/** upstream's leading / trailing whitespace around our text. */
function withBaseSpace(text, base) {
  if (typeof base !== 'string') return text;
  const lead = /^\s*/.exec(base)[0];
  const trail = /\s*$/.exec(base)[0];
  return lead + text.trim() + trail;
}

/** The placeholder names of a msgid, in order (plain ones; a plural form is not a value slot). */
const slots = (msgid) => [...msgid.matchAll(PH)].filter((m) => m[2] === undefined).map((m) => m[1]);
const shape = (s, re) => s.replace(re, '\u0000').replace(/\s*\u0000\s*/g, '\u0000');

/** Our `{0}` patterns, by shape. */
function buildPatterns(dict) {
  const byShape = new Map();
  for (const [k, v] of dict) {
    if (!/\{\d+\}/.test(k) || /\{\d+:/.test(k)) continue;
    const order = [...k.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
    byShape.set(shape(k, /\{\d+\}/g), { key: k, value: v, order });
  }
  return byShape;
}

function viaPattern(msgid, patterns) {
  if (!/\{/.test(msgid)) return null;
  const names = slots(msgid);
  if (!names.length || [...msgid.matchAll(PH)].length !== names.length) return null;
  const p = patterns.get(shape(msgid, PH));
  if (!p || p.order.length !== names.length) return null;
  // the k-th placeholder of our key is {order[k]}: in our value, {order[k]} → {names[k]}
  const map = new Map(p.order.map((idx, k) => [idx, names[k]]));
  const text = p.value.replace(/\{(\d+)\}/g, (w, i) => (map.has(Number(i)) ? `{${map.get(Number(i))}}` : w));
  return { text, key: p.key };
}

function normalizeBase(msgid, text, used) {
  let out = text;
  for (const r of TERMS) {
    if (!r.zh.test(msgid) || (r.not && r.not.test(msgid))) continue;
    const before = out;
    out = typeof r.from === 'string' ? swapWord(out, r.from, r.to) : out.replace(r.from, r.to);
    if (out !== before) used.set(r.why, (used.get(r.why) || 0) + 1);
  }
  for (const r of STYLE) {
    const before = out;
    out = out.replace(r.from, r.to);
    if (out !== before) used.set(r.why, (used.get(r.why) || 0) + 1);
  }
  // 「」 stay as in Chinese (our convention; 【】 become [ ]): upstream writes [ ] for both
  if (/「/.test(msgid) && !/[【[]/.test(msgid)) {
    const before = out;
    out = out.replace(/\[([^[\]]*)\]/g, '「$1」');
    if (out !== before) used.set('「」 kept (upstream [ ])', (used.get('「」 kept (upstream [ ])') || 0) + 1);
  }
  // no final period unless the msgid ends a sentence (our wording: short messages without one)
  if (/[^.]\.$/.test(out) && !/[。.！!？?…]\s*$/.test(msgid)) {
    out = out.slice(0, -1);
    used.set('no final period', (used.get('no final period') || 0) + 1);
  }
  return out;
}

const fits = (msgid, text) => {
  const sep = msgid.indexOf('::');
  const c = checkTranslation(sep >= 0 ? msgid.slice(sep + 2) : msgid, text);
  return c.ok && c.extras.length === 0 && !CJK.test(text.replace(/\{[^}]*\}/g, ''));
};

// ===== UI pack =======================================================================================================

function buildUiPack(ours, base, en) {
  const dict = new Map();
  const src = new Map();
  for (const f of OUR_FILES) for (const [k, v] of Object.entries(ours[f])) if (typeof v === 'string' && v) { dict.set(k, v); src.set(k, f); }
  const patterns = buildPatterns(dict);
  const msgids = [...Object.keys(base), ...Object.keys(en).filter((k) => !(k in base))].filter((k) => !k.startsWith('_'));
  const ctxPlain = new Set(msgids.filter((k) => k.includes('::')).map((k) => k.slice(k.indexOf('::') + 2)));
  const pack = {};
  const rows = [];
  const terms = new Map();
  const count = { ours: 0, pattern: 0, upstream: 0, fixed: 0, kept: 0, missing: 0, rejected: 0 };
  const bySource = {};
  for (const id of msgids) {
    const sep = id.indexOf('::');
    const m = sep >= 0 ? id.slice(sep + 2) : id;
    const up = typeof base[id] === 'string' && base[id] ? base[id] : null;
    let text = null;
    let how = null;
    let from = null;
    if (FIXES[id]) { text = FIXES[id][0]; how = 'fixed'; from = FIXES[id][1]; }
    else if (KEEP_UPSTREAM[id] && up) { text = up; how = 'kept'; from = KEEP_UPSTREAM[id]; }
    else if (sep < 0 && ctxPlain.has(m) && up) { text = up; how = 'kept'; from = 'a context key has our entry\'s sense'; }
    if (!text) {
      const key = dict.has(m) ? m : dict.has(m.replace(/\n/g, '\\n')) ? m.replace(/\n/g, '\\n') : dict.has(m.trim()) ? m.trim() : null;
      if (key) {
        const cand = withBaseSpace(finishOurs(dict.get(key).replace(/\\n/g, '\n')), up);
        if (fits(id, cand)) { text = cand; how = 'ours'; from = src.get(key); } else count.rejected++;
      }
    }
    if (!text) {
      const p = viaPattern(m, patterns);
      if (p) {
        const cand = withBaseSpace(finishOurs(p.text), up);
        if (fits(id, cand)) { text = cand; how = 'pattern'; from = `${src.get(p.key)}: ${p.key}`; } else count.rejected++;
      }
    }
    if (!text && up) {
      const cand = normalizeBase(id, up, terms);
      text = fits(id, cand) ? cand : up;
      how = 'upstream';
      from = cand === up ? 'as is' : 'normalized';
    }
    if (!text) { count.missing++; rows.push({ msgid: id, how: 'missing' }); continue; }
    count[how]++;
    if (how === 'ours') bySource[from] = (bySource[from] || 0) + 1;
    pack[id] = text;
    rows.push({ msgid: id, how, from, text, upstream: up });
  }
  return { pack, rows, count, bySource, terms: Object.fromEntries([...terms].sort((a, b) => b[1] - a[1])) };
}

function packMeta(baseMeta, count, total) {
  const meta = { ...baseMeta };
  meta.authors = ['Stronghold Protocol KR (한글 패치)', ...(Array.isArray(baseMeta?.authors) ? baseMeta.authors : [])];
  meta.credits = 'Interface strings: the Korean patch\'s own translation (한글 패치) for '
    + `${count.ours + count.pattern + count.fixed} of ${total} strings; the rest from upstream's machine translation of 2026-10-07, `
    + 'normalized to the patch\'s terms (tools/i18n/build-ko-pack.mjs). Game texts (data/i18n/ko.json): the official KR client data '
    + '(© Hypergryph / Yostar) via ArknightsAssets/ArknightsGamedata, plus the patch\'s translations of texts the KR tables lack.';
  // the 设置 note says "machine translated": not true of a pack that is mostly a human translation
  meta.machineTranslated = false;
  return meta;
}

// ===== game texts ====================================================================================================

/** Every string of data/*.json (the texts build-i18n may localize). */
function dataStrings() {
  const set = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { if (CJK.test(v)) set.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  for (const f of readdirSync(path.join(ROOT, 'data'))) if (f.endsWith('.json')) walk(readJson(path.join(ROOT, 'data', f)));
  return set;
}

function buildData(ours, o, log) {
  const dict = {};
  for (const f of DATA_FILES) for (const [k, v] of Object.entries(ours[f])) if (typeof v === 'string' && v && !CJK.test(v)) dict[k] = v;
  const tmp = mkdtempSync(path.join(tmpdir(), 'ko-pack-'));
  const dictFile = path.join(tmp, 'ko-dict.json');
  writeFileSync(dictFile, JSON.stringify(dict));
  const args = [path.join(ROOT, 'tools', 'build-i18n.mjs'), '--lang', 'ko', '--dict', dictFile, '--report', path.join(ROOT, '.cache', 'build-i18n-report.ko.json')];
  if (o.offline) args.push('--offline');
  if (o.check) args.push('--check');
  let out;
  let ok = true;
  try { out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; ok = false; }
  rmSync(tmp, { recursive: true, force: true });
  log(out.trimEnd());
  // what of our data dictionaries is not a text of data/*.json (no record id + field to put it on)
  const texts = dataStrings();
  const unmapped = Object.keys(dict).filter((k) => !texts.has(k));
  const bySrc = {};
  for (const f of DATA_FILES) for (const k of Object.keys(ours[f])) if (k in dict && !texts.has(k)) bySrc[f] = (bySrc[f] || 0) + 1;
  let usedDict = null;
  try { const rep = readJson(path.join(ROOT, '.cache', 'build-i18n-report.ko.json')); usedDict = Object.values(rep.coverage).reduce((s, c) => s + (c.dict || 0), 0); } catch { /* no report */ }
  return { ok, dictEntries: Object.keys(dict).length, usedDict, unmapped: unmapped.length, unmappedBySource: bySrc, unmappedSample: unmapped.slice(0, 40) };
}

// ===== main ==========================================================================================================

function main() {
  const o = parseArgs(process.argv.slice(2));
  const log = (...a) => { if (!o.quiet) console.log(...a); };
  const { dicts: ours, where: oursWhere } = loadOurs(o);
  const { json: base, where: baseWhere } = loadBase(o);
  const en = readJson(path.join(ROOT, 'public', 'i18n', 'en.json'));
  log(`build-ko-pack: ours from ${oursWhere}, upstream base ${baseWhere}`);
  const { pack, rows, count, bySource, terms } = buildUiPack(ours, base, en);
  const total = rows.length;
  const json = { _meta: packMeta(base._meta, count, total) };
  json._about = 'Generated by tools/i18n/build-ko-pack.mjs (local patch) from the Korean patch\'s dictionaries and upstream\'s machine-translated pack. Edit the dictionaries or the tool, not this file.';
  Object.assign(json, pack);
  const text = `${JSON.stringify(json, null, 2)}\n`;
  const dst = path.join(ROOT, 'public', 'i18n', 'ko.json');
  log(`  UI: ${total} msgids — ours ${count.ours} (${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ')}), pattern ${count.pattern}, fixed ${count.fixed}, `
    + `upstream kept ${count.kept}, upstream ${count.upstream} (${rows.filter((r) => r.how === 'upstream' && r.from === 'normalized').length} normalized), missing ${count.missing}; `
    + `${count.rejected} of our texts failed the placeholder check`);
  let failed = false;
  if (o.check) {
    const cur = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
    if (cur !== text) { console.error('build-ko-pack --check: public/i18n/ko.json is out of date'); failed = true; } else log('  public/i18n/ko.json is up to date');
  } else {
    writeFileSync(dst, text);
    log('  wrote public/i18n/ko.json');
  }
  // the game-text build reads the UI pack as its last fallback: build it after the pack is written
  const data = o.data ? buildData(ours, o, log) : null;
  if (data && !data.ok) failed = true;
  if (data) log(`  data: our dictionary ${data.dictEntries} texts, ${data.usedDict ?? '?'} used by the overlay; ${data.unmapped} are no text of data/*.json (${Object.entries(data.unmappedBySource).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  if (!o.check) {
    mkdirSync(path.dirname(o.report), { recursive: true });
    writeFileSync(o.report, `${JSON.stringify({ base: baseWhere, ours: oursWhere, count, bySource, terms, data, rows }, null, 1)}\n`);
    log(`  report ${path.relative(ROOT, o.report)}`);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`build-ko-pack: ${e.stack || e.message}`); process.exitCode = 2; }
}

export { swapWord, viaPattern, buildPatterns, normalizeBase, finishOurs };
