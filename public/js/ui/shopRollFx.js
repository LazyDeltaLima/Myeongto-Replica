// Local patch: the shop's special-goods refresh — a new pick-one offer (docs/rules/ui.md 「상점 화면」 갱신
// 애니메이션). The EN client's card_whole_refresh_special (ui/autochess/[uc]autochessbattle.ab, Animation on autochess_shop root_layout) plays, over
// the card row (root_fx: the slots' rect, RectMask2D), an additive orange sweep (grad: img_uifx_sweep_03 × #ffb500,
// game-shop.css .shopbar__sweep) and the UIParticle stars of particle_ctrl (active 1/60 s → 80/60 s), drawn here:
//   particle_star1  at (40, 17) from the centre, box 6.64 × 1.25; burst 3 × 5 every 0.01 s from 4/60 s; life 0.7–1.3;
//                   size 0.4–0.8 × a curve picked between two; colour between (1, .40, .29) and (1, .83, .16); vy .05–.2
//   particle_star2  left edge, 61.5 up; one at once; life 0.85, size 1.05; colour (1, .40, .29)–(1, .61, .16); vy .05
//   particle_star3  right edge −14.4, 42.2 up; one at once; life 1.1, size 1.2; colour (1, .40, .29)–(1, .55, .16); vy .1
// Particle units are 100 prefab units [추정: Local scaling under a 0.01-scale canvas — box 664 ≈ the row of 4 cards].
// Curves are the clip's keys joined linearly (their tangents not read). Texture img_uifx_star_4 (arts/ui/[uc]fxcommon.ab,
// local extraction ui/fxcommon) as a mask tinted with the colour; without it a soft dot. Math.random is fine: UI only.

import { useEffect, useRef } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { localAsset } from '../data.js';

const CTRL_ON = 1 / 60; // particle_ctrl m_IsActive on; off at 80/60 s = game-shop.css shop-stars-off (cuts every star)
const ORANGE = [1, 0.3997, 0.2925];
const SIZE_A = [[0, 0], [0.1, 1], [0.39, 0.22], [0.63, 0.61], [1, 0]];
const SIZE_B = [[0, 0], [0.12, 0.76], [0.24, 0.44], [0.42, 0.97], [0.61, 0.15], [0.74, 0.78], [1, 0]];
const ALPHA_12 = [[0, 0], [0.13, 1], [0.84, 1], [1, 0]];
const STARS = [
  { at: [0.5, 40, 17], box: [664, 125], burst: { t: 4 / 60, n: 3, cycles: 5, every: 0.01 }, life: [0.7, 1.3], size: [40, 80],
    sizeCurves: [SIZE_A, SIZE_B], colour: [ORANGE, [1, 0.83, 0.1647]], vy: [5, 20], alpha: ALPHA_12 },
  { at: [0, 0, 61.5], burst: { t: 0, n: 1, cycles: 1, every: 0 }, life: [0.85, 0.85], size: [105, 105],
    sizeCurves: [[[0, 0], [0.1, 1], [0.35, 0.28], [0.58, 0.87], [1, 0.42]]], colour: [ORANGE, [1, 0.6073, 0.1647]], vy: [5, 5], alpha: ALPHA_12 },
  { at: [1, -14.4, 42.2], burst: { t: 0, n: 1, cycles: 1, every: 0 }, life: [1.1, 1.1], size: [120, 120],
    sizeCurves: [[[0, 0], [0.23, 1], [0.45, 0.57], [0.69, 0.75], [1, 0.36]]], colour: [ORANGE, [1, 0.5516, 0.1647]], vy: [10, 10],
    alpha: [[0, 0], [0.19, 1], [0.77, 1], [1, 0]] },
];
const STEPS = 16; // keyframes per particle

const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lerp(lo, hi, Math.random());
function curveAt(keys, t) {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return t1 > t0 ? lerp(v0, v1, (t - t0) / (t1 - t0)) : v1;
    }
  }
  return keys[keys.length - 1][1];
}

/** Spawn the stars into `layer` (the size of `box`); returns the cleanup. `u` = px per prefab unit. */
function playStars(box, layer, u, tex) {
  const W = box.clientWidth, H = box.clientHeight;
  const spawn = (def, startS) => {
    const life = rand(...def.life);
    const size = rand(...def.size) * u;
    const pick = Math.random(), tint = Math.random();
    const c = def.colour[0].map((v, i) => Math.round(lerp(v, def.colour[1][i], tint) * 255));
    const vy = rand(...def.vy) * u;
    const [ax, dx, dy] = def.at;
    let x = ax * W + dx * u, y = H / 2 - dy * u;
    if (def.box) { x += rand(-0.5, 0.5) * def.box[0] * u; y -= rand(-0.5, 0.5) * def.box[1] * u; }
    const el = document.createElement('i');
    el.className = 'shopbar__star';
    el.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;background-color:rgb(${c.join(',')})`
      + (tex ? `;-webkit-mask-image:url("${tex}");mask-image:url("${tex}")` : ';border-radius:50%;background-image:none');
    if (!tex) el.style.background = `radial-gradient(circle, rgb(${c.join(',')}) 0 12%, rgba(${c.join(',')}, .45) 22%, transparent 50%)`;
    layer.appendChild(el);
    const frames = [];
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS;
      const s = def.sizeCurves.length > 1 ? lerp(curveAt(def.sizeCurves[0], t), curveAt(def.sizeCurves[1], t), pick) : curveAt(def.sizeCurves[0], t);
      frames.push({ offset: t, opacity: curveAt(def.alpha, t), transform: `translateY(${-vy * life * t}px) scale(${s})` });
    }
    el.animate(frames, { duration: life * 1000, delay: startS * 1000, fill: 'backwards' }).onfinish = () => el.remove();
  };
  for (const def of STARS) {
    const b = def.burst;
    for (let k = 0; k < b.cycles; k++) for (let n = 0; n < b.n; n++) spawn(def, CTRL_ON + b.t + k * b.every);
  }
  return () => layer.replaceChildren();
}

/** root_fx of the special refresh, laid over the card row (ui/shopBar.js, while `is-special`). */
export function RollFx() {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof box.animate !== 'function') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const unit = box.querySelector('.shopbar__rollunit');
    const u = (unit?.offsetWidth || 0) / 100;
    if (!(u > 0)) return undefined;
    const layer = box.querySelector('.shopbar__stars');
    return layer ? playStars(box, layer, u, localAsset('ui/fxcommon', 'img_uifx_star_4')) : undefined;
  }, []);
  return html`<span class="shopbar__rollfx" ref=${ref} aria-hidden="true"><span class="shopbar__rollunit"></span><span class="shopbar__sweep"></span><span class="shopbar__stars"></span></span>`;
}
