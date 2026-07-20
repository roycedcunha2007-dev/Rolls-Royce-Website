import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LINEUP, INTERIOR_CAR_FILE } from "../data/lineup.js";

import { ShowroomFloor } from "./showroom/ShowroomFloor.js";
import { ShowroomLights } from "./showroom/ShowroomLights.js";
import { ShowroomArchitecture } from "./showroom/ShowroomArchitecture.js";
import { ShowroomProps } from "./showroom/ShowroomProps.js";
import { ShowroomDrive } from "./showroom/ShowroomDrive.js";
import { CabinExperience } from "./showroom/CabinExperience.js";

gsap.registerPlugin(ScrollTrigger);

const SANCTUARY_POS = new THREE.Vector3(0, 0, -20);

// Camera shots — one cinematic composition per scroll beat.
const SHOTS = [
  { pos: [9.8, 1.6, 9.6], look: [0, 1.0, -1.2] },        // arrival: 3/4 hero
  { pos: [13.2, 3.4, 13.4], look: [-2, 1.6, -6] },       // the marque: architectural wide
  { pos: [-9.6, 1.9, 9.4], look: [-3, 1.3, -2] },        // atelier: materials wall side
  { pos: [1.5, 1.18, -19.55], look: [-2.6, 0.95, -20.1] }, // sanctuary: cabin wide
  { pos: [0.35, 1.14, -20.35], look: [-2.6, 0.9, -19.85] },// sanctuary: dash detail
  { pos: [5.3, 1.35, 4.4], look: [1.9, 0.95, 0.35] },    // craft: low front detail
  { pos: [12.8, 4.4, 13.8], look: [-1.5, 1.2, -4.5] },   // commission: elevated hero
];

const isPaintName = (n) =>
  n.includes("primary_paint") ||
  n.includes("remap_body") ||
  n.includes("carpaint") ||
  n === "body.4" ||
  n.startsWith("body.") ||
  n.includes("colored");

export class Showroom {
  constructor(container, { onProgress, onReady, onTelemetry, onSection, onBusy } = {}) {
    this.container = container;
    this.onProgress = onProgress;
    this.onReady = onReady;
    this.onTelemetry = onTelemetry;
    this.onSection = onSection;
    this.onBusy = onBusy;

    this.cars = {};
    for (const key of Object.keys(LINEUP)) {
      this.cars[key] = {
        group: new THREE.Group(),
        paintMats: [],
        secondaryMats: [],
        chromeMats: [],
        caliperMats: [],
        doorPivots: {},
        bonnetPivot: null,
        wheelPivots: [],
        loaded: false,
        promise: null,
      };
    }
    this.activeKey = null;
    this.paintHex = "#1c2e4a"; // Salamanca Blue
    this.twoToneHex = null;
    this.leatherHex = "#ded8ca";
    this.woodHex = "#4a2c18";
    this.jewellery = "chrome";
    this.caliperHex = "#7fb2ff";
    this.doorsOpen = false;
    this.bonnetOpen = false;
    this.driveMode = false;
    this.sectionIndex = 0;

    this.disposed = false;

    this._init();
    window.__rr = this; // debug context handle
  }

  snapshot(quality = 0.72) {
    this.smoothPos.copy(this.camState.pos);
    this.smoothLook.copy(this.camState.look);
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
    this.composer.render();
    return this.renderer.domElement.toDataURL("image/jpeg", quality);
  }

  snapshotAt(pos, look, quality = 0.72) {
    if (this.renderer.domElement.width === 0) {
      this.renderer.setSize(1280, 800);
      this.composer.setSize(1280, 800);
      this.camera.aspect = 1280 / 800;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(...pos);
    this.camera.lookAt(new THREE.Vector3(...look));
    this.composer.render();
    return this.renderer.domElement.toDataURL("image/jpeg", quality);
  }

  _init() {
    const c = this.container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
    this.renderer.setSize(c.clientWidth, c.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    c.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87979d);
    this.scene.fog = new THREE.FogExp2(0x3e403c, 0.0055);
    this.scene.environmentIntensity = 0.7;

    this.camera = new THREE.PerspectiveCamera(39, c.clientWidth / c.clientHeight, 0.08, 160);

    // High-End Post-processing Pipeline
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    // Luxury Bloom (subtle glow on highlights)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(c.clientWidth, c.clientHeight), 0.14, 0.4, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Initialize Modular Showroom Elements
    this.lights = new ShowroomLights(this.scene);
    this.architecture = new ShowroomArchitecture(this.scene);
    this.floor = new ShowroomFloor(this.scene);
    this.props = new ShowroomProps(this.scene);
    this.drive = new ShowroomDrive(this.scene);

    this._buildDust();
    this._buildHologram();

    this._loadAssets();
    this._cameraRig();
    this._interaction();
    this._loop();

    this._resize = () => {
      const w = c.clientWidth, h = c.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    };
    window.addEventListener("resize", this._resize);
  }

  _buildDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 9 + 0.15;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34 + (Math.random() < 0.28 ? SANCTUARY_POS.z : 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe6c2,
        size: 0.009,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.dust);
  }

