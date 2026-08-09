import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import gsap from "gsap";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PlanarReflection, applyPlanarReflection, syncPlanarReflection } from "./PlanarReflection.js";

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
  comfort: { name: "Comfort",      cruise: 96,  accel: 14, sway: 0.5,  float: 0.010, inertia: 0.6,  fov: 28, fog: 0.0040, bloom: 0.13, cityDim: 1.0,  lamp: 1.0,  accent: "#d8b878", wind: 0.5, rain: false, steerGain: 1.0,  gearHold: 0, grain: 0.030, vig: 0.30, temp: 0,    mpg: 1.0 },
  magic:   { name: "Magic Carpet", cruise: 78,  accel: 9,  sway: 0.3,  float: 0.022, inertia: 0.3,  fov: 27, fog: 0.0044, bloom: 0.14, cityDim: 1.0,  lamp: 0.9,  accent: "#9cc4ff", wind: 0.3, rain: false, steerGain: 0.62, gearHold: 0, grain: 0.016, vig: 0.24, temp: 0,    mpg: 1.08 },
  sport:   { name: "Sport",        cruise: 152, accel: 26, sway: 0.9,  float: 0.006, inertia: 1.1,  fov: 31, fog: 0.0036, bloom: 0.12, cityDim: 1.0,  lamp: 1.0,  accent: "#e07850", wind: 1.0, rain: false, steerGain: 1.55, gearHold: 1, grain: 0.052, vig: 0.42, temp: 0,    mpg: 0.72 },
  night:   { name: "Night",        cruise: 68,  accel: 10, sway: 0.4,  float: 0.014, inertia: 0.45, fov: 28, fog: 0.0050, bloom: 0.16, cityDim: 0.42, lamp: 1.35, accent: "#8fa2c8", wind: 0.4, rain: false, steerGain: 0.8,  gearHold: 0, grain: 0.044, vig: 0.46, temp: -2,   mpg: 1.05 },
  rain:    { name: "Rain",         cruise: 74,  accel: 11, sway: 0.45, float: 0.012, inertia: 0.5,  fov: 28, fog: 0.0060, bloom: 0.15, cityDim: 0.8,  lamp: 1.15, accent: "#6fa8c8", wind: 0.7, rain: true,  steerGain: 0.7,  gearHold: 0, grain: 0.038, vig: 0.38, temp: -3.5, mpg: 0.92 },
  personal:{ name: "Personal",     cruise: 88,  accel: 15, sway: 0.5,  float: 0.014, inertia: 0.7,  fov: 28, fog: 0.0042, bloom: 0.13, cityDim: 1.0,  lamp: 1.0,  accent: "#c8a2d8", wind: 0.5, rain: false, steerGain: 1.0,  gearHold: 0, grain: 0.030, vig: 0.32, temp: 0,    mpg: 1.0 },
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

/*
 * Building metrics, in metres. A storey is ~3.5 m and a curtain-wall bay is
 * ~1.75 m in the real world; the facade texture is tiled to those figures so
 * a tower's windows are the right SIZE for its height. Getting this wrong is
 * what makes a box read as graph paper instead of architecture.
 */
const FLOOR_M = 3.55;
const BAY_M = 1.75;

/* a unit cylinder points up +Y; every strut and cable is aligned off this */
const UNIT_Y = new THREE.Vector3(0, 1, 0);

