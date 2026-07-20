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
    this.enabled = on;
    if (on) {
      this._ensure();
      if (this.ctx.state === "suspended") this.ctx.resume();
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
    if (this.enabled && this.mode === "drive" && this.ctx) {
      const f = 46 + ratio * 38;
      this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.12);
      this.sub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.12);
    }
  }

  _apply() {
    if (!this.ctx) return;
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
