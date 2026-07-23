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
    uAberration: { value: 0.0009 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.03 },
    uHalation: { value: 0.18 },
    uAspect: { value: 1.6 },
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
    varying vec2 vUv;

    // cheap hash noise — no texture fetch, stable per pixel per frame
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // --- chromatic aberration: radial, zero at centre ---
      vec2 dir = c * uAberration * (0.35 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir).b;

      // --- halation: warm bleed out of the highlights ---
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float hi = smoothstep(0.62, 1.0, lum);
      col += vec3(0.9, 0.62, 0.34) * hi * uHalation;

      // --- vignette: aspect-corrected so it stays circular ---
      vec2 vc = c * vec2(uAspect, 1.0);
      float vig = smoothstep(0.92, 0.22, length(vc));
      col *= mix(1.0, vig, uVignette);

      // --- grain: strongest in the shadows, animated ---
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (1.0 - smoothstep(0.0, 0.75, lum));

      gl_FragColor = vec4(col, 1.0);
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
    gsap.to(u.uHalation, { value: m.rain ? 0.3 : 0.18, ...d });
    gsap.to(u.uAberration, { value: m.name === "Sport" ? 0.0015 : 0.0009, ...d });
  }
}

export { CinematicGradeShader };
