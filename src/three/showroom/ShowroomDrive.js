import * as THREE from "three";
import gsap from "gsap";

/*
 * The Magic Carpet Ride — a two-act cinematic experience.
 *
 *  Act I  · PAVILION : the motor car revealed on a piano-black platform,
 *           contemplated from three compositions (front · side · rear).
 *
 *  Act II · RIDE     : a living night city. Layered skyline, waterfront,
 *           wet-asphalt light streaks, street lamps, oncoming traffic,
 *           moonlit clouds, aircraft — with true drive physics (throttle,
 *           brake, steering), camera inertia, driving modes that change
 *           the world, and a six-camera cinematic rig.
 */

const CAR_Y = 0;
const LANE_X = -2.1;          // our side of the boulevard
const ONCOMING_X = 3.1;       // opposite lane

/*
 * Driving modes. Each genuinely re-tunes physics, steering, gearing, camera
 * and atmosphere — nothing here is cosmetic.
 *   cruise/accel  road speed and how urgently it is reached
 *   steerGain     how much lock the car takes (Sport darts, Magic glides)
 *   gearHold      gears held below the shift point (Sport holds one longer)
 *   grain/vig     film grade — Sport is grittier, Magic almost clean
 *   temp          ambient offset in °C (Rain and Night are colder)
 *   mpg           efficiency factor feeding the range computation
 */
const RIDE_MODES = {
  comfort: { name: "Comfort",      cruise: 96,  accel: 14, sway: 0.5,  float: 0.010, inertia: 0.6,  fov: 34, fog: 0.010, bloom: 0.24, cityDim: 1.0,  lamp: 1.0,  accent: "#d8b878", wind: 0.5, rain: false, steerGain: 1.0,  gearHold: 0, grain: 0.030, vig: 0.30, temp: 0,    mpg: 1.0 },
  magic:   { name: "Magic Carpet", cruise: 78,  accel: 9,  sway: 0.3,  float: 0.022, inertia: 0.3,  fov: 32, fog: 0.012, bloom: 0.30, cityDim: 1.0,  lamp: 0.9,  accent: "#9cc4ff", wind: 0.3, rain: false, steerGain: 0.62, gearHold: 0, grain: 0.016, vig: 0.24, temp: 0,    mpg: 1.08 },
  sport:   { name: "Sport",        cruise: 152, accel: 26, sway: 0.9,  float: 0.006, inertia: 1.1,  fov: 39, fog: 0.008, bloom: 0.20, cityDim: 1.0,  lamp: 1.0,  accent: "#e07850", wind: 1.0, rain: false, steerGain: 1.55, gearHold: 1, grain: 0.052, vig: 0.42, temp: 0,    mpg: 0.72 },
  night:   { name: "Night",        cruise: 68,  accel: 10, sway: 0.4,  float: 0.014, inertia: 0.45, fov: 33, fog: 0.014, bloom: 0.34, cityDim: 0.42, lamp: 1.35, accent: "#8fa2c8", wind: 0.4, rain: false, steerGain: 0.8,  gearHold: 0, grain: 0.044, vig: 0.46, temp: -2,   mpg: 1.05 },
  rain:    { name: "Rain",         cruise: 74,  accel: 11, sway: 0.45, float: 0.012, inertia: 0.5,  fov: 33, fog: 0.017, bloom: 0.30, cityDim: 0.8,  lamp: 1.15, accent: "#6fa8c8", wind: 0.7, rain: true,  steerGain: 0.7,  gearHold: 0, grain: 0.038, vig: 0.38, temp: -3.5, mpg: 0.92 },
  personal:{ name: "Personal",     cruise: 88,  accel: 15, sway: 0.5,  float: 0.014, inertia: 0.7,  fov: 34, fog: 0.011, bloom: 0.27, cityDim: 1.0,  lamp: 1.0,  accent: "#c8a2d8", wind: 0.5, rain: false, steerGain: 1.0,  gearHold: 0, grain: 0.030, vig: 0.32, temp: 0,    mpg: 1.0 },
};

/*
 * Cinematic mode is an edit, not a slideshow: [camera, seconds on screen].
 * Wide establishing shots hold; detail shots cut fast; the orbit gets long
 * enough to complete most of its arc.
 */
const CINE_SEQUENCE = [
  ["chase", 9], ["spirit", 5], ["wheel", 3.5], ["bonnet", 7],
  ["roadside", 4], ["driver", 8], ["orbit", 13], ["skyline", 6],
  ["bumper", 3.5], ["interior", 7], ["drone", 9], ["rear", 5], ["top", 5],
];

/* The Ghost's real numbers, so the instruments have something true to say. */
const TUNNEL_LEN = 84;        // world units ≈ metres
const EVENT_GAP = 760;        // between set pieces: ~19 s at a 96 mph cruise

const TANK_GAL = 21.7;        // 82 litres
const BASE_MPG = 24;          // best case; falls with speed
// 8-speed shift points in mph — the band the needle lives in
const GEAR_BANDS = [[0, 18], [18, 32], [32, 48], [48, 64], [64, 82], [82, 104], [104, 130], [130, 190]];

export class ShowroomDrive {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.phase = "pavilion";
    this.currentView = "side";
    this._car = null;

    // ---- ride state ----
    this.speed = 0;
    this.mode = "comfort";
    this.rideCam = "chase";
    this.cinematic = false;
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.highBeam = false;
    this.hazards = false;
    this.indicator = null; // 'L' | 'R' | null
    this._rideT = 0;
    this._lane = 0;
    this._pitch = 0;
    this._roll = 0;
    this._cineT = 0;
    this._cineIdx = 0;
    this._blinkT = 0;
    this._blinkOn = false;
    this.onBlink = null; // HUD tick callback

    // ---- instrument state (integrated in _updateRide, read by getTelemetry) ----
    this._trip = 0;             // miles since the engine was started
    this._fuel = TANK_GAL;      // US gallons remaining
    this._inTunnel = false;
    this._freeLook = { yaw: 0, pitch: 0 };
    this.onTunnel = null;       // fired on enter/exit for audio + HUD

