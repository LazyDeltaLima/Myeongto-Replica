// test/render/spine-idle-slots.test.js — the resting clip draws the same body as the deployment or the attack (docs/rules/
// render.md 「Spine 클립 커버리지」). 森蚺 rested on Skill_2_Idle, which shows only her robot's `S_*` slots: the extracted keys
// had taken a hooker component that sits unreferenced on her Default mode for the mode's pairs. Every operator and summon
// in data/assets.json is posed (Spine 3.8 runtime, the parser the client ships) at the start and middle of its resting
// clips — `idle` and each held mode's `equip[i].idle` — and of its deployment and attack clips; the slots that show an
// attachment are compared. A resting clip that shares under half of its slots with both is another form of the model.
// Skips when the models are not downloaded (npm run setup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(ROOT + 'package.json');
const ASSETS = JSON.parse(readFileSync(ROOT + 'data/assets.json', 'utf8'));
let R = null, CORE = null;
try { R = require('@pixi-spine/runtime-3.8'); CORE = require('@pixi-spine/base'); } catch { /* pixi-spine missing: skip */ }

// resting clips that are another form on purpose, or not yet checked — each with its reason
const KNOWN = {
  // [미조사] 뮤엘시스's 流形 rests in A_Idle while its deployment / attack are the plain clips: its modes (Recharge, Default,
  // Melee, Range…) are not read for summons yet (the token prefab's mode hookers) — bundle test-A
  'token_10030_mlyss_wtrman idle': 'unchecked: summon mode hookers not extracted',
};

const SKIP_TYPES = R ? [R.BoundingBoxAttachment, R.PointAttachment, R.ClippingAttachment, R.PathAttachment] : [];
const loader = R && {
  newRegionAttachment: (_s, n) => new R.RegionAttachment(n), newMeshAttachment: (_s, n) => new R.MeshAttachment(n),
  newBoundingBoxAttachment: (_s, n) => new R.BoundingBoxAttachment(n), newPathAttachment: (_s, n) => new R.PathAttachment(n),
  newPointAttachment: (_s, n) => new R.PointAttachment(n), newClippingAttachment: (_s, n) => new R.ClippingAttachment(n),
};

/** Slots showing an attachment at the start and the middle of `clip`. */
function visible(data, clip) {
  const sk = new R.Skeleton(data);
  const a = data.findAnimation(clip);
  const out = new Set();
  for (const f of [0, 0.5]) {
    sk.setToSetupPose();
    a.apply(sk, 0, a.duration * f, false, [], 1, CORE.MixBlend.setup, CORE.MixDirection.mixIn);
    for (const s of sk.slots) {
      const at = s.getAttachment();
      if (!at || SKIP_TYPES.some((T) => at instanceof T) || s.color.a <= 0.01) continue;
      out.add(s.data.name);
    }
  }
  return out;
}

/** [label, spine] of every model with roles. */
function models() {
  const out = [];
  for (const [id, c] of Object.entries(ASSETS.chars || {})) for (const [side, s] of Object.entries(c.spine || {})) out.push([id, side, s]);
  for (const [id, t] of Object.entries(ASSETS.tokens || {})) {
    if (!t.spine) continue;
    if (t.spine.skel) out.push([id, null, t.spine]);
    else for (const [side, s] of Object.entries(t.spine)) out.push([id, side, s]);
  }
  return out.filter(([, , s]) => s && s.anims && s.skel);
}

const present = R && models().some(([, , s]) => existsSync(ROOT + 'public' + s.skel));

test('a resting clip shows the body its deployment or attack shows (not another form of the model)', { skip: !present && 'Spine models not downloaded or pixi-spine missing' }, () => {
  const bad = [], seen = new Set();
  let n = 0;
  for (const [id, side, s] of models()) {
    const p = ROOT + 'public' + s.skel;
    if (!existsSync(p)) continue;
    const data = new R.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(p)));
    const rests = [['idle', s.anims.idle, s.anims.deploy]];
    for (const [i, e] of Object.entries(s.anims.equip || {})) if (e && e.idle) rests.push([`equip${i}.idle`, e.idle, e.deploy ?? s.anims.deploy]);
    for (const [role, idle, deploy] of rests) {
      if (!idle || !data.findAnimation(idle)) continue;
      const refs = [...new Set([deploy, s.anims.attack?.loop].filter((x) => x && x !== idle && data.findAnimation(x)))];
      if (!refs.length) continue;
      n++;
      const A = visible(data, idle);
      const share = Math.max(...refs.map((ref) => { const B = visible(data, ref); return [...A].filter((x) => B.has(x)).length / Math.max(1, Math.min(A.size, B.size)); }));
      const key = `${id} ${role}`;
      if (share >= 0.5) continue;
      seen.add(key);
      if (!Object.hasOwn(KNOWN, key)) bad.push(`${id}${side ? ` ${side}` : ''} ${role} ${idle}: ${(share * 100).toFixed(0)}% of its slots shown by ${refs.join(' / ')}`);
    }
  }
  assert.ok(n > 300, `resting clips compared: ${n}`);
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(KNOWN).filter((k) => !seen.has(k)), [], 'a KNOWN entry no longer differs: drop it');
});
