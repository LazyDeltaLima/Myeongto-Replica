// Ported by hand from upstream 0.3.3 (GPL-3.0).
// 选择同盟方式's drawings (upstream PR #643 split 6; every drawing here is original, no game art):
//   RadarScene — the left picture: rings, a sweep, blips and bearing / range read-outs that keep changing;
//   JoinArt — the picture of the 加入同盟 card (a row of isometric blocks under a target).
// Decorative only (aria-hidden). Styles: css/screens/lobby.css (mf-*).
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { reducedMotion } from './device.js';

/**
 * 选择同盟方式's radar: rings, a sweep, blips and bearing / range read-outs that keep changing — held still under
 * 减少动态效果 (prefers-reduced-motion: the CSS stops the sweep and the blips, this the read-outs).
 */
export function RadarScene() {
  const [read, setRead] = useState({ deg: 139, range: 2732 });
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const id = setInterval(() => setRead((r) => ({ deg: (r.deg + 37) % 360, range: 2600 + Math.floor(Math.random() * 260) })), 1400);
    return () => clearInterval(id);
  }, []);
  return html`<svg class="mf-radar" viewBox="0 0 600 460" aria-hidden="true" focusable="false">
    <g class="mf-radar__grid">${Array.from({ length: 11 }, (_, k) => html`<line key=${`v${k}`} x1=${k * 60} y1="0" x2=${k * 60} y2="460" />`)}
      ${Array.from({ length: 8 }, (_, k) => html`<line key=${`h${k}`} x1="0" y1=${k * 60 + 20} x2="600" y2=${k * 60 + 20} />`)}</g>
    <g class="mf-radar__land"><path d="M210 120l40-18 52 6 30-14 46 20 20 34-8 30 26 22-14 34-40 10-22 30-46-6-30 18-28-26 6-34-26-20 10-36-24-22z" /></g>
    <circle class="mf-radar__ring mf-radar__ring--far" cx="270" cy="250" r="190" />
    <circle class="mf-radar__ring" cx="270" cy="250" r="130" />
    <circle class="mf-radar__ring mf-radar__ring--core" cx="270" cy="250" r="70" />
    <g class="mf-radar__sweep"><path d="M270 250 L270 60 A190 190 0 0 1 404 116 Z" /><line x1="270" y1="250" x2="404" y2="116" /></g>
    <circle class="mf-radar__blip" cx="350" cy="196" r="7" />
    <circle class="mf-radar__blip mf-radar__blip--b" cx="200" cy="320" r="5" />
    <path class="mf-radar__cross" d="M262 250h16M270 242v16" />
    <g class="mf-radar__read"><rect x="384" y="236" width="74" height="26" /><text x="421" y="254" text-anchor="middle">${read.deg}°</text>
      <rect x="384" y="276" width="74" height="26" /><text x="421" y="294" text-anchor="middle">${read.range}</text></g>
    <path class="mf-radar__frame" d="M120 110v-16h16M420 94h16v16M120 390v16h16M420 406h16v-16" />
  </svg>`;
}

/** 加入同盟's picture: a row of isometric blocks, the middle ones lit, a target over them. */
export function JoinArt() {
  const blocks = [];
  for (let k = 0; k < 10; k++) {
    const x = 18 + k * 38, lit = k >= 2 && k <= 7;
    blocks.push(html`<g key=${k} class=${`mf-blk${lit ? ' is-lit' : ''}`} style=${`--k:${k}`}>
      <path class="mf-blk__top" d=${`M${x} 70l18-9 18 9-18 9z`} />
      <path class="mf-blk__l" d=${`M${x} 70l18 9v26l-18-9z`} />
      <path class="mf-blk__r" d=${`M${x + 36} 70l-18 9v26l18-9z`} />
    </g>`);
  }
  return html`<svg class="mf-art mf-art--join" viewBox="0 0 400 120" aria-hidden="true" focusable="false">
    <path class="mf-art__wire" d="M200 0v14M150 30h28M222 30h28" />
    <path class="mf-art__tri" d="M193 14h14l-7 8z" />
    <rect class="mf-art__target" x="186" y="26" width="28" height="30" />
    <path class="mf-art__x" d="M193 34l14 14M207 34l-14 14" />
    ${blocks}
    <text x="330" y="22" text-anchor="middle">JOIN AN ALLIANCE</text>
  </svg>`;
}
