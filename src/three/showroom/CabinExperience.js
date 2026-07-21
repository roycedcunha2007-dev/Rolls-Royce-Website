import * as THREE from "three";
import gsap from "gsap";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { CabinSFX } from "./CabinSFX.js";
import { EngineAudio } from "../audio.js";

/*
 * CabinExperience — the Sanctuary as an interactive bespoke room.
 *
 * Owns everything that lives inside the interior car:
 *   · a rebuildable Starlight Headliner (density / brightness / twinkle /
 *     Classic · Galaxy · Aurora · Milky Way modes / shooting stars)
 *   · ambient lighting strips along the dash and door sills
 *   · cabin lighting moods (showroom / golden hour / moonlight / midnight)
 *   · privacy glass and window tint
 *   · seat climate glow demonstrations
 *   · a hotspot registry with cinematic camera fly-tos
 *   · procedural interaction sounds (CabinSFX)
 */

const STAR_MODES = {
  classic: { colors: [[1.0, 0.98, 0.93]], aurora: 0 },
  galaxy: {
    colors: [[0.62, 0.72, 1.0], [0.84, 0.79, 1.0], [1.0, 0.97, 0.9], [0.72, 0.86, 1.0]],
    aurora: 0, cluster: 1,
  },
  aurora: { colors: [[0.6, 1.0, 0.82], [0.62, 0.86, 1.0]], aurora: 1 },
  milkyway: {
    colors: [[0.8, 0.86, 1.0], [1.0, 0.95, 0.86], [0.9, 0.9, 1.0]],
    aurora: 0, band: true,
  },
  comet: { colors: [[1.0, 0.98, 0.92]], aurora: 0, comet: 1 },
};

const AMBIENT_THEMES = [
  { id: "champagne", name: "Champagne Gold", hex: "#d8b878" },
  { id: "royal", name: "Royal Blue", hex: "#3f6fd8" },
  { id: "ice", name: "Ice Blue", hex: "#9cc8ff" },
  { id: "emerald", name: "Emerald", hex: "#2fae7d" },
  { id: "sunset", name: "Sunset", hex: "#e8703a" },
  { id: "crimson", name: "Crimson", hex: "#c22436" },
  { id: "moon", name: "Moonlight", hex: "#c6cede" },
  { id: "warm", name: "Warm White", hex: "#ffe1b0" },
];

const MOODS = {
  showroom: { key: 0.5, keyColor: 0xfff1dc, glow: 0.55, env: 0.55, bloom: 0.14 },
  golden: { key: 0.8, keyColor: 0xffc887, glow: 0.8, env: 0.42, bloom: 0.18 },
  moonlight: { key: 0.3, keyColor: 0xb9ccf2, glow: 0.5, env: 0.24, bloom: 0.22 },
  midnight: { key: 0.12, keyColor: 0x8f9ec4, glow: 0.85, env: 0.1, bloom: 0.3 },
};

const HIDE_PAIRS = [
  { id: "navy-cream", name: "Navy on Casden Tan", seat: 0x2c4a74, perf: 0xe8dfcd, cabin: 0xded4c2, belt: 0x24406b, carpet: 0x1c2c47 },
  { id: "ivory-navy", name: "Arctic on Navy", seat: 0xe6ddc9, perf: 0x2c4a74, cabin: 0xe0d8c6, belt: 0xcfc5ae, carpet: 0x202f4c },
  { id: "tan-espresso", name: "Moccasin on Espresso", seat: 0xa86b3c, perf: 0xe4d6bd, cabin: 0x3a2a1e, belt: 0x8a5730, carpet: 0x27180f },
  { id: "crimson-ivory", name: "Hotspur on Ivory", seat: 0x8f1d26, perf: 0xe9e0cf, cabin: 0xe4dccb, belt: 0x7c1a22, carpet: 0x2a1013 },
  { id: "slate-ice", name: "Slate on Ice", seat: 0x454b55, perf: 0xd9e2ea, cabin: 0xd3d7dc, belt: 0x3c424b, carpet: 0x23272e },
];

const VENEERS = [
  { id: "walnut", name: "Open-Pore Walnut" },
  { id: "piano", name: "Piano Black" },
  { id: "carbon", name: "Technical Carbon" },
  { id: "bleached", name: "Bleached Ash" },
];

const METALS = [
  { id: "chrome", name: "Polished Chrome", hex: 0xf2f3f5, rough: 0.16 },
  { id: "rosegold", name: "Rose Gold", hex: 0xdca57e, rough: 0.2 },
  { id: "dark", name: "Dark Chrome", hex: 0x4d525b, rough: 0.24 },
];

