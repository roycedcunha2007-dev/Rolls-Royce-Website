import gsap from "gsap";

/*
 * Procedural Rolls-Royce V12 — no audio assets.
 *
 * A Rolls-Royce 6.75L twin-turbo V12 is famously the quietest engine ever
 * fitted to a motor car. At idle you can barely hear it — you feel a deep,
 * silken tremor through the cabin floor. The start sequence is:
 *
 *   1. Electric starter whirr (high, thin, servo-like)
 *   2. First combustion catch — a single deep "whoomph"
 *   3. Brief rev flare as all 12 cylinders fire
 *   4. Settle to a near-silent idle rumble
 *
 * Modes after idle:
 *   cabin  — heavily muffled behind double glazing
 *   engine — bonnet open, brighter mechanical detail
 *   drive  — RPM-linked pitch, more presence
 */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.mode = "idle";
    this.rpmRatio = 0;
    this._starting = false;
    this._startNodes = [];
  }

  _ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    /* ---- persistent idle tone chain ---- */

    // Primary V12 fundamental — very low sawtooth for harmonic richness
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = 28;

    // Sub-bass sine for the chest-felt rumble
    this.sub = this.ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 14;

    // Second harmonic for body
    this.harm2 = this.ctx.createOscillator();
    this.harm2.type = "triangle";
    this.harm2.frequency.value = 56;

    // Low-pass to keep the tone silky, not buzzy
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 100;
    this.filter.Q.value = 0.5;

    // A gentle high-shelf cut to remove any harshness
    this.hiShelf = this.ctx.createBiquadFilter();
    this.hiShelf.type = "highshelf";
    this.hiShelf.frequency.value = 800;
    this.hiShelf.gain.value = -12;

    // Master gain
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    // Sub gain
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;

    // Harmonic gain
    this.harmGain = this.ctx.createGain();
    this.harmGain.gain.value = 0;

    // Slow LFO to add a living, breathing quality to the idle
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.35;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.003;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.gain.gain);

    // Routing
    this.osc.connect(this.filter);
    this.filter.connect(this.hiShelf);
    this.hiShelf.connect(this.gain);
    this.harm2.connect(this.harmGain);
    this.harmGain.connect(this.hiShelf);
    this.sub.connect(this.subGain);
    this.gain.connect(this.ctx.destination);
    this.subGain.connect(this.ctx.destination);

    this.osc.start();
    this.sub.start();
    this.harm2.start();
    this.lfo.start();
  }

  _noise(duration) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  setEnabled(on) {
    const wasOff = !this.enabled;
    this.enabled = on;
    if (on) {
      this._ensure();
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (wasOff) {
        this._startSequence();
        return;
      }
    } else {
      this._cleanupStart();
      this._starting = false;
    }
    this._apply();
  }

  setMode(mode) {
    this.mode = mode;
    if (!this._starting) this._apply();
  }

  setRpm(ratio) {
    this.rpmRatio = ratio;
    if (this.enabled && this.mode === "drive" && this.ctx && !this._starting) {
      const f = 44 + ratio * 36;
      this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.14);
      this.sub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.14);
      this.harm2.frequency.setTargetAtTime(f * 2, this.ctx.currentTime, 0.14);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  The Start Sequence                                                 */
  /* ------------------------------------------------------------------ */
  _startSequence() {
    if (!this.ctx) return;
    this._starting = true;
    this._cleanupStart();
    const t = this.ctx.currentTime;
    const nodes = [];

    /* Zero the persistent oscillators during the sequence */
    this.gain.gain.cancelScheduledValues(t);
    this.subGain.gain.cancelScheduledValues(t);
    this.harmGain.gain.cancelScheduledValues(t);
    this.osc.frequency.cancelScheduledValues(t);
    this.sub.frequency.cancelScheduledValues(t);
    this.harm2.frequency.cancelScheduledValues(t);
    this.filter.frequency.cancelScheduledValues(t);

    this.gain.gain.setValueAtTime(0, t);
    this.subGain.gain.setValueAtTime(0, t);
    this.harmGain.gain.setValueAtTime(0, t);

    /* ---- Phase 1: Electric starter motor (0 → 1.1s) ---- */
    // A refined electric servo whirr — sine tone with slight wobble
    const starter = this.ctx.createOscillator();
    starter.type = "sine";
    starter.frequency.setValueAtTime(320, t);
    starter.frequency.linearRampToValueAtTime(380, t + 0.3);
    starter.frequency.setValueAtTime(380, t + 0.3);
    // Slight strain as compression builds
    starter.frequency.linearRampToValueAtTime(360, t + 0.7);
    starter.frequency.linearRampToValueAtTime(390, t + 1.0);

    const starterGain = this.ctx.createGain();
    starterGain.gain.setValueAtTime(0, t);
    starterGain.gain.linearRampToValueAtTime(0.025, t + 0.06);
    starterGain.gain.setValueAtTime(0.025, t + 0.85);
    starterGain.gain.exponentialRampToValueAtTime(0.001, t + 1.15);

    const starterLP = this.ctx.createBiquadFilter();
    starterLP.type = "lowpass";
    starterLP.frequency.value = 900;

    starter.connect(starterLP).connect(starterGain).connect(this.ctx.destination);
    starter.start(t);
    starter.stop(t + 1.2);
    nodes.push(starter);

    // Subtle mechanical ticking from starter solenoid engagement
    const tick = this.ctx.createOscillator();
    tick.type = "square";
    tick.frequency.setValueAtTime(12, t);
    const tickLP = this.ctx.createBiquadFilter();
    tickLP.type = "lowpass";
    tickLP.frequency.value = 200;
    const tickGain = this.ctx.createGain();
    tickGain.gain.setValueAtTime(0, t);
    tickGain.gain.linearRampToValueAtTime(0.012, t + 0.04);
    tickGain.gain.setValueAtTime(0.012, t + 0.8);
    tickGain.gain.exponentialRampToValueAtTime(0.001, t + 1.05);

    tick.connect(tickLP).connect(tickGain).connect(this.ctx.destination);
    tick.start(t);
    tick.stop(t + 1.1);
    nodes.push(tick);

    /* ---- Phase 2: Combustion catch (1.0s) ---- */
    const catchTime = t + 1.0;

    // Deep, pressurised "whoomph" — a single short sine pulse, NOT noise
    const catchOsc = this.ctx.createOscillator();
    catchOsc.type = "sine";
    catchOsc.frequency.setValueAtTime(80, catchTime);
    catchOsc.frequency.exponentialRampToValueAtTime(28, catchTime + 0.3);
    const catchGain = this.ctx.createGain();
    catchGain.gain.setValueAtTime(0.001, t);
    catchGain.gain.setValueAtTime(0.001, catchTime);
    catchGain.gain.linearRampToValueAtTime(0.12, catchTime + 0.025);
    catchGain.gain.exponentialRampToValueAtTime(0.001, catchTime + 0.35);
    const catchLP = this.ctx.createBiquadFilter();
    catchLP.type = "lowpass";
    catchLP.frequency.value = 140;
    catchLP.Q.value = 0.7;

    catchOsc.connect(catchLP).connect(catchGain).connect(this.ctx.destination);
    catchOsc.start(catchTime);
    catchOsc.stop(catchTime + 0.4);
    nodes.push(catchOsc);

    // Very faint high-freq air rush accompanying the catch
    const airRush = this._noise(0.25);
    const airBP = this.ctx.createBiquadFilter();
    airBP.type = "bandpass";
    airBP.frequency.setValueAtTime(2200, catchTime);
    airBP.frequency.exponentialRampToValueAtTime(800, catchTime + 0.25);
    airBP.Q.value = 0.6;
    const airGain = this.ctx.createGain();
    airGain.gain.setValueAtTime(0.001, t);
    airGain.gain.setValueAtTime(0.001, catchTime);
    airGain.gain.linearRampToValueAtTime(0.015, catchTime + 0.02);
    airGain.gain.exponentialRampToValueAtTime(0.001, catchTime + 0.22);

    airRush.connect(airBP).connect(airGain).connect(this.ctx.destination);
    airRush.start(catchTime);
    nodes.push(airRush);

    /* ---- Phase 3: Brief rev flare & settle (1.05s → 2.8s) ---- */
    const revTime = t + 1.05;
    const settleTime = t + 2.8;

    const idleF = this.mode === "cabin" ? 26 : (this.mode === "engine" ? 34 : 48);
    const peakF = idleF * 1.8; // Gentle flare, not aggressive

    // Persistent oscillator pitch: sweep up then back to idle
    this.osc.frequency.setValueAtTime(12, t);
    this.osc.frequency.setValueAtTime(12, revTime);
    this.osc.frequency.linearRampToValueAtTime(peakF, revTime + 0.25);
    this.osc.frequency.exponentialRampToValueAtTime(idleF, settleTime);

    this.sub.frequency.setValueAtTime(6, t);
    this.sub.frequency.setValueAtTime(6, revTime);
    this.sub.frequency.linearRampToValueAtTime(peakF / 2, revTime + 0.25);
    this.sub.frequency.exponentialRampToValueAtTime(idleF / 2, settleTime);

    this.harm2.frequency.setValueAtTime(24, t);
    this.harm2.frequency.setValueAtTime(24, revTime);
    this.harm2.frequency.linearRampToValueAtTime(peakF * 2, revTime + 0.25);
    this.harm2.frequency.exponentialRampToValueAtTime(idleF * 2, settleTime);

    // Filter opens for rev, then closes back to a muffled idle
    const idleCut = this.mode === "cabin" ? 65 : (this.mode === "engine" ? 380 : 220);
    const peakCut = idleCut * 2.5;

    this.filter.frequency.setValueAtTime(40, t);
    this.filter.frequency.setValueAtTime(40, revTime);
    this.filter.frequency.linearRampToValueAtTime(peakCut, revTime + 0.2);
    this.filter.frequency.exponentialRampToValueAtTime(idleCut, settleTime);

    // Gain envelopes: swell on catch, brief peak, settle to whisper
    const idleG = this.mode === "cabin" ? 0.02 : (this.mode === "engine" ? 0.13 : 0.11);
    const idleSG = this.mode === "cabin" ? 0.04 : (this.mode === "engine" ? 0.06 : 0.07);
    const idleHG = this.mode === "cabin" ? 0.008 : (this.mode === "engine" ? 0.03 : 0.025);

    this.gain.gain.setValueAtTime(0, revTime - 0.01);
    this.gain.gain.linearRampToValueAtTime(idleG * 2.0, revTime + 0.18);
    this.gain.gain.exponentialRampToValueAtTime(idleG, settleTime);

    this.subGain.gain.setValueAtTime(0, revTime - 0.01);
    this.subGain.gain.linearRampToValueAtTime(idleSG * 1.8, revTime + 0.2);
    this.subGain.gain.exponentialRampToValueAtTime(idleSG, settleTime);

    this.harmGain.gain.setValueAtTime(0, revTime - 0.01);
    this.harmGain.gain.linearRampToValueAtTime(idleHG * 2.2, revTime + 0.15);
    this.harmGain.gain.exponentialRampToValueAtTime(idleHG, settleTime);

    this._startNodes = nodes;

    // Release to normal idle after the sequence finishes
    setTimeout(() => {
      this._starting = false;
      this._startNodes = [];
      this._apply();
    }, 3000);
  }

  _cleanupStart() {
    for (const n of this._startNodes) {
      try { n.stop(); } catch { /* already stopped */ }
    }
    this._startNodes = [];
  }

  _apply() {
    if (!this.ctx || this._starting) return;
    let g = 0, f = 28, cut = 100, sg = 0, hg = 0;
    if (this.enabled) {
      switch (this.mode) {
        case "cabin":  g = 0.02;  f = 26; cut = 65;  sg = 0.04; hg = 0.008; break;
        case "engine": g = 0.13;  f = 34; cut = 380; sg = 0.06; hg = 0.03;  break;
        case "drive":  g = 0.11;  f = 48; cut = 220; sg = 0.07; hg = 0.025; break;
        default:       g = 0.055; f = 28; cut = 100; sg = 0.04; hg = 0.012;
      }
    }
    gsap.to(this.gain.gain, { value: g, duration: 1.0, ease: "power2.out" });
    gsap.to(this.subGain.gain, { value: sg, duration: 1.0, ease: "power2.out" });
    gsap.to(this.harmGain.gain, { value: hg, duration: 1.0, ease: "power2.out" });
    gsap.to(this.osc.frequency, { value: f, duration: 1.0, ease: "power2.out" });
    gsap.to(this.sub.frequency, { value: f / 2, duration: 1.0, ease: "power2.out" });
    gsap.to(this.harm2.frequency, { value: f * 2, duration: 1.0, ease: "power2.out" });
    gsap.to(this.filter.frequency, { value: cut, duration: 1.0, ease: "power2.out" });
  }

  dispose() {
    this._cleanupStart();
    if (!this.ctx) return;
    try {
      this.osc.stop();
      this.sub.stop();
      this.harm2.stop();
      this.lfo.stop();
      this.ctx.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
  }
}
