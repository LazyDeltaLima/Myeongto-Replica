// 名片干员 (ui/seatArt.js): the operators a seat card can show, of every season the server offers (maintainer request
// 2026-11-18; the server's check is server/lobby.js cardAllowed) — the room's season's records from the page's data, the
// other seasons' from their own stores (data.seasonStore; a peer store tells its own subscribers, not the page's, when
// its chess / backups arrive, so this hook listens to each). The default card's pool stays the room's season's
// (cardContext `pool`): another season's data arriving never changes a card nobody picked.

import { useEffect, useReducer, useRef } from '../../vendor/hooks.module.js';
import { data, useData } from '../data.js';
import { useStore } from '../store.js';
import { offeredSeasonsOf } from './season.js';
import { cardOperators, mergeCardOperators, cardContext } from './seatArt.js';

const FILES = ['chess', 'backups'];
const settled = (st, n) => { const s = st.status(n); return s === 'ready' || s === 'missing'; };

/**
 * The seat cards' operator list (the picker's) and their cardContext.
 * @returns {{ list: any[], cards: ReturnType<typeof cardContext> }}
 */
export function useCardOperators() {
  useData(...FILES);
  const offered = useStore((s) => offeredSeasonsOf(s).join('|'));
  const own = data.season();
  const others = offered.split('|').filter((id) => id && id !== own);
  const key = others.join('|');
  const [, bump] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    const stores = others.map((id) => data.seasonStore(id)).filter(Boolean);
    const offs = stores.map((st) => st.subscribe((n) => { if (FILES.includes(n)) bump(); }));
    for (const st of stores) for (const n of FILES) st.load(n);
    return () => { for (const off of offs) off(); };
  }, [key]);
  const backups = data.get('backups');
  const stores = others.map((id) => data.seasonStore(id)).filter(Boolean);
  const inputs = [data.get('chess'), backups, ...stores.flatMap((st) => FILES.map((n) => st.get(n)))];
  const memo = useRef(/** @type {{ inputs: any[], value: any } | null} */ (null));
  const m = memo.current;
  if (m && m.inputs.length === inputs.length && m.inputs.every((v, i) => v === inputs[i])) return m.value;
  const mine = cardOperators(data.list('chess'), backups);
  const list = stores.length ? mergeCardOperators([mine, ...stores.map((st) => cardOperators(st.list('chess'), st.get('backups')))]) : mine;
  const pending = !backups || stores.some((st) => !FILES.every((n) => settled(st, n)));
  const value = { list, cards: cardContext(list, { pending, pool: mine }) };
  memo.current = { inputs, value };
  return value;
}
