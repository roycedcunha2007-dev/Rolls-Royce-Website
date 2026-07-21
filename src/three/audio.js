import gsap from "gsap";

/*
 * Procedural V12 hum — no audio assets. A sawtooth fundamental through a
 * low-pass filter, with per-mode gain/pitch/brightness curves:
 *   idle     — distant, felt more than heard
 *   cabin    — heavily muffled behind double glazing
 *   engine   — bonnet open, brighter mechanical growl
 *   drive    — RPM-linked pitch, more presence
 */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.mode = "idle";
    this.rpmRatio = 0;
    this.isStarting = false;
  }

  _ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.osc = this.ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = 30;

    this.sub = this.ctx.createOscillator();
    this.sub.type = "sine";
    this.sub.frequency.value = 15;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 120;
    this.filter.Q.value = 0.8;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.gain);
    this.sub.connect(this.subGain);
    this.gain.connect(this.ctx.destination);
    this.subGain.connect(this.ctx.destination);

    this.osc.start();
    this.sub.start();
  }

  setEnabled(on) {
    const wasEnabled = this.enabled;
    this.enabled = on;
    if (on) {
      this._ensure();
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!wasEnabled) {
        this._startSequence();
        return;
      }
    } else {
      this.isStarting = false;
    }
    this._apply();
  }

  setMode(mode) {
    this.mode = mode;
    this._apply();
  }

  /** ratio 0..1 — drive-mode acceleration curve */
  setRpm(ratio) {
    this.rpmRatio = ratio;
    if (this.enabled && this.mode === "drive" && this.ctx && !this.isStarting) {
      const f = 46 + ratio * 38;
      this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.12);
      this.sub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.12);
    }
  }

  _startSequence() {
    if (!this.ctx) return;
    this.isStarting = true;
    const t = this.ctx.currentTime;

    // Reset master gains to zero for cranking sequence
    this.gain.gain.cancelScheduledValues(t);
    this.subGain.gain.cancelScheduledValues(t);
    this.osc.frequency.cancelScheduledValues(t);
    this.filter.frequency.cancelScheduledValues(t);

    this.gain.gain.setValueAtTime(0, t);
    this.subGain.gain.setValueAtTime(0, t);

    // --- 1. STARTER MOTOR WHINE & RHYTHMIC COMPRESSION CHUGS ---
    // High-frequency starter gear whine
    const starterWhine = this.ctx.createOscillator();
    starterWhine.type = "sine";
    starterWhine.frequency.setValueAtTime(260, t);

    // LFO to modulate starter pitch for load effect
    const starterLFO = this.ctx.createOscillator();
    starterLFO.frequency.setValueAtTime(7.2, t); // Piston rotation frequency (~430 RPM)
    const starterLFOGain = this.ctx.createGain();
    starterLFOGain.gain.setValueAtTime(35, t);

    starterLFO.connect(starterLFOGain);
    starterLFOGain.connect(starterWhine.frequency);

    const starterGain = this.ctx.createGain();
    starterGain.gain.setValueAtTime(0, t);
    starterGain.gain.linearRampToValueAtTime(0.045, t + 0.08);

    // Rhythmic low-mid cylinder compression pulses
    const starterChug = this.ctx.createOscillator();
    starterChug.type = "triangle";
    starterChug.frequency.setValueAtTime(42, t);

    const chugGain = this.ctx.createGain();
    chugGain.gain.setValueAtTime(0, t);

    // Pulse volume at compression intervals
    const pulseLFO = this.ctx.createOscillator();
    pulseLFO.type = "sawtooth";
    pulseLFO.frequency.setValueAtTime(7.2, t);
    const pulseGain = this.ctx.createGain();
    pulseGain.gain.setValueAtTime(0.09, t);

    pulseLFO.connect(pulseGain);
    pulseGain.connect(chugGain.gain);

    const starterFilter = this.ctx.createBiquadFilter();
    starterFilter.type = "lowpass";
    starterFilter.frequency.setValueAtTime(160, t);

    starterWhine.connect(starterGain);
    starterGain.connect(this.ctx.destination);

    starterChug.connect(starterFilter);
    starterFilter.connect(chugGain);
    chugGain.connect(this.ctx.destination);

    // Start starter motor
    starterLFO.start(t);
    starterWhine.start(t);
    starterChug.start(t);
    pulseLFO.start(t);

    // Fade out starter motor as ignition catches
    starterGain.gain.setValueAtTime(0.045, t + 1.15);
    starterGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);

    pulseGain.gain.setValueAtTime(0.09, t + 1.05);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

    starterLFO.stop(t + 1.6);
    starterWhine.stop(t + 1.6);
    starterChug.stop(t + 1.6);
    pulseLFO.stop(t + 1.6);

    // --- 2. V12 COMBUSTION CATCH & REV ---
    const fireTime = t + 1.32;

    // Exhaust puff of air when ignition catches (filtered noise burst)
    const exhaustBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
    const channelData = exhaustBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const exhaustNode = this.ctx.createBufferSource();
    exhaustNode.buffer = exhaustBuffer;

    const exhaustFilter = this.ctx.createBiquadFilter();
    exhaustFilter.type = "bandpass";
    exhaustFilter.frequency.setValueAtTime(150, fireTime);
    exhaustFilter.frequency.exponentialRampToValueAtTime(55, fireTime + 0.8);
    exhaustFilter.Q.value = 1.2;

    const exhaustGain = this.ctx.createGain();
    exhaustGain.gain.setValueAtTime(0, t);
    exhaustGain.gain.setValueAtTime(0, fireTime);
    // Let more growl show if bonnet is open/engine view
    const isMuffled = this.mode === "cabin";
    exhaustGain.gain.linearRampToValueAtTime(isMuffled ? 0.08 : 0.22, fireTime + 0.04);
    exhaustGain.gain.exponentialRampToValueAtTime(0.0001, fireTime + 0.75);

    exhaustNode.connect(exhaustFilter).connect(exhaustGain).connect(this.ctx.destination);
    exhaustNode.start(fireTime);

    // V12 cylinder catch pitch sweep (rev peak and settle to idle)
    const targetIdleFreq = this.mode === "cabin" ? 27 : (this.mode === "engine" ? 36 : 52);
    const startupRevFreq = targetIdleFreq * 2.6; // High-pitch startup flare

    this.osc.frequency.setValueAtTime(14, t);
    this.osc.frequency.setValueAtTime(14, fireTime);
    this.osc.frequency.exponentialRampToValueAtTime(startupRevFreq, fireTime + 0.32);
    this.osc.frequency.exponentialRampToValueAtTime(targetIdleFreq, fireTime + 1.55);

    this.sub.frequency.setValueAtTime(7, t);
    this.sub.frequency.setValueAtTime(7, fireTime);
    this.sub.frequency.exponentialRampToValueAtTime(startupRevFreq / 2, fireTime + 0.32);
    this.sub.frequency.exponentialRampToValueAtTime(targetIdleFreq / 2, fireTime + 1.55);

    // Low-pass filter opens for the engine rev and then muffles for quiet idle
    const targetCutoff = this.mode === "cabin" ? 70 : (this.mode === "engine" ? 420 : 260);
    const startupPeakCutoff = targetCutoff * 3.0;

    this.filter.frequency.setValueAtTime(45, t);
    this.filter.frequency.setValueAtTime(45, fireTime);
    this.filter.frequency.exponentialRampToValueAtTime(startupPeakCutoff, fireTime + 0.28);
    this.filter.frequency.exponentialRampToValueAtTime(targetCutoff, fireTime + 1.55);

    // Dynamic gain values during combustion flare
    const targetGain = this.mode === "cabin" ? 0.025 : (this.mode === "engine" ? 0.16 : 0.14);
    const targetSubGain = this.mode === "cabin" ? 0.05 : (this.mode === "engine" ? 0.07 : 0.09);

    const startupPeakGain = targetGain * 2.6;
    const startupPeakSubGain = targetSubGain * 2.4;

    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.setValueAtTime(0, fireTime - 0.02);
    this.gain.gain.linearRampToValueAtTime(startupPeakGain, fireTime + 0.12);
    this.gain.gain.exponentialRampToValueAtTime(targetGain, fireTime + 1.55);

    this.subGain.gain.setValueAtTime(0, t);
    this.subGain.gain.setValueAtTime(0, fireTime - 0.02);
    this.subGain.gain.linearRampToValueAtTime(startupPeakSubGain, fireTime + 0.16);
    this.subGain.gain.exponentialRampToValueAtTime(targetSubGain, fireTime + 1.55);

    // Release startup lock and match target idle specs
    setTimeout(() => {
      this.isStarting = false;
      this._apply();
    }, 3200);
  }

  _apply() {
    if (!this.ctx || this.isStarting) return;
    let g = 0, f = 30, cut = 120, sg = 0;
    if (this.enabled) {
      switch (this.mode) {
        case "cabin":  g = 0.025; f = 27; cut = 70;  sg = 0.05; break;
        case "engine": g = 0.16;  f = 36; cut = 420; sg = 0.07; break;
        case "drive":  g = 0.14;  f = 52; cut = 260; sg = 0.09; break;
        default:       g = 0.07;  f = 30; cut = 120; sg = 0.05;
      }
    }
    gsap.to(this.gain.gain, { value: g, duration: 0.9, ease: "power2.out" });
    gsap.to(this.subGain.gain, { value: sg, duration: 0.9, ease: "power2.out" });
    gsap.to(this.osc.frequency, { value: f, duration: 0.9, ease: "power2.out" });
    gsap.to(this.filter.frequency, { value: cut, duration: 0.9, ease: "power2.out" });
  }

  dispose() {
    if (!this.ctx) return;
    try {
      this.osc.stop();
      this.sub.stop();
      this.ctx.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
  }
}
