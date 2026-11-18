// 名片干员 (ui/seatArt.js): the operators a seat card can show — data/cards.json (shared/cardOperators.js, every season)
// cut to the seasons the server offers (maintainer request 2026-11-18; the server's check is server/lobby.js
// cardAllowed), named in the page's language. The default card's pool is the room's season's (cardContext `season`).

import { useMemo } from '../../vendor/hooks.module.js';
import { data, useData } from '../data.js';
import { useStore } from '../store.js';
import { offeredSeasonsOf } from './season.js';
import { cardOperators, cardContext } from './seatArt.js';

/**
 * The seat cards' operator list (the picker's) and their cardContext.
 * @returns {{ list: any[], cards: ReturnType<typeof cardContext> }}
 */
export function useCardOperators() {
  useData('cards');
  const offered = useStore((s) => offeredSeasonsOf(s).join('|'));
  const file = data.get('cards');
  const season = data.season();
  const locale = data.locale();
  return useMemo(() => {
    const list = cardOperators(file, { seasons: offered.split('|'), localeName: (zh) => data.localeName(zh) });
    return { list, cards: cardContext(list, { pending: !file, season }) };
  }, [file, offered, season, locale]);
}