/* The Ghost's real numbers, so the instruments have something true to say. */
const TUNNEL_LEN = 130;       // world units ≈ metres — ~3 s inside at a cruise
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
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vP;
          uniform float uTime;

          // value noise, for cloud banks
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
          }
          float fbm(vec2 p){
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
            return v;
          }

          void main(){
            vec3 d = normalize(vP);
            float h = clamp(d.y, 0.0, 1.0);

            /*
             * A financial district never lets the sky go black. It is dark
             * overhead, but there is always a dome of light standing over
             * the towers — that ambience is most of why a city at night
             * reads as expensive rather than merely unlit. Cool-neutral
             * base, warm-white close to the roofline, and nothing anywhere
             * near pitch.
             */
            /*
             * The old dome mixed a warm sodium core straight into a blue
             * haze and the two met in MAGENTA — a mauve band sitting over
             * the roofline that read as a cheap dusk gradient and undid the
             * whole grade. The fix is not to remove the warmth but to keep
             * the two out of each other's way: the sodium core is pushed
             * DOWN below the roofline, where real buildings occlude it and
             * only its topmost edge shows, and the band between them is
             * carried by a desaturated slate that both can blend into.
             */
            vec3 zenith  = vec3(0.0040, 0.0062, 0.0122);
            vec3 upper   = vec3(0.0125, 0.0186, 0.0322);
            vec3 horizon = vec3(0.0345, 0.0450, 0.0625);
            vec3 col = mix(upper, zenith, pow(h, 0.42));
            col = mix(horizon, col, smoothstep(0.0, 0.30, h));

            // the district's dome of light: broad, cool-neutral, tall enough
            // to lift a third of the sky the way a real financial centre does
            col += vec3(0.0290, 0.0345, 0.0470) * exp(-pow(max(d.y, 0.0) * 4.2, 1.05));

            // humidity sitting in the first few degrees — this is the layer
            // that gives the towers something to fade INTO
            col += vec3(0.0225, 0.0290, 0.0400) * exp(-pow(max(d.y, 0.0) * 11.0, 1.5));

            /* and the sodium core, kept LOW, NARROW and weak. Warm light
             * added into a blue haze does not read as warm — it reads as
             * mauve, and a mauve band over the roofline is the single most
             * expensive-looking thing to get wrong. The warmth in this
             * frame belongs to the windows and the street lamps, which are
             * real objects the eye can attribute it to. */
            col += vec3(0.0215, 0.0130, 0.0052) * exp(-pow(max(d.y, 0.0) * 52.0, 1.3));

            // cloud banks lit from beneath by the city, thinning with altitude
            vec2 cp = d.xz / max(d.y + 0.30, 0.12);
            float cl = fbm(cp * 1.5 + vec2(uTime * 0.004, uTime * 0.002));
            cl = smoothstep(0.44, 0.94, cl) * smoothstep(0.02, 0.34, h) * (1.0 - h * 0.6);
            vec3 cloudCol = mix(vec3(0.058, 0.070, 0.098), vec3(0.115, 0.098, 0.082), exp(-h * 4.0));
            col = mix(col, cloudCol, cl * 0.8);

            // a whisper of blue noise, so a 220 m dome of smooth gradient
            // does not band across the top of every frame
            col += (hash(d.xz * 811.0 + d.y * 97.0) - 0.5) * 0.0022;

            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    dome.renderOrder = -2;
    this.skyMat = dome.material;
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

  /*
   * Facade textures.
   *
   * A real tower at night is mostly DARK. What makes it read as architecture
   * rather than a lit grid is structure: floor slabs, vertical mullions, and
   * light that clusters — whole floors still working, a scatter of late
   * offices, blinds half drawn. Uniform dots at even spacing is the single
   * thing that made the old city look like vector art, so the light here is
   * clustered per floor and per bay, never independent per window.
   *
   * Drawn one cell (one bay × one storey) at 48px so mullions and spandrels
   * survive at the near towers, and CACHED per style: the tile is mapped to
   * real metres through the mesh's own UVs (see _facadeGeo), so every tower
   * can share these few textures instead of baking its own canvas.
   */
  _facadeTex(style = 0) {
    this._facadeCache = this._facadeCache || {};
    if (this._facadeCache[style]) return this._facadeCache[style];

    // bays × storeys per tile. The world size of a bay and a storey is FIXED
    // (BAY_M / FLOOR_M) — only how many of them a tile holds varies, which is
    // what gives one tower a wide lazy grid and its neighbour a tight one.
    /* Occupancy. A financial district at eleven at night is far more lit
     * than intuition suggests — cleaners, trading desks, whole floors left
     * on — and the density of those windows IS the city's glow. Held too
     * low, the towers read as unoccupied blocks with a few lights in them,
     * which is a silhouette rather than a skyline. */
    const [bays, floors, litFloor] = [
      [8, 16, 0.64], [6, 12, 0.56], [10, 20, 0.76], [7, 14, 0.50], [9, 18, 0.62],
    ][style % 5];

    /*
     * 96 px a storey rather than 48. The extra resolution does not go on
     * more windows — a storey is still a storey and a bay is still a bay —
     * it goes on what is INSIDE each window, and that is the whole point.
     * A lit office seen from the street is not a coloured rectangle: it is
     * a bright ceiling plane, a darker floor, the black verticals of
     * partitions and columns, and a hot core where the fitting actually
     * hangs. At 48 px there is no room for any of that, so every window
     * comes out as a flat chip of colour and a hundred of them come out as
     * graph paper. That flatness is the single largest reason the skyline
     * read as cardboard.
     */
    const CELL = 96;
    const W = bays * CELL, H = floors * CELL;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");

    // dark glass curtain wall
    g.fillStyle = "#04060b";
    g.fillRect(0, 0, W, H);

    const floorH = CELL, bayW = CELL;

    /* ---- the structure, before any light ----
     * A curtain wall is a grid of anodised aluminium sitting proud of the
     * glass, and at night it catches the sky along its top edge and goes
     * black along its bottom one. Drawing both edges — rather than one flat
     * grey line — is what gives the facade relief instead of a wireframe.
     */
    for (let y = 0; y < H; y += floorH) {
      g.fillStyle = "rgba(148,168,198,0.085)";        // lit top arris
      g.fillRect(0, y, W, 3);
      g.fillStyle = "rgba(0,0,0,0.55)";               // shadowed underside
      g.fillRect(0, y + 3, W, 3);
    }
    for (let x = 0; x < W; x += bayW) {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(x, 0, 4, H);
      g.fillStyle = "rgba(142,162,192,0.075)";
      g.fillRect(x + 4, 0, 2, H);
    }

    // spandrel panel under every window — the opaque band that hides the
    // floor structure. Without it a tower is all glass and reads as a screen.
    for (let y = 0; y < H; y += floorH) {
      const sp = g.createLinearGradient(0, y + floorH * 0.62, 0, y + floorH);
      sp.addColorStop(0, "rgba(0,0,0,0.72)");
      sp.addColorStop(0.75, "rgba(3,5,9,0.86)");
      sp.addColorStop(1, "rgba(10,14,22,0.68)");
      g.fillStyle = sp;
      g.fillRect(0, y + floorH * 0.62, W, floorH * 0.38);
    }

    for (let y = 2, row = 0; y < H - 2; y += floorH, row++) {
      // whole floors switch on together; between them, scattered rooms
      const wholeFloor = Math.random() < litFloor;
      const floorWarm = Math.random() < 0.34;
      // a run of adjacent bays lit together reads as one open-plan office
      let run = 0, runWarm = floorWarm, runV = 0;

      for (let x = 2, bay = 0; x < W - 2; x += bayW, bay++) {
        let lit = wholeFloor;
        if (run > 0) { lit = true; run--; }
        else if (!wholeFloor && Math.random() < 0.44) {
          run = 1 + Math.floor(Math.random() * 3);
          runWarm = Math.random() < 0.36;
          runV = 150 + Math.random() * 90;
          lit = true;
        }
        if (!lit) continue;

        const warm = run > 0 ? runWarm : floorWarm;
        const v = run > 0 ? runV : 160 + Math.random() * 95;
        // vertical falloff: lower floors sit in the shadow of neighbours
        const depth = 0.45 + 0.55 * (y / H);
        const a = (0.5 + Math.random() * 0.5) * depth;

        /* Office light is tungsten or cool fluorescent — amber-white or
         * blue-white. Saturated colour here turns the skyline into confetti,
         * and the grade's chromatic aberration then fringes every window.
         * The lit part is the VISION glass only: the top two thirds of the
         * storey. Light spilling over the spandrel is what read as one tall
         * smear per bay rather than a floor of offices. */
        const gx = x + 5, gy = y + 5;
        const gw = bayW - 11, gh = floorH * 0.55;
        const cw = warm ? `${v}, ${v * 0.84}, ${v * 0.64}` : `${v * 0.86}, ${v * 0.93}, ${v}`;

        /* the room BEHIND the glass, in depth: the ceiling plane is what is
           actually bright, the floor takes only bounce, and the two are
           separated by the wall you can see at the back of the office */
        const room = g.createLinearGradient(0, gy, 0, gy + gh);
        room.addColorStop(0.00, `rgba(${cw},${a * 1.0})`);      // ceiling
        room.addColorStop(0.30, `rgba(${cw},${a * 0.72})`);
        room.addColorStop(0.72, `rgba(${cw},${a * 0.34})`);
        room.addColorStop(1.00, `rgba(${cw},${a * 0.20})`);     // floor
        g.fillStyle = room;
        g.fillRect(gx, gy, gw, gh);

        // the fitting itself: a hot line under the slab
        g.fillStyle = warm ? `rgba(255,242,218,${a * 0.5})` : `rgba(238,246,255,${a * 0.45})`;
        g.fillRect(gx + 2, gy + 1, gw - 4, Math.max(2, gh * 0.10));

        // columns and partitions standing in the room — the dark verticals
        // that stop an open-plan floor reading as a light box
        const parts = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0;
        for (let p = 0; p < parts; p++) {
          const px = gx + 4 + Math.random() * (gw - 10);
          g.fillStyle = `rgba(2,4,8,${0.30 + Math.random() * 0.4})`;
          g.fillRect(px, gy + gh * (0.1 + Math.random() * 0.2), 2 + Math.random() * 4, gh * (0.5 + Math.random() * 0.4));
        }
        // and the odd desk lamp burning after hours
        if (Math.random() < 0.18) {
          const dx = gx + 3 + Math.random() * (gw - 8), dy = gy + gh * (0.5 + Math.random() * 0.35);
          const dot = g.createRadialGradient(dx, dy, 0, dx, dy, gh * 0.34);
          dot.addColorStop(0, `rgba(255,232,186,${a * 0.85})`);
          dot.addColorStop(1, "rgba(255,232,186,0)");
          g.fillStyle = dot;
          g.fillRect(dx - gh * 0.34, dy - gh * 0.34, gh * 0.68, gh * 0.68);
        }
        // half-drawn blinds on some offices — a horizontal bite out of the top
        if (Math.random() < 0.24) {
          const bh = gh * (0.25 + Math.random() * 0.4);
          g.fillStyle = "rgba(4,6,11,0.80)";
          g.fillRect(gx, gy, gw, bh);
          // the slats catch a little of the room behind them
          g.fillStyle = `rgba(${cw},${a * 0.10})`;
          for (let sy = gy + 2; sy < gy + bh; sy += 4) g.fillRect(gx, sy, gw, 1);
        }
        // the glass itself is in front of all of it, and glass is never clean
        g.fillStyle = "rgba(120,150,190,0.045)";
        g.fillRect(gx, gy, gw, gh * 0.4);
      }
    }

    /* ---- what the DARK glass does ----
     * Two thirds of a night facade is unlit, and unlit curtain wall is not
     * black: it is a mirror at a grazing angle, so it carries a wash of the
     * sky down its upper floors and a smear of the street across its lowest
     * ones. Leaving that out is why the towers had lit dots floating on
     * nothing. Drawn over everything, at low alpha, in screen blend.
     */
    g.globalCompositeOperation = "lighter";
    const skyWash = g.createLinearGradient(0, 0, 0, H);
    skyWash.addColorStop(0.00, "rgba(21,33,55,0.20)");    // top floors see sky
    skyWash.addColorStop(0.45, "rgba(13,21,36,0.10)");
    skyWash.addColorStop(0.86, "rgba(9,12,20,0.035)");
    skyWash.addColorStop(1.00, "rgba(44,32,20,0.16)");    // and the street below
    g.fillStyle = skyWash;
    g.fillRect(0, 0, W, H);
    // vertical banding: adjacent panes of a curtain wall are never set at
    // exactly the same angle, so the sky breaks across them
    for (let x = 0; x < W; x += bayW) {
      if (Math.random() < 0.55) continue;
      g.fillStyle = `rgba(40,58,88,${0.03 + Math.random() * 0.06})`;
      g.fillRect(x + 5, 0, bayW - 10, H);
    }
    g.globalCompositeOperation = "source-over";

    // a couple of dark service bands — lift cores and plant floors
    g.fillStyle = "rgba(0,0,0,0.88)";
    for (let i = 0; i < 2; i++) {
      const y = Math.floor(Math.random() * floors) * floorH;
      g.fillRect(0, y, W, floorH * (1 + Math.floor(Math.random() * 2)));
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.colorSpace = THREE.SRGBColorSpace;
    // the tile's true size on the building, in metres — _facadeGeo scales
    // each mesh's UVs by this so a storey is a storey on every tower
    t.userData = { tileW: bays * BAY_M, tileH: floors * FLOOR_M };
    this._facadeCache[style] = t;
    return t;
  }

  /*
   * Where a facade is glass and where it is metal.
   *
   * Every tower was one uniform roughness, so the mullion grid, the
   * spandrel panels and the vision glass all took the night sky back at
   * exactly the same gloss — which is precisely the "no flat surfaces"
   * failure: a building whose materials do not differ has no materials at
   * all, only a picture of some. Black here is mirror glass, white is
   * anodised frame and painted spandrel, and the difference between them is
   * what makes the grid read as built rather than drawn on.
   */
  _facadeRoughTex(style = 0) {
    this._facadeRoughCache = this._facadeRoughCache || {};
    if (this._facadeRoughCache[style]) return this._facadeRoughCache[style];
    const [bays, floors] = [[8, 16], [6, 12], [10, 20], [7, 14], [9, 18]][style % 5];
    const CELL = 48;
    const W = bays * CELL, H = floors * CELL;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");

    g.fillStyle = "#231f1c";                 // vision glass: near mirror
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += CELL) {
      g.fillStyle = "#b4aca4";               // spandrel: painted, matte
      g.fillRect(0, y + CELL * 0.62, W, CELL * 0.38);
      g.fillStyle = "#8e8880";               // the slab edge
      g.fillRect(0, y, W, 3);
    }
    for (let x = 0; x < W; x += CELL) {
      g.fillStyle = "#6f6a64";               // anodised mullion: satin
      g.fillRect(x, 0, 5, H);
    }
    // weathering: rain tracks down the glass, dirt collecting on the frames
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const h = 30 + Math.random() * 240;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, `rgba(190,182,174,${0.05 + Math.random() * 0.14})`);
      gr.addColorStop(1, "rgba(190,182,174,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, 1 + Math.random() * 5, h);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.userData = { tileW: bays * BAY_M, tileH: floors * FLOOR_M };
    this._facadeRoughCache[style] = t;
    return t;
  }

  /*
   * A box whose UVs are scaled so the shared facade tile lands at real-world
   * size on every face — width-facing sides use the box's width, depth-facing
   * sides its depth, and the roof samples the dark corner of the tile so it
   * reads as a flat deck rather than glazing laid on its back.
   */
  _facadeGeo(w, h, d, tex, uOff = 0, vOff = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const { tileW, tileH } = tex.userData;
    const uv = geo.attributes.uv;
    const su = [d / tileW, d / tileW, 0, 0, w / tileW, w / tileW];
    const sv = h / tileH;
    for (let f = 0; f < 6; f++) {
      const roof = f === 2 || f === 3;
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k,
          roof ? 0.002 : uv.getX(k) * su[f] + uOff,
          roof ? 0.002 : uv.getY(k) * sv + vOff);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  /*
   * Street level. A lobby or a shopfront is not a glowing slab — it is a run
   * of tall glazed bays separated by dark piers, a few of them shut, with a
   * hot sill where the light lands on the pavement. Drawn once and shared;
   * _bandGeo tiles it along a band at its true width.
   */
  _shopTex() {
    if (this._shopT) return this._shopT;
    const W = 512, H = 128, BAY = 64;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#06070b";
    g.fillRect(0, 0, W, H);

    for (let x = 0; x < W; x += BAY) {
      if (Math.random() < 0.24) continue;            // a unit shut for the night
      const warm = Math.random() < 0.72;
      const v = 120 + Math.random() * 110;
      const col = warm ? `${v}, ${v * 0.72}, ${v * 0.46}` : `${v * 0.78}, ${v * 0.88}, ${v}`;
      // the glazed bay, inset from its piers and stopping short of the sill
      g.fillStyle = `rgba(${col}, 0.85)`;
      g.fillRect(x + 7, 14, BAY - 14, H - 40);
      // a hotter interior toward the back of the unit
      g.fillStyle = `rgba(${col}, 0.55)`;
      g.fillRect(x + 13, 30, BAY - 26, H - 70);
      // the spill onto the pavement
      const sp = g.createLinearGradient(0, H - 26, 0, H);
      sp.addColorStop(0, `rgba(${col}, 0.5)`);
      sp.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = sp;
      g.fillRect(x + 4, H - 26, BAY - 8, 26);
    }
    // fascia above and sill below, so the band has edges instead of bleeding
    g.fillStyle = "rgba(3,4,7,0.94)";
    g.fillRect(0, 0, W, 12);
    g.fillRect(0, H - 7, W, 7);

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    this._shopT = t;
    return t;
  }

  /* a band whose texture repeats along its length but spans its height once */
  _bandGeo(w, h, d, tileW) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const su = [d / tileW, d / tileW, 0, 0, w / tileW, w / tileW];
    for (let f = 0; f < 6; f++) {
      const roof = f === 2 || f === 3;
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, roof ? 0.002 : uv.getX(k) * su[f], roof ? 0.002 : uv.getY(k));
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  /*
   * A tower: podium, shaft with a setback, crown light, rooftop beacon.
   *
   * The podium matters more than it sounds. A shaft that meets the pavement
   * with a bare edge has nothing to give the eye at street level, and from a
   * low camera it reads as a slab hovering over the road — which is exactly
   * how the old towers looked. A wider base with a lit lobby band plants it.
   */
  _makeTower(w, h, style, beaconArr, matsArr, opts = {}) {
    const g = new THREE.Group();
    const tex = this._facadeTex(style);
    const d = w * (0.72 + Math.random() * 0.62);   // rectangular footprint
    // Dark glass, not painted concrete: low roughness and real metalness so
    // the facade picks up the moon and the city instead of reading as a flat
    // emissive card. Emissive carries only the lit windows.
    // Dark glass, but the reflective sheen must stay subtle — too much
    // metalness turned the whole skyline into blue cardboard mirrors of the
    // studio HDR. The lit windows (emissive) should dominate; the glass just
    // catches a faint edge of the night.
    /*
     * No two towers in a financial district are lit alike. One is a law
     * firm still working under cool white, the next is a hotel on warm
     * lamps, a third is half dark with one amber floor. Giving every
     * building the same white emissive at the same intensity is the thing
     * that makes a skyline read as one repeated asset — so each takes its
     * own colour temperature and its own brightness here.
     */
    const roll = Math.random();
    const temp = roll < 0.3 ? 0xffeed2         // warm white
      : roll < 0.88 ? 0xe8f0ff                 // cool white office light, most
        : 0xffc98c;                            // a few amber
    /*
     * Curtain-wall glass, reflecting the CITY rather than the studio HDR.
     * That distinction is everything: metalness against the gallery
     * environment turned the old skyline into blue cardboard mirrors,
     * while the same metalness against a dark night env with a lit band on
     * the horizon gives exactly what real glass does — near-black panels
     * that pick up the sky and the district's own glow at grazing angles.
     */
    const mat = new THREE.MeshStandardMaterial({
      color: 0x03050a,
      /* roughness now comes from the map — glass mirrors, frames and
       * spandrels do not — so the multiplier stays at unity and the
       * VARIATION between towers is carried by metalness instead. A single
       * roughness value for a whole curtain wall is what made these read as
       * printed cardboard. */
      roughness: 1.0, roughnessMap: this._facadeRoughTex(style),
      metalness: 0.62 + Math.random() * 0.22,
      envMap: this._env(), envMapIntensity: 0.85 + Math.random() * 0.45,
      emissive: temp, emissiveMap: tex,
      /* the facade tile is decoded from sRGB now that it is correctly
       * tagged, which costs roughly a stop against the old linear read —
       * hence the higher figures here for the same on-screen brightness */
      emissiveIntensity: 1.0 + Math.random() * 1.55,    // some barely occupied
    });
    matsArr.push(mat);

    // ---- podium: the building's feet ----
    const pod = opts.podium ? Math.min(h * 0.3, 5 + Math.random() * 8) : 0;
    if (pod > 0) {
      const pw = w + 1.4 + Math.random() * 2.6, pd = d + 1.4 + Math.random() * 2.6;
      const podium = new THREE.Mesh(
        this._facadeGeo(pw, pod, pd, tex, Math.random()),
        new THREE.MeshStandardMaterial({
          color: 0x0a0c11,
          roughness: 1.0, roughnessMap: this._facadeRoughTex(style),
          metalness: 0.5,
          envMap: this._env(), envMapIntensity: 0.7,
          emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85,
        })
      );
      podium.position.y = pod / 2;
      g.add(podium);

      // the lobby: glazed bays at pavement level, the one thing that makes a
      // night street feel occupied
      const shopTex = this._shopTex();
      const lob = new THREE.Mesh(
        this._bandGeo(pw + 0.08, 3.4, pd + 0.08, 14),
        new THREE.MeshStandardMaterial({
          color: 0x08090d, roughness: 0.42, metalness: 0.16,
          emissive: 0xffffff, emissiveMap: shopTex,
          emissiveIntensity: 0.85 + Math.random() * 0.4,
        })
      );
      lob.position.y = 1.7;
      g.add(lob);

      // a shallow canopy over the entrance catches the lobby light
      if (Math.random() < 0.55) {
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(pw + 1.1, 0.22, pd + 1.1),
          new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.62, metalness: 0.4 })
        );
        canopy.position.y = 3.5;
        g.add(canopy);
      }
    }

    // ---- shaft ----
    const shaftY = pod;
    const shaftH = Math.max(4, h - shaftY);
    const main = new THREE.Mesh(this._facadeGeo(w, shaftH, d, tex, Math.random(), Math.random()), mat);
    main.position.y = shaftY + shaftH / 2;
    g.add(main);

    // a cornice line where the shaft leaves the podium
    if (pod > 0) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.34, d + 0.5),
        new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.6, metalness: 0.45 })
      );
      band.position.y = shaftY + 0.17;
      g.add(band);
    }

    let top = h;
    if (Math.random() < 0.55) {
      const k = 0.55 + Math.random() * 0.2;
      const h2 = shaftH * (0.2 + Math.random() * 0.25);
      const upper = new THREE.Mesh(this._facadeGeo(w * k, h2, d * k, tex, Math.random(), Math.random()), mat);
      upper.position.y = h + h2 / 2;
      g.add(upper);
      top = h + h2;
      if (Math.random() < 0.34) {
        /* Matte and stubby. A 6 cm polished mast a couple of hundred
         * metres out is thinner than a pixel, so it aliases into a bright
         * hairline running up the sky — and half a dozen of those reads as
         * a rendering fault, not as architecture. */
        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.34, h * 0.12, 6),
          new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.94, metalness: 0.1 })
        );
        spire.position.y = top + h * 0.06;
        g.add(spire);
      }
      // crown light band
      if (Math.random() < 0.6) {
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(w * k + 0.15, 0.28, d * k + 0.15),
          new THREE.MeshBasicMaterial({ color: (Math.random() < 0.6 ? new THREE.Color(0xd8b070) : new THREE.Color(0x7fa8d8)).multiplyScalar(1.7), toneMapped: false, transparent: true, opacity: 0.85 })
        );
        crown.position.y = top;
        g.add(crown);
      }
    } else {
      // a flat-topped tower still gets a parapet, or it ends like a cut card
      const par = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x0d1015, roughness: 0.8, metalness: 0.2 })
      );
      par.position.y = h + 0.1;
      g.add(par);
    }
    // rooftop aviation beacon
    if (Math.random() < 0.6) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xff3b30, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
      b.scale.setScalar(1.1);
      b.position.y = top + 0.7;
      g.add(b);
      beaconArr.push(b);
    }
    g.userData.footprint = Math.max(w, d) + 4;
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
      const h = 14 + Math.random() * 50;
      const w = 5 + Math.random() * 8;
      // only the front rank pays for a modelled base; behind it, silhouette
      const t = this._makeTower(w, h, i % 5, this.beacons, this.pavTowerMats, { podium: r < 58 });
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 8);
      t.rotation.y = Math.random() * Math.PI;
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

  /*
   * A soft band: opaque down the middle, feathered on both long edges and
   * faded out at both ends. Any additive plane laid on the road or a wall
   * without this reads as a painted stripe with hard edges — the same
   * mistake as the free-floating "wet road" panel.
   */
  _softBandTex() {
    if (this._bandT) return this._bandT;
    const W = 64, H = 256;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const gx = g.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, "rgba(255,255,255,0)");
    gx.addColorStop(0.5, "rgba(255,255,255,1)");
    gx.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gx;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-in";
    const gy = g.createLinearGradient(0, 0, 0, H);
    gy.addColorStop(0, "rgba(0,0,0,0)");
    gy.addColorStop(0.14, "rgba(0,0,0,1)");
    gy.addColorStop(0.86, "rgba(0,0,0,1)");
    gy.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gy;
    g.fillRect(0, 0, W, H);
    this._bandT = new THREE.CanvasTexture(cv);
    return this._bandT;
  }

  /*
   * A palm frond, drawn once as an alpha card. Nothing places a boulevard
   * on the Gulf or the Riviera faster than a row of uplit palms — they are
   * the single most recognisable thing about the streets these cars
   * actually live on, and they cost one texture and two draws per tree.
   */
  _frondTex() {
    if (this._frondT) return this._frondT;
    const W = 128, H = 256;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, W, H);
    // the rachis
    g.strokeStyle = "#4a5b34";
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 - 6, H * 0.4, W / 2 - 2, 8); g.stroke();
    // leaflets down both sides, shorter toward the tip
    for (let i = 0; i < 26; i++) {
      const f = i / 26;
      const y = H - 14 - f * (H - 30);
      const len = (1 - Math.abs(f - 0.42) * 1.5) * 46 + 8;
      const droop = 12 + f * 16;
      for (const s of [-1, 1]) {
        g.strokeStyle = `rgba(${58 + f * 26},${78 + f * 30},${40 + f * 20},${0.9 - f * 0.25})`;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(W / 2, y);
        g.quadraticCurveTo(W / 2 + s * len * 0.6, y - droop * 0.3, W / 2 + s * len, y + droop);
        g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return (this._frondT = t);
  }

  /* one palm: tapered trunk, a merged crown of fronds, and its uplight */
  _makePalm(i) {
    const g = new THREE.Group();
    const h = 6.2 + Math.random() * 3.4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.24, h, 7, 4),
      new THREE.MeshStandardMaterial({
        color: 0x413729, roughness: 0.86, metalness: 0.08,
        envMap: this._env(), envMapIntensity: 0.4,
        emissive: 0x140f0a, emissiveIntensity: 0.5,
      })
    );
    trunk.position.y = h / 2;
    // palms lean, and a row of identical verticals reads as fence posts
    trunk.rotation.z = (Math.random() - 0.5) * 0.13;
    g.add(trunk);

    const frondGeos = [];
    const dummy = new THREE.Object3D();
    for (let f = 0; f < 11; f++) {
      const geo = new THREE.PlaneGeometry(1.5, 3.1);
      geo.translate(0, 1.45, 0);                    // pivot at the crown
      dummy.position.set(0, h, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.rotateY((f / 11) * Math.PI * 2 + Math.random() * 0.2);
      dummy.rotateX(0.72 + Math.random() * 0.5);    // droop
      dummy.updateMatrix();
      geo.applyMatrix4(dummy.matrix);
      frondGeos.push(geo);
    }
    const crown = new THREE.Mesh(
      mergeGeometries(frondGeos, false),
      new THREE.MeshStandardMaterial({
        map: this._frondTex(), color: 0x93a473, transparent: true, alphaTest: 0.35,
        roughness: 0.78, metalness: 0.06, side: THREE.DoubleSide,
        envMap: this._env(), envMapIntensity: 0.5,
        /* a floor, so a frond never resolves to pure black against the sky */
        emissive: 0x1b2414, emissiveIntensity: 0.55,
      })
    );
    for (const fg of frondGeos) fg.dispose();
    g.add(crown);

    // the uplight at its foot — every palm on a boulevard like this has one
    const up = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._softDot(), color: 0xffc070, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    up.scale.set(2.6, h * 0.85, 1);
    up.position.y = h * 0.42;
    g.add(up);

    g.userData.side = i % 2 === 0 ? -1 : 1;
    g.position.x = g.userData.side * (12.2 + Math.random() * 0.8);
    return g;
  }

  /*
   * A lamp does not cast a cone, it lays a POOL: brightest under the head
   * and fading to nothing with no edge anywhere. A soft radial decal on the
   * carriageway is what reads as that, and it is the single thing missing
   * from a street lit only by point lights.
   */
  _poolTex() {
    if (this._poolT) return this._poolT;
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.72)");
    gr.addColorStop(0.22, "rgba(255,255,255,0.34)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    this._poolT = new THREE.CanvasTexture(cv);
    return this._poolT;
  }

  /*
   * A lamp's halo in humid air. Not the same curve as _softDot: that one
   * falls off fast and reads as a bulb, this one carries a long, low tail
   * so it is still contributing light two lamp-widths out. Photographically
   * that tail IS the atmosphere — it is scattered light coming back off
   * water vapour, and without it a night street has bright lamps standing
   * in dead air.
   */
  _glowTex() {
    if (this._glowT) return this._glowT;
    const S = 256, C = S / 2;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(C, C, 0, C, C, C);
    gr.addColorStop(0.00, "rgba(255,255,255,1.00)");
    gr.addColorStop(0.04, "rgba(255,255,255,0.62)");
    gr.addColorStop(0.10, "rgba(255,255,255,0.30)");
    gr.addColorStop(0.20, "rgba(255,255,255,0.145)");
    gr.addColorStop(0.36, "rgba(255,255,255,0.062)");
    gr.addColorStop(0.58, "rgba(255,255,255,0.022)");
    gr.addColorStop(0.80, "rgba(255,255,255,0.006)");
    gr.addColorStop(1.00, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    this._glowT = new THREE.CanvasTexture(cv);
    return this._glowT;
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
    // Genuinely wet, not faked. A real reflective material with its OWN night
    // environment map (dark sky + a warm sodium horizon) is what gives rain-
    // slicked asphalt its sheen. The roughness MAP makes the wetness uneven —
    // glossy where water pools between the tyre tracks, drier on the crown —
    // which is what stops it reading as a sheet of plastic.
    this.roadTex = this._roadTexture();
    this.nightEnv = this._env();
    const roadRough = this._roadRoughTex();
    /*
     * Asphalt is a DIELECTRIC. The old road ran metalness 0.62 to buy a
     * sheen, and metalness is precisely what destroys albedo — which is why
     * the lane markings had faded to grey suggestions and the aggregate had
     * gone. All the gloss now comes from the planar reflection and its
     * Schlick term (F0 = 0.028, the real figure for wet stone), so the
     * surface can be a proper diffuse road again and the paint can be white.
     */
    this.roadMat = new THREE.MeshStandardMaterial({
      /* WHITE base colour. `color` multiplies `map`, so tinting the tarmac
       * here does not darken the asphalt — it darkens the road MARKINGS
       * too, by the same factor. That is why thermoplastic paint that
       * should be the brightest thing on the carriageway was arriving at
       * four per cent reflectance and reading as a grey suggestion. The
       * darkness belongs in the texture, where the paint can be exempt
       * from it. */
      color: 0xffffff, map: this.roadTex,
      roughness: 1.0, roughnessMap: roadRough, metalness: 0.0,
      envMap: this.nightEnv, envMapIntensity: 0.85,
      normalMap: this._roadNormalTex(), normalScale: new THREE.Vector2(0.16, 0.16),
    });
    /* the mirrored render of the city, projected back onto the carriageway */
    this.reflection = new PlanarReflection({ planeY: 0.002, scale: 0.46, every: 2, far: 230 });
    applyPlanarReflection(this.roadMat, {
      reflection: this.reflection, strength: 0.85, blur: 1.0, ripple: 1.0,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(19, 940), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.002, -220);
    road.receiveShadow = true;
    this.ride.add(road);
    this.roadMesh = road;

    /*
     * ---- the land the city stands on ----
     *
     * The boulevard used to be the ONLY ground in the world: past the kerb
     * there was nothing, so every tower's base ended in mid-air over the fog
     * and the skyline appeared to float above the road. The city block on the
     * right and the far bank across the water are what the buildings stand on.
     */
    const landMat = new THREE.MeshStandardMaterial({
      color: 0x05070c, roughness: 0.8, metalness: 0.24,
      envMap: this.nightEnv, envMapIntensity: 0.2,
    });
    const rightLand = new THREE.Mesh(new THREE.PlaneGeometry(440, 940), landMat);
    rightLand.rotation.x = -Math.PI / 2;
    rightLand.position.set(13.2 + 220, 0.0, -220);
    this.ride.add(rightLand);

    const farLand = new THREE.Mesh(new THREE.PlaneGeometry(320, 940), landMat);
    farLand.rotation.x = -Math.PI / 2;
    farLand.position.set(-76 - 160, 0.0, -220);
    this.ride.add(farLand);

    // Pavements — damp, not flooded, and matte enough to stay dark. Slab
    // joints and grime matter more than the shade: an untextured plane reads
    // as a strip of paper laid beside the road no matter how dark it is.
    const walkMat = new THREE.MeshStandardMaterial({
      // white base, for the same reason as the carriageway: the slabs' own
      // tone lives in the texture, so the joints and the kerb-side grime
      // survive instead of being multiplied into a single black sheet
      color: 0xffffff, map: this._walkTex(), roughness: 0.82, metalness: 0.0,
      envMap: this.nightEnv, envMapIntensity: 0.5,
    });
    for (const [x, w] of [[-11.4, 4], [11.4, 4]]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, 940), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.06, -220);
      this.ride.add(walk);
    }

    // kerbs — the lip between carriageway and pavement, and the one place a
    // street lamp's light actually catches an edge
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.66, metalness: 0.24, envMap: this._env(), envMapIntensity: 0.42 });
    for (const x of [-9.5, 9.5]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 940), kerbMat);
      kerb.position.set(x, 0.05, -220);
      this.ride.add(kerb);
    }

    // the quay wall: the boulevard's left edge drops to the water
    const quayMat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.82, metalness: 0.08, envMap: this._env(), envMapIntensity: 0.3 });
    const quay = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 940), quayMat);
    quay.position.set(-14.3, -0.92, -220);      // top lands just above the kerb
    quay.userData.noReflect = true;
    this.ride.add(quay);

    // and the far bank rises out of it again under the skyline. It sits close
    // enough (~65 m) that its lit windows survive the fog — a skyline you
    // cannot see across the water is just a black cut-out.
    const bank = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 940), quayMat);
    bank.position.set(-77.5, -0.9, -220);
    bank.userData.noReflect = true;
    this.ride.add(bank);

    // guardrail along the waterfront (left side)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.3, metalness: 0.9, envMap: this._env(), envMapIntensity: 1.05 });
    for (const y of [0.42, 0.78]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 940), railMat);
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
    // Near-black and near-mirror: at night a river is only what it reflects.
    // The old grey sheen read as a lit floor stretching to the horizon.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 940),
      new THREE.MeshStandardMaterial({
        color: 0x01030a, roughness: 0.3, metalness: 0.92,
        envMap: this.nightEnv, envMapIntensity: 0.28,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-46, -0.35, -220);
    water.userData.noReflect = true;
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
      s.position.set(-17 - Math.random() * 55, -0.32, -Math.random() * 440);
      s.userData.ph = Math.random() * Math.PI * 2;
      s.userData.noReflect = true;
      this.ride.add(s);
      this.waterStreaks.push(s);
    }

    // ---- far skyline backdrop, standing on the far bank ----
    // Every one of these sits beyond x = -106, i.e. on land, never out on the
    // water where a tower has nothing to stand on.
    this.farCity = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const h = 14 + Math.random() * 52;
      const w = 7 + Math.random() * 12;
      const t = this._makeTower(w, h, i % 5, (this.farBeacons = this.farBeacons || []), this.rideTowerMats);
      t.position.set(-82 - Math.random() * 62, 0, -40 - i * 11 - Math.random() * 8);
      t.rotation.y = Math.random() * Math.PI;
      this.farCity.add(t);
    }
    this.ride.add(this.farCity);

    // a rank of low waterfront blocks along the bank, so the skyline has a
    // foot rather than a row of shafts standing straight out of the river
    for (let i = 0; i < 16; i++) {
      const h = 5 + Math.random() * 9;
      const w = 12 + Math.random() * 16;
      const b = this._makeTower(w, h, i % 5, [], this.rideTowerMats);
      b.position.set(-78 - Math.random() * 9, 0, -30 - i * 27 - Math.random() * 14);
      b.rotation.y = Math.random() * Math.PI;
      this.farCity.add(b);
    }

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

    /*
     * The carriageway used to carry painted-on "reflections": additive
     * streak sprites parked under each lamp and ahead of the car's nose.
     * With a genuine mirrored render of the city projected onto the road,
     * every one of those is now a second, wrongly-shaped copy of a
     * reflection that already exists — and a flat tan wedge lying on the
     * tarmac is exactly what made the old frame read as a video game. They
     * are gone; what replaces them is the reflection itself, plus real
     * light from real lamps falling on the surface.
     */

    // ---- near towers flanking the right side ----
    // These are the ones seen from the driver's seat, so they carry podiums
    // and lit lobbies: the base of a building is all you see at 40 mph.
    this.rideTowers = [];
    this._ridePool(this.rideTowers, 26, (i) => {
      const h = 22 + Math.random() * 55;
      const w = 8 + Math.random() * 11;
      const t = this._makeTower(w, h, i % 5, (this.farBeacons = this.farBeacons || []), this.rideTowerMats, { podium: true });
      t.position.set(22 + Math.random() * 30, 0, 0);
      t.rotation.y = (Math.random() - 0.5) * 0.5;
      t.userData.side = 1;
      return t;
    });

    /*
     * ---- the street wall ----
     *
     * Between the kerb and the towers there was a gap of bare ground, which
     * is the other half of why the skyline looked detached: a real boulevard
     * is walled by low-rise right at the pavement, and the towers stand
     * BEHIND it. These blocks hold the street edge and put lit shopfronts at
     * eye level, where the wet road can catch them.
     */
    this.rideBlocks = [];
    this._ridePool(this.rideBlocks, 24, (i) => {
      const g = new THREE.Group();
      const h = 6 + Math.random() * 12;
      const w = 7 + Math.random() * 9;
      const d = 9 + Math.random() * 8;
      const tex = this._facadeTex(i % 5);
      const body = new THREE.Mesh(
        this._facadeGeo(w, h, d, tex, Math.random()),
        new THREE.MeshStandardMaterial({
          color: 0x080a0f,
          roughness: 1.0, roughnessMap: this._facadeRoughTex(i % 5),
          metalness: 0.58,
          envMap: this._env(), envMapIntensity: 0.8,
          emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0 + Math.random() * 0.7,
        })
      );
      body.position.y = h / 2;
      // the shopfront: glazed units along the pavement, some shut for the night
      const shopTex = this._shopTex();
      const shop = new THREE.Mesh(
        this._bandGeo(w + 0.1, 3.0, d + 0.1, 14),
        new THREE.MeshStandardMaterial({
          color: 0x08090d, roughness: 0.42, metalness: 0.14,
          emissive: 0xffffff, emissiveMap: shopTex,
          emissiveIntensity: 0.8 + Math.random() * 0.45,
        })
      );
      shop.position.y = 1.5;
      // a parapet cap so the roofline is a line, not a raw box edge
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5),
        new THREE.MeshStandardMaterial({ color: 0x101319, roughness: 0.82, metalness: 0.18 })
      );
      cap.position.y = h + 0.08;
      // the shopfronts' light lying on the wet pavement in front of them —
      // anchored to the units above it, so it can never read as a stray band
      const spill = new THREE.Mesh(
        new THREE.PlaneGeometry(d, 5.5),
        new THREE.MeshBasicMaterial({
          map: this._streakTex(), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, color: 0xe8b073, opacity: 0.2,
        })
      );
      spill.rotation.x = -Math.PI / 2;
      spill.rotation.z = -Math.PI / 2;               // brightest at the glass,
                                                     // fading out toward the kerb
      spill.position.set(-w / 2 - 2.4, 0.09, 0);
      g.add(body, shop, cap, spill);
      g.position.set(14.6 + Math.random() * 3.5 + w / 2, 0, 0);
      g.rotation.y = (Math.random() - 0.5) * 0.16;
      g.userData.side = 1;
      return g;
    });

    /*
     * ---- street lamps ----
     *
     * The old lamp was a white box with one glow sprite and a painted decal
     * under it: bright dots floating over unlit tarmac. A real luminaire is
     * four separate things, and leaving any of them out is what makes a
     * night street look drawn rather than lit:
     *
     *   the SOURCE    a small hot emitter, deliberately over 1.0 so bloom
     *                 finds it and it survives the highlight rolloff
     *   the LIGHT     an actual SpotLight throwing down and across the
     *                 carriageway with a wide penumbra, so kerbs, palm
     *                 trunks, bodywork and the wet surface all take it and
     *                 fall off correctly with distance
     *   the HALO      layered additive sprites — a tight core, a wide
     *                 diffuse bloom, and a broad haze disc — which is what
     *                 humid air does to a sodium lamp and the single
     *                 cheapest way to buy atmosphere
     *   the SCATTER   a downward cone of additive haze: the beam made
     *                 visible in the air it is travelling through
     *
     * Only the four nearest lamps carry a real light; further down the
     * boulevard the halo and the pool do all the work and no one can tell.
     */
    this.rideLamps = [];
    this.lampHeads = [];
    this.lampLights = [];
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x0f1216, roughness: 0.34, metalness: 0.88,
      envMap: this._env(), envMapIntensity: 1.1,
    });
    this._ridePool(this.rideLamps, 18, (i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.13, 6.5, 10), poleMat);
      pole.position.y = 3.25;
      pole.castShadow = false;
      // the arm sweeps out over the carriageway rather than jutting square
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.10, 0.10), poleMat);
      arm.position.set(-side * 1.0, 6.24, 0);
      arm.rotation.z = side * 0.10;
      const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.44), poleMat);
      cowl.position.set(-side * 1.8, 6.20, 0);

      // the source: emissive well past white so it clips into the bloom
      const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a6, toneMapped: false });
      headMat.color.multiplyScalar(2.6);   // a lamp head is a SOURCE, not a lit surface
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, 0.36), headMat);
      head.position.set(-side * 1.8, 6.09, 0);
      this.lampHeads.push(headMat);

      // ---- the halo, in three layers ----
      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._softDot(), color: 0xfff0d2, transparent: true, opacity: 0.62,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      core.material.color.multiplyScalar(1.7);
      core.scale.setScalar(1.05);
      core.position.copy(head.position);
      const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex(), color: 0xffc98c, transparent: true, opacity: 0.30,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      bloom.scale.setScalar(3.8);
      bloom.position.copy(head.position);
      const haze = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex(), color: 0xffb877, transparent: true, opacity: 0.085,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      haze.scale.setScalar(10.0);
      haze.position.copy(head.position);

      /*
       * The beam made visible.
       *
       * This was a cone of additive haze, and a cone is exactly the wrong
       * primitive: its silhouette is a hard-edged triangle that stands
       * against whatever is behind it, so what should have read as light in
       * the air read as a sheet of orange perspex leaning on the shopfronts.
       * Geometry cannot fix it either — the edge is where the surface turns
       * away from the eye, and it is always there.
       *
       * A SPRITE has no silhouette. It faces the camera from every angle,
       * so its only edge is its own alpha falling to zero, which is what
       * scattered light actually looks like. Stretched tall and narrow it
       * reads as the shaft under the luminaire, and it costs one quad.
       */
      const beam = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex(), color: 0xffb877, transparent: true, opacity: 0.13,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      beam.scale.set(4.2, 7.0, 1);
      beam.position.set(-side * 2.0, 3.5, 0);

      /* the pool of light actually lying on the surface. Real lights carry
         most of it now, so this is only the soft outer skirt that a
         four-light budget cannot reach. */
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 19),
        new THREE.MeshBasicMaterial({
          map: this._poolTex(), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, color: 0xffc98c, opacity: 0.085,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(-side * 2.9, 0.006, 0);
      pool.renderOrder = 2;

      g.add(pole, arm, cowl, head, core, bloom, haze, beam, pool);
      g.position.set(side * 10.2, 0, 0);
      g.userData.side = side;
      g.userData.head = headMat;    // for the ignition warm-up on recycle
      g.userData.glow = core;
      g.userData.layers = [core, bloom, haze, beam, pool];
      g.userData.baseOpacity = [0.62, 0.30, 0.085, 0.13, 0.085];
      g.userData.warm = 1;
      return g;
    });

    /*
     * Four travelling SpotLights, re-parented each frame to whichever lamps
     * are closest to the car. A pool decal cannot light a kerb, a palm, a
     * railing or the flank of the motor car — only a real light does that,
     * and it is the difference between a street with lamps in it and a
     * street that is lit.
     */
    for (let i = 0; i < 4; i++) {
      const sl = new THREE.SpotLight(0xffd0a4, 0, 28, Math.PI / 3.0, 0.94, 1.7);
      sl.position.set(0, 6.1, 0);
      sl.target.position.set(0, 0, 0);
      this.ride.add(sl, sl.target);
      this.lampLights.push(sl);
    }

    // ---- palms down both pavements ----
    this.ridePalms = [];
    this._ridePool(this.ridePalms, 16, (i) => this._makePalm(i));

    /*
     * GONE: three "roadPool" PointLights that used to hover 5.5 m directly
     * over our own lane so the carriageway was never black.
     *
     * They were the single worst artefact in the frame and had been hiding
     * in plain sight the whole time. A bare point source parked above a car
     * with a clearcoat on it produces a small, savagely bright specular
     * disc, and there were two of them burning through the rear screen and
     * the boot lid on every shot — the "blown-out white blobs" that made
     * the coachwork look like painted plastic no matter what the paint
     * material said. Bloom then spread each one across a third of the car.
     *
     * They are unnecessary now: the street lamps carry real SpotLights that
     * travel with us, which is where a lit road's light is supposed to come
     * from in the first place.
     */

    // ---- oncoming traffic + a slow leader ahead ----
    // At night an oncoming car is a silhouette behind its own glare, never a
    // lit box: near-black paint, no metalness to catch the moon, a greenhouse
    // that steps in from the body, and a faint glazing sheen.
    // Four is enough: spread over 300 m of fogged boulevard they read as a
    // stream, and each vehicle is ~20 draws that a background car should not
    // be spending twice over.
    this.traffic = [];
    for (let i = 0; i < 4; i++) {
      const c = this._makeTrafficCar(i, { style: i, paint: i * 3, lamp: i < 2 });
      c.position.set(ONCOMING_X + (i % 2) * 2.4, 0, -60 - i * 78);
      this.traffic.push(c);
    }

    // and two running our way in the outside lane, seen from behind
    this.sameWay = [];
    for (let i = 0; i < 2; i++) {
      const c = this._makeTrafficCar(i, { style: i + 1, paint: i * 2 + 1, away: true });
      c.rotation.y = Math.PI;                 // tail toward us
      c.position.set(-6.4, 0, -110 - i * 96);
      c.userData.speed = 30 + Math.random() * 8;
      this.sameWay.push(c);
    }

    // The car we spend the most time looking at: the one holding our lane.
    // It gets brake lights that actually come on, because a set of tail
    // lamps that never change is the tell that nothing ahead is real.
    this.leader = this._makeTrafficCar(0, { style: 0, paint: 1, away: true, lamp: true });
    this.leader.rotation.y = Math.PI;
    this.leader.position.set(LANE_X, 0, -130);
    this._leadBrake = 0;

    // ---- standing water: shallow pools that catch the city ----
    // Kept to the lane edges and the crown of the camber, where water
    // actually stands, so they read as road condition rather than decals.
    this.puddles = [];
    this._ridePool(this.puddles, 14, (i) => {
      const w = 1.6 + Math.random() * 3.4;
      const p = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        new THREE.MeshStandardMaterial({
          /* a puddle is a BLURRY mirror — standing water on rough tarmac
             scatters what it reflects, and a true mirror here reads as a
             hole cut in the road */
          color: 0x080d14, roughness: 0.13 + Math.random() * 0.1, metalness: 0.9,
          envMap: this._env(), envMapIntensity: 1.15,
          transparent: true, opacity: 0.62,
        })
      );
      p.rotation.x = -Math.PI / 2;
      p.scale.set(w, 1, w * (1.6 + Math.random()));
      p.position.set((Math.random() - 0.5) * 15, 0.008, 0);
      p.userData.side = 1;
      p.renderOrder = 1;
      return p;
    });

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
    /*
     * Airborne speed streaks. SIZE matters far more than it looks: point
     * size attenuates with distance, so at 0.15 world units a particle
     * that recycled a few metres in front of the chase camera drew as a
     * thirty-pixel soft disc — and since they recycle to z = +12, one was
     * usually sitting somewhere over the motor car. That was the pale
     * blister that kept appearing on the roof through every lighting
     * change. Small, dim, and recycled well clear of the lens.
     */
    this.streaks = new THREE.Points(sgeo, new THREE.PointsMaterial({
      color: 0xbfd2f0, size: 0.045, transparent: true, opacity: 0.32, depthWrite: false,
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

    /*
     * What the mirror must not contain. Anything lying flat and facing UP is
     * self-excluding — from below the plane it presents a back face and is
     * culled — so only the road itself and the two masses that live BELOW
     * the water line need naming here.
     */
    this.reflection.exclude(road);
    this.ride.traverse((o) => { if (o.userData.noReflect) this.reflection.exclude(o); });

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
    for (const t of this.rideTowers) { t.position.z = ri; ri += 21 + Math.random() * 11; }
    let bi = -470;
    for (const b of this.rideBlocks) { b.position.z = bi; bi += 13 + Math.random() * 7; }
    let ll = -470, rl = -470 - 21;
    for (const g of this.rideLamps) {
      if (g.userData.side < 0) { g.position.z = ll; ll += 42; }
      else { g.position.z = rl; rl += 42; }
    }
    let pp = -470;
    for (const p of this.railPosts) { p.position.z = pp; pp += 16; }
    let pl = -470, pr = -470 - 17;
    for (const t of this.ridePalms) {
      if (t.userData.side < 0) { t.position.z = pl; pl += 34; }
      else { t.position.z = pr; pr += 34; }
    }
  }

  /*
   * A premium boulevard: smooth, dark, evenly laid asphalt with FRESH
   * markings. The old surface was speckled with white noise and its lines
   * were half-faded, which reads as a municipal back street — the whole
   * point of this district is that everything in it is newly maintained.
   */
  /*
   * The carriageway's albedo.
   *
   * Two things were wrong with the old one and both are structural. It was
   * authored in linear space (a CanvasTexture defaults to no colour space),
   * so every value came out roughly its own square — dark asphalt turned to
   * pitch and the paint lost two thirds of its brightness. And the paint
   * itself was drawn at 0.8 alpha over black, so even correctly decoded it
   * could never be the hard, chalky white that road marking actually is.
   *
   * Thermoplastic road paint is one of the BRIGHTEST things in a night
   * street — it is deliberately retroreflective — and getting it right is a
   * surprising amount of the reference frame's quality, because it is the
   * one surface that reads as properly lit rather than merely glowing.
   */
  _roadTexture() {
    const W = 512, H = 2048;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0c0f16";
    g.fillRect(0, 0, W, H);

    // aggregate: two grades, because asphalt is stone in bitumen and a
    // single noise octave reads as television snow
    for (let i = 0; i < 26000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5
        ? `rgba(214,220,236,${0.02 + Math.random() * 0.06})`
        : `rgba(6,8,14,${0.05 + Math.random() * 0.14})`;
      const s = v < 0.5 ? 1 : 1 + Math.random() * 2;
      g.fillRect(Math.random() * W, Math.random() * H, s, s);
    }
    // broad tonal drift — patching, wear, and where the water lies
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 24 + Math.random() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.6;
      gr.addColorStop(0, dark ? "rgba(4,6,11,0.30)" : "rgba(150,160,182,0.055)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the seams where the paving machine laid its passes
    g.fillStyle = "rgba(0,0,0,0.30)";
    for (const x of [0.33, 0.67]) g.fillRect(x * W, 0, 3, H);
    g.fillStyle = "rgba(190,198,214,0.05)";
    for (const x of [0.33, 0.67]) g.fillRect(x * W + 3, 0, 1.5, H);

    /* ---- the paint ----
     * Drawn as near-white with a softly feathered edge and a slightly
     * grubbier core, so it is bright without being a vector rectangle. */
    const line = (x, w, warm) => {
      const grd = g.createLinearGradient(x - 2, 0, x + w + 2, 0);
      const c = warm ? "188,180,162" : "184,188,188";
      grd.addColorStop(0, `rgba(${c},0)`);
      grd.addColorStop(0.22, `rgba(${c},0.70)`);
      grd.addColorStop(0.78, `rgba(${c},0.70)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      return grd;
    };
    const stripe = (x, w, y, h, warm) => {
      line(x, w, warm);
      g.fillRect(x - 2, y, w + 4, h);
      // scuffing, so a 300 m run of paint is not one unbroken decal
      for (let i = 0; i < h / 18; i++) {
        if (Math.random() < 0.6) {
          g.fillStyle = `rgba(16,19,26,${0.16 + Math.random() * 0.38})`;
          g.fillRect(x - 2, y + Math.random() * h, w + 4, 2 + Math.random() * 9);
        }
      }
    };

    // edge lines
    stripe(24, 10, 0, H, false);
    stripe(W - 34, 10, 0, H, false);
    // centre double, in the warm white these districts actually use
    stripe(246, 6, 0, H, true);
    stripe(262, 6, 0, H, true);
    // lane dashes: long, clean, generously spaced
    for (let y = 0; y < H; y += 256) stripe(128, 11, y, 128, false);
    for (let y = 0; y < H; y += 256) stripe(W - 145, 11, y + 128, 128, false);

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;   // it is an albedo, not data
    t.repeat.set(1, 87);       // one tile ≈ 10.8 m along a 940 m carriageway
    t.anisotropy = 16;
    return t;
  }

  /* ------------------------------------------------ instancing helpers */
  /*
   * A cable-stay carries a hundred-odd identical stays and a bridge deck as
   * many railing posts. One Mesh each is a hundred draw calls for geometry
   * the GPU could issue in one, so both are built as InstancedMesh, placed
   * through a scratch Object3D.
   */
  _instanced(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    return m;
  }

  /* lay a unit cylinder (1 long, along +Y, radius 1) between two points */
  _strut(dummy, a, b, r) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    dummy.position.copy(a).addScaledVector(dir, 0.5);
    dummy.quaternion.setFromUnitVectors(UNIT_Y, dir.normalize());
    dummy.scale.set(r, len, r);
    dummy.updateMatrix();
    return dummy.matrix;
  }

  /*
   * Glazed tunnel tiling. A road tunnel is lined edge to edge in small
   * ceramic tiles precisely so it can be hosed down, and it is the grid of
   * grout lines — not the shape of the bore — that the eye reads at speed.
   * One 4 m patch, tiled everywhere; grime is handled by tinting the
   * material rather than baking a gradient that would repeat.
   */
  _tunnelTileTex() {
    if (this._tileT) return this._tileT;
    const S = 512, N = 20, C = S / N;      // 20 tiles across four metres
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "#15171b";               // grout
    g.fillRect(0, 0, S, S);

    for (let ry = 0; ry < N; ry++) {
      for (let rx = 0; rx < N; rx++) {
        const v = 190 + Math.random() * 52;
        g.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
        g.fillRect(rx * C + 1, ry * C + 1, C - 1.6, C - 1.6);
        // a glaze highlight along the top edge of each tile
        g.fillStyle = "rgba(255,255,255,0.2)";
        g.fillRect(rx * C + 1, ry * C + 1, C - 1.6, 1.4);
        // the odd cracked or replaced tile
        if (Math.random() < 0.04) {
          const d = 96 + Math.random() * 60;
          g.fillStyle = `rgba(${d},${d},${d},0.7)`;
          g.fillRect(rx * C + 1, ry * C + 1, C - 1.6, C - 1.6);
        }
      }
    }
    // exhaust grime running down the wall, and road spray flicked up it
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * S, w = 4 + Math.random() * 26;
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, `rgba(18,20,24,${0.1 + Math.random() * 0.22})`);
      gr.addColorStop(1, "rgba(18,20,24,0)");
      g.fillStyle = gr;
      g.fillRect(x, 0, w, S);
    }
    for (let i = 0; i < 320; i++) {
      g.fillStyle = `rgba(14,15,18,${0.05 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 5, 1 + Math.random() * 3);
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    this._tileT = t;
    return t;
  }

  /*
   * The tunnel. Two set pieces share one long cycle so the drive has a
   * shape — roughly nineteen seconds of open boulevard, a tunnel, more
   * boulevard, then the bridge. Inside, the world closes down to sodium
   * light and the engine note hardens; both are what makes emerging from
   * it onto the skyline land.
   *
   * The bore is an arched, tiled section rather than a rectangular box: a
   * box reads as a corridor, and it is the springing line and the vault
   * that say "tunnel" before a single lamp is switched on. Everything that
   * repeats down its length — ceiling luminaires, handrail posts, wall
   * signage, lane studs — is instanced, so the detail is nearly free.
   */
  _buildTunnel() {
    const g = new THREE.Group();
    const L = TUNNEL_LEN, half = L / 2;
    const R = 11.4;              // half-width of the bore
    const SPRING = 4.4;          // height the arch springs from
    const VAULT = 0.42;          // arch flattening — crown lands at ~9.2 m
    const CROWN = SPRING + R * VAULT;
    const dummy = new THREE.Object3D();

    const tileWall = this._tunnelTileTex();
    const tileVault = tileWall.clone();
    tileVault.needsUpdate = true;
    tileWall.repeat.set(L / 4, SPRING / 4);
    tileVault.repeat.set((Math.PI * R) / 4, L / 4);

    // ---- the bore ----
    // Tiles are glossy and wiped by every passing headlamp, so roughness
    // stays low; the vault carries decades of exhaust, so it is tinted far
    // darker than the walls the cleaning trains actually reach.
    // Tiles read WARM here, not clinical: everything they are lit by is
    // sodium. A cool grey wall is what made the bore look like a concrete
    // culvert rather than a tiled tunnel.
    const wallMat = new THREE.MeshStandardMaterial({
      map: tileWall, color: 0x4e4840, roughness: 0.22, metalness: 0.08,
    });
    const vaultMat = new THREE.MeshStandardMaterial({
      map: tileVault, color: 0x24262b, roughness: 0.55, metalness: 0.04, side: THREE.BackSide,
    });

    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, L, 40, 1, true, -Math.PI / 2, Math.PI),
      vaultMat
    );
    vault.rotation.x = -Math.PI / 2;
    vault.scale.y = VAULT;
    vault.position.y = SPRING;
    g.add(vault);

    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, SPRING), wallMat);
      wall.rotation.y = sx * -Math.PI / 2;
      wall.position.set(sx * R, SPRING / 2, 0);
      g.add(wall);
    }

    // ---- maintenance walkway, kerb and handrail down each side ----
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.9, metalness: 0.05 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.45, metalness: 0.75 });
    for (const sx of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, L), kerbMat);
      walk.position.set(sx * 10.6, 0.22, 0);
      g.add(walk);
      // a painted edge so the kerb catches the headlamps
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.2, L),
        new THREE.MeshStandardMaterial({ color: 0xb8b2a0, roughness: 0.7, metalness: 0.05 })
      );
      edge.position.set(sx * 9.86, 0.34, 0);
      g.add(edge);
      // two continuous rails; the posts between them are instanced
      for (const y of [1.02, 0.72]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 6), steelMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(sx * 10.1, y, 0);
        g.add(rail);
      }
      // cable trays — the tunnel's nervous system, bolted to the tiles
      for (const y of [2.7, 3.05]) {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, L), steelMat);
        tray.position.set(sx * (R - 0.2), y, 0);
        g.add(tray);
      }
    }

    const postN = Math.floor(L / 3) * 2;
    const posts = this._instanced(new THREE.CylinderGeometry(1, 1, 1, 6), steelMat, postN);
    let pi = 0;
    for (let z = -half + 1.5; z < half && pi < postN; z += 3) {
      for (const sx of [-1, 1]) {
        if (pi >= postN) break;
        dummy.position.set(sx * 10.1, 0.73, z);
        dummy.quaternion.identity();
        dummy.scale.set(0.03, 0.62, 0.03);
        dummy.updateMatrix();
        posts.setMatrixAt(pi++, dummy.matrix);
      }
    }
    posts.count = pi;
    g.add(posts);

    // ---- lighting: two continuous runs of luminaires in the haunches ----
    // Real tunnels light from the sides of the vault, not a strip down the
    // middle: the throw lands on the carriageway instead of the crown.
    this.tunnelStrips = [];
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a2, toneMapped: false });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.5, metalness: 0.6 });
    const SEG = 6.4, GAP = 3.6;
    const nSeg = Math.floor(L / (SEG + GAP));
    const housings = this._instanced(new THREE.BoxGeometry(0.62, 0.26, SEG), housingMat, nSeg * 2);
    const lenses = this._instanced(new THREE.BoxGeometry(0.42, 0.05, SEG - 0.5), lampMat, nSeg * 2);
    let li = 0;
    this._tunnelLampZ = [];
    for (let k = 0; k < nSeg; k++) {
      const z = -half + 4 + k * (SEG + GAP);
      this._tunnelLampZ.push(z);
      for (const sx of [-1, 1]) {
        dummy.quaternion.identity();
        dummy.scale.setScalar(1);
        dummy.position.set(sx * 6.4, CROWN - 1.5, z);
        dummy.updateMatrix();
        housings.setMatrixAt(li, dummy.matrix);
        dummy.position.y -= 0.15;
        dummy.updateMatrix();
        lenses.setMatrixAt(li, dummy.matrix);
        li++;
      }
    }
    housings.count = lenses.count = li;
    g.add(housings, lenses);

    // the glow the lenses throw down the tiled haunch, and their reflection
    // running the length of the wet carriageway
    const band = this._softBandTex();
    for (const sx of [-1, 1]) {
      const wash = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, L),
        new THREE.MeshBasicMaterial({
          map: band, color: 0xffa851, transparent: true, opacity: 0.16, depthWrite: false,
          blending: THREE.AdditiveBlending, fog: false,
        })
      );
      wash.rotation.y = sx * -Math.PI / 2;
      wash.position.set(sx * (R - 0.3), CROWN - 2.4, 0);
      g.add(wash);

      const smear = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, L),
        new THREE.MeshBasicMaterial({
          map: band, color: 0xc98544, transparent: true, opacity: 0.2, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      smear.rotation.x = -Math.PI / 2;
      smear.position.set(sx * 6.4, 0.02, 0);
      g.add(smear);
      this.tunnelStrips.push(wash, smear);
    }

    /*
     * Four pooled point lights do the work of thirty. They are re-seated
     * every frame onto the luminaires nearest the car, so the light that
     * actually falls on the paintwork sweeps past exactly as it should —
     * a light per lamp would cost the same and light nothing we can see.
     */
    this.tunnelLamps = [];
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0xffb457, 0, 22, 2);
      pl.position.set(0, CROWN - 1.8, 0);
      g.add(pl);
      this.tunnelLamps.push(pl);
    }

    // ---- jet fans slung under the crown ----
    this.tunnelFans = [];
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x2e333b, roughness: 0.5, metalness: 0.7 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x545b66, roughness: 0.42, metalness: 0.8, side: THREE.DoubleSide });
    for (let z = -half + 22; z < half - 12; z += 40) {
      for (const sx of [-1, 1]) {
        // a closed duct, not a hoop: seen against a bright tunnel mouth an
        // open cylinder reads as a black spider hanging from the crown
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.4, 16), fanMat);
        body.rotation.x = Math.PI / 2;
        body.position.set(sx * 3.6, CROWN - 1.1, z);
        g.add(body);
        for (const dz of [-1.76, 1.76]) {                     // inlet/outlet rings
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.07, 6, 16), fanMat);
          ring.position.set(sx * 3.6, CROWN - 1.1, z + dz);
          g.add(ring);
        }
        for (const dz of [-1.5, 1.5]) {                       // mounting straps
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), fanMat);
          strap.position.set(sx * 3.6, CROWN - 0.45, z + dz);
          g.add(strap);
        }
        const rotor = new THREE.Group();
        for (let b = 0; b < 5; b++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.02, 0.3), bladeMat);
          blade.position.set(Math.cos((b / 5) * Math.PI * 2) * 0.4, Math.sin((b / 5) * Math.PI * 2) * 0.4, 0);
          blade.rotation.z = (b / 5) * Math.PI * 2;
          blade.rotation.y = 0.5;
          rotor.add(blade);
        }
        rotor.position.set(sx * 3.6, CROWN - 1.1, z + 1.79);   // in the outlet ring
        g.add(rotor);
        this.tunnelFans.push(rotor);
      }
    }

    // ---- signage: the tunnel talks to you the whole way through ----
    const signBack = new THREE.MeshStandardMaterial({ color: 0x0d1014, roughness: 0.8, metalness: 0.1 });
    const exitMat = new THREE.MeshStandardMaterial({
      color: 0x0a1a10, emissive: 0x39d97a, emissiveIntensity: 1.1, roughness: 0.5,
    });
    const sosMat = new THREE.MeshStandardMaterial({
      color: 0x1a1206, emissive: 0xff8a1e, emissiveIntensity: 1.0, roughness: 0.5,
    });
    for (let z = -half + 14, k = 0; z < half - 8; z += 26, k++) {
      const sx = k % 2 === 0 ? -1 : 1;
      // emergency exit sign, green, low on the wall where smoke would not hide it
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.5), signBack);
      back.position.set(sx * (R - 0.12), 2.0, z);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 1.34), exitMat);
      face.position.set(sx * (R - 0.2), 2.0, z);
      g.add(back, face);
      // an SOS niche opposite, orange, with its recess cut into the tiling
      const niche = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.9, 1.5), signBack);
      niche.position.set(-sx * (R - 0.25), 1.4, z + 13);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.1), sosMat);
      panel.position.set(-sx * (R - 0.52), 1.85, z + 13);
      g.add(niche, panel);
    }

    // distance-to-exit markers, one every ten metres, low on both walls
    const markMat = new THREE.MeshStandardMaterial({ color: 0x141820, emissive: 0xbcd4f0, emissiveIntensity: 0.5, roughness: 0.6 });
    const marks = this._instanced(new THREE.BoxGeometry(0.05, 0.18, 0.5), markMat, Math.ceil(L / 10) * 2);
    let mi = 0;
    for (let z = -half + 5; z < half; z += 10) {
      for (const sx of [-1, 1]) {
        if (mi >= marks.count) break;
        dummy.position.set(sx * (R - 0.06), 1.15, z);
        dummy.quaternion.identity(); dummy.scale.setScalar(1);
        dummy.updateMatrix();
        marks.setMatrixAt(mi++, dummy.matrix);
      }
    }
    marks.count = mi;
    g.add(marks);

    // lane studs down the centre line, catching the headlamps
    const studMat = new THREE.MeshStandardMaterial({ color: 0x20242c, emissive: 0xe8d8a8, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.4 });
    const studs = this._instanced(new THREE.BoxGeometry(0.16, 0.03, 0.34), studMat, Math.ceil(L / 4));
    let si = 0;
    for (let z = -half; z < half && si < studs.count; z += 4) {
      dummy.position.set(0.2, 0.03, z);
      dummy.quaternion.identity(); dummy.scale.setScalar(1);
      dummy.updateMatrix();
      studs.setMatrixAt(si++, dummy.matrix);
    }
    studs.count = si;
    g.add(studs);

    // ---- portals: a concrete headwall with the bore cut clean out of it ----
    const concrete = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.95, metalness: 0.0 });
    const shape = new THREE.Shape();
    shape.moveTo(-19, -1); shape.lineTo(19, -1); shape.lineTo(19, 15); shape.lineTo(-19, 15); shape.closePath();
    const bore = new THREE.Path();
    bore.moveTo(-R, 0);
    bore.lineTo(-R, SPRING);
    bore.absellipse(0, SPRING, R, R * VAULT, Math.PI, 0, true);
    bore.lineTo(R, 0);
    bore.closePath();
    shape.holes.push(bore);
    const headGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });

    this.tunnelMouths = [];
    for (const end of [-1, 1]) {
      const head = new THREE.Mesh(headGeo, concrete);
      head.position.set(0, 0, end * half + (end > 0 ? 0 : -1.4));
      g.add(head);

      // the lit name band over the portal
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(13, 1.1, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x0c0f14, emissive: 0xd8c48a, emissiveIntensity: 0.85, roughness: 0.6 })
      );
      band.position.set(0, CROWN + 2.2, end * (half + 0.2));
      g.add(band);

      /*
       * The light lock. Daylight — or in our case a whole lit city — does
       * not stop dead at a tunnel mouth; it floods a few metres in and
       * dies. This additive card at each portal is what makes entering and
       * leaving read as a transition rather than a cut.
       */
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2 * R, CROWN),
        new THREE.MeshBasicMaterial({
          map: this._softDot(), color: 0xc8a878, transparent: true, opacity: 0.3,
          depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        })
      );
      glow.position.set(0, CROWN * 0.5, end * (half - 1.5));
      g.add(glow);
      this.tunnelMouths.push(glow);

      // expansion joint across the carriageway at the threshold
      const joint = new THREE.Mesh(
        new THREE.BoxGeometry(19.6, 0.04, 0.42),
        new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.4, metalness: 0.85 })
      );
      joint.position.set(0, 0.03, end * (half - 0.6));
      g.add(joint);
    }

    g.position.z = -TUNNEL_LEN - 340;
    this.tunnel = g;
    this.ride.add(g);
  }

  /*
   * The bridge: a twin-pylon cable stay you drive the length of.
   *
   * The old one was a pair of masts with sixteen wires strung to a girder.
   * What was missing is everything a real crossing has between the two —
   * a deck to stand on, parapets, anchorages the stays actually land in,
   * lighting, and a second pylon so the span has a middle. The stays fan
   * from a central mast to BOTH deck edges (the Normandie arrangement),
   * which is why the pylons are A-frames: the legs straddle the
   * carriageway and meet on the centreline before the mast carries on up.
   *
   * All 112 stays, every railing post and every anchorage are instanced,
   * so the whole structure costs about a dozen draw calls.
   */
  _buildBridge() {
    const g = new THREE.Group();
    const dummy = new THREE.Object3D();

    const DECK = 210;                     // length of deck we build
    const halfD = DECK / 2;
    const PZ = 44;                        // pylons fore and aft of centre
    const LEG_X = 13.9, LEG_TOP = 30;     // A-frame legs, base to apex
    const MAST_TOP = 62;
    const DECK_Y = -0.55;                 // top of the box girder, under the road
    const ANCHOR_X = 12.6, ANCHOR_Y = 0.9;

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x1e2229, roughness: 0.74, metalness: 0.1,
      envMap: this._env(), envMapIntensity: 0.6,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x1b1f27, roughness: 0.34, metalness: 0.86,
      envMap: this._env(), envMapIntensity: 1.0,
    });
    // Stays are sheathed in white or pale grey HDPE precisely so they are
    // visible; a dark cable disappears at night and the bridge loses its
    // whole geometry. These have to catch the headlamps.
    const stayMat = new THREE.MeshStandardMaterial({
      color: 0x9aa2ae, roughness: 0.34, metalness: 0.45,
      envMap: this._env(), envMapIntensity: 0.85,
    });

    // ---- deck: box girder, fascia, parapets, railing ----
    const girder = new THREE.Mesh(new THREE.BoxGeometry(24, 1.7, DECK), concrete);
    girder.position.set(0, DECK_Y - 0.85, 0);
    g.add(girder);
    for (const sx of [-1, 1]) {
      // the fascia beam — the edge you actually see from the carriageway
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, DECK), concrete);
      fascia.position.set(sx * 13.4, DECK_Y - 0.3, 0);
      g.add(fascia);
      // solid parapet, then a steel rail above it
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, DECK), concrete);
      parapet.position.set(sx * 13.3, 0.52, 0);
      g.add(parapet);
      for (const y of [1.72, 1.34]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, DECK, 6), steel);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(sx * 13.3, y, 0);
        g.add(rail);
      }
      // the crash barrier between carriageway and footway
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, DECK), steel);
      barrier.position.set(sx * 11.2, 0.4, 0);
      g.add(barrier);
    }

    const railN = Math.floor(DECK / 2.6) * 2;
    const posts = this._instanced(new THREE.CylinderGeometry(1, 1, 1, 6), steel, railN);
    let pi = 0;
    for (let z = -halfD + 1.3; z < halfD && pi < railN; z += 2.6) {
      for (const sx of [-1, 1]) {
        if (pi >= railN) break;
        dummy.position.set(sx * 13.3, 1.42, z);
        dummy.quaternion.identity();
        dummy.scale.set(0.035, 1.05, 0.035);
        dummy.updateMatrix();
        posts.setMatrixAt(pi++, dummy.matrix);
      }
    }
    posts.count = pi;
    g.add(posts);

    // transverse ribs under the deck — only glimpsed, but they are what
    // stops the underside reading as an extruded slab on the approach
    const ribN = Math.floor(DECK / 5);
    const ribs = this._instanced(new THREE.BoxGeometry(26.5, 0.5, 0.5), concrete, ribN);
    for (let i = 0; i < ribN; i++) {
      dummy.position.set(0, DECK_Y - 1.8, -halfD + 2.5 + i * 5);
      dummy.quaternion.identity(); dummy.scale.setScalar(1);
      dummy.updateMatrix();
      ribs.setMatrixAt(i, dummy.matrix);
    }
    g.add(ribs);

    // ---- the two pylons ----
    this.bridgeBeacons = [];
    this.bridgeUplights = [];
    const stayPts = [];

    for (const pz of [-PZ, PZ]) {
      for (const sx of [-1, 1]) {
        // splayed leg, base to apex on the centreline
        const base = new THREE.Vector3(sx * LEG_X, -2, pz);
        const apex = new THREE.Vector3(0, LEG_TOP, pz);
        const dir = new THREE.Vector3().subVectors(apex, base);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(2.1, dir.length(), 2.6), concrete);
        leg.position.copy(base).addScaledVector(dir, 0.5);
        leg.quaternion.setFromUnitVectors(UNIT_Y, dir.clone().normalize());
        g.add(leg);

        // the uplight at each leg's foot, washing the concrete
        const up = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._softDot(), color: 0xc9a76a, transparent: true, opacity: 0.4,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        up.scale.set(5, 15, 1);
        up.position.set(sx * (LEG_X - 1.2), 7, pz);
        g.add(up);
        this.bridgeUplights.push(up);
      }

      // the portal beam tying the legs above the carriageway
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * LEG_X - 4.5, 1.8, 2.2), concrete);
      beam.position.set(0, 14.5, pz);
      g.add(beam);

      // the mast above the apex
      const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, MAST_TOP - LEG_TOP, 2.6), concrete);
      mast.position.set(0, (LEG_TOP + MAST_TOP) / 2, pz);
      g.add(mast);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.5, 3.4, 8), concrete);
      cap.position.set(0, MAST_TOP + 1.7, pz);
      g.add(cap);

      // aviation warning light on the mast head
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._softDot(), color: 0xff3b30, transparent: true, opacity: 0.9,
        fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      beacon.scale.setScalar(3.2);
      beacon.position.set(0, MAST_TOP + 3.6, pz);
      g.add(beacon);
      this.bridgeBeacons.push(beacon);

      /*
       * The stay fan. Each cable leaves an anchor high on the mast and
       * lands on a deck anchorage out along the span — closer spacing at
       * the mast than at the deck, which is what gives a cable stay its
       * harp shape. Fore and aft, to both edges: 14 x 2 x 2 per pylon.
       */
      for (let i = 0; i < 14; i++) {
        const mastY = MAST_TOP - 2 - i * 1.55;             // tight at the top
        const reach = 9 + i * 3.8;                         // spread at the deck
        for (const dir of [-1, 1]) {
          for (const sx of [-1, 1]) {
            stayPts.push([
              new THREE.Vector3(0, mastY, pz),
              new THREE.Vector3(sx * ANCHOR_X, ANCHOR_Y, pz + dir * reach),
            ]);
          }
        }
      }
    }

    const stays = this._instanced(new THREE.CylinderGeometry(1, 1, 1, 5), stayMat, stayPts.length);
    const anchors = this._instanced(
      new THREE.BoxGeometry(0.75, 1.15, 0.75),
      steel,
      stayPts.length
    );
    stayPts.forEach(([a, b], i) => {
      stays.setMatrixAt(i, this._strut(dummy, a, b, 0.075));
      dummy.position.copy(b);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      anchors.setMatrixAt(i, dummy.matrix);
    });
    g.add(stays, anchors);

    // ---- deck lighting: columns down both footways ----
    const poleN = Math.floor(DECK / 26) * 2;
    const poles = this._instanced(new THREE.CylinderGeometry(1, 1, 1, 6), steel, poleN);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffd49a, toneMapped: false });
    const heads = this._instanced(new THREE.BoxGeometry(0.7, 0.16, 0.4), headMat, poleN);
    let qi = 0;
    for (let z = -halfD + 13; z < halfD && qi < poleN; z += 26) {
      for (const sx of [-1, 1]) {
        if (qi >= poleN) break;
        dummy.quaternion.identity();
        dummy.position.set(sx * 12.4, 3.4, z);
        dummy.scale.set(0.09, 6.8, 0.09);
        dummy.updateMatrix();
        poles.setMatrixAt(qi, dummy.matrix);
        dummy.position.set(sx * 11.6, 6.7, z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        heads.setMatrixAt(qi, dummy.matrix);
        qi++;
      }
    }
    poles.count = heads.count = qi;
    g.add(poles, heads);

    // their reflection running the length of the wet deck
    for (const sx of [-1, 1]) {
      const smear = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, DECK),
        new THREE.MeshBasicMaterial({
          color: 0xd8a76a, transparent: true, opacity: 0.13, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      smear.rotation.x = -Math.PI / 2;
      smear.position.set(sx * 10.6, 0.02, 0);
      g.add(smear);
    }

    // ---- navigation lights on the piers, for whatever passes beneath ----
    this.bridgeNav = [];
    for (const pz of [-PZ, PZ]) {
      for (const [sx, hex] of [[-1, 0xff2a20], [1, 0x28d64a]]) {
        const nav = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._softDot(), color: hex, transparent: true, opacity: 0.7,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        nav.scale.setScalar(1.6);
        nav.position.set(sx * 13.8, DECK_Y - 1.4, pz);
        g.add(nav);
        this.bridgeNav.push(nav);
      }
    }

    // expansion joints where the deck meets the approach roads
    for (const end of [-1, 1]) {
      const joint = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.05, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.38, metalness: 0.88 })
      );
      joint.position.set(0, 0.04, end * halfD);
      g.add(joint);
    }

    this.bridgeHalf = halfD;
    g.position.z = -TUNNEL_LEN - 340 - EVENT_GAP / 2;
    this.bridge = g;
    this.ride.add(g);
  }

  /* ------------------------------------------------- REAL TRAFFIC BODIES */
  /*
   * An extruded profile gets a car's proportions right and its surfaces
   * wrong. Real bodywork is continuous curvature — crown across the roof,
   * tumblehome down the flanks, a bonnet that falls in two directions at
   * once — and no amount of tuning a flat-sided extrusion produces that. It
   * reads as a box because it IS a box with a car-shaped outline.
   *
   * So the traffic stops pretending and borrows the lineup's own geometry.
   * The four GLBs are already resident, and each is collapsed ONCE into a
   * merged body + merged glass + one geometry per wheel — about six draw
   * calls, against the eight hundred the hero car costs. Background traffic
   * gets the hero car's surfaces at a background car's price.
   */
  setBodyDonors(cars) {
    const keys = Object.keys(cars || {}).filter((k) => cars[k] && cars[k].loaded);
    if (!keys.length || keys.length === this._donorCount) return;
    this._donorCount = keys.length;

    /*
     * These are hero assets: the Phantom alone merges to 2.3 million
     * vertices, which is a fine thing to spend on the car the customer is
     * configuring and an absurd one to spend on the third vehicle in the
     * oncoming lane. Take the lightest bodies that still read as real cars
     * and leave the rest to the showroom.
     */
    // this runs again as each car finishes loading, so the previous merge
    // has to go back to the GPU before the next one is built
    for (const d of this._donors || []) {
      d.body.dispose();
      d.glass?.dispose();
      for (const h of d.hubs) h.geo.dispose();
    }

    const built = [];
    for (const k of keys) {
      const d = this._mergeDonor(cars[k]);
      if (d) built.push(d);
    }
    built.sort((a, b) => a.body.attributes.position.count - b.body.attributes.position.count);
    const keep = [], BUDGET = 520000;
    for (const d of built) {
      if (keep.length < 3 && (keep.length === 0 || d.body.attributes.position.count <= BUDGET)) keep.push(d);
      else { d.body.dispose(); d.glass?.dispose(); for (const h of d.hubs) h.geo.dispose(); }
    }
    this._donors = keep;
    if (this._donors.length) this._rebuildTraffic();
  }

  /*
   * Flatten one loaded car into geometry we can afford. Everything is taken
   * into the car group's own space — staged, centred, sitting on y = 0 with
   * its nose along +x — then turned so the nose faces +z, which is the
   * direction every vehicle in here is built to face.
   */
  _mergeDonor(entry) {
    const root = entry.group;
    if (!root) return null;
    root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const spin = new THREE.Matrix4().makeRotationY(-Math.PI / 2);

    const glassSet = new Set(entry.glassMats || []);
    const wheelOf = new Map();
    for (const p of entry.wheelPivots || []) {
      p.traverse((o) => { if (o.isMesh) wheelOf.set(o, p); });
    }

    /*
     * Position and normal only — merging needs identical attribute sets, and
     * a dark car at night has no use for the rest.
     *
     * These GLBs are meshopt-compressed, so their attributes are QUANTIZED:
     * normalized 8/16-bit integers that three expands in the shader. Cloning
     * such an attribute and calling applyMatrix4 writes transformed floats
     * back into an integer array, which is how every donor first came out as
     * a unit cube. Reading through getX/getY/getZ de-normalizes properly, so
     * everything is copied into plain Float32 before it is touched.
     */
    const toFloat = (attr) => {
      const out = new Float32Array(attr.count * 3);
      for (let i = 0; i < attr.count; i++) {
        out[i * 3] = attr.getX(i);
        out[i * 3 + 1] = attr.getY(i);
        out[i * 3 + 2] = attr.getZ(i);
      }
      return new THREE.BufferAttribute(out, 3);
    };
    const take = (mesh, basis) => {
      const src = mesh.geometry;
      if (!src || !src.attributes.position) return null;
      const g = src.index ? src.toNonIndexed() : src;
      const out = new THREE.BufferGeometry();
      out.setAttribute("position", toFloat(g.attributes.position));
      if (g.attributes.normal) out.setAttribute("normal", toFloat(g.attributes.normal));
      out.applyMatrix4(basis);
      if (!g.attributes.normal) out.computeVertexNormals();
      if (src.index) g.dispose();
      return out;
    };

    const body = [], glass = [], wheels = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const pivot = wheelOf.get(o);
      if (pivot) {
        /*
         * Relative to its own hub, so the wheel can turn about its axle —
         * and then turned by the SAME quarter-turn as the body. Only the hub
         * POSITION was being spun before, so the bodies faced down the road
         * while every tyre still faced across it: four wheels mounted
         * sideways. The spin is a rotation about the origin and the geometry
         * is already centred on the hub, so this turns it in place.
         */
        const basis = new THREE.Matrix4().copy(spin).multiply(
          new THREE.Matrix4().copy(pivot.matrixWorld).invert().multiply(o.matrixWorld)
        );
        const g = take(o, basis);
        if (!g) return;
        if (!wheels.has(pivot)) wheels.set(pivot, []);
        wheels.get(pivot).push(g);
        return;
      }
      const basis = new THREE.Matrix4().copy(spin).multiply(toLocal).multiply(o.matrixWorld);
      const g = take(o, basis);
      if (!g) return;
      // Some of these scenes still carry a backdrop or shadow catcher that
      // survived the strip pass. Nothing on a motor car is eight metres
      // across, so anything that big is scenery, not bodywork.
      g.computeBoundingBox();
      const sz = g.boundingBox.getSize(new THREE.Vector3());
      if (Math.max(sz.x, sz.y, sz.z) > 7 || g.boundingBox.max.y > 3.4) { g.dispose(); return; }
      (glassSet.has(o.material) ? glass : body).push(g);
    });
    if (!body.length) return null;

    const join = (list) => {
      if (!list.length) return null;
      const m = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      return m;
    };

    const bodyGeo = join(body);
    if (!bodyGeo) return null;
    bodyGeo.computeBoundingBox();
    const bb = bodyGeo.boundingBox;

    const hubs = [];
    for (const [pivot, list] of wheels) {
      const geo = join(list);
      if (!geo) continue;
      const p = pivot.position.clone().applyMatrix4(spin);
      geo.computeBoundingSphere();
      hubs.push({ geo, pos: p, r: geo.boundingSphere ? geo.boundingSphere.radius : 0.34 });
    }

    return {
      body: bodyGeo,
      glass: join(glass),
      hubs,
      len: bb.max.z - bb.min.z,
      width: bb.max.x - bb.min.x,
      height: bb.max.y - bb.min.y,
      nose: bb.max.z,
      tail: bb.min.z,
    };
  }

  /* swap the placeholder bodies for the real ones, keeping every position */
  _rebuildTraffic() {
    const carry = (arr) => arr.map((c) => ({ pos: c.position.clone(), rot: c.rotation.y, ud: c.userData }));
    const oncoming = carry(this.traffic || []);
    const same = carry(this.sameWay || []);
    const lead = this.leader ? { pos: this.leader.position.clone(), rot: this.leader.rotation.y } : null;

    const drop = (o) => {
      if (!o) return;
      this.ride.remove(o);
      o.traverse((n) => {
        if (n.isMesh || n.isSprite) {
          if (n.geometry && !n.userData.shared) n.geometry.dispose();
          if (n.material) n.material.dispose();
        }
      });
    };
    for (const c of this.traffic || []) drop(c);
    for (const c of this.sameWay || []) drop(c);
    drop(this.leader);

    this.traffic = oncoming.map((s, i) => {
      const c = this._makeTrafficCar(i, { style: i, paint: i * 3, lamp: i < 2 });
      c.position.copy(s.pos);
      c.userData.speed = s.ud.speed ?? 26 + Math.random() * 10;
      return c;
    });
    this.sameWay = same.map((s, i) => {
      const c = this._makeTrafficCar(i, { style: i + 1, paint: i * 2 + 1, away: true });
      c.rotation.y = Math.PI;
      c.position.copy(s.pos);
      c.userData.speed = s.ud.speed ?? 30;
      return c;
    });
    this.leader = this._makeTrafficCar(0, { style: 0, paint: 1, away: true, lamp: true });
    this.leader.rotation.y = Math.PI;
    if (lead) this.leader.position.copy(lead.pos);
    else this.leader.position.set(LANE_X, 0, -130);
  }

  /*
   * Traffic bodywork, the fallback shape used until the lineup has loaded.
   *
   * What the eye recognises is the SIDE PROFILE — bonnet fall, screen rake,
   * roofline, the drop to the boot — so each vehicle is a profile drawn once
   * and extruded across its own width with a bevelled edge. The lower body
   * and the greenhouse are separate profiles at different widths, which
   * gives the shoulder line every real car has.
   *
   * Profiles run nose-forward: x = 0 at the tail, +x toward the nose, y up.
   */
  _extrudeProfile(pts, len, width, bevel = 0.045) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    const depth = Math.max(0.12, width - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: 2, curveSegments: 4,
    });
    geo.translate(-len / 2, 0, -depth / 2);
    geo.rotateY(-Math.PI / 2);          // profile +x becomes world +z (nose)

    /*
     * A straight extrusion has no plan view: head on it is a flat slab, which
     * is exactly how the old traffic read through a windscreen. Squeezing the
     * width as a function of height gives tumblehome — the inward lean of the
     * flanks — and squeezing it toward the ends rounds the nose and tail.
     * Two cheap vertex passes buy most of what a modelled body would.
     */
    let hi = 0;
    for (const p of pts) hi = Math.max(hi, p[1]);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), z = pos.getZ(i);
      const t = THREE.MathUtils.clamp(y / hi, 0, 1);
      const e = THREE.MathUtils.clamp(Math.abs(z) / (len / 2), 0, 1);
      const k = (1 - 0.14 * t * t) * (1 - 0.2 * e * e * e);
      pos.setX(i, pos.getX(i) * k);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* four bodies' worth of variety: saloon, estate, hatch, panel van */
  _carStyle(i) {
    const S = [
      {                                   // saloon — long bonnet, fast roof
        len: 4.66, w: 1.84, gw: 1.72, r: 0.33, ax: 1.42,
        low: [[0.42, 0.24], [0.06, 0.40], [0.03, 0.86], [0.70, 0.99], [2.10, 1.03],
              [3.30, 1.01], [4.02, 0.94], [4.48, 0.82], [4.62, 0.60], [4.58, 0.30], [4.24, 0.22]],
        up: [[1.12, 0.78], [1.66, 1.38], [2.62, 1.45], [3.14, 1.43], [3.66, 0.78]],
      },
      {                                   // estate — roof carried to the tail
        len: 4.88, w: 1.88, gw: 1.76, r: 0.35, ax: 1.50,
        low: [[0.44, 0.26], [0.06, 0.44], [0.04, 1.02], [1.00, 1.06], [2.40, 1.08],
              [3.50, 1.05], [4.20, 0.97], [4.68, 0.84], [4.82, 0.62], [4.78, 0.32], [4.42, 0.24]],
        up: [[0.20, 0.84], [0.28, 1.56], [2.70, 1.58], [3.28, 1.52], [3.84, 0.84]],
      },
      {                                   // hatchback — short, upright
        len: 4.02, w: 1.76, gw: 1.65, r: 0.31, ax: 1.24,
        low: [[0.38, 0.24], [0.05, 0.42], [0.04, 0.94], [0.80, 0.99], [2.00, 1.00],
              [2.98, 0.97], [3.56, 0.88], [3.94, 0.74], [4.00, 0.52], [3.94, 0.28], [3.62, 0.22]],
        up: [[0.30, 0.78], [0.46, 1.46], [1.90, 1.50], [2.44, 1.46], [3.06, 0.78]],
      },
      {                                   // panel van — tall box, stub bonnet
        len: 5.30, w: 1.96, gw: 1.90, r: 0.36, ax: 1.66,
        low: [[0.46, 0.28], [0.06, 0.46], [0.05, 1.16], [3.60, 1.20], [4.30, 1.08],
              [4.94, 0.92], [5.22, 0.66], [5.18, 0.34], [4.80, 0.26]],
        up: [[0.14, 0.98], [0.18, 2.06], [3.36, 2.08], [3.72, 1.72], [4.06, 0.98]],
      },
    ];
    return S[i % S.length];
  }

  /*
   * A headlamp at night is a hot core inside a wide halo with a faint
   * horizontal flare across it. A plain soft dot at high opacity just
   * bleaches a circle, which is what made the oncoming cars read as two
   * white blobs pushing a box.
   */
  _flareTex() {
    if (this._flareT) return this._flareT;
    const S = 128;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    /*
     * The falloff has to start soft. A solid white core additively blended
     * and then run through bloom stops being a lamp and becomes a disc of
     * blown highlight with a car behind it — which is exactly what the
     * oncoming traffic looked like.
     */
    const halo = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    halo.addColorStop(0, "rgba(255,250,238,0.62)");
    halo.addColorStop(0.1, "rgba(255,246,228,0.34)");
    halo.addColorStop(0.32, "rgba(255,238,210,0.12)");
    halo.addColorStop(1, "rgba(255,232,196,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, S, S);
    // the anamorphic streak a windscreen and a wet lens both produce
    const streak = g.createLinearGradient(0, 0, S, 0);
    streak.addColorStop(0, "rgba(255,246,226,0)");
    streak.addColorStop(0.5, "rgba(255,246,226,0.3)");
    streak.addColorStop(1, "rgba(255,246,226,0)");
    g.fillStyle = streak;
    g.fillRect(0, S / 2 - 2, S, 4);
    this._flareT = new THREE.CanvasTexture(cv);
    return this._flareT;
  }

  /* One oncoming vehicle: silhouette body, greenhouse, headlamps, glare. */
  _makeTrafficCar(i, opts = {}) {
    const c = new THREE.Group();
    const away = !!opts.away;                 // travelling with us, seen from behind
    const donor = this._donors && this._donors.length
      ? this._donors[(opts.style ?? i) % this._donors.length]
      : null;

    /*
     * Scale the donor down to an ordinary car. The lineup is staged at its
     * real length — a Phantom is 5.9 m — and a boulevard of them reads as a
     * procession, not as traffic. Bringing each to 4.5–5 m also stops the
     * same four silhouettes announcing themselves.
     */
    const s = donor
      ? (() => {
          const target = 4.5 + ((opts.style ?? i) % 3) * 0.24;
          const k = target / donor.len;
          return {
            k, len: donor.len * k, w: donor.width * k, gw: donor.width * k,
            r: (donor.hubs[0] ? donor.hubs[0].r : 0.34) * k, ax: 0,
          };
        })()
      : this._carStyle(opts.style ?? i);

    /*
     * Paint. Clearcoat is the whole game at night: a near-black panel with a
     * clear lacquer over it picks up a hard, moving highlight from every
     * street lamp it passes under, which is what separates a car from a
     * lump of matte plastic. Traffic is mostly dark, with the occasional
     * silver or white to break the rank up.
     */
    // Night traffic is nearly black behind its own lights. A mid-grey car
    // reads as a pale slab pushing two headlamps along, so the palette stays
    // dark and the variety comes from the tint, not the value.
    const paints = [0x07080c, 0x0b0e14, 0x11151b, 0x2c3038, 0x0d1520, 0x1a1214, 0x161a1e];
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: paints[(opts.paint ?? i) % paints.length],
      roughness: 0.24, metalness: 0.62, clearcoat: 1, clearcoatRoughness: 0.06,
      envMap: this._env(), envMapIntensity: 0.78,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x05070c, roughness: 0.07, metalness: 0.24, clearcoat: 1,
      envMap: this._env(), envMapIntensity: 1.1,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.7 });

    c.userData.wheels = [];
    if (donor) {
      // ---- real bodywork ----
      const body = new THREE.Mesh(donor.body, bodyMat);
      body.userData.shared = true;
      c.add(body);
      if (donor.glass) {
        const gl = new THREE.Mesh(donor.glass, glassMat);
        gl.userData.shared = true;
        c.add(gl);
      }
      for (const h of donor.hubs) {
        const hub = new THREE.Group();
        const w = new THREE.Mesh(h.geo, trimMat);
        w.userData.shared = true;
        hub.add(w);
        hub.position.copy(h.pos);
        c.add(hub);
        c.userData.wheels.push(hub);
      }
      c.scale.setScalar(s.k);
    } else {
      const body = new THREE.Mesh(this._extrudeProfile(s.low, s.len, s.w), bodyMat);
      const glass = new THREE.Mesh(this._extrudeProfile(s.up, s.len, s.gw), glassMat);
      c.add(body, glass);

      // a black sill under the doors, which is what stops a car looking as if
      // it is hovering over its own wheels
      const sill = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.02, 0.16, s.len * 0.58), trimMat);
      sill.position.y = 0.24;
      c.add(sill);

      const tyreMat = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.96, metalness: 0.0 });
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x5a626c, roughness: 0.38, metalness: 0.9, envMap: this.nightEnv, envMapIntensity: 0.5 });
      for (const dx of [-1, 1]) {
        for (const dz of [s.ax, -s.ax]) {
          const hub = new THREE.Group();
          const tyre = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.235, 22), tyreMat);
          tyre.rotation.z = Math.PI / 2;
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.66, s.r * 0.66, 0.245, 16), rimMat);
          rim.rotation.z = Math.PI / 2;
          hub.add(tyre, rim);
          hub.position.set(dx * (s.w / 2 - 0.1), s.r, dz);
          c.add(hub);
          c.userData.wheels.push(hub);
        }
      }
    }

    /*
     * The lamp rig lives in the group's own space, which for a donor body is
     * BEFORE the scale that shrinks it to an ordinary car — so it is placed
     * off the donor's real bounding box, not the scaled figures.
     */
    const flare = this._flareTex();
    const noseZ = donor ? donor.nose : s.len / 2;
    const tailZ = donor ? donor.tail : -s.len / 2;
    const halfW = donor ? donor.width / 2 : s.w / 2;
    const lampY = donor
      ? (donor.hubs[0] ? donor.hubs[0].r : 0.34) + donor.height * 0.16
      : s.r + 0.31;
    const bodyW = halfW * 2;

    /*
     * A donor body already HAS lamp housings, mirrors and a number plate
     * modelled into it. Bolting my own boxes over them is what produced a
     * red brick hanging off the back of a Cullinan, so on a real body the
     * rig is light only: a lit lens sitting a couple of centimetres proud
     * of the moulded one, and the flare it throws. The full set of parts is
     * built only for the placeholder shape, which has none of its own.
     */
    if (!away) {
      // ---- headlamps, seen head on ----
      for (const dx of [-1, 1]) {
        const x = dx * (halfW - bodyW * (donor ? 0.11 : 0.16));
        /*
         * The lens is TONE MAPPED. Left unmapped it is pinned at full white
         * whatever the exposure, so it always reads as the brightest thing
         * on screen; letting ACES roll it off keeps it a hot lamp that still
         * sits inside the picture. Tungsten-warm, not blue-white.
         */
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(donor ? 0.3 : 0.26, donor ? 0.09 : 0.11, 0.05),
          new THREE.MeshBasicMaterial({ color: 0xffe7bc })
        );
        lens.position.set(x, lampY, noseZ - (donor ? -0.02 : 0.16));
        const glare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flare, color: 0xffeccf, transparent: true, opacity: 0.5,
          depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        }));
        glare.scale.set(1.9, 1.05, 1);
        glare.position.set(x, lampY, noseZ + 0.1);
        c.add(lens, glare);

        if (!donor) {
          // the LED daytime-running signature — the single detail that dates
          // a car to this century, and one the placeholder has to fake
          const drl = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.028, 0.05),
            new THREE.MeshBasicMaterial({ color: 0xcfe4ff, toneMapped: false })
          );
          drl.position.set(x, lampY + 0.11, noseZ - 0.15);
          c.add(drl);
        }
      }
      if (!donor) {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.11, 0.03),
          new THREE.MeshStandardMaterial({ color: 0xdedad0, emissive: 0x8a8676, emissiveIntensity: 0.5, roughness: 0.7 })
        );
        plate.position.set(0, lampY - 0.33, noseZ - 0.12);
        c.add(plate);
      }
    } else {
      // ---- tail cluster, seen from behind ----
      const barMat = new THREE.MeshBasicMaterial({ color: 0xd8241a, toneMapped: false });
      barMat.color.multiplyScalar(2.2);
      const glares = [];
      for (const dx of [-1, 1]) {
        const x = dx * (halfW - bodyW * (donor ? 0.1 : 0.14));
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(donor ? 0.34 : 0.3, donor ? 0.09 : 0.1, 0.04),
          barMat
        );
        bar.position.set(x, lampY + 0.06, tailZ - (donor ? -0.02 : 0.14));
        const glare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flare, color: 0xff3b26, transparent: true, opacity: 0.62,
          depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
        }));
        glare.material.color.multiplyScalar(1.8);
        glare.scale.set(1.5, 0.9, 1);
        glare.position.set(x, lampY + 0.06, tailZ - 0.06);
        c.add(bar, glare);
        glares.push(glare.material);
      }
      let stripMat = null;
      if (!donor) {
        // the full-width light bar modern cars run between the clusters; a
        // real body already has its own, so this is placeholder-only
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(bodyW * 0.62, 0.035, 0.04),
          new THREE.MeshBasicMaterial({ color: 0x8e1810, toneMapped: false })
        );
        strip.material.color.multiplyScalar(2.6);
        strip.position.set(0, lampY + 0.06, tailZ + 0.14);
        c.add(strip);
        stripMat = strip.material;
      }
      c.userData.tail = { bar: barMat, strip: stripMat, glares };
    }

    /*
     * The vehicle's light on the road used to be a 26-metre additive plane
     * trailing behind it. Against a real mirrored render of the boulevard
     * that is a solid red stripe PAINTED down the carriageway — it does not
     * bend with the camber, it does not break up in the water, and it does
     * not move when the car changes lane, because it is a decal bolted to
     * the bumper. The reflection now carries every tail lamp and headlamp
     * on the road with the correct geometry, so the decal is deleted.
     */

    // Only the nearest oncoming pair carry a real light. A point light per
    // vehicle costs every shader in range and lights almost nothing we see.
    // It must sit WELL clear of the nose. Parked on the lamps themselves it
    // floodlit the car's own front panel, which is what turned an oncoming
    // silhouette into a pale slab with two holes punched in it.
    if (opts.lamp) {
      const pl = new THREE.PointLight(0xffe6c4, 8.5, 15, 2);
      pl.position.set(0, 0.5, away ? tailZ - 3.2 : noseZ + 3.4);
      c.add(pl);
    }

    c.userData.speed = 26 + Math.random() * 10;
    c.userData.wheelR = s.r;
    this.ride.add(c);
    return c;
  }

  /*
   * A night environment the wet road can reflect: an equirectangular canvas,
   * navy-black overhead falling to a warm sodium band at the horizon, with a
   * scatter of soft city-glow. Assigned as the road's own envMap (so it does
   * not touch the car or buildings). Pre-blurred so a rough surface samples
   * it smoothly instead of sparkling.
   */
  /* one night environment, shared by every reflective surface in the city */
  _env() {
    if (!this._nightEnvT) this._nightEnvT = this._nightEnvTex();
    return this._nightEnvT;
  }

  /*
   * Turn the night canvas into a real environment.
   *
   * This is a correctness fix with very large visual consequences.
   * MeshStandardMaterial can only sample a PMREM-encoded environment: its
   * IBL code path is `textureCubeUV`, which reads a specific packed mip
   * pyramid and nothing else. Handing it a raw equirectangular canvas —
   * which is what every material in the ride was getting — does not fail
   * loudly. It samples the wrong texels at the wrong mip and returns
   * something arbitrary, and here that arbitrary something was BRIGHT: the
   * carriageway was picking up close to a full unit of irradiance from an
   * environment that should have been contributing a few hundredths. That
   * is why the road sat as a milky grey sheet no matter how the lighting
   * was balanced, why the markings blew out the moment they were given
   * their real albedo, and why nothing in the scene had a believable
   * relationship to anything else.
   *
   * Prefiltered properly, the same image becomes what it was always meant
   * to be: dark sky overhead, a lit skyline round the horizon, a sodium
   * street layer beneath it — and every roughness value in the world gets
   * the correctly blurred mip of it.
   */
  buildEnvIBL(pmrem) {
    const raw = this._env();
    if (!pmrem || this._envIsIBL) return;
    const rt = pmrem.fromEquirectangular(raw);
    this.nightEnv = rt.texture;
    this._envIsIBL = true;
    this.group.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.envMap === raw) { m.envMap = this.nightEnv; m.needsUpdate = true; }
      }
    });
    raw.dispose();
    this._nightEnvT = this.nightEnv;   // later callers of _env() get the IBL
  }

  /*
   * The night, as every reflective surface in the world sees it.
   *
   * This one canvas is the environment for the coachwork, the chrome, the
   * glazing, the curtain-wall towers, the puddles and the river — so its
   * structure is the structure of every highlight in the frame. The old
   * version was a vertical gradient with sixty soft blobs smeared across
   * it, which is why reflections had no ARCHITECTURE: a flank rolling past
   * showed a wash of light with nothing in it, when what makes coachbuilt
   * paint read as coachbuilt is a skyline sliding down the shoulder line
   * with legible verticals in it.
   *
   * So it is drawn as a place: a horizon of real towers with real lit
   * floors, a sodium street layer beneath them, a moon, and the district's
   * glow standing over the lot. Blurred at the end — but blurred structure
   * still reads as structure, whereas blurred noise never does.
   */
  _nightEnvTex() {
    const W = 2048, H = 1024;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const HOR = H * 0.5;

    // ---- sky: cool, deep, and lifting toward the roofline ----
    const grad = g.createLinearGradient(0, 0, 0, HOR);
    grad.addColorStop(0.00, "#03050a");
    grad.addColorStop(0.45, "#060a14");
    grad.addColorStop(0.78, "#0d1524");
    grad.addColorStop(1.00, "#1a2438");   // the city's dome of light
    g.fillStyle = grad;
    g.fillRect(0, 0, W, HOR);

    // ---- ground: near-black, because a night street reflects, it does not
    // emit. A lifted lower hemisphere is what makes horizontal surfaces
    // glow from underneath and read as backlit plastic. ----
    const und = g.createLinearGradient(0, HOR, 0, H);
    und.addColorStop(0.00, "#0a0e16");
    und.addColorStop(0.30, "#04060b");
    und.addColorStop(1.00, "#010203");
    g.fillStyle = und;
    g.fillRect(0, HOR, W, H - HOR);

    // ---- the moon, and the halo it wears in humid air ----
    const mx = W * 0.22, my = H * 0.17;
    const halo = g.createRadialGradient(mx, my, 0, mx, my, 190);
    halo.addColorStop(0.00, "rgba(206,220,246,0.30)");
    halo.addColorStop(0.20, "rgba(178,196,232,0.10)");
    halo.addColorStop(1.00, "rgba(150,170,210,0)");
    g.fillStyle = halo;
    g.fillRect(mx - 190, my - 190, 380, 380);
    /* The moon is kept SOFT and fairly dim here, which is not how it looks
     * in the sky but is how it has to behave in an environment map. This
     * image is what every chromed and lacquered surface in the world
     * reflects, and a small hard-edged disc at near-full alpha reappears as
     * a small hard-edged disc on each of them — most obviously as a white
     * blister on the rear-view mirror and the roof of the motor car. The
     * moon's presence in the frame is carried by the actual moon sprite in
     * the sky; its job in here is only to give the coachwork somewhere
     * bright to catch as it rolls. */
    const disc = g.createRadialGradient(mx, my, 0, mx, my, 52);
    disc.addColorStop(0, "rgba(255,252,240,0.46)");
    disc.addColorStop(0.45, "rgba(232,238,250,0.22)");
    disc.addColorStop(1, "rgba(210,222,244,0)");
    g.fillStyle = disc;
    g.fillRect(mx - 56, my - 56, 112, 112);

    /* ---- the skyline: two ranks, so it has depth ----
     * The far rank is hazy and blue and barely more than a silhouette; the
     * near rank is darker, taller and carries legible lit floors. A single
     * rank reflects as a stripe; two reflect as a city.
     */
    const rank = (count, minH, maxH, alpha, tint, litAlpha) => {
      for (let i = 0; i < count; i++) {
        const bw = 26 + Math.random() * 88;
        const bx = Math.random() * W;
        const bh = minH + Math.random() * (maxH - minH);
        const top = HOR - bh;
        g.fillStyle = `rgba(${tint},${alpha})`;
        g.fillRect(bx, top, bw, bh);

        // lit floors. Real occupancy: whole storeys on, runs of bays, gaps.
        const fh = 9 + Math.random() * 5;
        const bayW = 7 + Math.random() * 5;
        const warmTower = Math.random();
        for (let y = top + 5; y < HOR - 4; y += fh) {
          if (Math.random() < 0.42) continue;               // a dark floor
          const whole = Math.random() < 0.4;
          for (let x = bx + 3; x < bx + bw - 3; x += bayW) {
            if (!whole && Math.random() < 0.52) continue;
            const warm = warmTower < 0.34 ? true : warmTower > 0.86 ? false : Math.random() < 0.4;
            const v = 150 + Math.random() * 105;
            g.fillStyle = warm
              ? `rgba(${v},${v * 0.80},${v * 0.56},${litAlpha * (0.5 + Math.random() * 0.5)})`
              : `rgba(${v * 0.80},${v * 0.90},${v},${litAlpha * (0.42 + Math.random() * 0.45)})`;
            g.fillRect(x, y, bayW * 0.66, fh * 0.5);
          }
        }
        // crown lights on the taller ones
        if (bh > (maxH * 0.62) && Math.random() < 0.5) {
          g.fillStyle = Math.random() < 0.6 ? "rgba(226,186,120,0.75)" : "rgba(150,186,232,0.7)";
          g.fillRect(bx, top - 3, bw, 3);
        }
      }
    };
    g.save();
    g.filter = "blur(6px)";
    rank(70, 40, 210, 0.55, "16,24,40", 0.30);        // far, hazy, blue
    g.filter = "none";
    rank(46, 70, 330, 0.92, "5,7,12", 0.85);          // near, dark, legible
    g.restore();

    /* ---- the street layer: sodium, shopfronts, headlamps. Narrow, and
     * sitting ON the horizon rather than washed across the sky — a wide
     * warm band here is what turns an entire carriageway brown. ---- */
    const band = g.createLinearGradient(0, HOR - 26, 0, HOR + 20);
    band.addColorStop(0.00, "rgba(214,150,80,0)");
    band.addColorStop(0.55, "rgba(226,162,88,0.42)");
    band.addColorStop(1.00, "rgba(180,150,120,0)");
    g.fillStyle = band;
    g.fillRect(0, HOR - 26, W, 46);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W, r = 10 + Math.random() * 40;
      const y = HOR - 6 + (Math.random() - 0.5) * 14;
      const gl = g.createRadialGradient(x, y, 0, x, y, r);
      const roll = Math.random();
      gl.addColorStop(0, roll < 0.66 ? "rgba(255,206,140,0.42)"
        : roll < 0.86 ? "rgba(198,220,255,0.30)"
          : "rgba(255,110,86,0.30)");                  // the odd tail lamp
      gl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gl;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* ---- and the dome of light standing over the whole district. This is
     * what a car's roof and a puddle's centre actually pick up, and its
     * absence is why the old reflections died to black overhead. ---- */
    const dome = g.createLinearGradient(0, HOR - 300, 0, HOR);
    dome.addColorStop(0, "rgba(96,124,172,0)");
    dome.addColorStop(1, "rgba(112,142,190,0.16)");
    g.fillStyle = dome;
    g.fillRect(0, HOR - 300, W, 300);

    // one blur pass: this is a rough IBL, and hard edges in it show up as
    // hard edges rolling across the coachwork
    g.filter = "blur(5px)";
    g.drawImage(cv, 0, 0);
    g.filter = "none";

    const t = new THREE.CanvasTexture(cv);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* Paving slabs: joints, a kerb-side gutter stain, and worn patches. */
  _walkTex() {
    if (this._walkT) return this._walkT;
    const S = 256, SLAB = 64;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "#2b2f38";                       // a damp night pavement, absolute
    g.fillRect(0, 0, S, S);

    // slab faces, each very slightly its own shade
    for (let y = 0; y < S; y += SLAB) {
      for (let x = 0; x < S; x += SLAB) {
        const v = 34 + Math.random() * 16;
        g.fillStyle = `rgb(${v},${v + 2},${v + 7})`;
        g.fillRect(x + 1.5, y + 1.5, SLAB - 3, SLAB - 3);
      }
    }
    // the joints between them
    g.strokeStyle = "rgba(8,10,15,0.9)";
    g.lineWidth = 2;
    for (let i = 0; i <= S; i += SLAB) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }
    // grime: darker where feet and water collect
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(9,11,16,${0.22 + Math.random() * 0.34})`);
      gr.addColorStop(1, "rgba(9,11,16,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 470);                          // one slab ≈ 0.5 m
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    this._walkT = t;
    return t;
  }

  /*
   * Roughness map for the road: water pools between the wheel tracks and at
   * the kerb, so those bands are near-mirror (dark = smooth) while the crown
   * of the camber and the worn centre are drier (light = rough). This uneven
   * gloss is most of what separates wet tarmac from wet plastic.
   */
  _roadRoughTex() {
    const W = 256, H = 1024;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");

    /*
     * This map now carries the whole range, because the material's own
     * roughness is 1.0 and the reflection reads its wetness straight off
     * here. A narrow range is what made the last pass a lake: with every
     * texel landing inside the "wet" window the entire carriageway mirrored
     * at once, and a road that mirrors EVERYWHERE is a swimming pool. Dry
     * has to be genuinely dry so the wet parts can be genuinely wet.
     */
    /*
     * The numbers here are the difference between wet asphalt and wet
     * GLASS. Water on a road does not make it smooth — it fills the voids
     * between the aggregate and leaves a surface that is still stone,
     * still scattering, just far less than when it was dry. Taken down to
     * a true mirror (roughness ~0.1) every headlamp on the boulevard threw
     * a hard white bar the full length of the carriageway, which is the
     * "road made of chrome" look. Around 0.3 the same lamp lays down a
     * long soft column instead, and the planar reflection — which is
     * blurred by this map too — becomes the thing carrying the wetness.
     */
    g.fillStyle = "#d4d4d4";                    // dry crown, properly rough
    g.fillRect(0, 0, W, H);

    /*
     * ---- and now the part that has to be got right ----
     *
     * The wet areas used to be drawn as four full-height gradient BANDS at
     * the wheel-track and gutter positions. Any feature that is constant
     * down this texture's V axis is constant along nine hundred metres of
     * carriageway, so those four bands rendered as four perfectly straight,
     * perfectly parallel glossy ribbons converging on the vanishing point.
     * The eye reads that instantly and reads it as PAINT. It was the single
     * most artificial thing left in the frame.
     *
     * Water on a road is not striped, it is BLOTCHED — it collects where
     * the surface happens to have settled, in patches metres long, with the
     * wheel tracks only biasing where those patches tend to fall. So the
     * wetness is laid down as a few hundred overlapping elongated pools,
     * scattered around the track lines rather than ruled along them, and
     * nothing here runs the full height of the tile.
     */
    const pool = (x, y, rx, ry, v, a) => {
      g.save();
      g.translate(x, y);
      g.scale(rx, ry);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      gr.addColorStop(0.55, `rgba(${v},${v},${v},${a * 0.55})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    };

    // the tracks and gutters, as a BIAS on where water gathers
    const lanes = [0.30, 0.70, 0.045, 0.955, 0.30, 0.70];
    for (let i = 0; i < 260; i++) {
      const lane = lanes[(Math.random() * lanes.length) | 0];
      const jitter = (Math.random() + Math.random() - 1) * 0.085;   // bell-ish
      const x = (lane + jitter) * W;
      const y = Math.random() * H;
      const rx = 10 + Math.random() * 34;
      const ry = rx * (2.0 + Math.random() * 5.0);                  // drawn out along the road
      pool(x, y, rx, ry, 92, 0.22 + Math.random() * 0.4);
    }
    // free-standing pools anywhere on the carriageway
    for (let i = 0; i < 90; i++) {
      const rx = 12 + Math.random() * 46;
      pool(Math.random() * W, Math.random() * H, rx, rx * (1.4 + Math.random() * 3.2),
        78, 0.2 + Math.random() * 0.45);
    }
    // and dry islands cut back through them, so no pool has a clean rim
    for (let i = 0; i < 150; i++) {
      const rx = 10 + Math.random() * 40;
      pool(Math.random() * W, Math.random() * H, rx, rx * (1.2 + Math.random() * 2.6),
        222, 0.18 + Math.random() * 0.4);
    }
    // fine grain, so the wet/dry edge is never a clean contour
    for (let i = 0; i < 20000; i++) {
      const v = Math.random() < 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.10})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 40);
    t.anisotropy = 8;
    return t;
  }

  /*
   * Surface relief for the carriageway. Not bumps for their own sake: a
   * perfectly flat normal makes every reflected highlight a clean geometric
   * shape, which is the single most synthetic thing about a CG wet road.
   * Broad, very shallow undulations — the settling and rutting of laid
   * asphalt — break the reflected lamps into something water-shaped, and a
   * fine aggregate grain keeps the dry crown from reading as vinyl.
   */
  _roadNormalTex() {
    if (this._roadNT) return this._roadNT;
    const W = 256, H = 256;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    // a flat normal is (0.5, 0.5, 1.0) in tangent space
    g.fillStyle = "rgb(128,128,255)";
    g.fillRect(0, 0, W, H);

    /* Soft ruts — but BROKEN ones. A gradient run the full height of this
       tile is a groove nine hundred metres long, and a road with perfectly
       straight infinite grooves in it reads as corrugated plastic. These
       are laid as overlapping segments instead, each a few metres long. */
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * W, w = 8 + Math.random() * 30;
      const y = Math.random() * H, h = 40 + Math.random() * 150;
      const lean = 120 + Math.random() * 16;
      const grd = g.createLinearGradient(x - w, 0, x + w, 0);
      grd.addColorStop(0, "rgba(128,128,255,0)");
      grd.addColorStop(0.5, `rgba(${lean | 0},128,255,0.34)`);
      grd.addColorStop(1, "rgba(128,128,255,0)");
      g.fillStyle = grd;
      const fade = g.createLinearGradient(0, y, 0, y + h);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.5, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      g.save();
      g.beginPath(); g.rect(x - w, y, w * 2, h); g.clip();
      g.fillRect(x - w, y, w * 2, h);
      g.restore();
    }
    // shallow dishes where water would stand
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 8 + Math.random() * 34;
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      grd.addColorStop(0, "rgba(148,148,255,0.34)");
      grd.addColorStop(0.5, "rgba(128,128,255,0.05)");
      grd.addColorStop(1, "rgba(108,108,255,0)");
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // aggregate
    for (let i = 0; i < 5200; i++) {
      const v = 128 + (Math.random() - 0.5) * 26;
      g.fillStyle = `rgba(${v | 0},${(255 - v) | 0},255,0.22)`;
      g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 120);
    t.anisotropy = 8;
    this._roadNT = t;
    return t;
  }

  /*
   * The skyline as the wet road sees it: the same lit windows, smeared into
   * vertical streaks, blurred, and faded out toward the viewer so the tarmac
   * closest to the car stays black. Drawn once into a canvas at build time.
   */
  _roadMirrorTex() {
    const W = 1024, H = 512;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");

    // vertical light streaks, brightest where a lit tower stands
    for (let i = 0; i < 190; i++) {
      const x = Math.random() * W;
      const warm = Math.random() < 0.72;
      const len = 60 + Math.random() * 300;
      const wdt = 2 + Math.random() * 11;
      const a = 0.05 + Math.random() * 0.4;
      const grd = g.createLinearGradient(0, 0, 0, len);
      const c = warm ? "255,196,120" : "150,190,255";
      grd.addColorStop(0, `rgba(${c},${a})`);
      grd.addColorStop(0.45, `rgba(${c},${a * 0.4})`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.fillRect(x, 0, wdt, len);
    }

    // a few long hero streaks — the tall towers reaching down the road
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * W;
      const grd = g.createLinearGradient(0, 0, 0, H * 0.9);
      grd.addColorStop(0, "rgba(255,214,150,0.34)");
      grd.addColorStop(0.5, "rgba(255,200,130,0.11)");
      grd.addColorStop(1, "rgba(255,190,120,0)");
      g.fillStyle = grd;
      g.fillRect(x, 0, 5 + Math.random() * 16, H * 0.9);
    }

    // blur so it reads as a reflection in moving water, not as stripes
    g.filter = "blur(5px)";
    g.drawImage(cv, 0, 0);
    g.filter = "none";

    // fade the near end to nothing — tarmac under the car is not a mirror
    const fade = g.createLinearGradient(0, H, 0, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.42, "rgba(0,0,0,0.55)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);

    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
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
    // the lamp's own glare disc: visible whenever the camera is ahead of
    // the car, at any distance, but never from behind it
    const gTarget = facing * (this.highBeam ? 0.78 : 0.55);
    for (const m of this.headGlows || []) {
      m.opacity += (gTarget - m.opacity) * 0.14;
    }
  }

  /* Distant skyline for the horizon plane: haze, silhouettes, lit windows. */
  _horizonTex() {
    const cv = document.createElement("canvas");
    cv.width = 2048; cv.height = 410;
    const g = cv.getContext("2d");

    /*
     * City haze pooling at street level, dissolving into the night.
     *
     * This gradient used to run half-opaque SODIUM ORANGE right across the
     * horizon, and it was the last source of the mauve band standing over
     * the far roofline: warm haze laid into a blue night sky does not read
     * as warm, it reads as violet, and a violet horizon is the single most
     * reliable way to make an expensive night frame look like a cheap dusk
     * preset. The warmth is kept, but it is pushed down into the lowest
     * few degrees where real buildings occlude most of it, and the layer
     * above it is taken to a cool slate that the sky dome can meet without
     * either colour having to cross the other.
     */
    const haze = g.createLinearGradient(0, 410, 0, 0);
    haze.addColorStop(0, "rgba(196,140,80,0.34)");
    haze.addColorStop(0.16, "rgba(126,102,86,0.20)");
    haze.addColorStop(0.42, "rgba(58,72,96,0.14)");
    haze.addColorStop(0.75, "rgba(40,52,74,0.06)");
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
    /*
     * Sky above, sodium below. A flat AmbientLight fills the shadows with
     * one colour; a hemisphere puts the cool of the sky on every upward
     * face and the warm bounce off the boulevard on every downward one,
     * which is most of why a lit city night looks lit at all.
     */
    this.sky = new THREE.HemisphereLight(0x38537f, 0x33240f, 0);
    this.sky.position.set(0, 12, 0);
    lights.add(this.sky);
    this.bounce = new THREE.PointLight(0x6a80a8, 0.7, 16, 2);
    this.bounce.position.set(0, -0.8, 0);
    lights.add(this.bounce);

    /*
     * ---- the two soft sources that actually shape the coachwork ----
     *
     * A SpotLight is a point. Under a clearcoat at roughness 0.03 a point
     * produces a specular a few pixels across and thousands of units
     * bright, which is the white blister that kept appearing on the roof
     * and which bloom then detonated across half the frame. No car has ever
     * been photographed that way. What lights a motor car on a night street
     * is BROAD: fifty metres of lit shopfront down one side, a river and a
     * sky down the other, and both of them are area sources.
     *
     * RectAreaLight gives exactly that — a specular that is a long soft
     * BAR travelling down the flank as the car moves, which is the single
     * most recognisable thing about automotive photography, and the thing
     * this scene had no way to produce.
     */
    RectAreaLightUniformsLib.init();
    this.shopWall = new THREE.RectAreaLight(0xffb264, 0, 26, 4.6);
    this.shopWall.position.set(11.0, 3.1, -2);
    this.shopWall.lookAt(-2.1, 0.85, -2);
    lights.add(this.shopWall);

    this.riverWall = new THREE.RectAreaLight(0x8fb2ee, 0, 30, 9);
    this.riverWall.position.set(-13.5, 5.0, -4);
    this.riverWall.lookAt(-2.1, 1.05, -4);
    lights.add(this.riverWall);

    this.lights = lights;
    this.group.add(lights);
  }

  /*
   * The pavilion rig is a bright exhibit — on the boulevard it must fall
   * away to moonlight, or the night reads as a grey studio. Streetlamps,
   * headlights and the city itself carry the ride.
   */
  /*
   * The night rig.
   *
   * A single dim moon over an ambient wash is what a night scene looks
   * like before anyone lights it, and it is why the boulevard read cold
   * and flat: one colour temperature everywhere, nothing separating the
   * motor car from the road behind it. A Gulf or Riviera night is lit from
   * TWO directions at once — sodium and shopfront gold coming up off the
   * ground on one side, moon and water reflecting cool down the other —
   * and the car sits in the middle catching both.
   *
   * The ride keeps the car at the origin, so lights parked around the
   * origin travel with it for free and behave as a proper key rig:
   *
   *   key    warm, low, camera right — the shopfronts we are passing
   *   key2   cool, high, camera left — moon off the water
   *   rim    cool backlight that cuts the roofline out of the dark
   *   sky    hemisphere: cool from above, sodium bounce from below
   */
  _setRideLighting(riding) {
    const t = { duration: 1.6, ease: "power2.inOut" };
    /*
     * The rig, rebalanced around what the city itself contributes.
     *
     * The old night rig ran two hard spotlights over a nearly black
     * ambient: the motor car was lit and NOTHING else was, so every facade,
     * kerb and palm in frame took its entire exposure from its own emissive
     * map and came out as a flat cut-out. That is the "insufficient
     * indirect light / buildings lack variation" failure, and no amount of
     * post can fix it — it is missing light, not missing grade.
     *
     * A financial district at night is bounced light, in enormous
     * quantities: tens of thousands of lit windows firing at each other
     * across a street, the whole lot coming back up off wet ground. So the
     * hemisphere does the heavy lifting now (cool from the sky dome, sodium
     * from the carriageway), the spotlights come DOWN so they shape the
     * coachwork rather than blowing holes in it, and the street lamps
     * carry the road themselves.
     */
    gsap.to(this.rim, { intensity: riding ? 0.62 : 2.4, ...t });
    /* the two hard spots hand the car over to the area lights on the road,
     * and stay only as a low wash on the surroundings the area lights do
     * not reach */
    gsap.to(this.key, { intensity: riding ? 7 : 120, ...t });
    gsap.to(this.key2, { intensity: riding ? 5 : 70, ...t });
    gsap.to(this.fill, { intensity: riding ? 0.14 : 0.5, ...t });
    gsap.to(this.amb, { intensity: riding ? 0.22 : 0.55, ...t });
    gsap.to(this.bounce, { intensity: riding ? 0.5 : 0.7, ...t });
    /* The prefiltered night environment is now the scene's true ambient,
     * so the hemisphere is a SHAPING light on top of it rather than the
     * source of the fill — it exists to put the sky's cool on upward faces
     * and the carriageway's sodium on downward ones. Left at the figure it
     * needed when the environment was broken it simply double-counts, and
     * the road comes back as a pale sheet. */
    if (this.sky) gsap.to(this.sky, { intensity: riding ? 0.7 : 0, ...t });
    if (this.shopWall) gsap.to(this.shopWall, { intensity: riding ? 3.4 : 0, ...t });
    if (this.riverWall) gsap.to(this.riverWall, { intensity: riding ? 1.9 : 0, ...t });

    if (riding) {
      // the backlight sits BEHIND and above, so the roof and shoulder get
      // an edge — separation is what makes a dark car read as a shape
      this.rim.position.set(-11, 9, 16);
      this.rim.color.setHex(0xa8c4f0);

      // shopfront gold, low and close on the right
      this.key.color.setHex(0xffb765);
      this.key.position.set(12.5, 5.2, 2);
      this.key.target.position.set(-2.1, 0.8, -2);
      this.key.angle = Math.PI / 3.4;
      this.key.penumbra = 0.92;
      this.key.distance = 46;

      // moon and water, high and cool on the left
      this.key2.color.setHex(0x8fb4f2);
      this.key2.position.set(-12, 8.5, -5);
      this.key2.target.position.set(-2.1, 1.1, -3);
      this.key2.angle = Math.PI / 3.8;
      this.key2.penumbra = 0.94;
      this.key2.distance = 46;

      // the ambient is the district's own light, not a grey lift: cool,
      // and only just strong enough to put air into the shadows
      this.amb.color.setHex(0x2c3a55);
      // sky above / sodium below, and the ratio between them IS the
      // 60 cool / 30 neutral / 10 warm balance the frame is aiming at
      if (this.sky) {
        this.sky.color.setHex(0x4a6da4);
        this.sky.groundColor.setHex(0x4a3418);
      }

      this.fill.color.setHex(0xffc98a);
      this.fill.position.set(6, 1.2, -12);
      this.bounce.color.setHex(0xffa860);
    } else {
      this.amb.color.setHex(0x2a3444);
      if (this.sky) { this.sky.color.setHex(0x38537f); this.sky.groundColor.setHex(0x33240f); }
      this.rim.position.set(-5, 8, -10);
      this.rim.color.setHex(0xc6d8f4);
      this.key.color.setHex(0xfff2e2);
      this.key.position.set(6, 8, 11);
      this.key.target.position.set(0, 0.6, 0);
      this.key.angle = Math.PI / 5;
      this.key.penumbra = 0.65;
      this.key.distance = 44;
      this.key2.color.setHex(0xbcd0f4);
      this.key2.position.set(-7, 7, 6);
      this.key2.target.position.set(0, 0.7, 0);
      this.key2.angle = Math.PI / 4.5;
      this.key2.penumbra = 0.7;
      this.key2.distance = 40;
      this.fill.color.setHex(0x9fb6dc);
      this.fill.position.set(9, 3, -4);
      this.bounce.color.setHex(0x6a80a8);
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
    /* Of those, the ones the occupant is actually SEATED in. These are
     * the shots that must show the commissioned cabin rather than the
     * exterior model's built-in one — bonnet, bumper and spirit look at
     * the car from outside it and keep the exterior. */
    this.seatedCams = new Set(["driver", "passenger", "interior", "rear"]);
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
        v.fov = 33;
        break;
      case "skyline":
        v.pos.set(-9.5, 1.0, 5.2);
        v.look.set(3.5, 3.2, -26);
        v.fov = 42;
        break;
      case "wheel":
        v.pos.set(lane + 2.3, 0.52, -0.9);
        v.look.set(lane + 0.9, 0.42, -1.7);
        v.fov = 30;
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
        v.fov = 32;
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
        v.fov = 34;
        break;
      case "orbit": {                   // the classic circling reveal
        const a = t * 0.32;
        v.pos.set(lane + Math.sin(a) * 7.4, 2.0 + Math.sin(a * 0.5) * 0.7, Math.cos(a) * 7.4);
        v.look.set(lane, 0.82, 0);
        v.fov = 31;
        break;
      }

      default: { // chase — the hero camera with full inertia
        const sway = Math.sin(t * 0.62) * 0.1 * m.sway;
        v.pos.set(
          lane * 0.55 + sway + this.input.steer * 0.4,
          2.16 + pitch * 0.22 + Math.cos(t * 3.4) * 0.008,
          11.4 + pitch * 0.7
        );
        /* aim long down the boulevard: a near look-at point pivots hard with
           every steering input, which is what made the frame feel driven
           rather than photographed */
        v.look.set(lane * 0.7 + this.input.steer * 0.8, 1.16 - pitch * 0.38, -30);
        v.fov = m.fov + Math.min(2.5, this.speed * 0.009);
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

    // Wetness: the boulevard is always damp (that is the whole look), and
    // Rain floods it. Puddles deepen and every light smear lengthens.
    const wet = m.rain ? 1 : 0.6;
    for (const p of this.puddles || []) {
      gsap.to(p.material, { opacity: 0.4 + wet * 0.34, duration: 1.2, ease: "power2.inOut" });
    }
    /* Rain floods the carriageway: the reflection strengthens, the ripple
     * lengthens, and the lamps' haloes swell in the wetter air. */
    const ru = this.roadMat?.userData?.reflectUniforms;
    if (ru) {
      gsap.to(ru.uReflStrength, { value: 0.86 + wet * 0.42, duration: 1.2, ease: "power2.inOut" });
      gsap.to(ru.uReflRipple, { value: 0.7 + wet * 1.1, duration: 1.2 });
    }
    this._wetGain = 0.85 + wet * 0.35;
    for (const lp of this.rideLamps || []) {
      const b = lp.userData.baseOpacity;
      lp.userData.layers.forEach((o, li) => {
        gsap.to(o.material, { opacity: b[li] * this._wetGain, duration: 1.2 });
      });
    }
    this.rain.visible = m.rain && this.phase === "riding";
    // city dimming + lamp brightness
    // scale each tower from ITS OWN base, or the mode tween flattens the
    // whole skyline back to a single brightness
    for (const mat of this.rideTowerMats) {
      if (mat.userData.baseEmissive == null) mat.userData.baseEmissive = mat.emissiveIntensity;
      gsap.to(mat, { emissiveIntensity: mat.userData.baseEmissive * m.cityDim, duration: 1.2 });
    }
    for (const h of this.lampHeads) gsap.to(h.color, {
      r: 2.6 * m.lamp, g: 2.2 * m.lamp, b: 1.6 * m.lamp, duration: 1.2,
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
    /* The pavilion's floating motes belong to the PAVILION. On the road
     * nothing updates them, so 220 additive particles sat frozen around
     * the origin for the whole drive — and because the car is pinned to
     * the origin too, one of them was parked six metres from the lens,
     * every frame, in the same place: the pale disc that kept turning up
     * on the roof of the motor car. */
    if (this.dust) this.dust.visible = false;
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
    if (this.dust) this.dust.visible = true;
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
      /* A hard-edged cone is a torch. A wide penumbra gives the soft
       * shoulder a real projector lens throws, and reaching further down
       * the road keeps the pool long rather than a disc under the nose. */
      const l = new THREE.SpotLight(0xfff2e0, 118, 44, Math.PI / 5.6, 0.80, 1.30);
      l.position.set(2.5, 0.55, zx);
      const tgt = new THREE.Object3D();
      tgt.position.set(18, 0.1, zx);
      h.add(l, tgt);
      l.target = tgt;
      /* the indirect: light coming back UP off wet asphalt onto the valance,
         bumper and the underside of the mirrors. Without it a night car
         floats, because nothing lights it from below. */
      const spill = new THREE.PointLight(0xffe9c8, 5, 12, 2);
      spill.position.set(6.2, 0.28, zx * 0.6);
      h.add(spill);
      // lamp glow visible from outside
      const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._softDot(), color: 0xf2f6ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      gs.material.color.multiplyScalar(2.4);   // a headlamp is the brightest thing on the road
      gs.scale.setScalar(0.5);
      gs.position.set(2.62, 0.58, zx);
      gs.material.opacity = 0;
      h.add(gs);
      /* Gated by viewing angle, like the flare below it. Sitting 15 cm
       * inside the nose these two discs were showing THROUGH the
       * coachwork from the chase camera — two hard-edged blisters on the
       * roof of the motor car, and the thing that kept reappearing in
       * every frame however the lighting was rebalanced. Whatever lets
       * them win the depth test against the grille, the honest fix is the
       * same one the flare already uses: you cannot see the glare off a
       * headlamp from behind the car, so it is not drawn from behind the
       * car. */
      (this.headGlows = this.headGlows || []).push(gs.material);
      // anamorphic flare — only visible from in front of the car, so it
      // appears in bumper/roadside/oncoming angles and never from behind
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._flareTex(), color: 0xdce9ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      }));
      flare.scale.set(9, 0.55, 1);
      flare.position.set(2.7, 0.58, zx);

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

    /* Kept low. These sit centimetres from modelled cabin fittings — the
     * rear-view mirror above all — and at the old 2.4 the mirror's back was
     * taking nearly ten units of irradiance and reading, through the rear
     * screen, as a hard white disc floating on the roof of the motor car.
     * The seated cameras run two thirds of a stop hotter than the exterior
     * ones anyway, so the cabin loses nothing by being lit gently. */
    const main = new THREE.PointLight(0xffcf9a, 0.9, 3.0, 2);
    main.position.set(-0.25, 0.95, 0);
    g.add(main);

    // door-casing washes, one per side, cooler and dimmer
    for (const dz of [-0.78, 0.78]) {
      const wash = new THREE.PointLight(0xffb877, 0.45, 1.8, 2);
      wash.position.set(-0.15, 0.78, dz);
      g.add(wash);
    }
    // the instrument binnacle throws a little light back at the driver
    const dash = new THREE.PointLight(0xbcd4ff, 0.45, 1.3, 2);
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
    if (this.skyMat) this.skyMat.uniforms.uTime.value = t;

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
    this._time = t;
  }

  /*
   * Called from the render loop immediately before the composer runs, since
   * it needs the camera in its final, spring-settled position for the frame.
   * The projection matrix is handed to the road straight afterwards — a
   * frame late and every reflection lags the camera by one step, which reads
   * as the whole road sliding.
   */
  renderReflection(renderer, scene, camera) {
    if (this.phase !== "riding" || !this.visible) return;
    this.reflection.update(renderer, scene, camera);
    syncPlanarReflection(this.roadMat, this.reflection, this._time || 0);
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

    // camera-inertia pitch: +accel leans back, braking dips the nose. Kept
    // gentle and clamped tight — a big pitch swing read as the car lifting.
    const pitchTarget = THREE.MathUtils.clamp(accel * 2.0, -0.28, 0.28) * m.inertia;
    this._pitch += (pitchTarget - this._pitch) * 0.045;

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
    for (const tw of this.rideTowers) recycle(tw, this.rideTowers, 21 + Math.random() * 8);
    for (const bl of this.rideBlocks) recycle(bl, this.rideBlocks, 13 + Math.random() * 6);
    for (const p of this.railPosts) recycle(p, this.railPosts, 16);
    for (const p of this.puddles) recycle(p, this.puddles, 26 + Math.random() * 34);
    for (const t of this.ridePalms) recycle(t, this.ridePalms, 34);

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
        const b = lp.userData.baseOpacity;
        lp.userData.head.color.setRGB(k * 2.6 * m.lamp, k * 2.2 * m.lamp, k * 1.6 * m.lamp);
        lp.userData.layers.forEach((o, li) => {
          o.material.opacity = b[li] * k * (this._wetGain ?? 1);
        });
      }
    }

    /*
     * Hand the four real SpotLights to the four lamps nearest the car. The
     * lamps stream past continuously, so anything static would light one
     * patch of road forever; re-parenting each frame means the pool of
     * light travels down the boulevard with us and the kerb, the palms and
     * the car's own flank all pass through it.
     */
    if (this.lampLights.length) {
      const near = this._lampSort || (this._lampSort = []);
      near.length = 0;
      for (const lp of this.rideLamps) if (lp.position.z > -70 && lp.position.z < 34) near.push(lp);
      near.sort((a, b2) => Math.abs(a.position.z - 4) - Math.abs(b2.position.z - 4));
      for (let i = 0; i < this.lampLights.length; i++) {
        const sl = this.lampLights[i];
        const lp = near[i];
        if (!lp || this._inTunnel) { sl.intensity = 0; continue; }
        const side = lp.userData.side;
        sl.position.set(lp.position.x - side * 1.8, 6.05, lp.position.z);
        sl.target.position.set(lp.position.x - side * 4.4, 0, lp.position.z + 1.5);
        sl.target.updateMatrixWorld();
        // fade in as it arrives and out as it leaves, so nothing pops
        const edge = Math.min(1, (lp.position.z + 70) / 22) * Math.min(1, (34 - lp.position.z) / 16);
        sl.intensity = 88 * m.lamp * Math.max(0, edge) * (lp.userData.warm ?? 1);
      }
    }

    this._updateSetPieces(flow, dt, t);

    // far city + water drift by slowly (parallax)
    this.farCity.position.z = (this.farCity.position.z + flow * 0.22) % 220;

    for (const s of this.waterStreaks) {
      s.position.z += flow * 0.4;
      if (s.position.z > 20) s.position.z = -430;
      s.material.opacity = (0.09 + 0.09 * Math.abs(Math.sin(t * 1.4 + s.userData.ph)));
    }

    // ---- traffic ----
    // Wheels that do not turn are the first thing to give a vehicle away, so
    // every hub is rolled at the rate its own contact patch is travelling.
    const roll = (c, metres) => {
      const w = c.userData.wheels;
      if (!w) return;
      const a = metres / c.userData.wheelR;
      for (const h of w) h.rotation.x -= a;
    };

    for (const c of this.traffic) {
      const d = flow + c.userData.speed * dt;
      c.position.z += d;
      roll(c, -d);                                   // coming at us: rolls the other way
      if (c.position.z > 26) {
        c.position.z = -300 - Math.random() * 160;
        c.position.x = ONCOMING_X + (Math.random() < 0.5 ? 0 : 2.4);
        c.userData.speed = 24 + Math.random() * 12;
      }
    }
    for (const c of this.sameWay) {
      const d = flow * 0.3;                          // we are slowly overtaking
      c.position.z += d;
      roll(c, d + flow * 0.7);
      if (c.position.z > 30) c.position.z = -260 - Math.random() * 140;
    }

    const ld = flow - this.speed * dt * 0.36;
    this.leader.position.z += ld;
    roll(this.leader, flow);
    if (this.leader.position.z > -18) this.leader.position.z = -150;
    if (this.leader.position.z < -190) this.leader.position.z = -140;

    /*
     * The leader's brake lights. It brakes when it is closing on us — which
     * happens naturally as our speed varies — and every so often for the
     * traffic it can see and we cannot. A tail lamp that never changes is
     * the tell that nothing ahead of us is really being driven.
     */
    const wantBrake = ld > 0.06 || Math.sin(this._rideT * 0.37) > 0.93 ? 1 : 0;
    this._leadBrake += (wantBrake - this._leadBrake) * (wantBrake ? 0.35 : 0.09);
    const b = this._leadBrake, tail = this.leader.userData.tail;
    if (tail) {
      tail.bar.color.setRGB((0.85 + 0.15 * b) * 2.2, (0.14 + 0.2 * b) * 2.2, (0.1 + 0.14 * b) * 2.2);
      tail.strip?.color.setRGB((0.56 + 0.4 * b) * 2.6, (0.09 + 0.16 * b) * 2.6, (0.06 + 0.1 * b) * 2.6);
      for (const gm of tail.glares) gm.opacity = 0.62 + 0.34 * b;
    }

    // speed streaks
    const sp = this.streaks.geometry.attributes.position.array;
    for (let i = 0; i < this._streakZ.length; i++) {
      sp[i * 3 + 2] += flow * 2.4 * this._streakZ[i];
      if (sp[i * 3 + 2] > 3) { sp[i * 3 + 2] = -240; sp[i * 3] = (Math.random() - 0.5) * 24; }
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.streaks.material.opacity = Math.min(0.30, 0.06 + this.speed * 0.0019);

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

    /*
     * The key rig follows the car across the lane. Without this the gold
     * side light stays put while the car steers out from under it, and the
     * highlight that should be travelling down the flank sits still.
     */
    if (activeCar) {
      const cx = activeCar.group.position.x;
      this.key.target.position.x = cx;
      this.key.position.x = cx + 14.6;
      this.key2.target.position.x = cx;
      this.key2.position.x = cx - 9.9;
      this.key.target.updateMatrixWorld();
      this.key2.target.updateMatrixWorld();
      /* The area sources are the shopfronts and the river, so they hold
       * their real world positions — but they must keep AIMING at the car,
       * or the soft bar of light slides off the flank the moment it
       * steers. */
      this.shopWall.lookAt(cx, 0.85, this.shopWall.position.z);
      this.riverWall.lookAt(cx, 1.05, this.riverWall.position.z);
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
      // the body pitches only slightly on the springs; it must not appear to
      // leave the road. The vertical float is a millimetre-scale breathe.
      g.rotation.x = -this._pitch * 0.16;
      g.position.y = CAR_Y + Math.sin(this._rideT * 1.7) * m.float * 0.5 + Math.sin(this._rideT * 18) * 0.0015 * (this.speed / 120);
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
  _updateSetPieces(flow, dt = 1 / 60, t = 0) {
    if (!this.tunnel) return;

    for (const piece of [this.tunnel, this.bridge]) {
      // both are long enough now that the car is still on them at z = 60;
      // recycling only once the trailing end has cleared the rear cameras
      piece.position.z += flow;
      if (piece.position.z > 150) piece.position.z -= EVENT_GAP;
    }

    // the car sits at world z = 0, so the tunnel contains us when its
    // centre is within half a tunnel length of the origin
    const tz = this.tunnel.position.z;
    const carLocal = -tz;                       // where we are along the bore
    const half = TUNNEL_LEN / 2;
    const inside = Math.abs(tz) < half;
    if (inside !== this._inTunnel) {
      this._inTunnel = inside;
      if (this.onTunnel) this.onTunnel(inside);
      // the sky no longer reaches us; drop the moon key while enclosed
      gsap.to(this.rim, { intensity: inside ? 0.12 : 0.55, duration: 0.5 });
    }

    /*
     * The strobe. Four pooled lights are re-seated each frame onto the
     * luminaire runs nearest the car, so the sodium sweeps down the
     * bodywork instead of sitting still — this, and not the lamps
     * themselves, is what the eye reads as speed inside a tunnel. They
     * fade up over the last stretch of approach so the mouth glows before
     * we reach it, and they light nothing at all once we are back outside.
     */
    const near = Math.abs(carLocal) < half + 70;
    for (let i = 0; i < this.tunnelLamps.length; i++) {
      const pl = this.tunnelLamps[i];
      if (!near) { pl.intensity = 0; continue; }
      const z = THREE.MathUtils.clamp(carLocal - 24 + i * 15, -half + 2, half - 2);
      pl.position.z = z;
      pl.position.x = (i % 2 ? 1 : -1) * 5.2;
      // a lamp only counts while we are within a few metres of the bore
      const reach = THREE.MathUtils.clamp(1 - (Math.abs(carLocal) - half) / 46, 0, 1);
      pl.intensity = 34 * reach;
    }

    // one luminaire run is failing, as one always is — a slow stutter that
    // catches the eye without becoming a strobe effect
    if (this.tunnelStrips) {
      const fail = 0.62 + 0.38 * (Math.sin(t * 21) > -0.55 ? 1 : 0.15);
      this.tunnelStrips[0].material.opacity = 0.16 * fail;
      this.tunnelStrips[1].material.opacity = 0.2 * fail;
    }

    // jet fans turning, and the light lock at each mouth brightening as we
    // close on it — the transition, not a cut
    for (let i = 0; i < (this.tunnelFans || []).length; i++) {
      this.tunnelFans[i].rotation.z += dt * (i % 2 ? 7.5 : -6.2);
    }
    if (this.tunnelMouths) {
      for (let i = 0; i < this.tunnelMouths.length; i++) {
        const mouthZ = (i === 0 ? -1 : 1) * (half - 1.5);
        const d = Math.abs(carLocal - mouthZ);
        this.tunnelMouths[i].material.opacity = 0.12 + 0.42 * THREE.MathUtils.clamp(1 - d / 55, 0, 1);
      }
    }

    /*
     * Street furniture inside a set piece has to go. A lamp column
     * standing in the bore or a tower growing through the bridge deck is
     * the one thing that gives away that these are props sliding past.
     */
    const tLo = tz - half - 6, tHi = tz + half + 6;
    const bz = this.bridge.position.z, bHalf = this.bridgeHalf || 105;
    const bLo = bz - bHalf, bHi = bz + bHalf;
    const clear = (o) => {
      const z = o.position.z;
      return !((z > tLo && z < tHi) || (z > bLo && z < bHi));
    };
    for (const lp of this.rideLamps) lp.visible = clear(lp);
    for (const t of this.ridePalms) t.visible = clear(t);
    for (const tw of this.rideTowers) tw.visible = clear(tw);
    for (const bl of this.rideBlocks) bl.visible = clear(bl);
    for (const p of this.railPosts) p.visible = clear(p);

    // ---- the bridge, lit ----
    const onBridge = Math.abs(bz) < bHalf;
    if (this.bridgeUplights) {
      // sodium floods washing the pylons, with the faint unsteadiness of a
      // discharge lamp; they only earn their brightness at close range
      const k = THREE.MathUtils.clamp(1 - (Math.abs(bz) - bHalf) / 120, 0.25, 1);
      for (let i = 0; i < this.bridgeUplights.length; i++) {
        this.bridgeUplights[i].material.opacity = k * (0.34 + 0.06 * Math.sin(t * 3.1 + i * 1.7));
      }
    }
    if (this.bridgeNav) {
      for (let i = 0; i < this.bridgeNav.length; i++) {
        this.bridgeNav[i].material.opacity = 0.35 + 0.45 * (Math.sin(t * 1.6 + i) > 0.2 ? 1 : 0.2);
      }
    }
    if (this.bridgeBeacons) {
      // aviation lights on the masts, out of step with each other as real
      // pairs always are
      for (let i = 0; i < this.bridgeBeacons.length; i++) {
        this.bridgeBeacons[i].material.opacity = Math.sin(t * 2.1 + i * 1.9) > 0.55 ? 0.95 : 0.05;
      }
    }
    if (onBridge !== this._onBridge) {
      this._onBridge = onBridge;
      // out over the water the moon is unobstructed again
      gsap.to(this.rim, { intensity: onBridge ? 0.85 : 0.55, duration: 0.9 });
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
