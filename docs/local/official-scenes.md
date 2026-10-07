# Official per-stage 3D board scenes (local patch)

Moved from our former `docs/DESIGN.md` §15.1 when upstream 0.2.0 restructured its design documents (2026-10-07).
Overview and file list: `docs/LOCAL-PATCH.md` 「공식 스테이지 3D 씬」.

## Official per-stage scenes (local patch, 2026-10-06)

Correction of the 2026-09-28 finding: the EN client (hot update 2026-08-21 / 09-09) ships a **prebuilt Unity scene per
stage**: `scenes/activities/act{1,2}autochess/level_<stage>/level_<stage>.ab` (GameObjects, meshes, MeshRenderers,
static-batched "Combined Mesh (root: scene)" chunks), `…/level_<stage>/lightingdata.ab` (baked `Lightmap-N_comp_light`
RGBM + `_comp_shadowmask`, BC7 1024²) and `…_lighting_settings.ab`. No stage uses `map_autochess` (the procedural
board's atlas, the first-season look): act1 m01–m07, act2 m02 and m04 use `map_autochesssand` (desert), act2 m03
`map_kxmr` + `map_lm_center` (Kazimierz Major), act2 m01 `map_syracuse_metro`.

- Export: `tools/local-extract/scene_extract.py` (needs the client; LZ4AK via `aklz4.py`). Every active renderer is baked
  into board space (Unity tile (r,c) = Anchor (−10,−9,0) + (c, r, −height) → board (ux+10, uy+9, −uz), winding flipped)
  and merged per (material, lightmap, hidden set) → `scene/<stage>/scene.json` + `geom.bin` + `lm*.png`; theme textures
  → `scene/tex/` (Unity DXT5nm normal maps rebuilt to RGB, gloss → roughness). 14–36 groups per stage, 17–80 k
  triangles (act2 m01: 98 k). Like the board textures of upstream #186, every texture / lightmap gets a WebP copy the
  manifest lists: a material's `_MainTex` lossy (q95), every data map and the RGBM lightmaps / shadowmasks lossless
  (43 → 26 MB); `--webp` converts already-extracted PNGs without the client, `--no-webp` skips it.
- Geometry (`geom.bin` version 2, `scene_extract.py pack_geometry`): positions u16 on one grid per scene
  (`quant.pos` = origin + one span, so the mesh matrix scales uniformly and the same vertex in two groups decodes to the
  same point — no seams between groups), normals i8×4, uv0 / uv1 u16 on each group's range (`q.uv0` / `q.uv1`, folded into
  the group material's `uMainST` / `uUv1ST`), a one-colour group stores `colConst` instead of the array, indices u16 up to
  65 536 vertices (`idxType`); pos / uv1 / idx delta + zigzag + byte-shuffled (`quant.dzs`, `official.js unDzs`) so gzip
  on the wire packs them. 11 stages: 37.2 → 18.2 MB raw, 10.8 → 3.8 MB gzip (act2 m01 8.1 → 4.1 MB, gzip 2.1 → 0.71 MB);
  decode error ≤ 6·10⁻⁴ tile (position), 0.4° (normal), 5·10⁻⁵ (uv). The reader still takes version 1 (f32, u32
  indices); `--requantize` rewrites version-1 files in place without the client. act2 m01 is large because the metro
  scene is detailed (157 k vertices, no LODs and < 0.5 % duplicate vertices), not because of an export fault.
- Hidden sets: the level root's `_settings` (`HIDDEN@1` left normal field, `@2` right normal field, `@3` boss field,
  `hide: 1`, `_hideBakeOffset (50,0,0)`) list the tile graphics (`_gridPos`) and props the client hides while that
  part of the map is not in play; saved inactive. Groups carry their key and `scene.json hidden[key].tiles`; the
  renderer shows a set while its rect overlaps a built area (normal → @1, 联防 → @1 + @2, boss → @3).
- Heights: the level's `_mapSettings.highlandHeight` (desert 0.4, Kazimierz 0.3) is the one height of every HIGH tile
  (forbidden, separators, bench pads). While a stage is drawn from its scene the app passes it as
  `stage.highlandHeight`; `render/style.js tileTop` makes `tiles.js` / `layout.js` / bench placement use it.
