// Synthesised sound, no audio files: a WebAudio graph built lazily on the player's first
// keypress or click (browsers refuse sound before a gesture). An engine hum and a police
// siren run as standing nodes whose pitch and volume the game steers each frame; everything
// else — shots, punches, the till jingle, the phone buzz — is a short one-shot voice.
// Every call is safe with no context at all: the screenshot scenes run silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null;
  let siren = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.38;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.15, vol = 0.25, delay = 0 }) {
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      // A voice that fails to start is silence, never a crash.
    }
  }

  function noise({ dur = 0.2, vol = 0.3, freq = 900, q = 0.8, delay = 0 }) {
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + delay;
      const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      source.connect(filter).connect(gain).connect(master);
      source.start(t0);
    } catch {
      // Silence, as above.
    }
  }

  function startEngine() {
    if (!ctx || !master || engine) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 52;
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 26;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      gain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.2);
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(master);
      osc.start();
      sub.start();
      engine = { osc, sub, gain };
    } catch {
      engine = null;
    }
  }

  function startSiren() {
    if (!ctx || !master || siren) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 830;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.65;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      siren = { osc, lfo, gain };
    } catch {
      siren = null;
    }
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.38, ctx.currentTime, 0.03);
      return muted;
    },
    /** ratio is 0 at idle to 1 at top speed; on=false parks the engine voice. */
    engine(on, ratio) {
      if (!ctx) return;
      if (on) {
        startEngine();
        if (engine) {
          const f = 52 + ratio * 118;
          engine.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.06);
          engine.sub.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.06);
        }
      } else if (engine) {
        try {
          engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
          const dying = engine;
          window.setTimeout(() => {
            try { dying.osc.stop(); dying.sub.stop(); } catch { /* already stopped */ }
          }, 350);
        } catch { /* nothing to stop */ }
        engine = null;
      }
    },
    /** level is 0 (far or none) to 1 (a unit on top of the player). */
    siren(level) {
      if (!ctx) return;
      if (level > 0.01) {
        startSiren();
        if (siren) siren.gain.gain.setTargetAtTime(0.028 + level * 0.05, ctx.currentTime, 0.15);
      } else if (siren) {
        try {
          siren.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          const dying = siren;
          window.setTimeout(() => {
            try { dying.osc.stop(); dying.lfo.stop(); } catch { /* already stopped */ }
          }, 400);
        } catch { /* nothing to stop */ }
        siren = null;
      }
    },
    shot() {
      noise({ dur: 0.13, vol: 0.5, freq: 1600, q: 0.4 });
      tone({ type: 'square', from: 210, to: 60, dur: 0.09, vol: 0.18 });
    },
    punch() {
      tone({ type: 'sine', from: 130, to: 44, dur: 0.09, vol: 0.32 });
    },
    crash(strength) {
      noise({ dur: 0.22, vol: 0.2 + 0.3 * Math.min(1, strength), freq: 300, q: 0.3 });
    },
    pickup() {
      tone({ type: 'square', from: 840, to: 1260, dur: 0.09, vol: 0.16 });
    },
    cash() {
      tone({ type: 'square', from: 990, dur: 0.07, vol: 0.14 });
      tone({ type: 'square', from: 1320, dur: 0.07, vol: 0.14, delay: 0.07 });
      tone({ type: 'square', from: 1760, dur: 0.12, vol: 0.14, delay: 0.14 });
    },
    phone() {
      tone({ type: 'square', from: 1180, dur: 0.05, vol: 0.07 });
      tone({ type: 'square', from: 1180, dur: 0.05, vol: 0.07, delay: 0.09 });
    },
    sting() {
      tone({ type: 'triangle', from: 523, dur: 0.12, vol: 0.2 });
      tone({ type: 'triangle', from: 659, dur: 0.12, vol: 0.2, delay: 0.1 });
      tone({ type: 'triangle', from: 784, dur: 0.22, vol: 0.22, delay: 0.2 });
    },
    alarm() {
      tone({ type: 'square', from: 1560, dur: 0.09, vol: 0.1 });
      tone({ type: 'square', from: 1560, dur: 0.09, vol: 0.1, delay: 0.14 });
    },
  };
}