    this._buildScene();
  }

  /* ================================================================ */
  _buildScene() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this._buildSky();
    this._buildLights();
    this._buildAtmosphere();

    this.pavilion = new THREE.Group();
    this.group.add(this.pavilion);
    this._buildFloor();
    this._buildPavilionArchitecture();
    this._buildCity();

    this.ride = new THREE.Group();
    this.ride.visible = false;
    this.group.add(this.ride);
    this._buildRide();

    this._buildViews();
  }

  /* ============================================================ SKY */
  _buildSky() {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(220, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {},
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vP;
          void main(){
            vec3 d = normalize(vP);
            float h = clamp(d.y, 0.0, 1.0);
            vec3 horizon = vec3(0.045, 0.075, 0.115);
            vec3 zenith  = vec3(0.004, 0.010, 0.022);
            vec3 col = mix(horizon, zenith, pow(h, 0.55));
            // warm city-glow band hugging the skyline
            col += vec3(0.14, 0.09, 0.045) * exp(-pow(max(d.y, 0.0) * 9.5, 1.4));
            float band = exp(-pow((d.y - d.x * 0.5) * 3.2, 2.0)) * smoothstep(0.03, 0.5, h);
            col += vec3(0.09, 0.10, 0.15) * band * 0.2;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    dome.renderOrder = -2;
    this.group.add(dome);

    // stars
    const n = 1200;
    const pos = new Float32Array(n * 3);
    const op = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.08, Math.random() - 0.5).normalize().multiplyScalar(205);
      pos[i * 3] = dir.x; pos[i * 3 + 1] = dir.y; pos[i * 3 + 2] = dir.z;
      op[i] = 0.25 + Math.random() * 0.75;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("opacity", new THREE.BufferAttribute(op, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `uniform float uTime; attribute float opacity; varying float vO;
        void main(){ vO = opacity; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = (180.0 / -mv.z) * (0.6 + 0.4 * sin(uTime * 1.3 + position.x)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vO; void main(){ float d = distance(gl_PointCoord, vec2(0.5)); if (d>0.5) discard;
        gl_FragColor = vec4(0.9,0.94,1.0,(1.0-d*2.0)*vO); }`,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.group.add(this.stars);

    // the moon and its halo, drifting clouds that occasionally veil it
    const moonPos = new THREE.Vector3(-95, 78, -150);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xf4ecd8, transparent: true, opacity: 0.95, fog: false, depthWrite: false }));
    moon.position.copy(moonPos);
    moon.scale.setScalar(11);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xcdd4e8, transparent: true, opacity: 0.24, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(moonPos);
    halo.scale.setScalar(42);
    this.group.add(moon, halo);

    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._cloudTex(), transparent: true, opacity: 0.16 + Math.random() * 0.12, fog: false, depthWrite: false, color: 0x9aa4be }));
      c.position.set(-160 + i * 55 + Math.random() * 20, 60 + Math.random() * 34, -150 - Math.random() * 20);
      c.scale.set(70 + Math.random() * 50, 22 + Math.random() * 12, 1);
      c.userData.v = 0.35 + Math.random() * 0.4;
      this.group.add(c);
      this.clouds.push(c);
    }

    // a distant aircraft crossing with blinking strobes
    this.aircraft = new THREE.Group();
    const acBody = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xffffff, transparent: true, opacity: 0.8, fog: false }));
    acBody.scale.setScalar(0.9);
    const acStrobe = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xff4444, transparent: true, opacity: 0.9, fog: false }));
    acStrobe.scale.setScalar(0.7);
    acStrobe.position.x = 1.4;
    this.aircraft.add(acBody, acStrobe);
    this._acStrobe = acStrobe;
    this.aircraft.position.set(180, 95, -140);
    this.group.add(this.aircraft);
  }

  _cloudTex() {
    if (this._cloudT) return this._cloudT;
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 96;
    const g = cv.getContext("2d");
    for (let i = 0; i < 26; i++) {
      const x = 30 + Math.random() * 196, y = 24 + Math.random() * 48, r = 16 + Math.random() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.10)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 96);
    }
    this._cloudT = new THREE.CanvasTexture(cv);
    return this._cloudT;
  }

  /* ========================================================== FLOOR */
  _buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(120, 72),
      new THREE.MeshStandardMaterial({ color: 0x04050a, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.pavilion.add(floor);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 3.2),
      new THREE.MeshBasicMaterial({ map: this._reflGlow(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    glow.renderOrder = 2;
    this.pavilion.add(glow);

    const stripMat = new THREE.MeshBasicMaterial({ color: 0xdcac6e, toneMapped: false });
    this.floorStrips = [];
    for (const z of [-3.2, 3.2]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(15, 0.015, 0.06), stripMat);
      strip.position.set(0, 0.04, z);
      strip.renderOrder = 3;
      this.pavilion.add(strip);
      this.floorStrips.push(strip);
      const smear = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 1.1),
        new THREE.MeshBasicMaterial({ color: 0xcaa268, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      smear.rotation.x = -Math.PI / 2;
      smear.position.set(0, 0.01, z + (z > 0 ? 0.5 : -0.5));
      smear.renderOrder = 2;
      this.pavilion.add(smear);
      const gl = new THREE.PointLight(0xe4b877, 0.45, 6, 2);
      gl.position.set(0, 0.2, z);
      this.pavilion.add(gl);
    }
  }

  _reflGlow() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(150,175,215,0.5)");
    grd.addColorStop(0.4, "rgba(90,110,150,0.22)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  /* ==================================================== PAVILION WALL */
  _buildPavilionArchitecture() {
    const wall = new THREE.Group();
    const WX = -11.5;
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x141009, roughness: 0.5, metalness: 0.35 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xd8a860, toneMapped: false });

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.2, 34), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.7, metalness: 0.2 }));
    back.position.set(WX - 0.25, 4.0, -4);
    wall.add(back);

    this.wallGlow = [];
    for (let i = 0; i < 30; i++) {
      const z = 10 - i * 1.05;
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.6, 0.32), slatMat);
      slat.position.set(WX, 3.5, z);
      wall.add(slat);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 6.2, 0.16), glowMat.clone());
      light.position.set(WX + 0.16, 3.5, z - 0.53);
      wall.add(light);
      this.wallGlow.push(light);
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 3.4), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.4, metalness: 0.5, emissive: 0xcaa25e, emissiveIntensity: 0.35 }));
    plinth.position.set(WX + 0.2, 2.4, 2);
    wall.add(plinth);

    const wash = new THREE.PointLight(0xffcf94, 1.1, 26, 1.7);
    wash.position.set(WX + 3, 3.6, -1);
    wall.add(wash);
    const wash2 = new THREE.PointLight(0xffdba8, 0.7, 20, 1.9);
    wash2.position.set(WX + 2, 2.0, 5);
    wall.add(wash2);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 34), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.6, metalness: 0.3 }));
    canopy.position.set(WX + 5.5, 8.1, -4);
    wall.add(canopy);
    const ceilLight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 24), glowMat.clone());
    ceilLight.position.set(WX + 1.2, 7.94, -4);
    wall.add(ceilLight);
    this.wallGlow.push(ceilLight);

    this.pavilion.add(wall);
  }

  /* facade textures — varied window patterns, warm/cool mix, lit bands */
  _facadeTex(style = 0) {
    const wc = document.createElement("canvas");
    wc.width = 64; wc.height = 160;
    const wg = wc.getContext("2d");
    wg.fillStyle = "#04060b";
    wg.fillRect(0, 0, 64, 160);
    const density = [0.42, 0.3, 0.55, 0.22][style % 4];
    for (let y = 4; y < 160; y += style % 2 ? 5 : 7) {
      const floorLit = Math.random() < 0.85;
      for (let x = 3; x < 64; x += style % 3 ? 6 : 9) {
        if (floorLit && Math.random() < density) {
          const warm = Math.random() < 0.8;
          const v = 190 + Math.random() * 65;
          wg.fillStyle = warm
            ? `rgba(${v}, ${v * 0.8}, ${v * 0.52}, ${0.45 + Math.random() * 0.55})`
            : `rgba(${v * 0.75}, ${v * 0.85}, ${v}, ${0.4 + Math.random() * 0.5})`;
          wg.fillRect(x, y, style % 3 ? 3.4 : 5.5, 3.0);
        }
      }
    }
    const t = new THREE.CanvasTexture(wc);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* a tower with setbacks, crown light and a rooftop beacon */
  _makeTower(w, h, style, beaconArr, matsArr) {
    const g = new THREE.Group();
    const tex = this._facadeTex(style);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x080b12, roughness: 0.8, metalness: 0.2,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 + Math.random() * 0.45,
    });
    tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(2, Math.round(h / 5)));
    matsArr.push(mat);

    const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    main.position.y = h / 2;
    g.add(main);
    if (Math.random() < 0.55) {
      const w2 = w * (0.55 + Math.random() * 0.2);
      const h2 = h * (0.2 + Math.random() * 0.25);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, w2), mat);
      upper.position.y = h + h2 / 2;
      g.add(upper);
      if (Math.random() < 0.5) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, h * 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.6, metalness: 0.6 }));
        spire.position.y = h + h2 + h * 0.1;
        g.add(spire);
      }
      // crown light band
      if (Math.random() < 0.6) {
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w2 + 0.15, 0.28, w2 + 0.15),
          new THREE.MeshBasicMaterial({ color: Math.random() < 0.6 ? 0xd8b070 : 0x7fa8d8, toneMapped: false, transparent: true, opacity: 0.85 })
        );
        crown.position.y = h + h2;
        g.add(crown);
      }
    }
    // rooftop aviation beacon
    if (Math.random() < 0.6) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xff3b30, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
      b.scale.setScalar(1.1);
      b.position.y = h + (g.children.length > 1 ? h * 0.28 : 0.6);
      g.add(b);
      beaconArr.push(b);
    }
    return g;
  }

  /* ========================================== PAVILION CITY BACKDROP */
  _buildCity() {
    const city = new THREE.Group();
    this.pavTowerMats = [];
    this.beacons = [];

    for (let i = 0; i < 46; i++) {
      const a = -Math.PI * 0.9 + Math.random() * Math.PI * 0.95;
      const r = 40 + Math.random() * 42;
      const h = 8 + Math.random() * 44;
      const w = 2.6 + Math.random() * 5.0;
      const t = this._makeTower(w, h, i % 4, this.beacons, this.pavTowerMats);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 8);
      city.add(t);
    }

    const n = 1200;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.92 + Math.random() * Math.PI * 0.95;
      const r = 38 + Math.random() * 58;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.4 + Math.random() * 30;
      pos[i * 3 + 2] = Math.sin(a) * r - 8;
      const warm = 0.7 + Math.random() * 0.3;
      col[i * 3] = warm; col[i * 3 + 1] = warm * (0.72 + Math.random() * 0.12); col[i * 3 + 2] = warm * (0.45 + Math.random() * 0.15);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.cityLights = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.5, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, map: this._softDot(),
    }));
    city.add(this.cityLights);
    this.city = city;
    this.pavilion.add(city);
  }

  _softDot() {
    if (this._dotT) return this._dotT;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    this._dotT = new THREE.CanvasTexture(cv);
    return this._dotT;
  }

  /* a vertically-stretched streak for wet reflections */
  _streakTex() {
    if (this._strkT) return this._strkT;
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 128;
    const g = cv.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.18)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(10, 0, 12, 128);
    this._strkT = new THREE.CanvasTexture(cv);
    return this._strkT;
  }

  /* ============================================================ RIDE */
  _buildRide() {
    this.rideTowerMats = [];

    // ---- the boulevard ----
    this.roadTex = this._roadTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(19, 520),
      new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.9, metalness: 0.0, map: this.roadTex, envMapIntensity: 0.03 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.002, -220);
    road.receiveShadow = true;
    this.ride.add(road);

    // pavements
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.92 });
    for (const [x, w] of [[-11.4, 4], [11.4, 4]]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, 520), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.06, -220);
      this.ride.add(walk);
    }

    // guardrail along the waterfront (left side)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.45, metalness: 0.8 });
    for (const y of [0.42, 0.78]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 520), railMat);
      rail.position.set(-13.6, y, -220);
      this.ride.add(rail);
    }
    this.railPosts = [];
    this._ridePool(this.railPosts, 30, () => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), railMat);
      p.position.set(-13.6, 0.43, 0);
      p.userData.side = -1;
      return p;
    });

    // ---- the water beyond, carrying smeared city light ----
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 520),
      new THREE.MeshStandardMaterial({ color: 0x030609, roughness: 0.35, metalness: 0.35, envMapIntensity: 0.14 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-59, -0.35, -220);
    this.ride.add(water);

    this.waterStreaks = [];
    for (let i = 0; i < 42; i++) {
      const warm = Math.random() < 0.65;
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5 + Math.random() * 1.1, 6 + Math.random() * 16),
        new THREE.MeshBasicMaterial({
          map: this._streakTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          color: warm ? 0xd8a660 : 0x6f96c8, opacity: 0.1 + Math.random() * 0.16,
        })
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set(-16 - Math.random() * 46, -0.32, -Math.random() * 440);
      s.userData.ph = Math.random() * Math.PI * 2;
      this.ride.add(s);
      this.waterStreaks.push(s);
    }

    // ---- far skyline backdrop across the water ----
    this.farCity = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const h = 10 + Math.random() * 46;
      const w = 4 + Math.random() * 9;
      const t = this._makeTower(w, h, i % 4, (this.farBeacons = this.farBeacons || []), this.rideTowerMats);
      t.position.set(-70 - Math.random() * 55, 0, -40 - i * 11 - Math.random() * 8);
      this.farCity.add(t);
    }
    this.ride.add(this.farCity);

    // ---- the destination: a hazy skyline burning on the horizon ----
    // FogExp2 erases anything past ~150m, so the horizon lives on a
    // fog-free canvas plane — silhouette towers, lit windows, warm ground
    // haze — exactly the glow the boulevard is driving toward.
    const horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 84),
      new THREE.MeshBasicMaterial({ map: this._horizonTex(), transparent: true, fog: false, depthWrite: false })
    );
    horizon.position.set(-20, 30, -352);
    horizon.renderOrder = -1;
    this.ride.add(horizon);

    // ---- near towers flanking the right side + some left beyond water start ----
    this.rideTowers = [];
    this._ridePool(this.rideTowers, 30, (i) => {
      const h = 18 + Math.random() * 55;
      const w = 6 + Math.random() * 9;
      const t = this._makeTower(w, h, i % 4, (this.farBeacons = this.farBeacons || []), this.rideTowerMats);
      t.position.set(17 + Math.random() * 34, 0, 0);
      t.userData.side = 1;
      return t;
    });

    // ---- street lamps: paired, warm pools, wet-road streak under each ----
    this.rideLamps = [];
    this.lampHeads = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.7 });
    this._ridePool(this.rideLamps, 16, (i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 6.4, 8), poleMat);
      pole.position.y = 3.2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.09), poleMat);
      arm.position.set(-side * 0.95, 6.1, 0);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.36), headMat);
      head.position.set(-side * 1.75, 6.02, 0);
      this.lampHeads.push(headMat);
      // glow sprite on the head
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xffd9a0, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
      gs.scale.setScalar(1.6);
      gs.position.copy(head.position);
      // wet reflection streak on the asphalt beneath
      const streak = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 7),
        new THREE.MeshBasicMaterial({ map: this._streakTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd8a76a, opacity: 0.34 })
      );
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = Math.PI;
      streak.position.set(-side * 1.75, 0.012, 2.6);
      g.add(pole, arm, head, gs, streak);
      g.position.set(side * 10.2, 0, 0);
      g.userData.side = side;
      g.userData.head = headMat;    // for the ignition warm-up on recycle
      g.userData.glow = gs;
      g.userData.warm = 1;
      return g;
    });

    // live pools that ride with the car so the road ahead is always lit
    this.roadPools = [];
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(0xffcf8f, 34, 26, 2);
      pl.position.set((i % 2 ? 1 : -1) * 4, 6, -8 - i * 14);
      this.ride.add(pl);
      this.roadPools.push(pl);
    }

    // ---- oncoming traffic + a slow leader ahead ----
    // At night an oncoming car is a silhouette behind its own glare, never a
    // lit box: near-black paint, no metalness to catch the moon, a greenhouse
    // that steps in from the body, and a faint glazing sheen.
    this.traffic = [];
    for (let i = 0; i < 3; i++) {
      this.traffic.push(this._makeTrafficCar(i));
    }

    // taillights of a car far ahead in our lane, with a body to hang them on
    this.leader = new THREE.Group();
    const leadMat = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.85, metalness: 0.0 });
    const leadBody = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.82, 4.5), leadMat);
    leadBody.position.y = 0.5;
    const leadTop = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.6, 2.5), leadMat);
    leadTop.position.set(0, 1.2, -0.15);
    this.leader.add(leadBody, leadTop);
    for (const dx of [-0.66, 0.66]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.1, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff2a1c, toneMapped: false })
      );
      bar.position.set(dx, 0.72, 2.26);
      this.leader.add(bar);
      const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xff2a22, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      t.scale.setScalar(0.85);
      t.position.set(dx, 0.72, 2.3);
      this.leader.add(t);
    }
    this.leader.position.set(LANE_X, 0, -130);
    this.ride.add(this.leader);

    // ---- set pieces on a long cycle: a tunnel, then a bridge ----
    this._buildTunnel();
    this._buildBridge();

    // ---- speed streaks ----
    const sc = 70;
    const spos = new Float32Array(sc * 3);
    this._streakZ = new Float32Array(sc);
    for (let i = 0; i < sc; i++) {
      spos[i * 3] = (Math.random() - 0.5) * 24;
      spos[i * 3 + 1] = 0.3 + Math.random() * 7;
      spos[i * 3 + 2] = -Math.random() * 240;
      this._streakZ[i] = 0.7 + Math.random() * 0.6;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    this.streaks = new THREE.Points(sgeo, new THREE.PointsMaterial({
      color: 0xbfd2f0, size: 0.15, transparent: true, opacity: 0.45, depthWrite: false,
      blending: THREE.AdditiveBlending, map: this._softDot(),
    }));
    this.ride.add(this.streaks);

    // ---- rain (Rain mode) ----
    const rn = 1500;
    const rpos = new Float32Array(rn * 3);
    this._rainV = new Float32Array(rn);
    for (let i = 0; i < rn; i++) {
      rpos[i * 3] = (Math.random() - 0.5) * 40;
      rpos[i * 3 + 1] = Math.random() * 14;
      rpos[i * 3 + 2] = -Math.random() * 60 + 12;
      this._rainV[i] = 9 + Math.random() * 6;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
    this.rain = new THREE.Points(rgeo, new THREE.PointsMaterial({
      color: 0x8fa6c4, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, map: this._streakTex(),
    }));
    this.rain.visible = false;
    this.ride.add(this.rain);

    // ---- indicator lamps on the car's corners (attached on ride start) ----
    this.blinkSprites = [];

    this._seedRide();
  }

  _ridePool(arr, count, make) {
    for (let i = 0; i < count; i++) {
      const o = make(i);
      this.ride.add(o);
      arr.push(o);
    }
  }

  _seedRide() {
    let ri = -470;
    for (const t of this.rideTowers) { t.position.z = ri; ri += 16 + Math.random() * 9; }
    let ll = -470, rl = -470 - 21;
    for (const g of this.rideLamps) {
      if (g.userData.side < 0) { g.position.z = ll; ll += 42; }
      else { g.position.z = rl; rl += 42; }
    }
    let pp = -470;
    for (const p of this.railPosts) { p.position.z = pp; pp += 16; }
  }

  _roadTexture() {
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 512;
    const g = cv.getContext("2d");
    g.fillStyle = "#0a0c11";
    g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.018})`; g.fillRect(Math.random() * 128, Math.random() * 512, 1, 1); }
    // kerb lines
    g.fillStyle = "rgba(215,205,178,0.4)";
    g.fillRect(6, 0, 3, 512); g.fillRect(119, 0, 3, 512);
    // centre double line
    g.fillStyle = "rgba(226,200,140,0.5)";
    g.fillRect(61, 0, 2, 512); g.fillRect(66, 0, 2, 512);
    // our-lane dashes
    g.fillStyle = "rgba(232,226,198,0.55)";
    for (let y = 0; y < 512; y += 64) g.fillRect(32, y, 3.4, 30);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 48);
    t.anisotropy = 8;
    return t;
  }

  /*
   * The tunnel. Two set pieces share one long cycle so the drive has a
   * shape — roughly nineteen seconds of open boulevard, a tunnel, more
   * boulevard, then the bridge. Inside, the world closes down to sodium
   * light and the engine note hardens; both are what makes emerging from
   * it onto the skyline land.
   */
  _buildTunnel() {
    const g = new THREE.Group();
    const L = TUNNEL_LEN, half = L / 2;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.94, metalness: 0.0 });
    const tile = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6, metalness: 0.05 });

    // ceiling + walls (single-sided inward is fine — we never see the back)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(23, 0.7, L), concrete);
    roof.position.set(0, 7.2, 0);
    g.add(roof);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.2, L), tile);
      wall.position.set(sx * 11.2, 3.6, 0);
      g.add(wall);
      // tiled dado stripe so speed reads on the wall
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, L),
        new THREE.MeshStandardMaterial({ color: 0x6a5636, emissive: 0x8a6c3c, emissiveIntensity: 0.7, roughness: 0.6 })
      );
      stripe.position.set(sx * 10.82, 2.5, 0);
      g.add(stripe);
    }

    // sodium strips overhead — the classic tunnel strobe
    this.tunnelLamps = [];
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb457, toneMapped: false });
    for (let z = -half + 5; z < half; z += 9) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.5), stripMat);
      s.position.set(0, 6.8, z);
      g.add(s);
      const pl = new THREE.PointLight(0xffb457, 16, 17, 2);
      pl.position.set(0, 6.4, z);
      g.add(pl);
      this.tunnelLamps.push(pl);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._softDot(), color: 0xffc478, transparent: true, opacity: 0.4,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      glow.scale.setScalar(3.2);
      glow.position.set(0, 6.6, z);
      g.add(glow);
    }

    // ribs to give the walls rhythm
    for (let z = -half; z < half; z += 6) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.3, 0.34), concrete);
      rib.position.set(0, 7.0, z);
      g.add(rib);
    }

    g.position.z = -TUNNEL_LEN - 340;
    this.tunnel = g;
    this.ride.add(g);
  }

  /* The bridge: portal towers and catenary cables passing overhead. */
  _buildBridge() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.55, metalness: 0.7 });
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.7, metalness: 0.5 });

    for (const sx of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 46, 1.5), steel);
      tower.position.set(sx * 12.4, 23, 0);
      g.add(tower);
      // aviation light at the top
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._softDot(), color: 0xff3b30, transparent: true, opacity: 0.9, fog: false, depthWrite: false,
      }));
      beacon.scale.setScalar(2.4);
      beacon.position.set(sx * 12.4, 46.5, 0);
      g.add(beacon);
      (this.beacons = this.beacons || []).push(beacon);

      // stay cables fanning down to the deck
      for (let i = 1; i <= 7; i++) {
        const reach = i * 12;
        const top = 44 - i * 1.6;
        const len = Math.hypot(reach, top);
        for (const dir of [-1, 1]) {
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), cableMat);
          cable.position.set(sx * 12.4, top / 2 + 1, dir * reach / 2);
          cable.rotation.x = dir * Math.atan2(reach, top);
          g.add(cable);
        }
      }
    }
    // the cross beam joining the towers
    const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 1.2), steel);
    beam.position.set(0, 42, 0);
    g.add(beam);

    g.position.z = -TUNNEL_LEN - 340 - EVENT_GAP / 2;
    this.bridge = g;
    this.ride.add(g);
  }

  /* One oncoming vehicle: silhouette body, greenhouse, headlamps, glare. */
  _makeTrafficCar(i) {
    const c = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.06 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.3 });

    const saloon = i % 2 === 0;
    const len = saloon ? 4.5 : 5.1;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.8, len), bodyMat);
    body.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.62, saloon ? 0.58 : 0.72, len * 0.55), glassMat);
    top.position.set(0, saloon ? 1.19 : 1.26, 0.1);
    c.add(body, top);

    // wheels — just enough to break the box silhouette
    const tyre = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.95 });
    for (const dx of [-0.95, 0.95]) {
      for (const dz of [len * 0.31, -len * 0.31]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), tyre);
        w.rotation.z = Math.PI / 2;
        w.position.set(dx, 0.33, dz);
        c.add(w);
      }
    }

    for (const dx of [-0.66, 0.66]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.12, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xfff6e4, toneMapped: false })
      );
      lamp.position.set(dx, 0.66, len / 2 - 0.02);
      c.add(lamp);
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xfff3dc, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      h.scale.setScalar(0.85);
      h.position.set(dx, 0.66, len / 2 + 0.05);
      c.add(h);
    }
    const pl = new THREE.PointLight(0xfff0d8, 9, 15, 2);
    pl.position.set(0, 0.7, len / 2 + 0.3);
    c.add(pl);

    c.position.set(ONCOMING_X + (i % 2) * 2.1, 0, -80 - i * 90);
    c.userData.speed = 26 + Math.random() * 10;
    this.ride.add(c);
    return c;
  }

  /*
   * Anamorphic flare streak: a horizontal smear with a hot core, the
   * signature of a wide cinema lens pointed at a bright source at night.
   */
  _flareTex() {
    if (this._flareCache) return this._flareCache;
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 32;
    const g = cv.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.0, "rgba(120,170,255,0)");
    grad.addColorStop(0.34, "rgba(150,190,255,0.30)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.66, "rgba(150,190,255,0.30)");
    grad.addColorStop(1.0, "rgba(120,170,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 32);
    // vertical falloff so the streak has a soft edge
    const v = g.createLinearGradient(0, 0, 0, 32);
    v.addColorStop(0, "rgba(0,0,0,1)");
    v.addColorStop(0.5, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = v;
    g.fillRect(0, 0, 256, 32);
    this._flareCache = new THREE.CanvasTexture(cv);
    return this._flareCache;
  }

  /*
   * Flares only bloom when the camera is actually in front of the lamp.
   * Comparing the camera's offset against the car's forward axis (world -Z
   * while driving) gives the facing term without any raycasting.
   */
  _updateFlares(camPos) {
    if (!this.headFlares || !camPos || !this._car) return;
    const carZ = this._car.group.position.z;
    // the nose points -Z, so the camera is ahead when its z is the smaller
    const ahead = carZ - camPos.z;
    const facing = THREE.MathUtils.clamp((ahead - 1.5) / 6, 0, 1);
    const dist = Math.abs(camPos.z - carZ) + Math.abs(camPos.x - this._car.group.position.x);
    // A flare is a lens artefact, so it needs BOTH ends of the range: it
    // fades out far away, and also right on top of the lamp — otherwise the
    // close cameras (Spirit, Bumper) get a screen-filling white blob.
    const near = THREE.MathUtils.clamp((dist - 2.0) / 3.5, 0, 1) *
                 THREE.MathUtils.clamp(1 - (dist - 9) / 22, 0, 1);
    const target = facing * near * (this.highBeam ? 0.85 : 0.5);
    for (const f of this.headFlares) {
      f.material.opacity += (target - f.material.opacity) * 0.12;
    }
  }

  /* Distant skyline for the horizon plane: haze, silhouettes, lit windows. */
  _horizonTex() {
    const cv = document.createElement("canvas");
    cv.width = 2048; cv.height = 410;
    const g = cv.getContext("2d");

    // warm city haze pooling at street level, dissolving into the night
    const haze = g.createLinearGradient(0, 410, 0, 0);
    haze.addColorStop(0, "rgba(214,148,72,0.5)");
    haze.addColorStop(0.3, "rgba(146,96,58,0.26)");
    haze.addColorStop(0.62, "rgba(64,54,58,0.1)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = haze;
    g.fillRect(0, 0, 2048, 410);

    // two depths of tower silhouettes
    for (const [alpha, hMin, hVar, wMin, wVar, winA] of [
      [0.5, 60, 120, 26, 46, 0.28],   // far ridge — dimmer, taller haze
      [0.85, 90, 210, 34, 62, 0.6],   // near ridge — darker, brighter windows
    ]) {
      let x = -20;
      while (x < 2060) {
        const w = wMin + Math.random() * wVar;
        const h = hMin + Math.random() * hVar;
        g.fillStyle = `rgba(9,13,22,${alpha})`;
        g.fillRect(x, 410 - h, w, h);
        // occasional spire
        if (Math.random() < 0.22) {
          g.fillRect(x + w / 2 - 1.5, 410 - h - 26, 3, 26);
          g.fillStyle = "rgba(255,120,90,0.8)";
          g.fillRect(x + w / 2 - 1.5, 410 - h - 28, 3, 3);
        }
        // scattered warm windows
        g.fillStyle = `rgba(255,205,140,${winA})`;
        for (let wy = 410 - h + 8; wy < 396; wy += 9) {
          for (let wx = x + 4; wx < x + w - 5; wx += 8) {
            if (Math.random() < 0.24) g.fillRect(wx, wy, 3.2, 4.2);
          }
        }
        // a crown light band on some towers
        if (Math.random() < 0.3) {
          g.fillStyle = "rgba(140,190,255,0.5)";
          g.fillRect(x + 3, 410 - h + 2, w - 6, 2.4);
        }
        x += w + 4 + Math.random() * 26;
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ========================================================== LIGHTS */
  _buildLights() {
    const lights = new THREE.Group();
    this.rim = new THREE.DirectionalLight(0xc6d8f4, 2.4);
    this.rim.position.set(-5, 8, -10);
    this.rim.castShadow = true;
    this.rim.shadow.mapSize.set(2048, 2048);
    this.rim.shadow.camera.left = -10; this.rim.shadow.camera.right = 10;
    this.rim.shadow.camera.top = 10; this.rim.shadow.camera.bottom = -10;
    this.rim.shadow.bias = -0.0004; this.rim.shadow.radius = 7;
    lights.add(this.rim, this.rim.target);

    this.key = new THREE.SpotLight(0xfff2e2, 120, 44, Math.PI / 5, 0.65, 1.3);
    this.key.position.set(6, 8, 11);
    this.key.target.position.set(0, 0.6, 0);
    lights.add(this.key, this.key.target);

    this.key2 = new THREE.SpotLight(0xbcd0f4, 70, 40, Math.PI / 4.5, 0.7, 1.4);
    this.key2.position.set(-7, 7, 6);
    this.key2.target.position.set(0, 0.7, 0);
    lights.add(this.key2, this.key2.target);

    this.fill = new THREE.DirectionalLight(0x9fb6dc, 0.5);
    this.fill.position.set(9, 3, -4);
    lights.add(this.fill);
    this.amb = new THREE.AmbientLight(0x2a3444, 0.55);
    lights.add(this.amb);
    this.bounce = new THREE.PointLight(0x6a80a8, 0.7, 16, 2);
    this.bounce.position.set(0, -0.8, 0);
    lights.add(this.bounce);

    this.lights = lights;
    this.group.add(lights);
  }

  /*
   * The pavilion rig is a bright exhibit — on the boulevard it must fall
   * away to moonlight, or the night reads as a grey studio. Streetlamps,
   * headlights and the city itself carry the ride.
   */
  _setRideLighting(riding) {
    const t = { duration: 1.6, ease: "power2.inOut" };
    gsap.to(this.rim, { intensity: riding ? 0.55 : 2.4, ...t });
    gsap.to(this.key, { intensity: riding ? 0 : 120, ...t });
    gsap.to(this.key2, { intensity: riding ? 0 : 70, ...t });
    gsap.to(this.fill, { intensity: riding ? 0.08 : 0.5, ...t });
    gsap.to(this.amb, { intensity: riding ? 0.16 : 0.55, ...t });
    gsap.to(this.bounce, { intensity: riding ? 0.18 : 0.7, ...t });
    if (riding) {
      // moon key: cool, low, from the water side
      this.rim.position.set(-18, 14, -22);
      this.rim.color.setHex(0x9db8e2);
    } else {
      this.rim.position.set(-5, 8, -10);
      this.rim.color.setHex(0xc6d8f4);
    }
  }

  /* ====================================================== ATMOSPHERE */
  _buildAtmosphere() {
    const n = 220;
    const pos = new Float32Array(n * 3);
    this._dustPh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 6 + 0.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      this._dustPh[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe4bd, size: 0.03, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, map: this._softDot(),
    }));
    this.group.add(this.dust);
  }

  /* =========================================================== VIEWS */
  _buildViews() {
    this.views = {
      side: { pos: new THREE.Vector3(0.4, 1.15, 11.2), look: new THREE.Vector3(0, 0.78, 0), fov: 26 },
      front: { pos: new THREE.Vector3(9.4, 1.35, 8.4), look: new THREE.Vector3(-0.4, 0.72, 0), fov: 30 },
      rear: { pos: new THREE.Vector3(-9.4, 1.45, 8.4), look: new THREE.Vector3(0.4, 0.74, 0), fov: 30 },
    };
    this._rideCamV = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 34 };
    // The full rig. Order is the cinematic running order too.
    this.rideCams = [
      "chase", "bonnet", "bumper", "wheel", "spirit",
      "driver", "passenger", "interior", "rear",
      "roadside", "skyline", "orbit", "drone", "top",
    ];
    // Cameras mounted on the car — free-look reads as turning your head;
    // the rest are cinematic placements where it reads as a gimbal.
    this.onboardCams = new Set(["bonnet", "bumper", "driver", "passenger", "interior", "rear", "spirit"]);
  }

  getViewTarget() {
    if (this.phase !== "riding") return this.views[this.currentView] || this.views.side;

    const m = RIDE_MODES[this.mode];
    const v = this._rideCamV;
    const lane = this._car ? this._car.group.position.x : LANE_X;
    const pitch = this._pitch;           // + = accelerating (lean back)
    const t = this._rideT;

    switch (this.rideCam) {
      case "bonnet":
        v.pos.set(lane, 1.28 + Math.sin(t * 19) * 0.004, -0.2);
        v.look.set(lane * 0.7, 1.02 - pitch * 0.5, -40);
        v.fov = m.fov + 6;
        break;
      case "roadside":
        v.pos.set(8.6, 1.0, -2.5);
        v.look.set(lane, 0.85, -1);
        v.fov = 30;
        break;
      case "drone":
        v.pos.set(lane * 0.4 + Math.sin(t * 0.25) * 2.5, 13.5, 8.5);
        v.look.set(lane, 0.4, -4.5);
        v.fov = 42;
        break;
      case "skyline":
        v.pos.set(-9.5, 1.0, 5.2);
        v.look.set(3.5, 3.2, -26);
        v.fov = 42;
        break;
      case "wheel":
        v.pos.set(lane + 2.3, 0.52, -0.9);
        v.look.set(lane + 0.9, 0.42, -1.7);
        v.fov = 34;
        break;

      // ---- onboard: the car's nose points -Z, so forward is -Z ----
      case "bumper":                    // slung under the front valance
        v.pos.set(lane, 0.4, -2.75);
        v.look.set(lane - this.input.steer * 1.4, 0.3, -46);
        v.fov = m.fov + 12;
        break;
      // Seated cameras sit at the windscreen line (roof is y 1.61, the
      // bonnet meets the glass near z -0.9). Further back and the cabin's
      // own dark interior fills the frame instead of the city.
      // The cabin is fully modelled — dash, wheel, mirror — so the seated
      // cameras sit INSIDE it looking out through the windscreen. Eye height
      // 1.33 (roof is 1.61); the wheel is on the right, this being a Ghost.
      case "driver":
        v.pos.set(lane + 0.10, 1.33 + Math.sin(t * 21) * 0.003, 0.35);
        v.look.set(lane + 0.12 - this.input.steer * 1.5, 0.38 - pitch * 0.4, -13);
        v.fov = m.fov + 14;
        break;
      case "passenger":
        v.pos.set(lane - 0.52, 1.32 + Math.sin(t * 21) * 0.003, 0.38);
        v.look.set(lane - 0.48 - this.input.steer * 1.1, 0.42 - pitch * 0.4, -13);
        v.fov = m.fov + 14;
        break;
      case "interior":                  // the rear lounge, down the cabin spine
        v.pos.set(lane - 0.04, 1.26, 1.62);
        v.look.set(lane + 0.02, 0.86 - pitch * 0.3, -15);
        v.fov = m.fov + 14;
        break;
      case "rear":                      // looking back at the road behind
        v.pos.set(lane, 1.42, 3.05);
        v.look.set(lane, 1.05, 44);
        v.fov = 38;
        break;
      case "spirit": {
        // Over the leading edge of the bonnet, looking down the boulevard.
        // NOTE: this asset has no separate Spirit of Ecstasy mesh (no such
        // node exists in the GLB), so this frames the nose, not the mascot.
        const drift = Math.sin(t * 0.4) * 0.10;
        v.pos.set(lane + 0.30 + drift, 1.44, -0.30);
        v.look.set(lane - 0.05 - this.input.steer * 0.6, 0.72 - pitch * 0.4, -9);
        v.fov = 30;
        break;
      }

      // ---- cinematic placements ----
      case "top":
        v.pos.set(lane, 8.6, 1.2);
        v.look.set(lane, 0, -5.5);
        v.fov = 40;
        break;
      case "orbit": {                   // the classic circling reveal
        const a = t * 0.32;
        v.pos.set(lane + Math.sin(a) * 7.4, 2.0 + Math.sin(a * 0.5) * 0.7, Math.cos(a) * 7.4);
        v.look.set(lane, 0.82, 0);
        v.fov = 36;
        break;
      }

      default: { // chase — the hero camera with full inertia
        const sway = Math.sin(t * 0.9) * 0.14 * m.sway;
        v.pos.set(
          lane * 0.6 + sway + this.input.steer * 0.55,
          2.3 + pitch * 0.55 + Math.cos(t * 5) * 0.012,
          9.6 + pitch * 1.6
        );
        v.look.set(lane * 0.85 + this.input.steer * 1.2, 1.02 - pitch * 0.8, -15);
        v.fov = m.fov + Math.min(6, this.speed * 0.02);
      }
    }

    this._applyFreeLook(v);
    this._updateFlares(v.pos);
    return v;
  }

  /*
   * Free look. Rather than moving the camera, we swing the look-at point
   * around it — so dragging reads as turning your head from a fixed seat,
   * never as the seat sliding through the bodywork.
   */
  _applyFreeLook(v) {
    const { yaw, pitch } = this._freeLook;
    if (!yaw && !pitch) return;
    if (!this._flDir) this._flDir = new THREE.Vector3();
    const d = this._flDir.copy(v.look).sub(v.pos);
    const len = d.length();
    if (len < 1e-4) return;
    // spherical: yaw about world Y, then pitch about the camera's right axis
    const theta = Math.atan2(d.x, -d.z) + yaw;
    const phi = THREE.MathUtils.clamp(Math.asin(d.y / len) + pitch, -1.2, 1.2);
    const cp = Math.cos(phi);
    v.look.set(
      v.pos.x + Math.sin(theta) * cp * len,
      v.pos.y + Math.sin(phi) * len,
      v.pos.z - Math.cos(theta) * cp * len
    );
  }

  /* Drag deltas from the Showroom pointer handlers, in radians. */
  setFreeLook(dYaw, dPitch) {
    const range = this.onboardCams.has(this.rideCam) ? 1.15 : 0.6;
    this._freeLook.yaw = THREE.MathUtils.clamp(this._freeLook.yaw + dYaw, -range, range);
    this._freeLook.pitch = THREE.MathUtils.clamp(this._freeLook.pitch + dPitch, -0.5, 0.5);
  }

  resetFreeLook() { this._freeLook.yaw = 0; this._freeLook.pitch = 0; }

  setView(id) {
    if (this.phase === "pavilion" && this.views[id]) this.currentView = id;
  }

  setRideCam(id) {
    if (!this.rideCams.includes(id)) return;
    this.rideCam = id;
    this.resetFreeLook();   // a new composition starts framed as designed
  }

  setCinematic(on) {
    this.cinematic = on;
    this._cineT = 0;
    this._cineIdx = 0;
    this.resetFreeLook();
    this.rideCam = on ? CINE_SEQUENCE[0][0] : "chase";
    if (!on) this.rideCam = "chase";
  }

  /* driving mode — returns the grade for Showroom to apply scene-wide */
  setMode(id) {
    if (!RIDE_MODES[id]) return null;
    this.mode = id;
    const m = RIDE_MODES[id];
    this.modeVig = m.vig;      // the render loop blends toward this
    this.rain.visible = m.rain && this.phase === "riding";
    // city dimming + lamp brightness
    for (const mat of this.rideTowerMats) gsap.to(mat, { emissiveIntensity: (0.85 + 0.2) * m.cityDim, duration: 1.2 });
    for (const h of this.lampHeads) gsap.to(h.color, {
      r: 1 * m.lamp, g: 0.85 * m.lamp, b: 0.63 * m.lamp, duration: 1.2,
    });
    return m;
  }

  getModeList() {
    return Object.entries(RIDE_MODES).map(([id, m]) => ({ id, name: m.name, accent: m.accent }));
  }

  /* toggles */
  setHighBeam(on) {
    this.highBeam = on;
    if (!this._car?.headlights) return;
    this._car.headlights.traverse((o) => {
      if (o.isSpotLight) {
        gsap.to(o, { intensity: on ? 420 : 170, distance: on ? 70 : 38, duration: 0.4 });
        o.angle = on ? Math.PI / 4.6 : Math.PI / 6;
      }
    });
  }

  setIndicator(dir) { this.indicator = this.indicator === dir ? null : dir; this._blinkT = 0; }
  setHazards(on) { this.hazards = on; this._blinkT = 0; }

  /* =================================================== RIDE CONTROL */
  startRide() {
    if (this.phase === "riding") return;
    this.phase = "riding";
    this._rideT = 0;
    this.speed = 0;
    this._pitch = 0;
    this._trip = 0;
    this._fuel = TANK_GAL;
    this._freeLook.yaw = 0;
    this._freeLook.pitch = 0;
    this.pavilion.visible = false;
    this.ride.visible = true;
    this.rain.visible = RIDE_MODES[this.mode].rain;
    this._setRideLighting(true);
    this._seedRide();
    if (this._car) {
      gsap.to(this._car.group.rotation, { y: Math.PI / 2, duration: 1.3, ease: "power2.inOut" });
      gsap.to(this._car.group.position, { x: LANE_X, duration: 1.6, ease: "power2.inOut" });
      if (this._car.headlights) this._car.headlights.visible = true;
      this._attachBlinkers(this._car);
      this.setCabinLight(true);   // the seated cameras need a lit cabin
    }
  }

  stopRide() {
    if (this.phase === "pavilion") return;
    this.phase = "pavilion";
    this.ride.visible = false;
    this.pavilion.visible = true;
    this._setRideLighting(false);
    this.currentView = "side";
    this.rideCam = "chase";
    this.cinematic = false;
    this.speed = 0;
    this.indicator = null;
    this.hazards = false;
    if (this._car) {
      gsap.to(this._car.group.rotation, { y: 0, duration: 1.0, ease: "power2.inOut" });
      gsap.to(this._car.group.position, { x: 0, duration: 1.0, ease: "power2.inOut" });
      this._car.group.rotation.z = 0;
      if (this._car.headlights) this._car.headlights.visible = false;
      for (const w of this._car.wheelPivots) w.rotation.z = 0;
      for (const s of this.blinkSprites) s.visible = false;
    }
  }

  isRiding() { return this.phase === "riding"; }

  _attachBlinkers(car) {
    if (this._blinkersOn === car) return;
    this._blinkersOn = car;
    this.blinkSprites = [];
    // corners in car-local space (nose +X before ride rotation)
    const corners = [
      { p: new THREE.Vector3(2.55, 0.62, -0.92), side: "L" },
      { p: new THREE.Vector3(2.55, 0.62, 0.92), side: "R" },
      { p: new THREE.Vector3(-2.6, 0.68, -0.92), side: "L" },
      { p: new THREE.Vector3(-2.6, 0.68, 0.92), side: "R" },
    ];
    for (const c of corners) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xffa028, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.5);
      s.position.copy(c.p);
      s.visible = false;
      s.userData.side = c.side;
      car.group.add(s);
      this.blinkSprites.push(s);
    }
  }

  /* ========================================================= TOGGLE */
  setVisible(visible, activeCar) {
    this.visible = visible;
    this.group.visible = visible;
    this.phase = "pavilion";
    this.currentView = "side";
    this.rideCam = "chase";
    this.ride.visible = false;
    this.pavilion.visible = true;
    this._car = activeCar || null;

    if (visible && activeCar) {
      activeCar.group.position.set(0, CAR_Y, 0);
      activeCar.group.rotation.set(0, 0, 0);
      if (activeCar.headlights) activeCar.headlights.visible = false;
      this._setupHeadlights(activeCar);
    }
  }

  _setupHeadlights(active) {
    if (!active || active.headlights) return;
    const h = new THREE.Group();
    for (const zx of [-0.78, 0.78]) {
      const l = new THREE.SpotLight(0xfff4e6, 170, 38, Math.PI / 6, 0.4, 1.3);
      l.position.set(2.5, 0.55, zx);
      const tgt = new THREE.Object3D();
      tgt.position.set(18, 0.1, zx);
      h.add(l, tgt);
      l.target = tgt;
      // lamp glow visible from outside
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xf2f6ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      gs.scale.setScalar(0.62);
      gs.position.set(2.62, 0.58, zx);
      h.add(gs);
      // anamorphic flare — only visible from in front of the car, so it
      // appears in bumper/roadside/oncoming angles and never from behind
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._flareTex(), color: 0xdce9ff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      flare.scale.set(9, 0.55, 1);
      flare.position.set(2.7, 0.58, zx);
      flare.renderOrder = 8;
      h.add(flare);
      (this.headFlares = this.headFlares || []).push(flare);
    }
    h.visible = false;
    active.headlights = h;
    active.group.add(h);
    this._setupCabinGlow(active);
  }

  /*
   * Cabin ambient light. Without it the seated cameras look into a black
   * hole — a real car at night has its dashboard and door casings lit, and
   * that glow is most of what makes an interior shot feel inhabited.
   * Local +X maps to world -Z on the driving car, so this sits mid-cabin.
   */
  _setupCabinGlow(active) {
    if (active.cabinGlow) return;
    const g = new THREE.Group();

    const main = new THREE.PointLight(0xffcf9a, 2.4, 3.4, 2);
    main.position.set(-0.25, 0.95, 0);
    g.add(main);

    // door-casing washes, one per side, cooler and dimmer
    for (const dz of [-0.78, 0.78]) {
      const wash = new THREE.PointLight(0xffb877, 1.0, 1.9, 2);
      wash.position.set(-0.15, 0.78, dz);
      g.add(wash);
    }
    // the instrument binnacle throws a little light back at the driver
    const dash = new THREE.PointLight(0xbcd4ff, 0.8, 1.4, 2);
    dash.position.set(0.55, 0.92, 0.4);
    g.add(dash);

    for (const l of g.children) l.userData.base = l.intensity;
    g.visible = false;
    active.cabinGlow = g;
    active.group.add(g);
  }

  setCabinLight(on) {
    this.cabinLight = on;
    const g = this._car?.cabinGlow;
    if (!g) return;
    g.visible = true;
    for (const l of g.children) {
      gsap.to(l, { intensity: on ? l.userData.base : 0.001, duration: 0.7, ease: "power2.out" });
    }
  }

  /* ========================================================= UPDATE */
  update(dt, t, activeCar) {
    if (!this.visible) return;
    if (activeCar) this._car = activeCar;
    if (this.starMat) this.starMat.uniforms.uTime.value = t;

    // clouds drift; aircraft crosses; beacons blink — the sky is alive in both acts
    for (const c of this.clouds || []) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 200) c.position.x = -220;
    }
    if (this.aircraft) {
      this.aircraft.position.x -= dt * 2.6;
      if (this.aircraft.position.x < -200) this.aircraft.position.x = 200;
      if (this._acStrobe) this._acStrobe.material.opacity = (Math.sin(t * 6) > 0.6) ? 0.95 : 0.05;
    }
    const blinkPhase = Math.sin(t * 5.2) > 0 ? 1 : 0.06;
    for (const b of this.beacons || []) b.material.opacity = blinkPhase;
    for (const b of this.farBeacons || []) b.material.opacity = blinkPhase;

    if (this.phase === "riding") this._updateRide(dt, t, activeCar);
    else this._updatePavilion(dt, t, activeCar);
  }

  _updatePavilion(dt, t, activeCar) {
    if (activeCar) {
      activeCar.group.position.y = CAR_Y + Math.sin(t * 0.6) * 0.012;
      activeCar.group.rotation.z = Math.sin(t * 0.45) * 0.0025;
    }
    if (this.cityLights) this.cityLights.material.opacity = 0.78 + 0.12 * Math.sin(t * 0.9);
    for (const s of this.floorStrips) s.material.opacity = 0.85 + 0.15 * Math.sin(t * 0.7);
    if (this.dust) {
      const p = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this._dustPh.length; i++) {
        p[i * 3] += Math.sin(t * 0.2 + this._dustPh[i]) * 0.0015;
        p[i * 3 + 1] += 0.0022;
        if (p[i * 3 + 1] > 6.2) p[i * 3 + 1] = 0.1;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  _updateRide(dt, t, activeCar) {
    this._rideT += dt;
    const m = RIDE_MODES[this.mode];

    // ---- physics: throttle / brake around the mode's cruise ----
    let target = m.cruise;
    if (this.input.throttle) target = m.cruise * 1.55;
    if (this.input.brake) target = Math.max(14, m.cruise * 0.24);
    const accel = (target - this.speed) * (this.input.brake ? 0.05 : 0.016) * (m.accel / 14);
    this.speed += accel * (dt * 60);
    this.speed = Math.max(0, this.speed);

    // ---- odometer + fuel burn (mph × seconds ÷ 3600 = miles) ----
    const miles = (this.speed * dt) / 3600;
    this._trip += miles;
    this._fuel = Math.max(0, this._fuel - miles / this._mpg());

    // camera-inertia pitch: +accel leans back, braking dips the nose
    const pitchTarget = THREE.MathUtils.clamp(accel * 3.2, -0.5, 0.5) * m.inertia;
    this._pitch += (pitchTarget - this._pitch) * 0.06;

    const flow = this.speed * dt * 0.42;

    // ---- the boulevard streams past ----
    if (this.roadTex) this.roadTex.offset.y = (this.roadTex.offset.y - flow * 0.105) % 1;

    const recycle = (o, rows, gap) => {
      o.position.z += flow;
      if (o.position.z > 30) {
        let far = 1e9;
        for (const q of rows) if ((q.userData.side || 1) === (o.userData.side || 1)) far = Math.min(far, q.position.z);
        o.position.z = far - gap;
      }
    };
    for (const tw of this.rideTowers) recycle(tw, this.rideTowers, 16 + Math.random() * 6);
    for (const p of this.railPosts) recycle(p, this.railPosts, 16);

    // street lamps recycle, then ignite: a lamp that comes back into the
    // world warms up over half a second instead of popping on, which reads
    // as the boulevard lighting itself ahead of the car
    for (const lp of this.rideLamps) {
      const before = lp.position.z;
      recycle(lp, this.rideLamps, 42);
      if (lp.position.z < before) lp.userData.warm = 0;      // it wrapped
      const w = lp.userData.warm ?? 1;
      if (w < 1) {
        lp.userData.warm = Math.min(1, w + dt * 2);
        const k = lp.userData.warm;
        lp.userData.head.color.setRGB(k * m.lamp, k * 0.85 * m.lamp, k * 0.63 * m.lamp);
        if (lp.userData.glow) lp.userData.glow.material.opacity = 0.42 * k;
      }
    }

    this._updateSetPieces(flow);

    // far city + water drift by slowly (parallax)
    this.farCity.position.z = (this.farCity.position.z + flow * 0.22) % 220;
    for (const s of this.waterStreaks) {
      s.position.z += flow * 0.4;
      if (s.position.z > 20) s.position.z = -430;
      s.material.opacity = (0.09 + 0.09 * Math.abs(Math.sin(t * 1.4 + s.userData.ph)));
    }

    // oncoming traffic + leader
    for (const c of this.traffic) {
      c.position.z += flow + c.userData.speed * dt;
      if (c.position.z > 26) { c.position.z = -300 - Math.random() * 120; c.userData.speed = 24 + Math.random() * 12; }
    }
    this.leader.position.z += flow - this.speed * dt * 0.36;
    if (this.leader.position.z > -18) this.leader.position.z = -150;
    if (this.leader.position.z < -190) this.leader.position.z = -140;

    // speed streaks
    const sp = this.streaks.geometry.attributes.position.array;
    for (let i = 0; i < this._streakZ.length; i++) {
      sp[i * 3 + 2] += flow * 2.4 * this._streakZ[i];
      if (sp[i * 3 + 2] > 12) { sp[i * 3 + 2] = -240; sp[i * 3] = (Math.random() - 0.5) * 24; }
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.streaks.material.opacity = Math.min(0.55, 0.12 + this.speed * 0.0028);

    // rain falls diagonally with our motion
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this._rainV.length; i++) {
        rp[i * 3 + 1] -= this._rainV[i] * dt;
        rp[i * 3 + 2] += flow * 0.7;
        if (rp[i * 3 + 1] < 0) { rp[i * 3 + 1] = 14; rp[i * 3] = (Math.random() - 0.5) * 40; rp[i * 3 + 2] = -Math.random() * 60 + 12; }
        if (rp[i * 3 + 2] > 14) rp[i * 3 + 2] = -50;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // ---- the car: steering, magic-carpet float, roll, wheels ----
    if (activeCar) {
      const g = activeCar.group;
      // steerGain is what separates the modes at the wheel: Magic Carpet
      // glides across the lane, Sport darts to it
      const steerTarget = LANE_X + this.input.steer * 2.2 * m.steerGain + Math.sin(this._rideT * 0.31) * 0.5 * m.sway;
      const prevX = g.position.x;
      g.position.x += (steerTarget - g.position.x) * (0.035 * m.steerGain);
      const lateralV = (g.position.x - prevX) / Math.max(dt, 1e-4);
      // body roll from lateral movement + acceleration squat
      this._roll += ((-lateralV * 0.02) - this._roll) * 0.08;
      g.rotation.z = this._roll;
      g.rotation.x = -this._pitch * 0.35;
      g.position.y = CAR_Y + Math.sin(this._rideT * 1.7) * m.float + Math.sin(this._rideT * 23) * 0.004 * (this.speed / 100);
      const wheelSpin = flow * 0.9;
      for (const w of activeCar.wheelPivots) w.rotation.z -= wheelSpin;
    }

    // ---- indicators / hazards blink ----
    const blinkActive = this.hazards || this.indicator;
    if (blinkActive) {
      this._blinkT += dt;
      const on = Math.floor(this._blinkT / 0.42) % 2 === 0;
      if (on !== this._blinkOn) {
        this._blinkOn = on;
        if (on && this.onBlink) this.onBlink();
      }
      for (const s of this.blinkSprites) {
        const show = this.hazards || s.userData.side === this.indicator;
        s.visible = show && on;
      }
    } else {
      for (const s of this.blinkSprites) s.visible = false;
      this._blinkOn = false;
    }

    // ---- cinematic auto-camera: a cut sequence, not a round-robin ----
    if (this.cinematic) {
      this._cineT += dt;
      const [, hold] = CINE_SEQUENCE[this._cineIdx];
      if (this._cineT > hold) {
        this._cineT = 0;
        this._cineIdx = (this._cineIdx + 1) % CINE_SEQUENCE.length;
        this.rideCam = CINE_SEQUENCE[this._cineIdx][0];
        this.resetFreeLook();
      }
    }
  }

  /*
   * Set pieces stream toward the car and recycle a full EVENT_GAP back, so
   * tunnel and bridge stay half a cycle apart forever. Entering the tunnel
   * flips _inTunnel, which mutes the street lamps that would otherwise poke
   * through the roof and tells the HUD/audio the world has closed in.
   */
  _updateSetPieces(flow) {
    if (!this.tunnel) return;

    for (const piece of [this.tunnel, this.bridge]) {
      piece.position.z += flow;
      if (piece.position.z > 60) piece.position.z -= EVENT_GAP;
    }

    // the car sits at world z = 0, so the tunnel contains us when its
    // centre is within half a tunnel length of the origin
    const tz = this.tunnel.position.z;
    const inside = Math.abs(tz) < TUNNEL_LEN / 2;
    if (inside !== this._inTunnel) {
      this._inTunnel = inside;
      if (this.onTunnel) this.onTunnel(inside);
      // the sky no longer reaches us; drop the moon key while enclosed
      gsap.to(this.rim, { intensity: inside ? 0.12 : 0.55, duration: 0.5 });
    }

    // hide any street lamp currently occupying the tunnel's span
    const lo = tz - TUNNEL_LEN / 2 - 4, hi = tz + TUNNEL_LEN / 2 + 4;
    for (const lp of this.rideLamps) {
      lp.visible = !(lp.position.z > lo && lp.position.z < hi);
    }
  }

  /*
   * Telemetry — every readout is derived from simulation state. Nothing on
   * the cluster is a literal, because an instrument that cannot move is a
   * decoration pretending to be an instrument.
   */
  getTelemetry() {
    const m = RIDE_MODES[this.mode];

    // gear: the band the current road speed falls in, less the mode's hold
    let gearIdx = 0;
    for (let i = 0; i < GEAR_BANDS.length; i++) {
      if (this.speed >= GEAR_BANDS[i][0]) gearIdx = i;
    }
    gearIdx = Math.max(0, gearIdx - m.gearHold);
    const [lo, hi] = GEAR_BANDS[gearIdx];
    const frac = THREE.MathUtils.clamp((this.speed - lo) / (hi - lo), 0, 1);
    // idle 620, and each gear sweeps ~2600 rpm before the shift
    const rpm = Math.round(620 + frac * 2600 + this.input.throttle * 420);

    // power reserve: the Rolls-Royce inversion of a rev counter — how much
    // of the engine is still in hand, not how hard it is working
    const reserve = Math.max(2, Math.round(100 - (rpm / 5500) * 100));

    // Range uses efficiency achieved SO FAR, not the instantaneous figure.
    // Instantaneous mpg improves as you slow down, so braking to a halt
    // would make the predicted range leap by a hundred miles — which is
    // exactly the tell of a fake instrument. Averaging over the trip is
    // both what a real car does and what stops the number jumping.
    const burned = TANK_GAL - this._fuel;
    const avgMpg = burned > 0.02 ? this._trip / burned : this._mpg();
    const range = Math.max(0, Math.round(this._fuel * avgMpg));

    return {
      speed: Math.round(this.speed),
      rpm,
      reserve,
      gear: this._gearLabel(gearIdx),
      trip: +this._trip.toFixed(1),
      range,
      temp: +this._temp().toFixed(1),
      mode: this.mode,
      modeName: m.name,
      accent: m.accent,
      heading: Math.round((341 + Math.sin(this._rideT * 0.05) * 4 + 360) % 360),
      riding: this.phase === "riding",
      cam: this.rideCam,
      tunnel: this._inTunnel,
    };
  }

  _gearLabel(idx) {
    if (this.speed < 1.5) return this.input.brake ? "P" : "N";
    return `D${idx + 1}`;
  }

  /* Efficiency falls as speed rises, then again by the mode's character. */
  _mpg() {
    const m = RIDE_MODES[this.mode];
    return THREE.MathUtils.clamp(BASE_MPG - this.speed * 0.055, 9, BASE_MPG) * m.mpg;
  }

  /* Ambient temperature: a night that cools as it deepens, plus the mode. */
  _temp() {
    const m = RIDE_MODES[this.mode];
    return 12.4 + m.temp - Math.min(2.5, this._rideT / 240) + Math.sin(this._rideT * 0.017) * 0.4;
  }

  dispose() {
    this.group?.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach((x) => { for (const v of Object.values(x)) if (v && v.isTexture) v.dispose(); x.dispose?.(); });
      }
    });
  }
}

export { RIDE_MODES };
