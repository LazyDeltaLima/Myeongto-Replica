// Mixer snapshots (local patch, docs/LOCAL-PATCH.md 「스킬 특수 음악·대역 전환·모드 타격음」 → 「믹서 스냅샷」, maintainer report
// leftover: 归溟幽灵鲨's switch to her 替身). Used by public/js/audio.js (upstream) through short local-patch lines.
//
// The official client turns a snapshot of its AudioMixer `MainMixer` (EN sharedassets1.assets) on while certain banks play
// (audio_data.json snapshotBanks → manifest sfx.snap.hook, tools/assets/skill-mode-sfx.mjs snapshotSfx): every hook in
// the game data targets `AllLowpass_Reverb` — 归溟幽灵鲨's ON_BUFF_START.ghost2_switch2stand (p_skill_sharpstandborn, 5 s),
// 浊心斯卡蒂's deploy and skill starts (0.1 s). The snapshot's values against Default [데이터: the mixer constant]:
//   * BattleGameSound (the bus over Music, Voice and every battle group): Lowpass cutoff 22000 → 556 Hz, SFX Reverb on —
//     dry −6696 mB, room 0 mB, room HF −1594 mB, decay 5.7 s (HF ratio 1.01), reverb −219 mB, reverb delay 0.0464 s;
//   * Music: its own Lowpass 22000 → 5000 Hz (inside the 556 Hz above: not modelled);
//   * group volumes a few dB apart from Default (the snapshot keeps older levels) — not modelled.
// The hook banks themselves sit on `Independent` (under ~FX_VolumeControl, outside BattleGameSound): they stay clear while
// everything else sinks. Here: the sfx / voice / bgm channels meet on `mgr.bus`; sounds outside the bus (sfx.snap.outside,
// and UI one-shots — SFX_UI is outside it too) play on `mgr.sfxOutside`, straight to the master.
// Timing (client code, docs/rules/audio.md 「믹서 스냅샷」): `SnapshotBank.Play` (RVA 0x34B1240) transitions to the snapshot
// over the bank's `duration` after its `delay`; `SnapshotAudioAtom.Update` (RVA 0x34B1090) reverses it once every sound of the
// hook bank has ended, and `ReverseSnapshot` (RVA 0x34B1650) goes to the last still-active bank's snapshot, else to Default,
// over the ending bank's `duration` with no delay. Here: `delay` then `dur` s into the snapshot as the hook starts, held while
// any hook sounds (every hook of the data is AllLowpass_Reverb), the releasing hook's `dur` back to Default when the last ends.

const DB = (mB) => 10 ** (mB / 2000);
/** The modelled snapshots: the bus's lowpass cutoff (Hz), dry / reverb levels (linear) and the reverb's decay (s). */
export const SNAPSHOTS = Object.freeze({
  AllLowpass_Reverb: Object.freeze({ cutoff: 556, dry: DB(-6696), wet: DB(-219), decay: 5.7, preDelay: 0.0464 }),
});
const OPEN_CUTOFF = 22000;
const MIN_RAMP_S = 0.01;

const snapOf = (mgr) => mgr?.getManifest?.()?.audio?.sfx?.snap || null;

/** The hook entry ({ snap, dur, delay? }) of `url` when its bank turns a modelled snapshot on, else null. */
export function snapshotHookOf(mgr, url) {
  const h = snapOf(mgr)?.hook?.[url];
  return h && SNAPSHOTS[h.snap] ? h : null;
}

/** Whether `url`'s bank plays outside the filtered bus (sfx.snap.outside). */
export function outsideBus(mgr, url) {
  const s = snapOf(mgr);
  if (!s || !Array.isArray(s.outside)) return false;
  if (mgr._outsideOf !== s) { mgr._outsideOf = s; mgr._outside = new Set(s.outside); }
  return mgr._outside.has(url);
}

