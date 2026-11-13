// 确定自选编队 — 规程's third start step "3/3" (PHASE.DIY_CHOOSE; server/match/match/diyChoose.js), laid out as the official
// auto_chess_diy_choose_state (CN client; two official screens of a 4-player co-op start, maintainer decision 2026-11-11
// to draw it after them). Left: the order rows of the strategy draft (bandDraft.js OrderRow: name card, the picked
// strategy, ✓ = ready for this step) with 本局信息 under them. Centre: one row per tier (auto_chess_diy_choose_level_view:
// Ⅴ above Ⅵ, 255 units high on the doc_color band) holding the seat's 自选编队 cards from the right, the tier's big mark
// (diy_choose_level_icon_<tier>_c, _g when the lineup has none of that tier) and 「n/2」 (num_bg); a tier without cards
// shows the empty figure and 「尚不存在n阶自选编队」. A card is the 干员调配 card (auto_chess_deploy_char_item_view: the
// slab, the portrait on its backing with the bottom shade and frame, the profession corner, the skill and module boxes,
// the tier mark, rarity, name and the bonds on their mint badges) without its level column (maintainer decision
// 2026-11-11); a chosen one wears the select outline in its tier's colour (Ⅴ #ebb85e, Ⅵ #fb752a), and one all of whose
// bonds are off this match is 本局禁用 (the server would leave it out of the shop) and cannot be chosen. A tap toggles a
// card; on a full tier the earliest choice of the tier makes room (maintainer decision 2026-11-11, gameLogic
// toggleDiyChoice). 准备就绪 locks the choice: the centre turns into panel_team_selected (the 已选择自选编队 mark) and the
// rows keep only the chosen cards (⌀NONE for a tier without one); 取消准备 unlocks it. Under it: the bond tip, the
// ready seats as the stage-info player figures (img_player_bg → img_player_confirmed) and the button.
// 自选预设 (DiyPresetBox, our feature — maintainer decision 2026-11-13: the strategy draft's row moved here, where the cards
// are): a band over the tier rows with the roster dropdown of the draft (bandDraft.js PresetPicker, without 保持当前编队),
// its tags and 记住此策略的预设. On entry it shows what my strategy applied when my pick landed (bandPresetChoice: its link,
// else its nation bond's preset, else 不使用预设); a change applies that roster (ui/factionPick.js applyPresetChoice, the chat
// faction follows) and sends it at once — the server takes the lineup until I ready, keeping a chosen card only where the
// same operator stays (match/diyChoose.js setDiyLineup). Locked while ready.
// The art is the season's extract (`diyChooseArt/…`, tools/local-extract/season_ui.py 'prefabs'); without it the CSS
// draws plain fills. Styles: css/screens/diychoose.css on the strategy draft's frame (css/screens/draft.css).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, TierChip, MicroLabel } from '../ui/components.js';
import { useGameData } from '../ui/gameComponents.js';
import { chessPortraitUrl, profIconUrl, bondIconUrl, skillRecordIconUrl, moduleTypeIconUrl, uiUrl } from '../ui/assetUrls.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfoDialog, matchInfoModel } from '../ui/matchInfo.js';
import { actions } from '../ui/gameActions.js';
import { sortedPlayers, diyPickOff, diyChooseRows, toggleDiyChoice, startStepCount } from '../ui/gameLogic.js';
import { slotRecord } from '../ui/diyModel.js';
import { useStore } from '../store.js';
import { data, localAsset } from '../data.js';
import { audio } from '../audio.js';
import { OrderRow, useOrderArt, draftArt, PresetPicker, presetChoiceTags } from './bandDraft.js';
import { diyPresetStore, bandPresetChoice, bandRecommendation, linkBand } from '../ui/diyPresets.js';
import { applyPresetChoice } from '../ui/factionPick.js';
import { flushDiySync } from '../ui/loadoutSync.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ', 5: 'Ⅴ', 6: 'Ⅵ' };
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** The sprites the CSS draws (custom properties on the screen): the season's extract, else none (the CSS fills). */
function artVars(m) {
  const art = (n) => uiUrl(m, `diyChooseArt/${n}`);
  const vars = {
    '--dc-doc': art('doc_color'), '--dc-num': art('num_bg'), '--dc-tips': art('tips'),
    '--dc-slab': art('img_char_chess_normal_bg'), '--dc-cardbg': art('img_char_card_bg'), '--dc-frame': art('img_cahr_card_frame'),
    '--dc-shade': art('img_char_card_bg_mask') || localAsset('ui/outer', 'img_char_card_bg_mask'),
    '--dc-outline': art('img_char_card_select_outline'), '--dc-bond': art('bkg_char_card_bond_active'),
    '--dc-ok': art('btn_confirm'), '--dc-cancel': art('cancel'), '--dc-side': art('team_list_left_side'),
    '--dc-pbg': localAsset('ui/outer', 'img_player_bg'), '--dc-pon': localAsset('ui/outer', 'img_player_confirmed'),
  };
  return Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}:url("${v}")`).join(';');
}

/** One 自选编队 card (auto_chess_diy_choose_char_view holding the 干员调配 card). */
function DiyCard({ m, slotId, pick, tier, chosen, off, locked, onTap }) {
  const D = { chess: data.get('chess'), backups: data.get('backups') };
  const rec = slotRecord(slotId, pick, D);
  const elite = slotRecord(slotId, pick, D, { elite: true });
  const name = rec?.name || pick?.charId || '?';
  const sk = rec?.skill ? skillRecordIconUrl(m, rec.skill, { empty: false }) : null;
  const mod = elite?.module?.active ? elite.module : null;
  const modIcon = mod ? moduleTypeIconUrl(data.get('local'), mod.type) : null;
  const prof = profIconUrl(m, rec?.profession);
  const none = uiUrl(m, 'diyChooseArt/img_module_no');
  const lv = uiUrl(m, `chessLevelSprite/chess_level_icon_${tier}`);
  const ban = uiUrl(m, 'diyChooseArt/ban');
  const state = off ? t('本局禁用') : chosen ? t('已选择') : null;
  return html`<button type="button" class=${cx('dccard', chosen && 'is-on', off && 'is-off')} data-tier=${tier} data-slot=${slotId}
      data-testid="diy-choose-card" aria-pressed=${chosen ? 'true' : 'false'} aria-disabled=${off || locked ? 'true' : 'false'}
      title=${state ? `${name} · ${state}` : name} onClick=${() => onTap(slotId)}>
    <i class="dccard__slab" aria-hidden="true"></i>
    <span class="dccard__char" aria-hidden="true">
      <span class="dccard__por">${rec ? html`<img src=${chessPortraitUrl(m, elite || rec)} alt="" draggable=${false} />` : null}</span>
      <i class="dccard__shade"></i><i class="dccard__frame"></i>
      <span class="dccard__prof">${prof ? html`<img src=${prof} alt="" draggable=${false} />` : null}</span>
      <span class="dccard__box is-skill">${sk || none ? html`<img src=${sk || none} alt="" draggable=${false} />` : null}</span>
      <span class="dccard__box is-mod">${modIcon || none ? html`<img src=${modIcon || none} alt="" draggable=${false} />` : null}</span>
    </span>
    <span class="dccard__lv" aria-hidden="true">${lv ? html`<img src=${lv} alt="" draggable=${false} />` : html`<${TierChip} tier=${tier} size="sm" />`}</span>
    <span class="dccard__stars" aria-hidden="true">${'★'.repeat(Math.max(1, Math.min(6, Number(rec?.rarity) || 6)))}</span>
    <span class="dccard__name">${name}</span>
    <span class="dccard__bonds" aria-hidden="true">${(rec?.bonds || []).slice(0, 3).map((b) => {
      const u = bondIconUrl(m, b);
      return html`<i key=${b} class="dccard__bond" style=${u ? `--b:url("${u}")` : null}></i>`;
    })}</span>
    ${chosen ? html`<i class="dccard__sel" aria-hidden="true"></i>` : null}
    ${off ? html`<span class="dccard__ban" aria-hidden="true">${ban ? html`<img src=${ban} alt="" draggable=${false} />` : null}<b>${t('本局禁用')}</b></span>` : null}
  </button>`;
}

/** One tier row (auto_chess_diy_choose_level_view): its cards from the right, the tier mark and n/limit. */
function TierRow({ m, row, ready, onTap }) {
  const has = row.slots.length > 0;
  const shown = ready ? row.slots.filter((s) => s.chosen) : row.slots;
  const glyph = uiUrl(m, `diyChooseLevelSprite/diy_choose_level_icon_${row.tier}_${has ? 'c' : 'g'}`);
  const empty = uiUrl(m, 'diyChooseArt/empty');
  const none = uiUrl(m, 'diyChooseArt/none');
  return html`<section class=${cx('dclv', !has && 'is-empty')} data-tier=${row.tier} data-testid="diy-choose-tier"
      aria-label=${t('{tier}阶 自选', { tier: row.tier })}>
    ${glyph ? html`<img class="dclv__glyph" src=${glyph} alt="" draggable=${false} />` : html`<b class="dclv__glyph is-text" aria-hidden="true">${ROMAN[row.tier] || row.tier}</b>`}
    ${ready ? null : html`<span class="dclv__num num" data-testid="diy-choose-count"><b>${row.count}</b>/${row.limit}</span>`}
    <div class="dclv__cards">${shown.map((s) => html`<${DiyCard} key=${s.slotId} m=${m} slotId=${s.slotId} pick=${s.pick} tier=${row.tier}
      chosen=${s.chosen} off=${s.off} locked=${ready} onTap=${onTap} />`)}</div>
    ${!ready && !has ? html`<div class="dclv__none">${empty ? html`<img src=${empty} alt="" draggable=${false} />` : null}
      <span>${t('尚不存在{tier}阶自选编队', { tier: row.tier })}</span></div>` : null}
    ${ready && !shown.length ? html`<span class="dclv__nonetag">${none ? html`<img src=${none} alt="NONE" draggable=${false} />` : 'NONE'}</span>` : null}
  </section>`;
}

/** panel_team_selected: the 已选择自选编队 mark (select_doc_chess ×4, select_doc_main, select_doc_arrow, select_doc_text). */
function DoneMark({ m }) {
  const art = (n) => uiUrl(m, `diyChooseArt/${n}`);
  const chess = art('select_doc_chess');
  return html`<div class="dcdone" data-testid="diy-choose-done">
    <span class="dcdone__mark" aria-hidden="true">
      ${chess ? ['tl', 'tr', 'bl', 'br'].map((k) => html`<i key=${k} class=${`dcdone__chess is-${k}`} style=${`--s:url("${chess}")`}></i>`) : null}
      ${art('select_doc_main') ? html`<i class="dcdone__main" style=${`--s:url("${art('select_doc_main')}")`}></i>` : null}
      ${art('select_doc_arrow') ? html`<i class="dcdone__arrow" style=${`--s:url("${art('select_doc_arrow')}")`}></i>` : null}
    </span>
    <b class="dcdone__text">${t('已选择自选编队')}</b>
  </div>`;
}

/**
 * 自选预设 on 确定自选编队 (see the header): `bandId` = my strategy; `locked` while ready (or a request runs).
 * @param {{ bandId: string, band: any, off: string[]|null, locked: boolean }} props
 */
export function DiyPresetBox({ bandId, band, off, locked }) {
  const links = useStore((s) => s.links, Object.is, diyPresetStore);
  const presets = useStore((s) => s.presets, Object.is, diyPresetStore);
  const [picked, setPicked] = useState(null);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const choice = picked ?? bandPresetChoice(bandId, band, links, presets);
  const link = links?.[bandId] ?? null;
  const tags = presetChoiceTags(choice, { link, rec: bandRecommendation(band), off });
  const TAG = { linked: ['link', t('已关联')], rec: ['rec', t('推荐')], off: ['off', t('本局禁用')] };
  const pick = async (v) => {
    setPicked(v);
    if (remember) linkBand(bandId, v);
    setBusy(true);
    await applyPresetChoice(v);
    await flushDiySync();
    setBusy(false);
  };
  const keep = (v) => {
    setRemember(v);
    if (v && picked != null) linkBand(bandId, picked);
  };
  return html`<div class=${cx('dcpreset', locked && 'is-locked')} data-testid="diy-choose-preset">
    <span class="dcpreset__k"><${MicroLabel} tone="mint">DIY PRESET</${MicroLabel}><b>${t('自选预设')}</b></span>
    <${PresetPicker} choice=${choice} presets=${presets} off=${off} locked=${locked || busy} onChoice=${pick} keep=${false} />
    ${tags.map((k) => html`<span key=${k} class=${`draft-preset__tag is-${TAG[k][0]}`}>${TAG[k][1]}</span>`)}
    <label class="dcpreset__keep" title=${t('选择阵营预设时聊天阵营一并切换')}><input type="checkbox" checked=${remember} disabled=${locked}
      onChange=${(e) => keep(e.currentTarget.checked)} />${t('记住此策略的预设')}</label>
    <span class="dcpreset__hint">${t('切换预设后，下方卡片换成该预设的编队；已选择的卡片只保留干员未变的位置')}</span>
  </div>`;
}

export function DiyChooseScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const roomSolo = useStore((s) => s.room?.mode === 'solo');
  const gd = useGameData();
  const m = gd.m;
  const view = priv?.diyChoose || null;
  const ready = !!view?.ready;
  const [exit, setExit] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // the choice in the order it was made (the server keeps it in lineup order): a tap on a full tier drops the earliest
  const srv = Array.isArray(view?.chosen) ? view.chosen : [];
  const [order, setOrder] = useState(srv);
  const inFlight = useRef(0);
  const srvKey = srv.join(',');
  useEffect(() => { if (!inFlight.current && !sameSet(srv, order)) setOrder(srv); }, [srvKey]);

  const off = new Set(Array.isArray(pub?.disabledBonds) ? pub.disabledBonds : []);
  const D = { chess: data.get('chess'), backups: data.get('backups') };
  const getChess = (id) => data.lookup('chess', id);
  const rows = diyChooseRows(view, order, (slotId, pick) => diyPickOff(slotId, pick, off, getChess, D));
  const tap = (slotId) => {
    if (!view || ready || busy) return;
    const slot = rows.flatMap((r) => r.slots).find((s) => s.slotId === slotId);
    if (!slot || slot.off) return;
    const next = toggleDiyChoice(order, slotId, view.perTier);
    setOrder(next);
    audio.sfx('tab', { volume: 0.5 });
    inFlight.current++;
    void actions.diyChoose(next).finally(() => { inFlight.current--; });
  };
  const readyUp = async (cancel) => {
    if (!view || busy) return;
    setBusy(true);
    await actions.diyReady(cancel);
    setBusy(false);
  };

  const mode = gd.config?.modes?.[pub?.modeId];
  const solo = roomSolo || mode?.type === 'SINGLE' || String(pub?.modeId || '').includes('single');
  const players = sortedPlayers(pub);
  const draftOrder = Array.isArray(pub?.draft?.order) ? pub.draft.order : [];
  const listed = solo ? players.filter((p) => p.playerId === myId)
    : [...draftOrder.map((pid) => players.find((p) => p.playerId === pid)).filter(Boolean), ...players.filter((p) => !draftOrder.includes(p.playerId))];
  const artOf = useOrderArt(gd, myId);
  const orderArt = draftArt('order');
  const readyN = players.filter((p) => p.ready).length;
  const total = Number(pub?.diyChoose?.seconds) > 0 ? Number(pub.diyChoose.seconds) : null;
  const info = infoOpen ? matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: D }) : null;
  const pon = localAsset('ui/outer', 'img_player_confirmed');
  // 自选预设: my strategy's roster, for a seat with a lineup view (a spectator has none)
  const presetBand = view ? (priv?.bandId || players.find((p) => p.playerId === myId)?.bandId || null) : null;

  return html`<div class="screen draft dchoose" style=${artVars(m)} data-testid="diy-choose">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${startStepCount(gd.config)} of=${startStepCount(gd.config)} title=${t('确定自选编队')} micro="DIY // LINEUP CHECK"
      pub=${total ? pub : { ...pub, deadline: 0 }} total=${total} config=${gd.config} onExit=${() => setExit(true)} />
    <main class="draft__main dchoose__main">
      <aside class=${cx('draft-order', !solo && listed.length > 4 && 'is-8', orderArt && 'has-art')} style=${orderArt || null}>
        ${orderArt ? html`<i class="draft-order__back" aria-hidden="true"></i>` : null}
        <div class="draft-order__deco" aria-hidden="true"><i></i><i></i><span>STRONGHOLD PROTOCOL<br />${solo ? 'SINGLE OPERATOR' : 'COLLABORATIVE SYSTEM'}</span></div>
        <div class="draft-order__rows">
          ${listed.map((p, i) => html`<${OrderRow} key=${p.playerId} p=${p} i=${i} picked=${p.bandId || (p.playerId === myId ? priv?.bandId : null) || null}
            cur=${false} self=${p.playerId === myId} ready=${!!p.ready} checked=${!!p.ready} gd=${gd} art=${artOf(p)} />`)}
        </div>
        <div class="draft-order__side">
          <${Button} variant="secondary" icon="search" block=${true} class="draft-order__info" data-testid="match-info-open"
            aria-haspopup="dialog" onClick=${() => setInfoOpen(true)}>${t('本局信息')}<//>
        </div>
      </aside>
      <div class=${cx('dchoose__body', ready && 'is-ready', presetBand && 'has-preset')}>
        ${ready ? html`<${DoneMark} m=${m} />` : null}
        <div class="dchoose__levels">
          ${presetBand ? html`<${DiyPresetBox} key=${presetBand} bandId=${presetBand} band=${gd.band(presetBand)} off=${pub?.disabledBonds ?? null} locked=${ready || busy} />` : null}
          ${view ? rows.map((row) => html`<${TierRow} key=${row.tier} m=${m} row=${row} ready=${ready} onTap=${tap} />`)
            : html`<p class="dchoose__spec t-dim">${t('观战中')}</p>`}
        </div>
        <div class="dchoose__foot">
          <p class="dchoose__tip">${t('*阵容不完整的盟约难以在模拟中激活')}</p>
          <div class="dchoose__ready" role="status" aria-label=${`${t('已就绪')} ${readyN}/${players.length}`}>
            <span class="dchoose__ppl" aria-hidden="true">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'is-on', !pon && 'is-plain')}></i>`)}</span>
            <small>${t('已就绪')}</small>
          </div>
          ${view ? html`<button type="button" class=${cx('dchoose__btn', ready && 'is-cancel')} data-testid="diy-choose-ready" disabled=${busy}
            onClick=${() => readyUp(ready)}>${ready ? t('取消准备') : t('准备就绪')}</button>` : null}
        </div>
      </div>
    </main>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
    <${MatchInfoDialog} open=${infoOpen} onClose=${() => setInfoOpen(false)} model=${info} />
  </div>`;
}
