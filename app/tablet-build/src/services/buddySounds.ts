// Buddy ringtones — synthesized per-species call sounds, Web Audio only.
// Zero audio files. Each species gets a loud, distinctive, LOOPING signature
// phrase so a call never gets missed. Cute-but-quiet fails the bar.
//
// Contract: start(species?) begins looping, stop() silences, `ringing` reports.
// When real recorded buddy sounds land, swap the phrase synths for <audio>
// loops and keep this contract — callers won't care.

/** One phrase of a species' ring. Oscillators must stop themselves. */
type Phrase = (ctx: AudioContext, out: GainNode) => void;

function tone(
  ctx: AudioContext, out: GainNode,
  opts: {
    type: OscillatorType; from: number; to?: number;
    at?: number; dur: number; vol?: number; vibrato?: { rate: number; depth: number };
  },
): void {
  const t0 = ctx.currentTime + (opts.at || 0);
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.9, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  if (opts.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = opts.vibrato.rate;
    const depth = ctx.createGain();
    depth.gain.value = opts.vibrato.depth;
    lfo.connect(depth); depth.connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + opts.dur + 0.05);
  }
  osc.connect(g); g.connect(out);
  osc.start(t0); osc.stop(t0 + opts.dur + 0.05);
}

const PHRASE_MS = 1400;

const PHRASES: Record<string, Phrase> = {
  // Biscuit's woof: two sharp low barks. Impossible to sleep through.
  dog: (ctx, out) => {
    tone(ctx, out, { type: 'square', from: 170, to: 110, dur: 0.16, vol: 1 });
    tone(ctx, out, { type: 'square', from: 170, to: 110, at: 0.22, dur: 0.16, vol: 1 });
  },
  // Miso's meow: the classic demanding glide.
  cat: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 750, to: 1050, dur: 0.28, vol: 1 });
    tone(ctx, out, { type: 'sine', from: 1050, to: 580, at: 0.28, dur: 0.3, vol: 1 });
  },
  // Finn's ehhhh: high warbly dolphin squeal.
  dolphin: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 2000, to: 1700, dur: 0.7, vol: 0.8, vibrato: { rate: 28, depth: 320 } });
  },
  // Guppy's bloop bloop: exaggerated, not realistic. Two descending bloops.
  goldfish: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 450, to: 130, dur: 0.2, vol: 1 });
    tone(ctx, out, { type: 'sine', from: 420, to: 120, at: 0.3, dur: 0.24, vol: 1 });
  },
  // Lulu's sparkle: bright triangle arpeggio, ascending.
  unicorn: (ctx, out) => {
    const notes = [880, 1174, 1568, 1174, 880];
    notes.forEach((f, i) => tone(ctx, out, { type: 'triangle', from: f, at: i * 0.13, dur: 0.14, vol: 0.9 }));
  },
  // Default khaos ping: the siren. Loud, warbly, rhythmic.
  khaos: (ctx, out) => {
    const t0 = ctx.currentTime;
    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.value = 740;
    const warble = ctx.createOscillator();
    warble.type = 'square'; warble.frequency.value = 3;
    const warbleDepth = ctx.createGain(); warbleDepth.gain.value = 130;
    warble.connect(warbleDepth); warbleDepth.connect(carrier.frequency);
    const gate = ctx.createGain(); gate.gain.value = 0.5;
    const gateLfo = ctx.createOscillator();
    gateLfo.type = 'square'; gateLfo.frequency.value = 6;
    const gateDepth = ctx.createGain(); gateDepth.gain.value = 0.5;
    gateLfo.connect(gateDepth); gateDepth.connect(gate.gain);
    carrier.connect(gate); gate.connect(out);
    carrier.start(t0); warble.start(t0); gateLfo.start(t0);
    const stopAt = t0 + PHRASE_MS / 1000;
    carrier.stop(stopAt); warble.stop(stopAt); gateLfo.stop(stopAt);
  },
};

/** Species id → phrase. Unknown ids (incl. 'custom' uploads) get the khaos siren. */
export function phraseFor(speciesId?: string | null): Phrase {
  if (speciesId && PHRASES[speciesId]) return PHRASES[speciesId];
  return PHRASES.khaos;
}

export class BuddyRingtone {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  get ringing(): boolean {
    return this.ctx !== null;
  }

  /** Start looping `species`' signature sound. Defaults to the khaos siren. */
  start(species?: string | null): void {
    this.stop();
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      const out = ctx.createGain();
      out.gain.value = 0.4; // loud — this is a ringtone, not ambience
      out.connect(ctx.destination);
      const play = phraseFor(species);
      play(ctx, out);
      this.timer = setInterval(() => {
        if (this.ctx === ctx) play(ctx, out);
      }, PHRASE_MS);
    } catch {
      this.ctx = null;
    }
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      try { void ctx.close(); } catch { /* already closed */ }
    }
  }
}
