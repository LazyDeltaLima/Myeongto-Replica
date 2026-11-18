#!/usr/bin/env node
// Where an operator's shot leaves its model: the mount point's spot at the moment the shot is fired, per attack mode.
//
// The official projectile starts at the shooter's mount point (`RangedAttack._GetMountPoint`: the `_mountPointType` of the
// mode's attack, MUZZLE or a special point — data/chess.json `shot.*.mount`) and its flight time is the board distance from
// there to the target's hit point over `_speed` (`BasicMovement.OnInit` / `ParacurveMovement.OnInit`: both points'
// `mapPositionV3`). Those points are Transforms of the battle model that follow a Spine bone (a BoneFollower; the bone's name
// is in tools/assets/local-char-points.json), so where the point is when the shot leaves is where that bone is in the mode's
// attack clip at its strike. The spot saved in the prefab is not that: it is the pose the model was saved in, often the Idle
// frame and for a quarter of the operators behind the model or at its feet (能天使's F_Muzzle is (−144, 76) in Idle and
// (118, 163) at her attack's OnAttack frame).
//
// So this script poses each shooter's default model (the battle Spine Front / Back that tools/fetch-assets.mjs downloads from
// the public fexli/ArknightsResource repository, docs/ASSETS.md — not the local client) in every attack clip that fires a flying shot, at the clip time the
// strike lands (server/sim/ai.js attackTiming: the OnAttack frame `hit`, else the end of the clip; `_preDelay` when the ability
// does not wait for the event), and writes the bone's spot in skeleton units (y up, the Front model facing right) to
// tools/assets/op-mount-poses.json:
//   { <spine id>: { "<clip>@<clip seconds>": { muzzle | sp<N>: { F: [x, y], B?: [x, y] } } } }
// B is absent when the model has no Back skeleton or the Back skeleton lacks the clip. tools/build-data.mjs reads it into
// the shots' `from` (opMounts).
//
// The target's end of the flight is its hit point (`Entity.hitMountPoint`). For an enemy whose hit point follows a bone
// (tools/assets/local-enemy-bindings.json `points.hit.*.bone`: 守墓石像, “斩胄之剑”, “破胄之锤”) the client reads the bone
// live; the data takes where it stands in the first frame of each attack mode's attack clip (the stance between swings),
// written under the enemy's prefab key as `"<clip>@0": { hit: { F: [x, y] } }` (an enemy model has one skeleton) and read
// by build-data's enemyHitAt. It reads data/ (the shots and attack clips build-data wrote), so the order after a change is
// build-data → this → build-data. Any shooter it cannot pose (no point record, no such bone or clip, no skeleton on disk)
// stops it with the list.
//
// Usage (repo root, after `npm run assets`): node tools/assets/mount-poses.mjs

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MOUNT_POSES_FILE = 'tools/assets/op-mount-poses.json';
const POINTS_FILE = 'tools/assets/local-char-points.json';
const ENEMY_POINTS_FILE = 'tools/assets/local-enemy-bindings.json';

/** The model point a shot's `mount` names (char_points.py keys), or null for one not on the model. */
export function mountKey(mount) {
  if (mount === 'MUZZLE') return 'muzzle';
  const m = /^SPECIAL_(\d+)$/.exec(String(mount));
  return m ? `sp${m[1]}` : null;
}

/** A shot record that flies from a model point (not GROUND: it leaves the feet). */
export function fliesFromPoint(s) {
  return !!s && typeof s.key === 'string' && Number(s.speed) > 0 && s.mount !== 'GROUND';
}

/**
 * The clip and clip time a flying shot of an attack record leaves at (ai.js attackTiming in clip seconds): a 要塞's ranged
 * swing (`ranged`) fires it; the strike is the OnAttack frame (`hit`, the end of the clip without one), or `_preDelay` when the
 * ability does not wait for the event (`wait` 0). null without a clip.
 */
export function shotClipAt(anim) {
  const a = anim?.ranged ?? anim;
  if (!a || typeof a.clip !== 'string' || !(a.dur > 0)) return null;
  const t = a.wait === 0 ? Math.min(a.pre > 0 ? a.pre : 0, a.dur) : Number.isFinite(a.hit) ? a.hit : a.dur;
  return { clip: a.clip, t: Math.round(t * 1000) / 1000 };
}

/** The pose key of a clip time ("Attack@0.3"). */
export const poseKey = (clip, t) => `${clip}@${t}`;

/**
 * Every (spine id, pose key, point key) a unit's flying shots need: [{ spine, key, point, clip, t, where }].
 * `shot` / `attackAnim` as data/chess.json has them; a skill entry null keeps the Default mode's.
 */
