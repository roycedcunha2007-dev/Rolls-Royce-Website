import * as THREE from "three";
import gsap from "gsap";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

let rectAreaInitialized = false;

/*
 * Cinematic gallery rig — few sources, each with a job:
 *   1. Soft cool daylight through the glazing (key, casts the long shadows).
 *   2. Low ambient base so blacks stay readable but rich.
 *   3. A broad rect light in the ceiling tray for the paint's long highlight.
 *   4. Three narrow exhibit spots on the car.
 *   5. Warm accents: sanctuary, lounge, art wall.
 * Everything else in the scene is emissive trim handled by the architecture.
 */
export class ShowroomLights {
  constructor(scene) {
    this.scene = scene;
    this.all = [];

    if (!rectAreaInitialized) { RectAreaLightUniformsLib.init(); rectAreaInitialized = true; }

    // 1 — ambient base.
    this.hemi = new THREE.HemisphereLight(0xc4ccd2, 0x30291f, 0.5);
    scene.add(this.hemi); this._track(this.hemi);

    // 2 — daylight key through the east glazing.
    this.sun = new THREE.DirectionalLight(0xfff0da, 1.5);
    this.sun.position.set(26, 15, 4);
    this.sun.target.position.set(-4, 0, -2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.far = 80;
    this.sun.shadow.bias = -0.0001; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 5;
    scene.add(this.sun, this.sun.target); this._track(this.sun);

    // Cool bounce fill from the opposite side, shadowless.
    this.fill = new THREE.DirectionalLight(0xaebfcc, 0.32);
    this.fill.position.set(-18, 10, 12);
    scene.add(this.fill); this._track(this.fill);

    // 3 — ceiling tray rect light: the long soft highlight along the coachwork.
    this.tray = new THREE.RectAreaLight(0xfff2df, 3.6, 11, 7);
    this.tray.position.set(0, 9.9, -0.5);
    this.tray.lookAt(0, 0, -0.5);
    scene.add(this.tray); this._track(this.tray);

    // 4 — exhibit spots on the car, one with shadow.
    this.carKey = this._spot(0xfff3e2, 130, [4.5, 9.2, 4], [0, 0.6, 0], 0.46, 22, true);
    this._spot(0xf3ead9, 60, [-5, 9.2, -4.5], [0, 0.7, 0], 0.48, 22, false);
    this._spot(0xe8ecef, 42, [-4.5, 9.2, 4.5], [-0.5, 0.6, 0.5], 0.5, 22, false);

    // 5 — warm accents.
    // Sanctuary spot follows the sanctuary bay (API preserved for Showroom).
    this.sanctLight = this._spot(0xffd9a6, 70, [2, 7.2, -17], [0, 0.5, -20], 0.55, 24, true);
    // Rear gallery low wash so the signage wall reads.
    this.gallery = this._spot(0xf6e8ce, 46, [0, 7.4, -17.5], [0, 2.4, -26.8], 0.75, 28, false);
    // Consultation lounge under the mezzanine.
    this.loungeLight = this._spot(0xffc98e, 34, [-11.5, 4.5, -9], [-11.8, 0.4, -9.6], 0.7, 12, false);
    // Materials wall wash on the walnut side.
    this._spot(0xffe3ba, 40, [-12.5, 8.8, 4], [-15.6, 2.2, 4], 0.62, 16, false);
    this._spot(0xffe3ba, 34, [-12.5, 8.8, 12], [-15.6, 2.2, 12.5], 0.62, 16, false);
    // Entry portal accent.
    this._spot(0xf3e6cf, 30, [-6, 8.8, 17.5], [-6, 2.5, 20.8], 0.55, 14, false);
    // Cool moon rim used only in drive mode.
    this.driveRim = this._spot(0xbdd4e8, 0, [-9, 7, -5], [0, 0.8, 0], 0.55, 30, true);
  }

  _track(light) { this.all.push({ light, base: light.intensity }); return light; }

  _spot(color, intensity, pos, target, angle, distance, shadow = false) {
    const light = new THREE.SpotLight(color, intensity, distance, angle, 0.65, 1.6);
    light.position.set(...pos);
    light.target.position.set(...target);
    light.castShadow = shadow;
    if (shadow) {
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.00015; light.shadow.normalBias = 0.03; light.shadow.radius = 4;
    }
    this.scene.add(light, light.target);
    this._track(light);
    return light;
  }

  setDriveMode(on) {
    const d = 0.9, e = "power2.inOut";
    for (const { light, base } of this.all) {
      let target = on ? base * 0.04 : base;
      if (light === this.driveRim) target = on ? 14 : 0;
      if (light === this.hemi) target = on ? 0.07 : base;
      gsap.to(light, { intensity: target, duration: d, ease: e });
    }
  }

  setSanctuaryZ(z) {
    this.sanctLight.position.set(2, 7.2, z + 3);
    this.sanctLight.target.position.set(0, 0.5, z);
  }
}
