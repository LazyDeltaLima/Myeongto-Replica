// Operator voice lines (local NAS patch, docs/LOCAL-PATCH.md): the official battle lines (작전 개시 / 선택 / 배치 / 작전 중) of every
// pool operator in Korean and Japanese, downloaded with the rest of the audio (tools/fetch-assets.mjs) from the
// ArknightsAssets2 `voice` branch (no jsDelivr mirror):
//   sound_beta_2/voice_kr/{charId}/cn_NNN.mp3   Korean
//   sound_beta_2/voice/{charId}/cn_NNN.mp3      Japanese (the default voice; the file names say cn_ in every language)
// The line numbers are the charword_table voiceIds (checked against ko_KR charword_table 2026-10-05), nine lines:
//   CN_020 작전 개시 → `start`, CN_021 / CN_022 오퍼레이터 선택 1·2 → `select`, CN_023 / CN_024 배치 1·2 → `deploy`,
//   CN_025 … CN_028 작전 중 1~4 (played on skill start) → `skill`.
// An operator without a line simply has no URL for it (a 404 is a miss, never an error).
//
// Manifest: audio.voice = { kr: { [charId]: { start, select, deploy, skill: [url…] } }, jp: { … } } — the client
// (public/js/voice.js) plays the language the player picked, or none.

import { RAW, joinUrl, safeName } from './sources.mjs';
import { kindOf } from './formats.mjs';

/** Voice language → folder under sound_beta_2. */
export const VOICE_LANGS = Object.freeze({ kr: 'voice_kr', jp: 'voice' });

/** Role → charword line numbers. */
export const VOICE_LINES = Object.freeze({ start: [20], select: [21, 22], deploy: [23, 24], skill: [25, 26, 27, 28] });

const lineFile = (n) => `cn_${String(n).padStart(3, '0')}.mp3`;

/**
 * Template of audio.voice for plan.mjs (manifest leaves: one alternative each).
 * @param {string[]} charIds operators to cover
 * @returns {{ [lang: string]: { [charId: string]: { [role: string]: { alts: object[] }[] } } }}
 */
export function voiceTemplate(charIds) {
  const out = {};
  for (const [lang, dir] of Object.entries(VOICE_LANGS)) {
    const byChar = {};
    for (const id of charIds) {
      if (typeof id !== 'string' || !/^char_\d+_[a-z0-9_]+$/i.test(id)) continue;
      const roles = {};
      for (const [role, lines] of Object.entries(VOICE_LINES)) {
        roles[role] = lines.map((n) => {
          const file = lineFile(n);
          const rel = `audio/voice/${lang}/${safeName(id)}/${file}`;
          return { alts: [{ rel, urls: [joinUrl(RAW.aa2voice, `${dir}/${id}/${file}`)], kind: kindOf(file) }] };
        });
      }
      byChar[id] = roles;
    }
    out[lang] = byChar;
  }
  return out;
}

/**
 * After resolveTemplate: drop the roles (and operators) left without a file, and move the voice misses out of the
 * general miss list (a missing line is expected — not worth one report line each). Mutates both arguments.
 * @param {any} body resolved manifest body
 * @param {{ misses: string[] }} resolved
 * @returns {{ lines: number, missing: number }}
 */
export function tidyVoice(body, resolved) {
  const voice = body?.audio?.voice;
  let lines = 0;
  for (const byChar of Object.values(voice || {})) {
    for (const [id, roles] of Object.entries(byChar)) {
      for (const [role, urls] of Object.entries(roles)) {
        if (Array.isArray(urls) && urls.length) lines += urls.length; else delete roles[role];
      }
      if (!Object.keys(roles).length) delete byChar[id];
    }
  }
  const before = resolved.misses.length;
  resolved.misses = resolved.misses.filter((p) => !String(p).startsWith('audio.voice.'));
  return { lines, missing: before - resolved.misses.length };
}