export function shotPoses(spine, shot, attackAnim, where = spine) {
  const out = [];
  if (!shot || typeof shot !== 'object') return out;
  const skills = Array.isArray(shot.skills) ? shot.skills : [];
  const recs = [[shot.base, attackAnim?.base, 'base'], ...skills.map((s, i) => [s, attackAnim?.skills?.[i] ?? attackAnim?.base, `skill ${i}`])];
  for (const [s, anim, label] of recs) {
    if (!fliesFromPoint(s)) continue;
    const point = mountKey(s.mount);
    const at = shotClipAt(anim);
    out.push({ spine, point, clip: at?.clip ?? null, t: at?.t ?? null, key: at ? poseKey(at.clip, at.t) : null, where: `${where} ${label} (${s.mount})` });
  }
  return out;
}

function units() {
  const files = ['data/chess.json', 'data/backups.json'];
  const seasons = join(ROOT, 'data/seasons');
  if (existsSync(seasons)) for (const d of readdirSync(seasons).sort()) files.push(`data/seasons/${d}/chess.json`, `data/seasons/${d}/backups.json`);
  const out = [];
  for (const rel of files) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const d = JSON.parse(readFileSync(abs, 'utf8'));
    const recs = rel.endsWith('backups.json') ? Object.values(d.units || {}) : Object.values(d);
    for (const u of recs) if (u && typeof u === 'object') out.push({ u, rel });
  }
  return out;
}

/** The enemies of data/ (each season's too) as { spine: its attackAnim } — one row per prefab key. */
function enemies() {
  const files = ['data/enemies.json'];
  const seasons = join(ROOT, 'data/seasons');
  if (existsSync(seasons)) for (const d of readdirSync(seasons).sort()) files.push(`data/seasons/${d}/enemies.json`);
  const out = new Map();
  for (const rel of files) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    for (const [key, e] of Object.entries(JSON.parse(readFileSync(abs, 'utf8')))) {
      const spine = e?.spine ?? key;
      if (!out.has(spine)) out.set(spine, { anim: e?.attackAnim ?? null, where: `${rel} ${key}` });
    }
  }
  return out;
}

/** The clips an enemy's hit point is posed in: its attack clip and each attack mode's (build-data enemyHitAt). */
export function enemyHitClips(attackAnim) {
  const clips = new Set();
  if (typeof attackAnim?.clip === 'string') clips.add(attackAnim.clip);
  for (const m of Object.values(attackAnim?.modes || {})) if (typeof m?.clip === 'string') clips.add(m.clip);
  return [...clips].sort();
}

function loadRuntime() {
  const require = createRequire(join(ROOT, 'package.json'));
  const r = require('@pixi-spine/runtime-3.8');
  const base = require('@pixi-spine/base');
  return { r, MixBlend: r.MixBlend ?? base.MixBlend, MixDirection: r.MixDirection ?? base.MixDirection, yDown: base.settings?.yDown !== false };
}

