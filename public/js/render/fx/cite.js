// public/js/render/fx/cite.js — the client key a hand-written effect entry stands for (docs/rules/fx.md 「바인딩 표」).
// The renderer never reads `src`: test/render/fx-bindings.test.js looks each key up in the binding table (the buff
// templates' tools/assets/fx-templates.json, the client-only public/assets/local/fx/bindings.json) and checks that the
// entry's prefabs are that key's. A key is a buff template or buff key (`horn_t_1[reborn_effect]`; also matches the
// buffs that template creates), a projectile (`projectile_chr_ines_guard`), or a prefab path (`char_1046_sbell2/
// Others/Direction/Talents/1/SnowAccumulation`; also matches the GameObjects under it).

/**
 * Tag `entry` (a table value: an array spec, a plan function, an object) with its client key(s); returns `entry`.
 * Call it before Object.freeze.
 * @template T
 * @param {string | string[]} src
 * @param {T} entry
 * @returns {T}
 */
export function cite(src, entry) {
  Object.defineProperty(entry, 'src', { value: Object.freeze(Array.isArray(src) ? [...src] : [src]), enumerable: false });
  return entry;
}
