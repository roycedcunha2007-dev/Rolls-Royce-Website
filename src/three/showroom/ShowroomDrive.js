import * as THREE from "three";
import gsap from "gsap";

/*
 * The Magic Carpet Ride — a two-act cinematic experience.
 *
 *  Act I  · PAVILION : the motor car revealed, parked on a piano-black
 *           platform inside a glass pavilion overlooking a night city.
 *           Contemplated from three cinematic angles (front · side · rear).
 *
 *  Act II · RIDE     : engine start. The car glides down a wet night
 *           boulevard through a realistic, luminous city skyline — towers
 *           streaming past, streetlights sweeping, the road unspooling ahead.
 */

const CAR_Y = 0;

export class ShowroomDrive {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.phase = "pavilion";        // "pavilion" | "riding"
    this.currentView = "side";
    this.speed = 0;
    this._rideT = 0;
    this._car = null;

    this._buildScene();
  }

  _buildScene() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this._buildSky();
    this._buildLights();
    this._buildAtmosphere();

    // Act I — pavilion
    this.pavilion = new THREE.Group();
    this.group.add(this.pavilion);
    this._buildFloor();
    this._buildPavilionArchitecture();
    this._buildCity();

    // Act II — the ride
    this.ride = new THREE.Group();
    this.ride.visible = false;
    this.group.add(this.ride);
    this._buildRide();

    this._buildViews();
  }

  /* ============================================================ SKY */
  _buildSky() {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(200, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {},
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vP;
          void main(){
            vec3 d = normalize(vP);
            float h = clamp(d.y, 0.0, 1.0);
            vec3 horizon = vec3(0.03, 0.08, 0.13);
            vec3 zenith  = vec3(0.004, 0.011, 0.024);
            vec3 col = mix(horizon, zenith, pow(h, 0.6));
            float band = exp(-pow((d.y - d.x * 0.55) * 3.4, 2.0)) * smoothstep(0.02, 0.5, h);
            col += vec3(0.10, 0.11, 0.16) * band * 0.5;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    dome.renderOrder = -2;
    this.group.add(dome);

    const n = 1300;
    const pos = new Float32Array(n * 3);
    const op = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.06, Math.random() - 0.5).normalize().multiplyScalar(190);
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
          gl_PointSize = (170.0 / -mv.z) * (0.6 + 0.4 * sin(uTime * 1.3 + position.x)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vO; void main(){ float d = distance(gl_PointCoord, vec2(0.5)); if (d>0.5) discard;
        gl_FragColor = vec4(0.9,0.94,1.0,(1.0-d*2.0)*vO); }`,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.group.add(this.stars);
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

  /* window-light facade texture, shared by pavilion + ride towers */
  _cityWindowTex() {
    const wc = document.createElement("canvas");
    wc.width = 64; wc.height = 128;
    const wg = wc.getContext("2d");
    wg.fillStyle = "#05070c";
    wg.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 6) {
      for (let x = 4; x < 64; x += 7) {
        if (Math.random() < 0.42) {
          const w = 200 + Math.random() * 55;
          wg.fillStyle = `rgba(${w}, ${w * 0.82}, ${w * 0.55}, ${0.5 + Math.random() * 0.5})`;
          wg.fillRect(x, y, 3.4, 3.2);
        }
      }
    }
    const t = new THREE.CanvasTexture(wc);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ========================================== PAVILION CITY BACKDROP */
  _buildCity() {
    const city = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x070a10, roughness: 0.85, metalness: 0.15 });
    const winTex = this._cityWindowTex();
    const litMat = new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.8, metalness: 0.2, emissive: 0xffd69a, emissiveMap: winTex, emissiveIntensity: 1.0 });

    for (let i = 0; i < 60; i++) {
      const a = -Math.PI * 0.9 + Math.random() * Math.PI * 0.95;
      const r = 40 + Math.random() * 40;
      const h = 8 + Math.random() * 42;
      const w = 2.6 + Math.random() * 5.0;
      const mat = Math.random() < 0.72 ? litMat.clone() : towerMat;
      if (mat.emissiveMap) {
        mat.emissiveMap = winTex.clone();
        mat.emissiveMap.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(2, Math.round(h / 4)));
        mat.emissiveMap.needsUpdate = true;
        mat.emissiveIntensity = 0.7 + Math.random() * 0.6;
      }
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      t.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r - 8);
      city.add(t);
    }

    const n = 1300;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.92 + Math.random() * Math.PI * 0.95;
      const r = 38 + Math.random() * 55;
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
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(cv);
  }

  /* ============================================================ RIDE */
  _buildRide() {
    // wet boulevard — a long dark road with a scrolling lane-marking texture
    this.roadTex = this._roadTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 460),
      new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.88, metalness: 0.0, map: this.roadTex, envMapIntensity: 0.05 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.002, -200);
    road.receiveShadow = true;
    this.ride.add(road);

    // wet reflective sheen down the lane centre (streaked light on tarmac)
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 460),
      new THREE.MeshBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.set(0, 0.01, -200);
    this.ride.add(sheen);

    // recycling flanking towers
    this.rideTowers = [];
    const winTex = this._cityWindowTex();
    this._ridePool(this.rideTowers, 46, (i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const h = 16 + Math.random() * 52;
      const w = 5 + Math.random() * 8;
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a0e15, roughness: 0.82, metalness: 0.2, emissive: 0xffd39a, emissiveMap: winTex.clone(), emissiveIntensity: 0.55 + Math.random() * 0.5 });
      mat.emissiveMap.repeat.set(Math.max(2, Math.round(w / 2.2)), Math.max(3, Math.round(h / 4)));
      mat.emissiveMap.needsUpdate = true;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      t.position.set(side * (13 + Math.random() * 44), h / 2, 0);
      t.userData.side = side;
      return t;
    });

    // recycling streetlights (emissive heads; a few live pools light the road)
    this.rideLamps = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.7 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    this._ridePool(this.rideLamps, 20, (i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), poleMat);
      pole.position.y = 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), poleMat);
      arm.position.set(-side * 0.8, 5.8, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.34), lampMat);
      head.position.set(-side * 1.5, 5.72, 0);
      g.add(pole, arm, head);
      g.position.set(side * 9.2, 0, 0);
      g.userData.side = side;
      return g;
    });

    // three warm pools riding ahead of the car, lighting the road surface
    this.roadPools = [];
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(0xffcf8f, 1.2, 22, 2);
      pl.position.set((i % 2 ? 1 : -1) * 3, 5.5, -6 - i * 12);
      this.ride.add(pl);
      this.roadPools.push(pl);
    }

    // luminous speed streaks skimming past for the sensation of motion
    const sc = 60;
    const spos = new Float32Array(sc * 3);
    this._streakZ = new Float32Array(sc);
    for (let i = 0; i < sc; i++) {
      spos[i * 3] = (Math.random() - 0.5) * 22;
      spos[i * 3 + 1] = 0.3 + Math.random() * 7;
      spos[i * 3 + 2] = -Math.random() * 220;
      this._streakZ[i] = 0.7 + Math.random() * 0.6;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    this.streaks = new THREE.Points(sgeo, new THREE.PointsMaterial({
      color: 0xbfd2f0, size: 0.16, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, map: this._softDot(),
    }));
    this.ride.add(this.streaks);

    // spread the recycling pools evenly down the boulevard
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
    // towers: two flanking rows marching into the distance
    let li = -430, ri = -430;
    for (const t of this.rideTowers) {
      if (t.userData.side < 0) { t.position.z = li; li += 19 + Math.random() * 8; }
      else { t.position.z = ri; ri += 19 + Math.random() * 8; }
    }
    let ll = -430, rl = -430;
    for (const g of this.rideLamps) {
      if (g.userData.side < 0) { g.position.z = ll; ll += 44; }
      else { g.position.z = rl; rl += 44; }
    }
  }

  _roadTexture() {
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 512;
    const g = cv.getContext("2d");
    g.fillStyle = "#090b10";
    g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`; g.fillRect(Math.random() * 128, Math.random() * 512, 1, 1); }
    g.fillStyle = "rgba(220,210,180,0.42)";
    g.fillRect(12, 0, 3, 512); g.fillRect(113, 0, 3, 512);
    g.fillStyle = "rgba(232,226,198,0.66)";
    for (let y = 0; y < 512; y += 64) g.fillRect(62, y, 4, 34);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 46);
    t.anisotropy = 8;
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
    this._rideCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 34 };
  }

  getViewTarget() {
    if (this.phase === "riding") {
      const s = Math.sin(this._rideT * 0.7);
      const sway = Math.sin(this._rideT * 0.9) * 0.18;
      // chase camera riding just behind and above the car, looking down the road
      this._rideCam.pos.set(2.4 + sway, 2.35 + s * 0.03, 9.8);
      this._rideCam.look.set(sway * 2.2, 1.05, -16);
      this._rideCam.fov = 34;
      return this._rideCam;
    }
    return this.views[this.currentView] || this.views.side;
  }

  setView(id) {
    if (this.phase === "pavilion" && this.views[id]) this.currentView = id;
  }

  /* ==================================================== ENGINE START */
  startRide() {
    if (this.phase === "riding") return;
    this.phase = "riding";
    this._rideT = 0;
    this.speed = 0;
    this.pavilion.visible = false;
    this.ride.visible = true;
    this._seedRide();
    if (this._car) {
      // the car turns to face down the boulevard and its lamps ignite
      gsap.to(this._car.group.rotation, { y: Math.PI / 2, duration: 1.3, ease: "power2.inOut" });
      if (this._car.headlights) this._car.headlights.visible = true;
    }
  }

  stopRide() {
    if (this.phase === "pavilion") return;
    this.phase = "pavilion";
    this.ride.visible = false;
    this.pavilion.visible = true;
    this.currentView = "side";
    this.speed = 0;
    if (this._car) {
      gsap.to(this._car.group.rotation, { y: 0, duration: 1.0, ease: "power2.inOut" });
      this._car.group.position.x = 0;
      this._car.group.rotation.z = 0;
      if (this._car.headlights) this._car.headlights.visible = false;
      for (const w of this._car.wheelPivots) w.rotation.z = 0;
    }
  }

  isRiding() { return this.phase === "riding"; }

  /* ========================================================= TOGGLE */
  setVisible(visible, activeCar) {
    this.visible = visible;
    this.group.visible = visible;
    this.phase = "pavilion";
    this.currentView = "side";
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

  /* forward-facing headlamps for the ride */
  _setupHeadlights(active) {
    if (!active || active.headlights) return;
    const h = new THREE.Group();
    for (const zx of [-0.78, 0.78]) {
      const l = new THREE.SpotLight(0xfff4e6, 40, 34, Math.PI / 6, 0.4, 1.3);
      l.position.set(2.5, 0.55, zx);
      const tgt = new THREE.Object3D();
      tgt.position.set(16, 0.2, zx);
      h.add(l, tgt);
      l.target = tgt;
    }
    h.visible = false;
    active.headlights = h;
    active.group.add(h);
  }

  /* ========================================================= UPDATE */
  update(dt, t, activeCar) {
    if (!this.visible) return;
    if (activeCar) this._car = activeCar;

    if (this.starMat) this.starMat.uniforms.uTime.value = t;

    if (this.phase === "riding") {
      this._updateRide(dt, t, activeCar);
    } else {
      this._updatePavilion(dt, t, activeCar);
    }
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
    // ease the speed up to cruising, with a living shimmer
    const cruise = 118 + Math.sin(this._rideT * 0.5) * 10;
    this.speed += (cruise - this.speed) * 0.012;
    const flow = this.speed * dt * 0.42;

    // the boulevard streams beneath the car
    if (this.roadTex) this.roadTex.offset.y = (this.roadTex.offset.y - flow * 0.11) % 1;

    // towers + streetlights sweep past and recycle behind
    const recycle = (o, gap, rows) => {
      o.position.z += flow;
      if (o.position.z > 26) {
        // find the far end on this side and place beyond it
        let far = 1e9;
        for (const q of rows) if (q.userData.side === o.userData.side) far = Math.min(far, q.position.z);
        o.position.z = far - gap;
      }
    };
    for (const tw of this.rideTowers) recycle(tw, 19, this.rideTowers);
    for (const lp of this.rideLamps) recycle(lp, 44, this.rideLamps);

    // speed streaks
    const sp = this.streaks.geometry.attributes.position.array;
    for (let i = 0; i < this._streakZ.length; i++) {
      sp[i * 3 + 2] += flow * 2.4 * this._streakZ[i];
      if (sp[i * 3 + 2] > 12) { sp[i * 3 + 2] = -220; sp[i * 3] = (Math.random() - 0.5) * 22; }
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;

    // the car sways gently in its lane, wheels spinning, body settling
    if (activeCar) {
      const lane = Math.sin(this._rideT * 0.33) * 0.55;
      activeCar.group.position.x += (lane - activeCar.group.position.x) * 0.03;
      activeCar.group.position.y = CAR_Y + Math.sin(this._rideT * 22) * 0.006;
      activeCar.group.rotation.z = -Math.cos(this._rideT * 0.33) * 0.012;
      const wheelSpin = flow * 0.9;
      for (const w of activeCar.wheelPivots) w.rotation.z -= wheelSpin;
    }
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