// What the hand finds when it touches the cabin — matched against node names.
const TOUCH_MAP = [
  { re: /leatherperf/, label: "Perforated contrast hide", act: "massage" },
  { re: /leatherbmp/, label: "Hand-stitched seat hide", act: "massage" },
  { re: /wooddfs/, label: "Open-pore walnut veneer", act: "chime" },
  { re: /carpetdfs/, label: "Deep-pile lambswool carpet" },
  { re: /fabricroof/, label: "Starlight headliner", act: "panel:starlight" },
  { re: /seatbelt/, label: "Bespoke seat belt" },
  { re: /steklo/, label: "Electrochromic glazing", act: "panel:glass" },
  { re: /ffcccccc|ff9a9a9a/, label: "Jewelled brightwork", act: "click" },
  { re: /interiordfs|ff999999/, label: "Leather-wrapped fascia" },
  { re: /tormoz/, label: "Coloured brake caliper" },
  { re: /tire|sidewall/, label: "Bespoke 21-inch wheel" },
  { re: /shader_turn/, label: "Indicator jewel", act: "indicate" },
  { re: /lightsdfs|vehiclelights|shader_rear/, label: "Laser lamp jewellery", act: "lamps" },
  { re: /remap_body|exteriorost/, label: "Hand-polished coachwork" },
  // remaining dark-trim variants, named by where they live in the cabin
  { re: /660d0d0d|cc0d0000/, label: "Panoramic glazing", act: "panel:glass" },
  { re: /ff0d0d0d/, label: "Soft-touch door casing", act: "click" },
  { re: /ff191919/, label: "Rear privacy blind", act: "click" },
  { re: /ff141414/, label: "Console surround", act: "click" },
  { re: /ff0f0f0f|ff0a0a0a/, label: "Piano-black switch panel", act: "click" },
  { re: /ff070707|ff040404|ff000000/, label: "Cabin shadow-line trim" },
  { re: /ff990000|ffff0000/, label: "Illuminated jewel", act: "lamps" },
];

export class CabinExperience {
  constructor(showroom, entry) {
    this.showroom = showroom;
    this.entry = entry;
    this.sfx = new CabinSFX();

    entry.group.updateMatrixWorld(true);
    this.box = new THREE.Box3().setFromObject(entry.group);
    this.size = this.box.getSize(new THREE.Vector3());
    this.center = this.box.getCenter(new THREE.Vector3());

    this.starCfg = { density: 220, brightness: 1.0, speed: 1.0, mode: "classic" };
    this.mood = "showroom";
    this.ambientHex = "#d8b878";
    this.privacy = false;
    this.tint = 0.35;
    this.seatClimate = null;
    this.focused = null;
    this._savedEnv = showroom.scene.environmentIntensity;
    this._meteors = [];
    this._glowBase = 0.55;

    this.raycaster = new THREE.Raycaster();
    this.tapped = new Set();
    this.onTap = null; // HUD subscribes: ({label, x, y, act, count})
    this.engineOn = false;
    this.rainOn = false;
    this.hidePair = HIDE_PAIRS[0];
    this.veneer = "walnut";
    this.metal = "chrome";

    this._buildLights();
    this._buildStars();
    this._buildStrips();
    this._buildHotspots();
    this._buildViewpoints();
  }

  /* -------------------------------------------- viewpoints -------- */
  _buildViewpoints() {
    const seatY = 0.64;
    this.viewpoints = {
      lounge: {
        label: "Lounge",
        // signature symmetric shot down the cabin spine, rear to dash
        pos: this.W(0.78, 0.64, 0.5),
        look: this.W(0.12, 0.56, 0.5),
        after: { mode: "orbit", target: this.W(0.4, 0.54, 0.5), minR: 0.5, maxR: 1.8, minPhi: 0.68, maxPhi: 1.78 },
      },
      driver: {
        label: "Driver's seat",
        // seated at the wheel, gaze forward and gently down over the rim
        pos: this.W(0.52, 0.78, 0.685),
        look: this.W(0.16, 0.47, 0.645),
        after: { mode: "pov" },
      },
      passenger: {
        label: "Passenger",
        // the passenger's outlook: veneer fascia, vents, jewelled switchgear
        pos: this.W(0.52, 0.78, 0.315),
        look: this.W(0.16, 0.47, 0.355),
        after: { mode: "pov" },
      },
      rearLeft: {
        label: "Rear lounge · left",
        // seated in the rear-left, clear of the seat back, gaze level forward
        pos: this.W(0.74, 0.66, 0.38),
        look: this.W(0.14, 0.58, 0.45),
        after: { mode: "pov" },
      },
      rearRight: {
        label: "Rear lounge · right",
        pos: this.W(0.74, 0.66, 0.62),
        look: this.W(0.14, 0.58, 0.55),
        after: { mode: "pov" },
      },
      starlight: {
        label: "Starlight",
        // reclined in the rear, gaze up at the canopy above the front seats
        pos: this.W(0.78, 0.7, 0.5),
        look: this.W(0.66, 0.95, 0.5),
        // orbit beneath the canopy so the whole sky can be explored
        after: { mode: "orbit", target: this.W(0.66, 0.92, 0.5), minR: 0.5, maxR: 2.0, minPhi: 1.45, maxPhi: 2.72 },
        starlight: true,
      },
      exterior: {
        label: "Walk around",
        pos: this.center.clone().add(new THREE.Vector3(4.4, 1.35, 3.6)),
        look: this.W(0.5, 0.45, 0.5),
        after: { mode: "orbit", target: this.W(0.5, 0.42, 0.5), minR: 2.4, maxR: 10, minPhi: 0.18, maxPhi: 1.62 },
      },
      overhead: {
        label: "Overhead",
        pos: this.center.clone().add(new THREE.Vector3(0.4, 5.6, 0.2)),
        look: this.W(0.5, 0.5, 0.5),
        after: { mode: "orbit", target: this.W(0.5, 0.42, 0.5), minR: 2.2, maxR: 9, minPhi: 0.12, maxPhi: 1.2 },
      },
    };
  }