/** The node a sound of `url` connects to: outside the bus for `outside` banks, else the sfx channel. */
export function sfxOut(mgr, url, ui = false) {
  return (ui || outsideBus(mgr, url)) && mgr?.sfxOutside ? mgr.sfxOutside : mgr?.sfxGain;
}

/** A decaying stereo noise tail: the SFX Reverb's late reverb [추정: no early reflections, flat in frequency]. */
function impulse(ctx, s) {
  const rate = ctx.sampleRate || 48000;
  const pre = Math.round(s.preDelay * rate);
  const len = pre + Math.round(s.decay * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-6.91 * (i - pre)) / (s.decay * rate)); // −60 dB at `decay`
  }
  return buf;
}

/** The chain between the bus and the master (built on the first hook): bus → lowpass → dry → master, lowpass → reverb → wet → master. */
function chainOf(mgr, s) {
  if (mgr._snapChain) return mgr._snapChain;
  const c = mgr.ctx;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = OPEN_CUTOFF;
  lp.Q.value = 0.7071;
  const dry = c.createGain();
  const wet = c.createGain();
  wet.gain.value = 0;
  const verb = c.createConvolver();
  verb.buffer = impulse(c, s);
  mgr.bus.disconnect();
  mgr.bus.connect(lp);
  lp.connect(dry); dry.connect(mgr.master);
  verb.connect(wet); wet.connect(mgr.master);
  mgr._snapChain = { lp, dry, wet, verb, fed: false, idle: null };
  return mgr._snapChain;
}

function rampTo(param, v, t, dur, exp = false) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  if (exp) param.exponentialRampToValueAtTime(Math.max(1, v), t + dur);
  else param.linearRampToValueAtTime(v, t + dur);
}

/**
 * Turn hook `h`'s snapshot on as its sound starts. Returns the release to call when that sound ends (or is cut) —
 * idempotent; a no-op without Web Audio.
 * @param {any} mgr the AudioManager
 * @param {{ snap: string, dur: number, delay?: number }} h
 * @returns {() => void}
 */
export function holdSnapshot(mgr, h) {
  const s = SNAPSHOTS[h?.snap];
  if (!s || !mgr?.ctx || !mgr.bus || !mgr.master) return () => {};
  let ch;
  try { ch = chainOf(mgr, s); } catch { return () => {}; }
  const dur = Math.max(MIN_RAMP_S, Number(h.dur) || 0);
  const at = mgr.ctx.currentTime + Math.max(0, Number(h.delay) || 0);
  mgr._snapHolds = (mgr._snapHolds || 0) + 1;
  if (mgr._snapHolds === 1) {
    try {
      clearTimeout(ch.idle);
      if (!ch.fed) { ch.lp.connect(ch.verb); ch.fed = true; }
      rampTo(ch.lp.frequency, s.cutoff, at, dur, true);
      rampTo(ch.dry.gain, s.dry, at, dur);
      rampTo(ch.wet.gain, s.wet, at, dur);
    } catch { /* ignore */ }
  }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    mgr._snapHolds = Math.max(0, (mgr._snapHolds || 1) - 1);
    if (mgr._snapHolds > 0 || !mgr.ctx) return;
    try {
      const t = Math.max(mgr.ctx.currentTime, at);
      rampTo(ch.lp.frequency, OPEN_CUTOFF, t, dur, true);
      rampTo(ch.dry.gain, 1, t, dur);
      rampTo(ch.wet.gain, 0, t, dur);
      // the reverb stops listening once its tail has gone (a convolver costs while it is fed)
      clearTimeout(ch.idle);
      ch.idle = setTimeout(() => {
        if (mgr._snapHolds > 0 || !ch.fed) return;
        try { ch.lp.disconnect(ch.verb); } catch { /* ignore */ }
        ch.fed = false;
      }, (t - mgr.ctx.currentTime + dur + s.decay + 0.5) * 1000);
    } catch { /* ignore */ }
  };
}