function main() {
  const assets = JSON.parse(readFileSync(join(ROOT, 'data/assets.json'), 'utf8'));
  const points = JSON.parse(readFileSync(join(ROOT, POINTS_FILE), 'utf8'));
  const need = new Map();   // spine → Map(key → { clip, t, points: Set })
  const problems = [];
  for (const { u, rel } of units()) {
    const spine = u.assets?.spine ?? u.charId;
    for (const p of shotPoses(spine, u.shot, u.attackAnim, `${rel} ${u.chessId ?? u.charId}`)) {
      if (!p.point) { problems.push(`${p.where}: a mount that is not a model point`); continue; }
      if (!p.key) { problems.push(`${p.where}: no attack clip to pose`); continue; }
      const m = need.get(spine) ?? new Map();
      need.set(spine, m);
      const e = m.get(p.key) ?? { clip: p.clip, t: p.t, points: new Set() };
      m.set(p.key, e);
      e.points.add(p.point);
    }
  }
  const { r, MixBlend, MixDirection, yDown } = loadRuntime();
  const loader = {
    newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
    newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
    newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n),
  };
  const skeletonOf = (url) => {
    if (typeof url !== 'string') return null;
    const abs = join(ROOT, 'public', url.replace(/^\/+/, ''));
    if (!existsSync(abs)) return undefined;
    const data = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(abs)));
    return { data, sk: new r.Skeleton(data) };
  };
  const round2 = (x) => Math.round(x * 100) / 100 || 0;
  const out = {};
  // enemies whose hit point follows a bone: that bone in the first frame of each attack clip
  const enemyPoints = JSON.parse(readFileSync(join(ROOT, ENEMY_POINTS_FILE), 'utf8'));
  for (const [spine, { anim, where }] of [...enemies()].sort(([a], [b]) => a.localeCompare(b))) {
    const h = enemyPoints[spine]?.points?.hit;
    const p = h?.F ?? h?.B;
    if (!p?.bone) continue;
    const clips = enemyHitClips(anim);
    if (!clips.length) { problems.push(`${where}: its hit point follows bone ${p.bone} and it has no attack clip to pose`); continue; }
    const e = assets.enemies?.[spine];
    const m = skeletonOf((e?.spineLocal ?? e?.spine)?.skel);
    if (!m) { problems.push(`${spine}: no skeleton ${m === undefined ? 'on disk (npm run assets)' : 'in data/assets.json'}`); continue; }
    const rows = {};
    for (const clip of clips) {
      const a = m.data.findAnimation(clip);
      if (!a) { problems.push(`${spine}: its skeleton has no clip ${clip}`); continue; }
      m.sk.setToSetupPose();
      a.apply(m.sk, 0, 0, false, null, 1, MixBlend.setup, MixDirection.mixIn);
      m.sk.updateWorldTransform();
      const b = m.sk.findBone(p.bone);
      if (!b) { problems.push(`${spine}: no bone ${p.bone} for its hit point`); continue; }
      rows[poseKey(clip, 0)] = { hit: { F: [round2(b.worldX), round2(yDown ? -b.worldY : b.worldY)] } };
    }
    out[spine] = rows;
  }
  for (const spine of [...need.keys()].sort()) {
    const sp = assets.chars?.[spine]?.spine;
    const F = skeletonOf(sp?.front?.skel), B = skeletonOf(sp?.back?.skel);
    if (!F) { problems.push(`${spine}: no Front skeleton ${F === undefined ? 'on disk (npm run assets)' : 'in data/assets.json'}`); continue; }
    const pts = points[spine];
    const rows = {};
    for (const [key, e] of [...need.get(spine)].sort(([a], [b]) => a.localeCompare(b))) {
      const row = {};
      for (const point of [...e.points].sort()) {
        const entry = pts?.[point];
        if (!entry) { problems.push(`${spine} ${key}: no ${point} point in ${POINTS_FILE} (tools/local-extract/char_points.py)`); continue; }
        const pose = (m, face) => {
          if (!m) return null;
          const anim = m.data.findAnimation(e.clip);
          if (!anim) return face === 'F' ? (problems.push(`${spine}: Front skeleton has no clip ${e.clip}`), null) : null;
          // the point's own side first, then the other side's bone (render/fxpoints.js pointOn)
          const mine = face === 'B' ? entry.B || entry.F : entry.F || entry.B;
          const other = mine === entry.F ? entry.B : entry.F;
          m.sk.setToSetupPose();
          anim.apply(m.sk, 0, e.t, false, null, 1, MixBlend.setup, MixDirection.mixIn);
          m.sk.updateWorldTransform();
          const b = [mine, other].map((p) => (p?.bone ? m.sk.findBone(p.bone) : null)).find(Boolean);
          if (!b) {
            // a point that follows no bone sits where the prefab put it
            if (!mine?.bone && Array.isArray(mine?.at)) return [round2(mine.at[0]), round2(mine.at[1])];
            problems.push(`${spine} ${face}: no bone ${mine?.bone ?? '(none)'} for ${point}`);
            return null;
          }
          return [round2(b.worldX), round2(yDown ? -b.worldY : b.worldY)];
        };
        const f = pose(F, 'F');
        if (!f) continue;
        const bk = B ? pose(B, 'B') : null;
        row[point] = { F: f, ...(bk ? { B: bk } : {}) };
      }
      rows[key] = row;
    }
    out[spine] = rows;
  }
  if (problems.length) {
    console.error(`mount-poses: ${problems.length} shooter(s) not posed, nothing written:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const head = {
    $comment: 'Where each operator\'s flying shot leaves its default model: the mount point\'s bone posed in the attack clip at '
      + 'the strike, skeleton units (y up, the Front model facing right; B = the Back model); and where an enemy\'s hit point '
      + 'that follows a bone stands in the first frame of each attack clip (enemy prefab keys, `hit`). Written by tools/assets/'
      + 'mount-poses.mjs from the public battle Spine models, tools/assets/local-char-points.json and local-enemy-bindings.json; '
      + 'read by tools/build-data.mjs.',
  };
  const lines = [` "$comment": ${JSON.stringify(head.$comment)}`, ...Object.keys(out).sort().map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(out[k])}`)];
  writeFileSync(join(ROOT, MOUNT_POSES_FILE), `{\n${lines.join(',\n')}\n}\n`);
  console.log(`${Object.keys(out).length} shooter model(s) → ${MOUNT_POSES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