  _buildHologram() {
    const g = new THREE.Group();
    const solid = new THREE.MeshBasicMaterial({
      color: 0x7fb2ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wire = new THREE.MeshBasicMaterial({
      color: 0xbcd8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.62), solid);
    const blockWire = new THREE.Mesh(block.geometry, wire);
    g.add(block, blockWire);

    this.holoCells = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), solid.clone());
        cyl.position.set(-0.33 + i * 0.13, 0.3, side * 0.19);
        cyl.rotation.x = side * 0.42;
        g.add(cyl);
        this.holoCells.push(cyl);
      }
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.006, 8, 72), wire.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.1;
    g.add(ring);
    this.holoRing = ring;

    g.position.set(1.55, 1.5, 0);
    g.visible = false;
    g.scale.setScalar(0.001);
    this.hologram = g;
    this.scene.add(g);
  }

  _loadAssets() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_u, l, t) => {
      if (!this.disposed && this.onProgress) this.onProgress(Math.round((l / t) * 100));
    };
    manager.onLoad = () => {
      if (!this.disposed && this.onReady) this.onReady();
      this._loadSecondary();
    };
    manager.onError = (url) => console.error("[rr] loading error:", url);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.pmrem = pmrem;

    new RGBELoader(manager).load("/env/studio.hdr", (hdr) => {
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    });

    this.loader = new GLTFLoader(manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this._loadCar("Ghost", manager);
    this._loadInteriorCar(manager);
  }

  _loadSecondary() {
    const lazy = new GLTFLoader();
    lazy.setMeshoptDecoder(MeshoptDecoder);
    this.lazyLoader = lazy;
    for (const key of Object.keys(LINEUP)) {
      if (key !== "Ghost") this._loadCar(key, null, lazy);
    }
  }

  _loadCar(key, manager, loaderOverride) {
    const def = LINEUP[key];
    const loader = loaderOverride || this.loader;
    const entry = this.cars[key];

    entry.promise = new Promise((resolve) => {
      loader.load(def.file, (gltf) => {
        if (this.disposed) return;
        this._dress(key, gltf.scene, entry);
        const staged = this._stage(gltf.scene, def.length);
        entry.group.add(staged);
        this._stripBackdrops(entry);
        this._clusterWheels(entry);
        this._findHinges(key, entry);
        entry.group.visible = key === this.activeKey;
        this.scene.add(entry.group);
        entry.loaded = true;
        this._applyCustomization(entry);
        resolve(entry);
      });
    });

    if (key === "Ghost" && !this.activeKey) this.activeKey = "Ghost";
  }

  _loadInteriorCar(manager) {
    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(INTERIOR_CAR_FILE, (gltf) => {
      if (this.disposed) return;
      const entry = {
        group: new THREE.Group(),
        paintMats: [],
        secondaryMats: [],
        chromeMats: [],
        caliperMats: [],
        leatherMats: [],
        woodMats: [],
        glassMats: [],
        wheelPivots: [],
        doorPivots: {},
        loaded: true,
      };
      this._dressInterior(gltf.scene, entry);
      const staged = this._stage(gltf.scene, 5.55);
      entry.group.add(staged);
      entry.group.position.copy(SANCTUARY_POS);
      entry.group.rotation.y = 0;
      this.scene.add(entry.group);
      this.interiorCar = entry;
      this.cabin = new CabinExperience(this, entry);
      this._applyCustomization(entry);
      // the cabin's two-tone commission is the source of truth in here, so
      // it lands after the global paint/leather pass
      this.cabin.setHides(this.cabin.hidePair.id);
    });
  }

  _stage(root, targetLength) {
    const wrapper = new THREE.Group();
    wrapper.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) root.rotation.y = Math.PI / 2;
    const box2 = new THREE.Box3().setFromObject(wrapper);
    const size2 = box2.getSize(new THREE.Vector3());
    const scale = targetLength / Math.max(size2.x, size2.z);
    wrapper.scale.setScalar(scale);
    const box3 = new THREE.Box3().setFromObject(wrapper);
    const center = box3.getCenter(new THREE.Vector3());
    wrapper.position.set(-center.x, -box3.min.y, -center.z);
    return wrapper;
  }

  _dress(key, root, entry) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const m = obj.material;
      if (!m) return;
      const name = (m.name || "").toLowerCase();
      m.envMapIntensity = 1.1;

      if (key === "Phantom") {
        const node = (obj.name || "").toLowerCase();
        if (node.includes("circle")) {
          obj.material = new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.1 });
          return;
        }
        if (node.includes("female")) {
          obj.material = this._chromeMat();
          entry.chromeMats.push(obj.material);
          return;
        }
        if ((m.name || "") === "Material.002") {
          obj.material = new THREE.MeshPhysicalMaterial({ color: 0x0c0f14, metalness: 0.4, roughness: 0.05, envMapIntensity: 1.8 });
          return;
        }
        const paint = this._paintMat();
        obj.material = paint;
        entry.paintMats.push(paint);
        return;
      }

      if (key === "Cullinan") {
        const node = (obj.name || "").toLowerCase();
        if (node.startsWith("glass")) {
          obj.material = new THREE.MeshPhysicalMaterial({
            color: 0x11161f, metalness: 0.3, roughness: 0.05, envMapIntensity: 1.6,
            transparent: true, opacity: 0.85, side: THREE.DoubleSide,
          });
        } else if (name === "colored") {
          const paint = new THREE.MeshPhysicalMaterial({
            map: m.map || null,
            color: new THREE.Color(this.paintHex),
            metalness: 0.75,
            roughness: 0.32,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06,
            envMapIntensity: 1.1,
            side: THREE.DoubleSide,
          });
          obj.material = paint;
          entry.paintMats.push(paint);
        } else if (name === "wheel") {
          m.metalness = 0.85;
          m.roughness = 0.3;
          m.envMapIntensity = 1.1;
        } else if (name.toLowerCase() === "dash") {
          m.envMapIntensity = 0.55;
        } else {
          m.metalness = 0.75;
          m.roughness = 0.3;
          m.envMapIntensity = 1.15;
          m.side = THREE.DoubleSide;
        }
        return;
      }

      if (isPaintName(name)) {
        const paint = this._paintMat();
        obj.material = paint;
        entry.paintMats.push(paint);
      } else if (name.includes("secondary_paint")) {
        const paint = this._paintMat();
        obj.material = paint;
        entry.secondaryMats.push(paint);
      } else if (name.includes("chrome")) {
        m.metalness = 1.0;
        m.roughness = 0.09;
        m.envMapIntensity = 1.1;
        entry.chromeMats.push(m);
      } else if (name.includes("brake") || name.includes("tormoz")) {
        const cal = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.caliperHex), metalness: 0.75, roughness: 0.28 });
        obj.material = cal;
        entry.caliperMats.push(cal);
      } else if (name.includes("mirror_glass")) {
        m.metalness = 1.0;
        m.roughness = 0.02;
      } else if (name.includes("windshield") || name.includes("glass") || name.includes("steklo")) {
        m.roughness = 0.03;
        m.envMapIntensity = 1.8;
        if (name.includes("glass.012")) {
          obj.material = new THREE.MeshPhysicalMaterial({ color: 0x0c1118, metalness: 0.35, roughness: 0.05, envMapIntensity: 1.8 });
        }
      } else if (name.includes("rubber") || name === "tire" || name.includes("sidewall") || name.includes("tire_white")) {
        m.roughness = 0.9;
        m.envMapIntensity = 0.3;
      } else if (name.includes("rim")) {
        m.metalness = 1.0;
        m.roughness = 0.2;
        m.envMapIntensity = 1.0;
        entry.chromeMats.push(m);
      } else if (name.includes("headlight_beam") || name.includes("small_light") || name === "ext_light_shad" || name.includes("lightsdfs")) {
        m.envMapIntensity = 0.5;
        if (m.emissive) m.emissiveIntensity = 0.25;
      } else if (name.includes("tailight_red") || name.includes("brake_light")) {
        m.emissive = new THREE.Color(0x7a1218);
        m.emissiveIntensity = 0.65;
      }
    });
  }

  /* Procedural open-pore walnut so the veneer reads as real wood. */
  _woodTexture() {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 512;
    const g = cv.getContext("2d");
    g.fillStyle = "#5a381e";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * 512;
      const w = 1 + Math.random() * 3.4;
      const tone = Math.random();
      g.strokeStyle = tone < 0.5
        ? `rgba(38, 22, 10, ${0.14 + Math.random() * 0.22})`
        : `rgba(150, 100, 55, ${0.1 + Math.random() * 0.16})`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(-20, y);
      for (let x = 0; x <= 532; x += 32) {
        g.lineTo(x, y + Math.sin(x * 0.011 + i) * 7 + (Math.random() - 0.5) * 3);
      }
      g.stroke();
    }
    // fine pores
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(25, 14, 6, ${0.05 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 0.8);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /*
   * The interior GLB's node names preserve the original GTA material regions
   * even after deduplication — use them to rebuild a bespoke, colourful
   * cabin: two-tone hides, navy carpet, walnut veneer, jewelled metals.
   */
  _dressInterior(root, entry) {
    entry.regions = {
      seats: [], seatPerf: [], cabin: [], carpet: [], wood: [],
      headliner: [], belts: [], metalBright: [], metalMid: [],
      signals: [], lamps: [],
    };
    const R = entry.regions;

    const mk = (opts) => new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.25, ...opts });

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const m = obj.material;
      if (!m) return;
      const node = (obj.name || "").toLowerCase();
      const name = (m.name || "").toLowerCase();
      m.envMapIntensity = 0.25;

      if (node.includes("leatherperf")) {
        // perforated seat centres — the contrast tone of the two-tone hide
        const mat = mk({ color: 0xe8dfcd, roughness: 0.7, metalness: 0.02 });
        obj.material = mat;
        R.seatPerf.push(mat);
      } else if (node.includes("leatherbmp")) {
        // main seat hide
        const mat = mk({ color: 0x2c4a74, roughness: 0.58, metalness: 0.03, sheen: 0.4, sheenColor: new THREE.Color(0x6d86ab) });
        obj.material = mat;
        R.seats.push(mat);
        entry.leatherMats.push(mat);
      } else if (node.includes("carpetdfs")) {
        const mat = mk({ color: 0x1c2c47, roughness: 0.96, metalness: 0, envMapIntensity: 0.08 });
        obj.material = mat;
        R.carpet.push(mat);
      } else if (node.includes("wooddfs")) {
        const mat = mk({
          map: this._woodTexture(),
          color: 0xb9855a,
          roughness: 0.22,
          metalness: 0.05,
          clearcoat: 1.0,
          clearcoatRoughness: 0.12,
          envMapIntensity: 0.5,
        });
        obj.material = mat;
        R.wood.push(mat);
        entry.woodMats.push(mat);
      } else if (node.includes("fabricroof")) {
        const mat = mk({ color: 0xe4ddcf, roughness: 0.92, metalness: 0, envMapIntensity: 0.1 });
        obj.material = mat;
        R.headliner.push(mat);
      } else if (node.includes("seatbelt")) {
        const mat = mk({ color: 0x24406b, roughness: 0.75, metalness: 0.02 });
        obj.material = mat;
        R.belts.push(mat);
      } else if (node.includes("interiordfs") || node.includes("ff999999")) {
        // dash / door-card leather wrap — the pale surround tone
        const mat = mk({ color: 0xded4c2, roughness: 0.6, metalness: 0.03 });
        obj.material = mat;
        R.cabin.push(mat);
      } else if (node.includes("ffcccccc") || node.includes("ff9a9a9a")) {
        // brightwork: vents, bezels, handles
        const mat = mk({ color: 0xf2f3f5, roughness: 0.16, metalness: 1.0, envMapIntensity: 0.9 });
        obj.material = mat;
        R.metalBright.push(mat);
      } else if (node.includes("ff666666")) {
        const mat = mk({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9, envMapIntensity: 0.6 });
        obj.material = mat;
        R.metalMid.push(mat);
      } else if (node.includes("shader_turn")) {
        const mat = mk({ color: 0x76500f, roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(0xff9a1e), emissiveIntensity: 0 });
        obj.material = mat;
        R.signals.push(mat);
      } else if (node.includes("lightsdfs") || node.includes("shader_rear") || name.includes("vehiclelights")) {
        const mat = mk({ color: 0x2a2c30, roughness: 0.25, metalness: 0.4, emissive: new THREE.Color(0xfff2d8), emissiveIntensity: 0.12 });
        obj.material = mat;
        R.lamps.push(mat);
      } else if (node.includes("remap_body") || node.includes("exteriorost")) {
        // coachwork — the node name survives dedup, the material name doesn't
        const paint = this._paintMat();
        obj.material = paint;
        entry.paintMats.push(paint);
      } else if (name.includes("tormoz")) {
        const cal = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.caliperHex), metalness: 0.75, roughness: 0.28 });
        obj.material = cal;
        entry.caliperMats.push(cal);
      } else if (name.includes("steklo") || node.includes("steklo")) {
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0x0a0e15,
          metalness: 0.2,
          roughness: 0.04,
          transparent: true,
          opacity: 0.55,
          envMapIntensity: 0.12,
          side: THREE.DoubleSide,
        });
        obj.material = glass;
        entry.glassMats.push(glass);
      }
    });
  }

  _paintMat() {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.paintHex),
      metalness: 0.88,
      roughness: 0.3,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.0,
    });
  }

  _chromeMat() {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.06, envMapIntensity: 1.5 });
  }

  _stripBackdrops(entry) {
    entry.group.updateMatrixWorld(true);
    const meshes = [];
    entry.group.traverse((obj) => {
      if (!obj.isMesh) return;
      const b = new THREE.Box3().setFromObject(obj);
      const s = b.getSize(new THREE.Vector3());
      if (s.x > 4.5 && s.z > 3.0) meshes.push(obj);
    });

    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const posAttr = geo.attributes.position;
      const index = geo.index;
      if (!index) continue;
      const keep = [];
      const arr = index.array;
      for (let i = 0; i < arr.length; i += 3) {
        let grounded = 0;
        for (let k = 0; k < 3; k++) {
          v.fromBufferAttribute(posAttr, arr[i + k]);
          mesh.localToWorld(v);
          if (v.y < 0.06) grounded++;
        }
        if (grounded === 3) continue;
        keep.push(arr[i], arr[i + 1], arr[i + 2]);
      }
      if (keep.length < arr.length) geo.setIndex(keep);
    }
  }

  _clusterWheels(entry) {
    const wheelMeshes = [];
    entry.group.updateMatrixWorld(true);
    entry.group.traverse((obj) => {
      if (!obj.isMesh) return;
      const n = ((obj.material && obj.material.name) || obj.name || "").toLowerCase();
      if (/rim|tire|sidewall|tormoz|brake|wheel/.test(n)) wheelMeshes.push(obj);
    });
    if (wheelMeshes.length < 4) return;

    const carBox = new THREE.Box3().setFromObject(entry.group);
    const carCenter = carBox.getCenter(new THREE.Vector3());
    const clusters = new Map();

    for (const mesh of wheelMeshes) {
      const b = new THREE.Box3().setFromObject(mesh);
      const ctr = b.getCenter(new THREE.Vector3());
      const sx = ctr.x > carCenter.x ? 1 : -1;
      const sz = ctr.z > carCenter.z ? 1 : -1;
      const k = `${sx},${sz}`;
      if (!clusters.has(k)) clusters.set(k, []);
      clusters.get(k).push(mesh);
    }
    if (clusters.size < 2) return;

    for (const meshes of clusters.values()) {
      const box = new THREE.Box3();
      for (const mesh of meshes) box.expandByObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(entry.group.worldToLocal(center.clone()));
      entry.group.add(pivot);
      pivot.updateMatrixWorld(true);
      for (const mesh of meshes) pivot.attach(mesh);
      entry.wheelPivots.push(pivot);
    }
  }

  _findHinges(key, entry) {
    entry.group.traverse((obj) => {
      const n = (obj.name || "").toLowerCase();
      if (n === "door_lf_dummy") entry.doorPivots.lf = obj;
      else if (n === "door_rf_dummy") entry.doorPivots.rf = obj;
      else if (n === "door_lr_dummy") entry.doorPivots.lr = obj;
      else if (n === "door_rr_dummy") entry.doorPivots.rr = obj;
      else if (n === "bonnet_dummy" && !entry.bonnetPivot) entry.bonnetPivot = obj;
    });
  }

  _cameraRig() {
    this.camState = {
      pos: new THREE.Vector3(...SHOTS[0].pos),
      look: new THREE.Vector3(...SHOTS[0].look),
    };
    this.smoothPos = this.camState.pos.clone();
    this.smoothLook = this.camState.look.clone();

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: "#scroll-root",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.1,
      },
    });
    for (let i = 1; i < SHOTS.length; i++) {
      tl.to(this.camState.pos, { x: SHOTS[i].pos[0], y: SHOTS[i].pos[1], z: SHOTS[i].pos[2], duration: 1, ease: "power2.inOut" }, i - 1);
      tl.to(this.camState.look, { x: SHOTS[i].look[0], y: SHOTS[i].look[1], z: SHOTS[i].look[2], duration: 1, ease: "power2.inOut" }, i - 1);
    }
    this.scrollTl = tl;
  }

  setSectionIndex(idx) {
    this.sectionIndex = idx;
    if (this.lights) this.lights.setSanctuaryZ(idx === 3 ? SANCTUARY_POS.z : 0);
  }

  /* ------------------------------------------------------------------
   * Explore camera: cinematic fly-to, then hand control to the user —
   * free orbit around a target, or a seated first-person look-around.
   * ------------------------------------------------------------------ */
  flyTo(pos, look, after = null, duration = 1.6) {
    this.explore = null;
    if (!this.cabinFocus) {
      this.cabinFocus = { pos: this.camera.position.clone(), look: this.smoothLook.clone() };
    }
    gsap.killTweensOf(this.cabinFocus.pos);
    gsap.killTweensOf(this.cabinFocus.look);
    gsap.to(this.cabinFocus.pos, { x: pos.x, y: pos.y, z: pos.z, duration, ease: "power2.inOut" });
    gsap.to(this.cabinFocus.look, {
      x: look.x, y: look.y, z: look.z, duration, ease: "power2.inOut",
      onComplete: () => {
        if (after && !this.disposed) this._beginExplore(after, pos, look);
      },
    });
  }

  _beginExplore(after, pos, look) {
    this.cabinFocus = null;
    if (after.mode === "orbit") {
      const target = after.target.clone();
      const sph = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
      this.explore = {
        mode: "orbit",
        target,
        radius: sph.radius,
        theta: sph.theta,
        phi: sph.phi,
        minR: after.minR ?? 0.5,
        maxR: after.maxR ?? 13,
        minPhi: after.minPhi ?? 0.14,
        maxPhi: after.maxPhi ?? Math.PI * 0.55,
      };
    } else {
      const dir = look.clone().sub(pos).normalize();
      this.explore = {
        mode: "pov",
        basePos: pos.clone(),
        yaw: Math.atan2(dir.x, dir.z),
        pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
        dolly: 0,
      };
    }
  }

  _interaction() {
    this.mouse = { x: 0, y: 0 };
    this._onMove = (e) => {
      this.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", this._onMove);

    this.turn = 0;
    this.targetTurn = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    const inUI = (e) => !!(e.target && e.target.closest && e.target.closest("button, a, input, [data-ui]"));
    this._onDown = (e) => {
      if (inUI(e)) return;
      if (this.driveMode) return;
      dragging = true;
      this._dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      this.container.classList.add("grabbing");
    };
    this._onDrag = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (this.cabinMode) {
        const ex = this.explore;
        if (!ex) return;
        if (ex.mode === "orbit") {
          ex.theta -= dx * 0.0052;
          ex.phi = THREE.MathUtils.clamp(ex.phi - dy * 0.0038, ex.minPhi, ex.maxPhi);
        } else {
          ex.yaw -= dx * 0.0034;
          ex.pitch = THREE.MathUtils.clamp(ex.pitch + dy * 0.0028, -0.85, 0.85);
        }
      } else {
        this.targetTurn += dx * 0.004;
      }
    };
    this._onUp = (e) => {
      const wasDragging = dragging;
      dragging = false;
      this._dragging = false;
      this.container.classList.remove("grabbing");
      // a click (not a drag) inside the cabin touches whatever it lands on
      if (
        wasDragging && this.cabinMode && this.cabin && e &&
        Math.hypot(e.clientX - downX, e.clientY - downY) < 7 &&
        !inUI(e)
      ) {
        this.cabin.handleTap(e.clientX, e.clientY);
      }
    };
    this._onWheel = (e) => {
      if (!this.cabinMode || !this.explore) return;
      if (inUI(e)) return;
      const ex = this.explore;
      if (ex.mode === "orbit") {
        ex.radius = THREE.MathUtils.clamp(ex.radius * (1 + Math.sign(e.deltaY) * 0.09), ex.minR, ex.maxR);
      } else {
        ex.dolly = THREE.MathUtils.clamp(ex.dolly - Math.sign(e.deltaY) * 0.05, -0.15, 0.42);
      }
    };
    window.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onDrag);
    window.addEventListener("pointerup", this._onUp);
    window.addEventListener("wheel", this._onWheel, { passive: true });

    this._onKeyDown = (e) => {
      if (!this.driveMode) return;
      if (["ArrowLeft", "a", "A"].includes(e.key)) {
        this.drive.targetX = -1.6;
        this.drive.targetRoll = 0.05;
      }
      if (["ArrowRight", "d", "D"].includes(e.key)) {
        this.drive.targetX = 1.6;
        this.drive.targetRoll = -0.05;
      }
    };
    this._onKeyUp = (e) => {
      if (!this.driveMode) return;
      if (["ArrowLeft", "a", "A", "ArrowRight", "d", "D"].includes(e.key)) {
        this.drive.targetX = 0;
        this.drive.targetRoll = 0;
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  _loop() {
    this.clock = new THREE.Clock();
    let telemetryAcc = 0;

    const animate = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;

      // Cabin: starlight twinkle, breathing ambience, weather
      if (this.cabin) this.cabin.update(t, dt);

      // Kinetic sculpture + rotating exhibit platform.
      if (this.props) {
        this.props.update(t, this.turn);
      }

      // The platform turns imperceptibly while the car is on display.
      if (!this.driveMode && !this._dragging && this.sectionIndex <= 1) {
        this.targetTurn += dt * 0.02;
      }

      // Animate hologram
      if (this.hologram && this.hologram.visible) {
        this.hologram.rotation.y = t * 0.35;
        if (this.holoRing) this.holoRing.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03);
        for (let i = 0; i < this.holoCells.length; i++) {
          this.holoCells[i].material.opacity = 0.1 + 0.14 * Math.abs(Math.sin(t * 5 + i * 0.55));
        }
      }

      const active = this.cars[this.activeKey];

      if (this.driveMode && active) {
        this.drive.update(dt, t, active);

        // Chase camera smoothing
        this.smoothPos.lerp(new THREE.Vector3(active.group.position.x * 0.55, 2.15 + Math.cos(t * 5) * 0.02, 9.8), 0.05);
        this.smoothLook.lerp(new THREE.Vector3(active.group.position.x * 0.8, 0.95, -4), 0.08);
        this.camera.position.copy(this.smoothPos);
        this.camera.lookAt(this.smoothLook);

        telemetryAcc += dt;
        if (telemetryAcc > 0.12 && this.onTelemetry) {
          telemetryAcc = 0;
          this.onTelemetry({
            speed: Math.round(this.drive.speed),
            rpm: Math.round(this.drive.rpm),
            rpmRatio: (this.drive.rpm - 1800) / 2600,
          });
        }
      } else if (this.cabinFocus) {
        // Cinematic fly-to owns the camera during transitions.
        this.smoothPos.lerp(this.cabinFocus.pos, 0.09);
        this.smoothLook.lerp(this.cabinFocus.look, 0.09);
        this.camera.position.copy(this.smoothPos);
        this.camera.lookAt(this.smoothLook);
      } else if (this.cabinMode && this.explore) {
        // User-driven exploration: free orbit, or seated look-around.
        const ex = this.explore;
        if (!this._exTmpA) {
          this._exTmpA = new THREE.Vector3();
          this._exTmpB = new THREE.Vector3();
          this._exSph = new THREE.Spherical();
        }
        if (ex.mode === "orbit") {
          this._exSph.set(ex.radius, ex.phi, ex.theta);
          this._exTmpA.setFromSpherical(this._exSph).add(ex.target);
          this._exTmpB.copy(ex.target);
        } else {
          const cp = Math.cos(ex.pitch);
          this._exTmpB.set(Math.sin(ex.yaw) * cp, Math.sin(ex.pitch), Math.cos(ex.yaw) * cp);
          this._exTmpA.copy(ex.basePos).addScaledVector(this._exTmpB, ex.dolly);
          this._exTmpB.add(this._exTmpA);
        }
        this.smoothPos.lerp(this._exTmpA, 0.14);
        this.smoothLook.lerp(this._exTmpB, 0.17);
        this.camera.position.copy(this.smoothPos);
        this.camera.lookAt(this.smoothLook);
      } else {
        // Showroom mode camera parallax
        if (active) {
          this.turn += (this.targetTurn - this.turn) * 0.06;
          active.group.rotation.y = this.turn;
        }
        const driftX = Math.sin(t * 0.22) * 0.13;
        const driftY = Math.cos(t * 0.17) * 0.05;
        const inCabin = this.sectionIndex === 3;
        const par = inCabin ? 0.06 : 0.32;

        this.smoothPos.lerp(this.camState.pos, 0.085);
        this.smoothLook.lerp(this.camState.look, 0.085);
        this.camera.position.set(
          this.smoothPos.x + this.mouse.x * par + (inCabin ? 0 : driftX),
          this.smoothPos.y - this.mouse.y * par * 0.55 + (inCabin ? 0 : driftY),
          this.smoothPos.z
        );
        this.camera.lookAt(this.smoothLook);
      }

      this.dust.rotation.y = t * 0.012;
      this.composer.render();
    };
    animate();
  }

  /* ---------------- public API ---------------- */

  async setModel(key) {
    if (key === this.activeKey || !LINEUP[key]) return;
    const prev = this.cars[this.activeKey];
    const next = this.cars[key];
    if (this.onBusy) this.onBusy(true);
    this.setDoors(false);
    this.setBonnet(false);

    if (prev) {
      gsap.to(prev.group.position, { y: -0.35, duration: 0.55, ease: "power2.in" });
      gsap.to(prev.group.scale, { x: 0.985, y: 0.985, z: 0.985, duration: 0.55, ease: "power2.in" });
    }
    await new Promise((r) => setTimeout(r, 520));
    if (prev) {
      prev.group.visible = false;
      prev.group.position.y = 0;
      prev.group.scale.setScalar(1);
    }

    this.activeKey = key;
    if (!next.promise) {
      this._loadCar(key, null, this.lazyLoader || this.loader);
    }
    await next.promise;
    if (this.disposed) return;
    this._applyCustomization(next);
    next.group.rotation.y = this.turn;
    next.group.position.set(0, -0.35, 0);
    next.group.visible = true;
    gsap.to(next.group.position, { y: 0, duration: 0.8, ease: "power3.out" });
    if (this.onBusy) this.onBusy(false);
  }

  _applyCustomization(entry) {
    const paint = new THREE.Color(this.paintHex);
    for (const m of entry.paintMats) m.color.copy(paint);
    const two = this.twoToneHex ? new THREE.Color(this.twoToneHex) : paint;
    for (const m of entry.secondaryMats || []) m.color.copy(two);
    this._applyJewellery(entry);
    const cal = new THREE.Color(this.caliperHex);
    for (const m of entry.caliperMats || []) m.color.copy(cal);
    if (entry.leatherMats) {
      const l = new THREE.Color(this.leatherHex);
      for (const m of entry.leatherMats) m.color.copy(l);
    }
    if (entry.woodMats) {
      const w = new THREE.Color(this.woodHex);
      for (const m of entry.woodMats) m.color.copy(w);
    }
  }

  _applyJewellery(entry) {
    for (const m of entry.chromeMats || []) {
      if (this.jewellery === "gold") {
        m.color.setHex(0xd8b56a);
        m.roughness = 0.14;
      } else if (this.jewellery === "smoked") {
        m.color.setHex(0x3a3e46);
        m.roughness = 0.18;
      } else {
        m.color.setHex(0xffffff);
        m.roughness = 0.07;
      }
    }
  }

  _tweenColor(mats, hex) {
    const c = new THREE.Color(hex);
    for (const m of mats) gsap.to(m.color, { r: c.r, g: c.g, b: c.b, duration: 0.8, ease: "power2.out" });
  }

  setPaint(hex) {
    this.paintHex = hex;
    for (const car of [...Object.values(this.cars), this.interiorCar].filter(Boolean)) {
      this._tweenColor(car.paintMats, hex);
      if (!this.twoToneHex) this._tweenColor(car.secondaryMats || [], hex);
    }
  }

  setTwoTone(hex) {
    this.twoToneHex = hex;
    const target = hex || this.paintHex;
    for (const car of Object.values(this.cars)) this._tweenColor(car.secondaryMats || [], target);
  }

  setLeather(hex) {
    this.leatherHex = hex;
    if (this.interiorCar) this._tweenColor(this.interiorCar.leatherMats, hex);
  }

  setWood(hex) {
    this.woodHex = hex;
    if (this.interiorCar) this._tweenColor(this.interiorCar.woodMats, hex);
  }

  setJewellery(id) {
    this.jewellery = id;
    for (const car of [...Object.values(this.cars), this.interiorCar].filter(Boolean)) this._applyJewellery(car);
  }

  setCaliper(hex) {
    this.caliperHex = hex;
    for (const car of [...Object.values(this.cars), this.interiorCar].filter(Boolean)) {
      this._tweenColor(car.caliperMats || [], hex);
    }
  }

  setDoors(open) {
    this.doorsOpen = open;
    const entry = this.cars[this.activeKey];
    if (!entry || !entry.doorPivots.lf) return;
    const a = open ? 0.92 : 0;
    const ease = "power2.inOut";
    const dur = 1.15;
    if (entry.doorPivots.lf) gsap.to(entry.doorPivots.lf.rotation, { y: a, duration: dur, ease });
    if (entry.doorPivots.rf) gsap.to(entry.doorPivots.rf.rotation, { y: -a, duration: dur, ease });
    if (entry.doorPivots.lr) gsap.to(entry.doorPivots.lr.rotation, { y: -a, duration: dur, ease });
    if (entry.doorPivots.rr) gsap.to(entry.doorPivots.rr.rotation, { y: a, duration: dur, ease });
  }

  setBonnet(open) {
    this.bonnetOpen = open;
    const entry = this.cars[this.activeKey];
    if (entry && entry.bonnetPivot) {
      gsap.to(entry.bonnetPivot.rotation, { x: open ? -0.55 : 0, duration: 1.0, ease: "power2.inOut" });
    }
    if (this.hologram) {
      if (open) {
        this.hologram.visible = true;
        gsap.to(this.hologram.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: "power3.out" });
      } else {
        gsap.to(this.hologram.scale, {
          x: 0.001, y: 0.001, z: 0.001,
          duration: 0.5,
          ease: "power2.in",
          onComplete: () => { this.hologram.visible = false; },
        });
      }
    }
  }

  setDrive(on) {
    this.driveMode = on;

    // Toggle driving scenery and active headlights
    const active = this.cars[this.activeKey];
    this.drive.setVisible(on, active);

    // Toggle showroom architecture and furniture visibility
    if (this.architecture) this.architecture.setVisible(!on);
    if (this.props) this.props.setVisible(!on);

    // Animate lights
    if (this.lights) this.lights.setDriveMode(on);

    // Transition background color and fog
    const targetBg = on ? 0x06070a : 0x87979d;
    const targetFog = on ? 0x06070a : 0x3e403c;
    const targetFogDensity = on ? 0.022 : 0.0055;

    if (this.scene.background) {
      gsap.to(this.scene.background, {
        r: ((targetBg >> 16) & 255) / 255,
        g: ((targetBg >> 8) & 255) / 255,
        b: (targetBg & 255) / 255,
        duration: 0.8,
        ease: "power2.out",
      });
    }
    if (this.scene.fog) {
      gsap.to(this.scene.fog.color, {
        r: ((targetFog >> 16) & 255) / 255,
        g: ((targetFog >> 8) & 255) / 255,
        b: (targetFog & 255) / 255,
        duration: 0.8,
        ease: "power2.out",
      });
      gsap.to(this.scene.fog, {
        density: targetFogDensity,
        duration: 0.8,
        ease: "power2.out",
      });
    }

    if (this.interiorCar) this.interiorCar.group.visible = !on;
    if (this.starPoints) this.starPoints.visible = !on;
    if (this.cabin?.strips) this.cabin.strips.visible = !on;

    if (on) {
      this.setDoors(false);
      this.setBonnet(false);
      if (active) {
        gsap.to(active.group.rotation, { y: Math.PI / 2, duration: 1.0, ease: "power2.inOut" });
        this.targetTurn = Math.PI / 2;
        this.turn = Math.PI / 2;
      }
    } else if (active) {
      active.group.position.x = 0;
      active.group.rotation.z = 0;
      active.group.position.y = 0;
      this.targetTurn = 0;
      this.turn = 0;
      gsap.to(active.group.rotation, { y: 0, duration: 0.9, ease: "power2.inOut" });
      for (const w of active.wheelPivots) w.rotation.z = 0;
      this.smoothPos.copy(this.camState.pos);
      this.smoothLook.copy(this.camState.look);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this.cabin?.dispose();
    this.scrollTl?.scrollTrigger?.kill();
    this.scrollTl?.kill();
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerdown", this._onDown);
    window.removeEventListener("pointermove", this._onDrag);
    window.removeEventListener("pointerup", this._onUp);
    window.removeEventListener("wheel", this._onWheel);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          m.dispose();
        }
      }
    });
    this.pmrem?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
