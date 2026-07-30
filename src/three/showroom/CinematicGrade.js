import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/*
 * CinematicGrade — the final pass that turns a clean render into footage.
 *
 * Four effects, all of which the eye reads as "shot on a camera" rather than
 * "drawn by a computer", and each independently dialled by driving mode:
 *
 *   chromatic aberration — RGB split that grows toward the frame edge, the
 *     way a fast lens fringes wide open. Zero at centre so the car is clean.
 *   vignette            — light falloff into the corners; the single
 *     cheapest way to make a night scene feel photographed.
 *   film grain          — animated luminance noise, scaled DOWN in the
 *     highlights, because real grain lives in the shadows.
 *   halation            — a warm lift where the image is already bright, so
 *     street lamps bleed into the surrounding dark like film emulsion.
 *
 * Deliberately NOT a depth-of-field pass: with logarithmicDepthBuffer the
 * depth texture is non-linear, and every cheap DoF here banded badly.
 */
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.00032 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.022 },
    uHalation: { value: 0.085 },
    uAspect: { value: 1.6 },
    /* the grade proper — lift / gamma / gain, see the fragment shader */
    uShoulder: { value: 0.34 },   // highlight rolloff toward white
    uToe: { value: 0.62 },        // how far the black floor is pulled down
    uContrast: { value: 1.10 },
    uSaturation: { value: 1.08 },
    /* A cool-NEUTRAL base, not a blue one. Pushing shadows hard into blue
     * is the single thing that makes a night render read as a games
     * console rather than as an automotive commercial. */
    uShadowTint: { value: new THREE.Color(0.70, 0.81, 1.0) },
    uHighTint: { value: new THREE.Color(1.0, 0.93, 0.82) },      // warm white
    uSplit: { value: 0.2 },
    uStreak: { value: 0.0 },      // anamorphic flare belongs in a film, not here
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain, uHalation, uAspect;
    uniform float uContrast, uSaturation, uSplit, uStreak, uShoulder, uToe;
    uniform vec3 uShadowTint, uHighTint;
    varying vec2 vUv;

    // cheap hash noise — no texture fetch, stable per pixel per frame
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // --- chromatic aberration: radial, zero at centre ---
      vec2 dir = c * uAberration * (0.35 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;

      /* -----------------------------------------------------------------
       * ANAMORPHIC STREAK — off by default.
       *
       * Blue horizontal flares off every practical are the signature of a
       * night supercar film, and they are exactly what a Rolls-Royce
       * commercial does NOT do: they announce the lens instead of the
       * motor car. Kept only for Rain, where water on the glass earns it.
       * ----------------------------------------------------------------- */
      if (uStreak > 0.001) {
        vec3 streak = vec3(0.0);
        float wsum = 0.0;
        for (int i = 1; i <= 12; i++) {
          float fi = float(i);
          float off = fi * 0.0055;
          float w = 1.0 / (1.0 + fi * fi * 0.16);
          vec3 a = texture2D(tDiffuse, vUv + vec2(off, 0.0)).rgb;
          vec3 b = texture2D(tDiffuse, vUv - vec2(off, 0.0)).rgb;
          streak += (max(a - 0.9, 0.0) + max(b - 0.9, 0.0)) * w;
          wsum += w;
        }
        col += streak / max(wsum, 0.001) * vec3(0.5, 0.66, 1.0) * uStreak;
      }

      // --- halation: a whisper of warmth out of the brightest highlights ---
      float lum = luma(col);
      float hi = smoothstep(0.74, 1.0, lum);
      col += vec3(0.95, 0.72, 0.46) * hi * uHalation;

      /* -----------------------------------------------------------------
       * THE GRADE — luxury commercial, not music video.
       *
       * Everything below is display-referred: ACES has already run in
       * OutputPass, so this is the print, not the negative.
       *
       * The previous curve was a Reinhard divide plus a power plus a
       * pivot-contrast, three compressions stacked on top of one another,
       * and their combined effect on a night frame was to flatten exactly
       * the range this scene lives in — the low midtones, where every wet
       * road, every dark facade and every panel of black paint sits. The
       * result read as "underexposed and slightly grey" no matter what the
       * exposure was set to.
       *
       * Replaced with an explicit LIFT / GAMMA / GAIN, the grade a colourist
       * actually reaches for, and each of the three doing one job:
       *
       *   TOE     pulls the bottom of the curve down and holds it there,
       *           so blacks are black and stay black under bloom
       *   GAMMA   opens the low midtones without touching either end —
       *           this is what makes facades, kerbs and coachwork readable
       *           without the frame going milky
       *   SHOULDER a smooth, asymptotic highlight rolloff so a lamp bleeds
       *           to white the way film does rather than clipping to a hard
       *           orange disc
       * ----------------------------------------------------------------- */

      // TOE — a soft floor, not a clamp, so shadow detail bends rather than dies
      col = max(col - uToe * 0.055, 0.0) / max(1.0 - uToe * 0.055, 0.001);

      // GAMMA — the money move on a night frame
      col = pow(max(col, 0.0), vec3(0.90));

      // SHOULDER — asymptotic, so nothing ever clips flat
      col = col * (1.0 + col * uShoulder) / (1.0 + col);

      // and only then contrast, about a filmic pivot
      col = (col - 0.40) * uContrast + 0.40;
      col = max(col, 0.0);

      lum = luma(col);
      /* Split-tone, on the 60 / 30 / 10 balance the frame is built to:
       * a cool-neutral base carrying the shadows and the midtones, and
       * warmth admitted only where the city is genuinely warm. Note the
       * midpoint sits high — pushing the shadows hard blue is the single
       * thing that makes a night render read as a games console. */
      vec3 tint = mix(uShadowTint, uHighTint, smoothstep(0.10, 0.70, lum));
      col = mix(col, col * tint, uSplit);

      // saturation rolls off in the highlights so lamps go white, not orange
      float satRoll = 1.0 - smoothstep(0.70, 1.0, lum) * 0.85;
      col = mix(vec3(lum), col, uSaturation * satRoll);

      // the faintest lift so the deepest blacks hold air instead of going flat
      col += uShadowTint * 0.012 * (1.0 - smoothstep(0.0, 0.24, lum));

      // --- vignette: aspect-corrected so it stays circular ---
      vec2 vc = c * vec2(uAspect, 1.0);
      float vig = smoothstep(0.96, 0.20, length(vc));
      col *= mix(1.0, vig, uVignette);

      // --- grain: strongest in the shadows, animated ---
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (1.0 - smoothstep(0.0, 0.75, luma(col)));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class CinematicGrade extends ShaderPass {
  constructor() {
    super(CinematicGradeShader);
    this.enabled = false;   // the atelier stays clean; the ride switches it on
  }

  setAspect(w, h) { this.uniforms.uAspect.value = w / Math.max(1, h); }

  update(t) { this.uniforms.uTime.value = t; }

  /* Ease to a driving mode's grade. Called from Showroom.setRideMode. */
  applyMode(m, gsap) {
    const u = this.uniforms;
    const d = { duration: 1.2, ease: "power2.inOut" };
    gsap.to(u.uGrain, { value: m.grain, ...d });
    // uVignette is driven per-frame by the render loop (it depends on which
    // camera is live, not only on the mode) — see Showroom's drive branch
    gsap.to(u.uHalation, { value: m.rain ? 0.13 : 0.085, ...d });
    gsap.to(u.uAberration, { value: m.name === "Sport" ? 0.0006 : 0.00032, ...d });
    /* Every mode stays inside the same house grade — the differences are
     * a stop of contrast, not a different film stock. Sport firms up
     * slightly, Night sits a touch cooler, and only Rain earns any streak,
     * because only Rain has water on the glass to produce one. */
    gsap.to(u.uContrast, { value: m.name === "Sport" ? 1.17 : 1.10, ...d });
    gsap.to(u.uSaturation, { value: m.name === "Night" ? 1.02 : 1.08, ...d });
    gsap.to(u.uSplit, { value: m.name === "Night" ? 0.26 : m.name === "Magic Carpet" ? 0.17 : 0.2, ...d });
    gsap.to(u.uStreak, { value: m.rain ? 0.28 : 0, ...d });
  }
}

export { CinematicGradeShader };
