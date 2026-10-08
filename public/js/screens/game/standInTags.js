// public/js/screens/game/standInTags.js — 0.2.0 补位: the small 「替补」 tag under the player's own prep pieces (hand,
// 临时整备区, board) of a chess they do not own (m.private.standIns): the model is the stand-in's everywhere
// (render/app.js pieceInfo — the owner's recall of the official mode, 2026-10-06), the tag says it fields for another
// chess (the detail card names it). A 自选 piece gets no tag: its model is the operator's everywhere and the official
// game marks nothing under it (docs/LOCAL-PATCH.md 「0.2.0 병합」 — user report 2026-10-08, upstream
// 0def7bab's 「自选」 tag removed). Anchored to each piece's drawn body (view.pieceScreenRect,
// followed every frame like the direction wheel follows its tile); never takes the pointer, so the pieces stay
// draggable.

import { useEffect, useRef, useState } from '../../../vendor/hooks.module.js';
import { html } from '../../ui/components.js';
import { ownStandIn, standInLabel, standInTip } from '../../ui/gameLogic.js';

const rawOf = (view) => (view && view.raw) || view || null;

/**
 * The player's own prep pieces that fight as stand-ins: [{ uid, label, name, area, tip }] (hand, temp, board; `name` =
 * the stand-in's, `tip` = which chess it fields for).
 * @param {any} priv m.private @param {(id: string) => any} getChess @param {any} backups data/backups.json
 */
export function standInPieces(priv, getChess, backups) {
  const out = [];
  if (!priv || !Array.isArray(priv.standIns) || !priv.standIns.length) return out;
  const add = (p, area) => {
    if (!p || p.kind !== 'chess' || !Number.isInteger(p.uid)) return;
    const c = getChess(p.id);
    const si = ownStandIn(c, priv, backups);
    if (si) out.push({ uid: p.uid, label: standInLabel(si), name: si.name, area, tip: standInTip(si, c.name) });
  };
  for (const p of Array.isArray(priv.hand) ? priv.hand : []) add(p, 'hand');
  for (const p of Array.isArray(priv.temp) ? priv.temp : []) add(p, 'temp');
  for (const p of Array.isArray(priv.board) ? priv.board : []) add(p, 'board');
  return out;
}

/** @param {{ view: any, priv: any, getChess: (id: string) => any, backups: any }} props */
export function StandInTags({ view, priv, getChess, backups }) {
  const items = standInPieces(priv, getChess, backups);
  const [pos, setPos] = useState({});
  const last = useRef('');
  const key = items.map((it) => it.uid).join(',');
  useEffect(() => {
    const raw = rawOf(view);
    if (!raw || typeof raw.pieceScreenRect !== 'function' || !key) { last.current = ''; setPos({}); return undefined; }
    const uids = key.split(',').map(Number);
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const next = {};
      let sig = '';
      for (const uid of uids) {
        let r;
        try { r = raw.pieceScreenRect(uid); } catch { r = null; }
        if (!r || !(r.width > 0)) continue;
        // under the feet: the bottom centre of the drawn body
        next[uid] = { x: (r.left + r.right) / 2, y: r.bottom };
        sig += `${uid}:${next[uid].x.toFixed(1)},${next[uid].y.toFixed(1)};`;
      }
      if (sig !== last.current) { last.current = sig; setPos(next); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [view, key]);
  if (!items.length) return null;
  return html`<div class="sitags" aria-hidden="true" data-testid="standin-tags">
    ${items.map((it) => {
      const p = pos[it.uid];
      return p ? html`<span key=${it.uid} class=${`sitag sitag--${it.area}`} data-uid=${it.uid} data-standin="1" title=${it.tip}
        style=${`left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px`}>${it.label}</span>` : null;
    })}
  </div>`;
}