- Rendering: `render/board3d/official.js` (one ShaderMaterial per material / lightmap, and per group for version-2
  geometry). **Gamma space** like the client (globalgamemanagers PlayerSettings `m_ActiveColorSpace` 0 = Gamma): textures
  and material / light colours are used as stored (`NoColorSpace`, no sRGB → linear) and the result is written without
  `colorspace_fragment`. The lit scene shaders (`Torappu/Scene/StandardRealtimeShadow`, `…/Standard`) carry Unity
  Standard's property set, so they follow `BRDF1_Unity_PBS` in gamma space: dielectric specular 0.2209
  (diffuse × 0.779), Disney diffuse, GGX + Smith joint with the square-rooted specular term, surface reduction
  1 − 0.28·r·pr, smoothness from `_MetallicGlossMap` × `_GlossMapScale` (else `_Glossiness`; the export keeps no
  metallic — ≈ 0 in every theme map); gi.diffuse = the RGBM lightmap decoded the gamma way, 5·a·rgb (`m_LightmapFormat` 2;
  the lighting settings bake indirect × 4, `m_UsingShadowmask`), the mixed main light × N·L × its shadowmask on top;
  gi.specular = the scene's reflection (`scene.json reflection`: the island's baked ReflectionProbe — act2 m01 / m03 —
  else RenderSettings' generated skybox reflection × `m_ReflectionIntensity`; mean colour per cube face, RGBM decoded
  5·a·rgb) along the reflected view. `_HG_VERTEX_COLOR_BLEND_ON` covers the albedo with `_BlendColor` by the
  vertex colour over `_BlendRangeCtrl.xy` × `_BlendStrength` (vertex-painted sand; the noise terms are not read) — the
  plain sand floors and half-covered patterned tiles of the official screenshots. Normal maps through a screen-space
  tangent frame, alpha test / blend per keyword, the shared focus falloff; a simplified StylizedWater
  (`_DeepWaterColor` × `_WaterColor` × `_WaterColorIntensity` at the deep colour's alpha over the sea floor);
  `DynamicWaterTile` tide warnings hidden). Before 2026-10-06 the maths ran in linear space (sRGB textures, the
  linear-space RGBM decode 34.49·a^2.2, `_BlendColor` × 2 as a tint): every product came out darker and more
  saturated — the desert sand orange-brown and grimy, the water vivid cyan. Measured on act1 m03 against a KR
  client battle frame at the same camera (mean RGB): walkway 191/180/167 (official 191/179/166), floor 216/186/139
  (208/176/132), rock blocks 192/149/103 (200/153/106), open water 34/61/71 (38/61/73). `BoardScene` loads the scene per stage (`opts.loadOfficial`)
  and keeps the procedural board until it arrives; with a scene it skips the procedural tiles, background and terrain
  water but keeps devices, gates, field edges and terrain FX. `?officialBoard=0` forces the procedural board.
- Devices (2026-10-06, user report: the 射击台 tiles of act1 m03 / m06 looked like fenced ground and undeployable marks):
  the scene holds only their sockets — the client instantiates the level's traps (`trap_1106_achplat` 射击台,
  `trap_1105_accrate` 阻隔工事) at run time from their prefabs (pkgrps/btl_pfb_tokens_*.ab
  `<key>/Graphic/Mesh/<key>`, meshes / textures in arts/maps/common/trap). With the official scene the procedural board
  mesh, where the 射击台 slabs lived, is not drawn, so they were missing. `scene_extract.py --devices` exports both
  models to `scene/devices` (scene format v2, board offsets from the tile centre, `devices[key].top` = the standing
  plate: 射击台 0.393 under its 0.465 rim); `loadOfficialScene` loads them with every stage and `built.devices` builds
  them, shaded like Torappu/Scene/Trap/Shadow (`albedo × (_Ambient + _Diffuse · N·L · main light)`, no lightmap —
  [ASSUMED] from the material's properties). BoardScene places a 射击台 on each active platform tile and the 阻隔工事
  model for the static and battle crates (`createDevice` switches once the scene is built); the app sets
  `stage.platformHeight` (style.js `tileTop('platform')`), so units on a 射击台 stand on its plate. The 土石结构 mound
  (act1 m06 `trap_032_mound`) keeps the procedural crate (its standing height is not settled) and so does the “双眼皮”
  turret (no prefab root in the token packs).
- Not done: the StylizedWater shader is approximated (one deep colour: no depth-based shallow colour near the shore — the
  official water turns teal-green there —, no shore foam, caustics or sky reflection); the
  tide (act2 m04 涨潮控制) does not move the water or toggle the warning tiles yet; static crates / blowers are still
  our devices (the scenes do not contain them).

---

