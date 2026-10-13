// 关于本服务器: the licence and use notice the title screen opens from its 服务器信息 button under the login box — a short summary
// of NOTICE.md (unofficial, non-commercial, the game material is the rights holders', the code is GPL-3.0-or-later with
// no warranty, removal on request) with the source repository, so the players of a server see it without the README
// (maintainer decision 2026-10-13, docs/rules/ui.md 「타이틀 라이선스 고지」). 关闭 takes the focus, so the notice opens at its top.

import { html, Button, Modal } from './components.js';
import { ISSUES_URL } from './settings.js';
import { t, N_ } from '../../../shared/i18n.js';

/** The source repository: the issue tracker's repository (settings.js ISSUES_URL). */
export const REPO_URL = ISSUES_URL.replace(/\/issues$/, '');

/** The sections, in NOTICE.md's order (msgids: translated when shown, so a language switch reaches them). */
const SECTIONS = [
  [N_('非官方同人作品'), N_('本服务器是《明日方舟》限时玩法「卫戍协议：盟约」的非官方同人复刻，与上海鹰角网络（Hypergryph）、Yostar 及其关联方没有任何关联，也未获得其授权或认可。')],
  [N_('仅限非商业用途'), N_('仅供学习、学术研究和个人非商业娱乐。禁止任何形式的盈利：出售或付费分发、收费开服或付费房间、广告、打赏、赞助、会员等。')],
  [N_('游戏素材的版权'), N_('《明日方舟》相关的名称、角色、美术、音乐音效、文本与游戏数据，版权归上海鹰角网络及其授权方（Yostar 等）所有，不适用本项目的代码许可证。')],
  [N_('代码许可证'), N_('本项目自己编写的代码以 GPL-3.0-or-later 发布，可以在该许可证的条件下使用、修改和再分发。本项目按「原样」提供，不附带任何担保。许可证全文和第三方库的许可证见源代码仓库的 LICENSE、NOTICE.md 与 THIRD-PARTY-NOTICES.md。')],
  [N_('权利人联系'), N_('如果你是相关权利人，认为本项目的任何内容不妥，请在源代码仓库提交 Issue，我们会尽快删除相关内容。')],
];

/**
 * @param {{ open: boolean, onClose: Function }} props
 */
export function AboutModal({ open, onClose }) {
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('关于本服务器')} micro="ABOUT · LICENSE" width="7.4rem" class="about"
    actions=${html`<${Button} variant="primary" icon="check" data-autofocus onClick=${onClose}>${t('关闭')}<//>`}>
    ${SECTIONS.map(([head, text]) => html`<section key=${head} class="about__sec">
      <h3 class="about__head">${t(head)}</h3>
      <p class="modal__text">${t(text)}</p>
    </section>`)}
    <p class="about__src">
      <span>${t('源代码')}</span>
      <a href=${REPO_URL} target="_blank" rel="noopener noreferrer">${REPO_URL.replace(/^https:\/\//, '')}</a>
    </p>
    <p class="about__copy">Copyright (C) 2026 Stronghold-Protocol contributors · GPL-3.0-or-later</p>
  <//>`;
}
