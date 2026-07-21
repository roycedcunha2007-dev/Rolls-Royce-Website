/*
 * CabinSFX — every cabin interaction has a hand-tuned procedural sound.
 * No audio files: crystal clicks, soft door thumps, leather slides and a
 * distant orchestral pad are all synthesised on a lazily created
 * AudioContext (resumed on the first user gesture).
 */
export class CabinSFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambience = null;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  _noise(duration) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  /* A jewelled switch: tiny filtered tick + faint high ping. */
  click() {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;

    const tick = this._noise(0.03);
    const tickHp = ctx.createBiquadFilter();
    tickHp.type = "bandpass";
    tickHp.frequency.value = 2600;
    tickHp.Q.value = 1.4;
    const tickG = ctx.createGain();
    tickG.gain.setValueAtTime(0.22, t);
    tickG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    tick.connect(tickHp).connect(tickG).connect(this.master);
    tick.start(t);

    const ping = ctx.createOscillator();
    ping.type = "sine";
    ping.frequency.value = 3400;
    const pingG = ctx.createGain();
    pingG.gain.setValueAtTime(0.035, t);
    pingG.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    ping.connect(pingG).connect(this.master);
    ping.start(t);
    ping.stop(t + 0.18);
  }

  /* Coach-door weight: low thud with felt damping. */
  thump() {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.34);

    const puff = this._noise(0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.12, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    puff.connect(lp).connect(pg).connect(this.master);
    puff.start(t);
  }

  /* Leather / seat motion: soft filtered noise sweep. */
  slide() {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;
    const n = this._noise(0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.linearRampToValueAtTime(950, t + 0.42);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
  }

  /* Discovery chime: two soft crystal tones a sixth apart. */
  chime() {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;
    [[880, 0], [1480, 0.12]].forEach(([f, dt]) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.06, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dt + 0.9);
      o.connect(g).connect(this.master);
      o.start(t + dt);
      o.stop(t + dt + 1.0);
    });
  }

  /* The double-tone of a very polite horn. */
  horn() {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const t = ctx.currentTime;
    [392, 494].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.03);
      g.gain.setValueAtTime(0.09, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.55);
    });
  }

  /* Distant orchestral atmosphere: detuned pad through a slow swell. */
  setAmbience(on) {
    const ctx = this._ensure();
    if (on && !this.ambience) {
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 3.5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 640;
      g.connect(this.master);

      const oscs = [220, 220.7, 329.6, 165].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 3 ? "sine" : "triangle";
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = i === 3 ? 0.5 : 0.22;
        o.connect(og).connect(lp);
        o.start(t);
        return o;
      });
      lp.connect(g);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.012;
      lfo.connect(lfoG).connect(g.gain);
      lfo.start(t);

      this.ambience = { oscs, lfo, g };
    } else if (!on && this.ambience) {
      const t = ctx.currentTime;
      const { oscs, lfo, g } = this.ambience;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.4);
      for (const o of oscs) o.stop(t + 1.5);
      lfo.stop(t + 1.5);
      this.ambience = null;
    }
  }

  /* Wind + tyre wash for the drive — level 0..1 follows road speed. */
  setWind(level) {
    const ctx = this._ensure();
    if (level > 0.01 && !this.windNode) {
      const t = ctx.currentTime;
      const src = this._noise(2.2);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      src.connect(lp).connect(g).connect(this.master);
      src.start(t);
      this.windNode = { src, g, lp };
    }
    if (this.windNode) {
      const t = ctx.currentTime;
      const target = Math.min(0.075, level * 0.075);
      this.windNode.g.gain.cancelScheduledValues(t);
      this.windNode.g.gain.setTargetAtTime(target, t, 0.4);
      this.windNode.lp.frequency.setTargetAtTime(320 + level * 700, t, 0.5);
      if (level <= 0.01) {
        this.windNode.src.stop(t + 1.2);
        this.windNode = null;
      }
    }
  }

  /* Rain on the roof — filtered noise, heard through 6mm of glass. */
  setRain(on) {
    const ctx = this._ensure();
    if (on && !this.rainNode) {
      const t = ctx.currentTime;
      const src = this._noise(2.5);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 380;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 2.0);
      src.connect(hp).connect(lp).connect(g).connect(this.master);
      src.start(t);
      this.rainNode = { src, g };
    } else if (!on && this.rainNode) {
      const t = ctx.currentTime;
      const { src, g } = this.rainNode;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 1.0);
      src.stop(t + 1.1);
      this.rainNode = null;
    }
  }

  dispose() {
    try {
      this.setAmbience(false);
      this.setRain(false);
      this.setWind(0);
      this.ctx?.close();
    } catch {
      /* already closed */
    }
  }
}
