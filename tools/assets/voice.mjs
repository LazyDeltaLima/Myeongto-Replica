// Operator voice in two languages (local patch, docs/LOCAL-PATCH.md). Upstream (#73, plan.mjs 干员战斗语音) plans ONE
// voice dump per build (`--voice-lang`, cn by default) into `audio.voice[charId][slot]`. Here the build defaults to
// Korean (fetch-assets `--voice-lang=kr`) and a Japanese twin of the very same slots goes to `audio.voiceJp`: the
// player picks Korean / Japanese / off per browser (public/js/voice.js), and the audio manager's voice() reads the
// chosen table. Same file names in every dub (`cn_NNN.mp3`), only the folder differs:
//   audio/voice/kr/<charId>/cn_NNN.mp3  ← sound_beta_2/voice_kr/…     audio/voice/jp/…  ← sound_beta_2/voice/…
// A line one dub lacks is simply left out (a 404 is a miss, never an error, and not worth a report line each).

import { VOICE_DIRS } from './audio.mjs';

/** The extra dubs planned beside the build's own (`--voice-lang`), manifest key → dub. */
export const VOICE_TWINS = Object.freeze({ voiceJp: 'jp' });

/**
 * The voice template of `from` rewritten to dub `to`: every leaf's `rel` (audio/voice/<from>/…) and source URL
 * (…/<VOICE_DIRS[from]>/…) point at the other dub's same file.
 * @param {object} voice plan template `audio.voice` ({ [charId]: { [slot]: leaf | leaf[] } })
 * @param {string} from VOICE_DIRS key of the build's voice
 * @param {string} to VOICE_DIRS key of the twin
 */
export function voiceTwin(voice, from, to) {
  if (!VOICE_DIRS[from] || !VOICE_DIRS[to] || from === to) return {};
  const relFrom = `audio/voice/${from}/`, relTo = `audio/voice/${to}/`;
  const urlFrom = `/${VOICE_DIRS[from]}/`, urlTo = `/${VOICE_DIRS[to]}/`;
  const altOf = (a) => ({ ...a, rel: String(a.rel).replace(relFrom, relTo), urls: a.urls.map((u) => String(u).replace(urlFrom, urlTo)), bytes: undefined });
  const leafOf = (l) => (l && Array.isArray(l.alts) ? { alts: l.alts.map(altOf).map(({ bytes, ...a }) => a) } : null);
  const out = {};
  for (const [charId, slots] of Object.entries(voice || {})) {
    const v = {};
    for (const [slot, l] of Object.entries(slots || {})) v[slot] = Array.isArray(l) ? l.map(leafOf).filter(Boolean) : leafOf(l);
    out[charId] = v;
  }
  return out;
}

/**
 * After resolveTemplate: drop the voice slots (and operators) left without a file in `audio.voice` and the twins, and
 * move the voice misses out of the general miss list. Mutates both arguments.
 * @param {any} body resolved manifest body
 * @param {{ misses: string[] }} resolved
 * @returns {{ lines: number, missing: number }}
 */
export function tidyVoice(body, resolved) {
  let lines = 0;
  for (const key of ['voice', ...Object.keys(VOICE_TWINS)]) {
    const byChar = body?.audio?.[key];
    if (!byChar || typeof byChar !== 'object') continue;
    for (const [id, slots] of Object.entries(byChar)) {
      for (const [slot, v] of Object.entries(slots || {})) {
        const list = (Array.isArray(v) ? v : [v]).filter((u) => typeof u === 'string' && u);
        if (!list.length) { delete slots[slot]; continue; }
        slots[slot] = Array.isArray(v) ? list : list[0];
        lines += list.length;
      }
      if (!Object.keys(slots || {}).length) delete byChar[id];
    }
  }
  const before = resolved.misses.length;
  resolved.misses = resolved.misses.filter((p) => !/^audio\.voice(Jp)?\./.test(String(p)));
  return { lines, missing: before - resolved.misses.length };
}