  viewpoint(id) {
    const v = this.viewpoints[id];
    if (!v) return;
    this.focused = null;
    const prev = this.currentView;
    this.currentView = id;
    // theatre-darken the roof when admiring the sky, restore when leaving it
    if (v.starlight) this.enterStarlight();
    else if (this.viewpoints[prev]?.starlight) this.exitStarlight();
    this.showroom.flyTo(v.pos, v.look, v.after, 1.9);
    this.sfx.slide();
  }

  /* Dim the cabin and take the headliner to near-black so the fibre-optic
     stars blaze exactly as they do in the real motor car at night. */
  enterStarlight() {
    if (this._starlightOn) return;
    this._starlightOn = true;
    const R = this.entry.regions || {};
    this._headSaved = (R.headliner || []).map((m) => m.color.getHex());
    this._moodBefore = this.mood;
    for (const m of R.headliner || []) {
      gsap.killTweensOf(m.color);
      gsap.to(m.color, { r: 0.03, g: 0.035, b: 0.05, duration: 1.2, ease: "power2.inOut" });
    }
    this.setMood("midnight");
    this.sfx.chime();
  }

  exitStarlight() {
    if (!this._starlightOn) return;
    this._starlightOn = false;
    const R = this.entry.regions || {};
    (R.headliner || []).forEach((m, i) => {
      const hex = this._headSaved ? this._headSaved[i] : 0xe4ddcf;
      const c = new THREE.Color(hex);
      gsap.killTweensOf(m.color);
      gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: 1.0, ease: "power2.inOut" });
    });
    if (this._moodBefore && this._moodBefore !== "midnight") this.setMood(this._moodBefore);
  }

  /* -------------------------------------------- touch anything ---- */
  handleTap(clientX, clientY) {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.showroom.camera);
    const hits = this.raycaster.intersectObject(this.entry.group, true);
    const hit = hits.find((h) => h.object.visible);
    if (!hit) return;

    const node = (hit.object.name || "").toLowerCase();
    const entryDef = TOUCH_MAP.find((t) => t.re.test(node)) || { label: "Coachbuilt detail" };

    // the physical response: a tiny engineered press with spring-back
    const mesh = hit.object;
    gsap.killTweensOf(mesh.scale);
    gsap.to(mesh.scale, { x: 0.996, y: 0.996, z: 0.996, duration: 0.09, ease: "power2.out" });
    gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.09, ease: "elastic.out(1, 0.35)" });

    switch (entryDef.act) {
      case "massage": this.massagePulse(mesh); this.sfx.slide(); break;
      case "chime": this.sfx.chime(); break;
      case "indicate": this.indicate(3); break;
      case "lamps": this.flashLamps(); break;
      default: this.sfx.click();
    }

    this.tapped.add(entryDef.label);
    if (this.onTap) {
      this.onTap({
        label: entryDef.label,
        act: entryDef.act || null,
        x: clientX,
        y: clientY,
        count: this.tapped.size,
      });
    }
  }

  massagePulse(mesh) {
    gsap.killTweensOf(mesh.position);
    const y0 = mesh.position.y;
    gsap.to(mesh.position, {
      y: y0 + 0.004,
      duration: 0.42,
      yoyo: true,
      repeat: 7,
      ease: "sine.inOut",
      onComplete: () => { mesh.position.y = y0; },
    });
  }

  indicate(times = 3) {
    const mats = this.entry.regions?.signals || [];
    for (const m of mats) {
      gsap.killTweensOf(m);
      gsap.fromTo(m, { emissiveIntensity: 1.6 }, {
        emissiveIntensity: 0,
        duration: 0.42,
        repeat: times * 2 - 1,
        ease: "steps(1)",
      });
    }
    let n = 0;
    const tick = setInterval(() => {
      this.sfx.click();
      if (++n >= times * 2) clearInterval(tick);
    }, 420);
  }

  flashLamps() {
    const mats = this.entry.regions?.lamps || [];
    for (const m of mats) {
      gsap.killTweensOf(m);
      gsap.to(m, { emissiveIntensity: 1.6, duration: 0.5, ease: "power2.out" });
      gsap.to(m, { emissiveIntensity: this.engineOn ? 1.1 : 0.12, duration: 1.1, delay: 1.4, ease: "power2.inOut" });
    }
    this.sfx.click();
  }

  /* -------------------------------------------- engine start ------ */
  engineStart(on) {
    this.engineOn = on;
    const R = this.entry.regions || {};
    for (const m of R.lamps || []) {
      gsap.to(m, { emissiveIntensity: on ? 1.1 : 0.12, duration: 0.9, ease: "power2.inOut" });
    }
    if (on) {
      // the fascia breathes awake — strips flare then settle
      for (const m of this.stripMats) {
        gsap.fromTo(m, { opacity: 0.25 }, { opacity: 0.9, duration: 1.6, ease: "power2.out" });
      }
    }
    if (!this.v12) this.v12 = new EngineAudio();
    this.v12.setEnabled(on && this.sfx.enabled);
    if (on) {
      this.v12.setMode("cabin");
    }
  }

  /* -------------------------------------------- weather ----------- */
  setRain(on) {
    this.rainOn = on;
    if (!this.rain) {
      const n = 1600;
      const pos = new Float32Array(n * 3);
      this._rainSpeed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = this.center.x + (Math.random() - 0.5) * 14;
        pos[i * 3 + 1] = Math.random() * 5.5;
        pos[i * 3 + 2] = this.center.z + (Math.random() - 0.5) * 12;
        this._rainSpeed[i] = 3.4 + Math.random() * 2.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0x9fb4cc,
          size: 0.02,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        })
      );
      this.rain.visible = false;
      this.showroom.scene.add(this.rain);
    }
    this.rain.visible = on;
    this.sfx.setRain(on);
    if (on && this.mood === "showroom") this.setMood("moonlight");
  }

  /* -------------------------------------------- bespoke ----------- */
  _tween(mats, hex, dur = 0.9) {
    const c = new THREE.Color(hex);
    for (const m of mats || []) {
      gsap.killTweensOf(m.color);
      gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: dur, ease: "power2.out" });
    }
  }

  setHides(pairId) {
    const p = HIDE_PAIRS.find((x) => x.id === pairId) || HIDE_PAIRS[0];
    this.hidePair = p;
    const R = this.entry.regions || {};
    this._tween(R.seats, p.seat);
    this._tween(R.seatPerf, p.perf);
    this._tween(R.cabin, p.cabin);
    this._tween(R.belts, p.belt);
    this._tween(R.carpet, p.carpet);
    this.sfx.slide();
  }

  setCarpet(hex) {
    this._tween(this.entry.regions?.carpet, hex);
    this.sfx.click();
  }

  setVeneer(id) {
    this.veneer = id;
    const R = this.entry.regions || {};
    for (const m of R.wood || []) {
      if (id === "walnut") {
        m.map = m.userData.walnut || m.map;
        m.color.set(0xb9855a);
        m.roughness = 0.22;
      } else if (id === "bleached") {
        m.map = m.userData.walnut || m.map;
        m.color.set(0xe0cba8);
        m.roughness = 0.3;
      } else if (id === "piano") {
        m.userData.walnut = m.userData.walnut || m.map;
        m.map = null;
        m.color.set(0x101114);
        m.roughness = 0.06;
      } else if (id === "carbon") {
        m.userData.walnut = m.userData.walnut || m.map;
        m.map = null;
        m.color.set(0x23262b);
        m.roughness = 0.34;
      }
      m.needsUpdate = true;
    }
    this.sfx.chime();
  }

  setMetal(id) {
    this.metal = id;
    const def = METALS.find((x) => x.id === id) || METALS[0];
    const R = this.entry.regions || {};
    for (const m of [...(R.metalBright || []), ...(R.metalMid || [])]) {
      gsap.to(m.color, {
        r: ((def.hex >> 16) & 255) / 255,
        g: ((def.hex >> 8) & 255) / 255,
        b: (def.hex & 255) / 255,
        duration: 0.9,
      });
      m.roughness = def.rough;
    }
    this.sfx.click();
  }

  /* World point from cabin-box fractions — robust to model scale. */
  W(fx, fy, fz) {
    return new THREE.Vector3(
      this.box.min.x + this.size.x * fx,
      this.box.min.y + this.size.y * fy,
      this.box.min.z + this.size.z * fz
    );
  }

  /* ------------------------------------------------ lights ------- */
  _buildLights() {
    const c = this.center;
    this.key = new THREE.PointLight(0xfff1dc, 0.5, 5.2, 1.9);
    this.key.position.set(c.x, this.box.min.y + this.size.y * 0.8, c.z);
    this.showroom.scene.add(this.key);

    // ambient strip glow — a coloured light that follows the theme
    this.glow = new THREE.PointLight(0xd8b878, 0.55, 3.6, 2.2);
    this.glow.position.set(c.x - this.size.x * 0.12, this.box.min.y + this.size.y * 0.42, c.z);
    this.showroom.scene.add(this.glow);
  }

  /* A fibre-optic star: a hard bright core, a soft halo, and a faint
     four-point diffraction cross so the brighter tips sparkle like the
     real Starlight Headliner rather than reading as fuzzy dots. */
  _starSprite() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, 64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.1, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.32, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.06)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);

    // diffraction cross
    g.globalCompositeOperation = "lighter";
    const spike = g.createLinearGradient(0, 32, 64, 32);
    spike.addColorStop(0, "rgba(255,255,255,0)");
    spike.addColorStop(0.5, "rgba(255,255,255,0.5)");
    spike.addColorStop(1, "rgba(255,255,255,0)");
    g.strokeStyle = spike;
    g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(2, 32); g.lineTo(62, 32);
    g.moveTo(32, 2); g.lineTo(32, 62); g.stroke();

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildStars() {
    // Built-in PointsMaterial for bullet-proof depth behaviour; twinkle is
    // animated on the CPU through the vertex-colour buffer (a few hundred
    // stars — negligible).
    this.starMat = new THREE.PointsMaterial({
      size: 0.016,
      sizeAttenuation: true,
      map: this._starSprite(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = null;
    this.regenStars();
  }

  /*
   * Build a surface sampler from the actual headliner mesh so stars land
   * exactly on the curved roof lining instead of a guessed flat plane.
   *
   * The sampler is built in the mesh's LOCAL space and the mesh's live world
   * matrix is applied per-sample at regen time — this decouples the sampler
   * from when it was built (world matrices may be stale during construction)
   * and keeps the canopy glued to the roof however the cabin is transformed.
   */
  _buildRoofSampler() {
    const meshes = (this.entry.headlinerMeshes || []).filter(
      (m) => m.geometry && m.geometry.attributes.position
    );
    if (!meshes.length) return null;

    // If several roof meshes exist, bake them into one under the first mesh's
    // frame; the shared world matrix is then applied at sample time.
    this._roofMesh = meshes[0];
    let geo;
    if (meshes.length === 1) {
      geo = meshes[0].geometry;
    } else {
      const inv = new THREE.Matrix4();
      meshes[0].updateWorldMatrix(true, false);
      inv.copy(meshes[0].matrixWorld).invert();
      const geos = [];
      for (const m of meshes) {
        m.updateWorldMatrix(true, false);
        const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        src.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", src.attributes.position.clone());
        if (src.attributes.normal) g.setAttribute("normal", src.attributes.normal.clone());
        geos.push(g);
      }
      geo = BufferGeometryUtils.mergeGeometries(geos, false) || geos[0];
    }
    if (!geo) return null;

    this.roofSampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
    return this.roofSampler;
  }

  regenStars(cfg = {}) {
    Object.assign(this.starCfg, cfg);
    const { density, mode } = this.starCfg;
    const def = STAR_MODES[mode] || STAR_MODES.classic;

    if (this.stars) {
      this.showroom.scene.remove(this.stars);
      this.stars.geometry.dispose();
    }

    const n = Math.round(density);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this._starSeed = new Float32Array(n);
    this._starBase = new Float32Array(n * 3);
    this._starMag = new Float32Array(n);

    if (!this.roofSampler && !this._roofTried) {
      this._roofTried = true;
      this._buildRoofSampler();
    }

    const setColor = (i) => {
      this._starSeed[i] = Math.random() * 40;
      // magnitude: a power curve gives many faint stars and a few brilliant
      // ones — the natural distribution the real headliner has
      this._starMag[i] = 0.32 + Math.pow(Math.random(), 2.4) * 1.25;
      const c = def.colors[(Math.random() * def.colors.length) | 0];
      this._starBase[i * 3] = c[0];
      this._starBase[i * 3 + 1] = c[1];
      this._starBase[i * 3 + 2] = c[2];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    };

    if (this.roofSampler && this._roofMesh) {
      // work in world space using the mesh's live transform
      this._roofMesh.updateWorldMatrix(true, false);
      const world = this._roofMesh.matrixWorld;
      const rb = new THREE.Box3().setFromObject(this._roofMesh);
      const rangeY = Math.max(1e-4, rb.max.y - rb.min.y);
      // Galaxy: a Gaussian cluster on the roof, so density swells at a centre
      const clusterC = def.cluster ? this.W(0.34, 1.0, 0.42) : null;
      const _p = new THREE.Vector3();
      const _nrm = new THREE.Vector3();
      const _cabin = new THREE.Vector3(this.center.x, rb.min.y - 0.5, this.center.z);
      const _dir = new THREE.Vector3();
      let i = 0, guard = 0;
      while (i < n && guard < n * 60) {
        guard++;
        this.roofSampler.sample(_p, _nrm);
        _p.applyMatrix4(world);
        // only the upper roof shell (skip A-pillar / visor trim on the mesh)
        const hy = (_p.y - rb.min.y) / rangeY;
        if (hy < 0.62) continue;
        // Milky Way: bias toward a longitudinal band
        if (def.band && Math.abs(_p.z - this.center.z) > this.size.z * 0.2 && Math.random() < 0.72) continue;
        // Galaxy: keep a sparse field but concentrate ~60% near the cluster
        if (clusterC) {
          const dx = _p.x - clusterC.x, dz = _p.z - clusterC.z;
          const g = Math.exp(-(dx * dx + dz * dz) / (2 * 0.34 * 0.34));
          if (Math.random() > 0.4 + 0.6 * g) continue;
        }
        // nudge a hair toward the cabin interior so each fibre tip sits on the
        // visible face of the lining (never buried behind the opaque roof shell)
        _dir.copy(_cabin).sub(_p).normalize();
        const off = 0.01;
        pos[i * 3] = _p.x + _dir.x * off;
        pos[i * 3 + 1] = _p.y + _dir.y * off;
        pos[i * 3 + 2] = _p.z + _dir.z * off;
        setColor(i);
        i++;
      }
      // if the mesh was too small to fill, top up the rest at the last point
      for (; i < n; i++) { pos[i * 3] = pos[0]; pos[i * 3 + 1] = pos[1]; pos[i * 3 + 2] = pos[2]; setColor(i); }
    } else {
      // fallback: the previous flat-plane scatter
      const cx = this.center.x, cz = this.center.z;
      const roofY = this.box.min.y + this.size.y * 0.755;
      for (let i = 0; i < n; i++) {
        let fx = Math.random() - 0.5;
        let fz = Math.random() - 0.5;
        if (def.band && Math.random() < 0.62) fz = (Math.random() - 0.5) * 0.35 + Math.sin(fx * 4.0) * 0.1;
        pos[i * 3] = cx + (0.14 + fx * 0.27) * this.size.x;
        pos[i * 3 + 1] = roofY + (Math.random() - 0.5) * 0.02;
        pos[i * 3 + 2] = cz + fz * this.size.z * 0.58;
        setColor(i);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this._starAurora = !!def.aurora;

    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.renderOrder = 4;
    this.showroom.scene.add(this.stars);

    // keep legacy handles alive for drive-mode visibility toggles
    this.showroom.starPoints = this.stars;
    this.showroom.starGeo = geo;
  }

  /* One shooting star arcing across the headliner. */
  meteor() {
    // ride just under the real roof if we have it, else the old estimate
    let roofY = this.box.min.y + this.size.y * 0.86;
    if (this._roofMesh) {
      this._roofMesh.updateWorldMatrix(true, false);
      const rb = new THREE.Box3().setFromObject(this._roofMesh);
      roofY = rb.min.y + (rb.max.y - rb.min.y) * 0.78;
    }
    const z0 = this.center.z + (Math.random() - 0.5) * this.size.z * 0.5;
    const x0 = this.center.x - this.size.x * 0.2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.22, 0.004, -0.05),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xfff6dd,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.position.set(x0, roofY, z0);
    this.showroom.scene.add(line);
    this._meteors.push(line);

    gsap.to(mat, { opacity: 0.9, duration: 0.12, ease: "power1.out" });
    gsap.to(line.position, {
      x: x0 + this.size.x * 0.42,
      z: z0 + (Math.random() - 0.5) * 0.3,
      duration: 0.85,
      ease: "power1.in",
    });
    gsap.to(mat, {
      opacity: 0,
      duration: 0.3,
      delay: 0.6,
      onComplete: () => {
        this.showroom.scene.remove(line);
        geo.dispose();
        mat.dispose();
        this._meteors = this._meteors.filter((m) => m !== line);
      },
    });
  }

  shower() {
    for (let i = 0; i < 7; i++) setTimeout(() => this.meteor(), i * 240);
  }

  /* ------------------------------------------------ strips ------- */
  _buildStrips() {
    this.stripMats = [];
    const mk = (len, axis) => {
      const geo = axis === "x"
        ? new THREE.BoxGeometry(len, 0.012, 0.012)
        : new THREE.BoxGeometry(0.012, 0.012, len);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.ambientHex), toneMapped: false, transparent: true, opacity: 0.9 });
      this.stripMats.push(mat);
      return new THREE.Mesh(geo, mat);
    };

    const group = new THREE.Group();
    // dash line, spanning the cabin width near the windscreen base
    const dash = mk(this.size.z * 0.62, "z");
    dash.position.copy(this.W(0.24, 0.58, 0.5));
    group.add(dash);
    // door sills, both flanks
    for (const fz of [0.09, 0.91]) {
      const sill = mk(this.size.x * 0.4, "x");
      sill.position.copy(this.W(0.48, 0.4, fz));
      group.add(sill);
    }
    // rear deck
    const rear = mk(this.size.z * 0.5, "z");
    rear.position.copy(this.W(0.78, 0.52, 0.5));
    group.add(rear);

    this.strips = group;
    this.showroom.scene.add(group);
  }

  setAmbientTheme(hex) {
    this.ambientHex = hex;
    const c = new THREE.Color(hex);
    for (const m of this.stripMats) gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: 1.1, ease: "power2.out" });
    gsap.to(this.glow.color, { r: c.r, g: c.g, b: c.b, duration: 1.1, ease: "power2.out" });
    this.sfx.click();
  }

  /* ------------------------------------------------ moods -------- */
  setMood(id) {
    const m = MOODS[id];
    if (!m) return;
    this.mood = id;
    this._glowBase = m.glow;
    gsap.to(this.key, { intensity: m.key, duration: 1.4, ease: "power2.inOut" });
    const kc = new THREE.Color(m.keyColor);
    gsap.to(this.key.color, { r: kc.r, g: kc.g, b: kc.b, duration: 1.4 });
    gsap.to(this.glow, { intensity: m.glow, duration: 1.4 });
    gsap.to(this.showroom.scene, {
      environmentIntensity: m.env === null ? this._savedEnv : m.env,
      duration: 1.4,
    });
    gsap.to(this.showroom.bloom, { strength: m.bloom, duration: 1.4 });
    this.sfx.click();
  }

  /* ------------------------------------------------ glass -------- */
  setGlass({ tint = this.tint, privacy = this.privacy }) {
    this.tint = tint;
    this.privacy = privacy;
    const mats = this.entry.glassMats || [];
    const opacity = privacy ? 0.94 : 0.35 + tint * 0.5;
    const dark = privacy ? 0.035 : 0.12 - tint * 0.08;
    for (const m of mats) {
      gsap.to(m, { opacity, duration: 1.0, ease: "power2.inOut" });
      gsap.to(m.color, { r: dark, g: dark * 1.15, b: dark * 1.6, duration: 1.0 });
    }
    this.sfx.slide();
  }

  /* ------------------------------------------------ seats -------- */
  setSeatClimate(mode) {
    this.seatClimate = mode;
    const mats = this.entry.leatherMats || [];
    const target =
      mode === "heat" ? new THREE.Color(0xff5a1e) :
      mode === "cool" ? new THREE.Color(0x4d8dff) : new THREE.Color(0x000000);
    const intensity = mode ? (mode === "heat" ? 0.16 : 0.12) : 0;
    for (const m of mats) {
      if (!m.emissive) continue;
      gsap.to(m.emissive, { r: target.r, g: target.g, b: target.b, duration: 1.2 });
      gsap.to(m, { emissiveIntensity: intensity, duration: 1.2 });
    }
    this.sfx.slide();
  }

  /* ------------------------------------------------ hotspots ----- */
  _buildHotspots() {
    this.hotspots = [
      {
        id: "starlight",
        label: "Starlight Headliner",
        marker: this.W(0.5, 0.88, 0.5),
        cam: this.W(0.58, 0.62, 0.5),
        look: this.W(0.4, 1.02, 0.5),
      },
      {
        id: "dash",
        label: "The Driver's Stage",
        marker: this.W(0.26, 0.6, 0.5),
        cam: this.W(0.6, 0.72, 0.46),
        look: this.W(0.18, 0.55, 0.52),
      },
      {
        id: "seats",
        label: "Hand-Stitched Hides",
        marker: this.W(0.46, 0.48, 0.3),
        cam: this.W(0.76, 0.85, 0.74),
        look: this.W(0.42, 0.42, 0.26),
      },
      {
        id: "lounge",
        label: "The Rear Lounge",
        marker: this.W(0.72, 0.52, 0.5),
        cam: this.W(0.34, 0.72, 0.5),
        look: this.W(0.82, 0.46, 0.5),
      },
      {
        id: "veneer",
        label: "Open-Pore Veneer",
        marker: this.W(0.36, 0.48, 0.52),
        cam: this.W(0.54, 0.7, 0.4),
        look: this.W(0.3, 0.42, 0.55),
      },
      {
        id: "glass",
        label: "Panorama & Privacy",
        marker: this.W(0.5, 0.64, 0.1),
        cam: this.W(0.52, 0.66, 0.5),
        look: this.W(0.46, 0.6, 0.0),
      },
      {
        id: "audio",
        label: "Bespoke Audio Suite",
        marker: this.W(0.3, 0.36, 0.84),
        cam: this.W(0.62, 0.72, 0.34),
        look: this.W(0.26, 0.28, 0.9),
      },
    ];
  }

  /* Fly the camera to a feature, then let the user look around from there. */
  focus(id) {
    const h = this.hotspots.find((x) => x.id === id);
    if (!h) return;
    this.focused = id;
    this.showroom.flyTo(h.cam, h.look, { mode: "pov" }, 1.7);
    this.sfx.thump();
  }

  /* Return to the lounge view (keeps cabin mode). */
  unfocus() {
    this.focused = null;
    this.viewpoint("lounge");
  }

  baseShot() {
    return { pos: this.W(0.72, 0.68, 0.46), look: this.W(0.2, 0.55, 0.52) };
  }

  enter() {
    const sr = this.showroom;
    sr.cabinMode = true;
    this.viewpoint("lounge");
    this.setMood("moonlight");
    this.sfx.thump();
    this.sfx.setAmbience(true);
  }

  exit() {
    const sr = this.showroom;
    this.focused = null;
    if (sr.cabinFocus) {
      gsap.killTweensOf(sr.cabinFocus.pos);
      gsap.killTweensOf(sr.cabinFocus.look);
    }
    sr.cabinFocus = null;
    sr.explore = null;
    sr.cabinMode = false;
    this.setSeatClimate(null);
    this.engineStart(false);
    this.setRain(false);
    this.exitStarlight();
    this.currentView = null;
    this.sfx.setAmbience(false);
    this.setMood("showroom");
  }

  /* Screen-space marker positions for the HUD. */
  getMarkers() {
    const cam = this.showroom.camera;
    const v = new THREE.Vector3();
    return this.hotspots.map((h) => {
      v.copy(h.marker).project(cam);
      const behind = v.z > 1;
      return {
        id: h.id,
        label: h.label,
        x: (v.x * 0.5 + 0.5) * 100,
        y: (-v.y * 0.5 + 0.5) * 100,
        visible: !behind && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05,
      };
    });
  }

  update(t, dt = 0.016) {
    // the cabin breathes: ambient glow drifts like a slow pulse
    if (this.glow) {
      this.glow.intensity = this._glowBase * (0.88 + 0.12 * Math.sin(t * 0.55));
    }

    // rain falls and recycles
    if (this.rain && this.rain.visible) {
      const p = this.rain.geometry.attributes.position;
      const arr = p.array;
      for (let i = 0; i < this._rainSpeed.length; i++) {
        arr[i * 3 + 1] -= this._rainSpeed[i] * dt;
        arr[i * 3] -= dt * 0.35;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 5.5;
          arr[i * 3] = this.center.x + (Math.random() - 0.5) * 14;
        }
      }
      p.needsUpdate = true;
    }

    // Comet mode: shooting stars streak across on their own
    if (this.starCfg.mode === "comet" && this.showroom.cabinMode && this.stars && this.stars.visible) {
      this._cometT = (this._cometT || 0) + dt;
      if (this._cometT > (this._cometGap || 2.8)) {
        this._cometT = 0;
        this._cometGap = 1.8 + Math.random() * 2.6;
        this.meteor();
      }
    }

    if (!this.stars || !this._starBase) return;
    const { brightness, speed } = this.starCfg;
    const colAttr = this.stars.geometry.attributes.color;
    const col = colAttr.array;
    const base = this._starBase;
    const seed = this._starSeed;
    const mag = this._starMag;
    const n = seed.length;
    for (let i = 0; i < n; i++) {
      const m = mag ? mag[i] : 1;
      const tw = (0.25 + 0.75 * Math.abs(Math.sin(t * speed * 1.4 + seed[i]))) * brightness * m;
      let r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
      if (this._starAurora) {
        const h = 0.5 + 0.5 * Math.sin(t * 0.35 + seed[i] * 2.1);
        r = 0.55;
        g = 1.0 - 0.25 * h;
        b = 0.78 + 0.22 * h;
      }
      col[i * 3] = r * tw;
      col[i * 3 + 1] = g * tw;
      col[i * 3 + 2] = b * tw;
    }
    colAttr.needsUpdate = true;
  }

  dispose() {
    this.sfx.dispose();
    this.v12?.dispose();
    if (this.rain) {
      this.showroom.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
    }
    if (this.stars) {
      this.showroom.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.starMat.dispose();
    }
    if (this.strips) this.showroom.scene.remove(this.strips);
    this.showroom.scene.remove(this.key, this.glow);
  }
}

export { AMBIENT_THEMES, MOODS, HIDE_PAIRS, VENEERS, METALS };
