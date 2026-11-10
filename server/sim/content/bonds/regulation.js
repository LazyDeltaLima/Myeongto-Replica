// server/sim/content/bonds/regulation.js — the old entry of 卫戍协议：规程's own bond templates, kept for its importers:
// they are in bonds/nation/<bond>.js and bonds/general/arcane.js and run through bonds/dispatch.js.

import * as S from '../support/index.js';
import { recordBb } from './shared.js';

export { YAN_ELEMENTS } from './nation/yan.js';
export { SIRACUSA_STATUSES, abnormalCount } from './nation/siracusa.js';
export { ursusExtra } from './nation/ursus.js';

/** The bond's numbers when its record has template `key` — every buff of the record together —, else null. */
export const regulationBb = (bondId, key, scope) => recordBb(S.bondRecord(bondId, scope), String(key).replace(/(\[[^\]]*\])+$/, ''));
