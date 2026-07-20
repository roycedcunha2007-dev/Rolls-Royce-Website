import * as THREE from "three";

export class ShowroomDrive {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.speed = 0;
    this.targetX = 0;
    this.targetRoll = 0;
    this.rpm = 800;

    this._buildHighway();
    this._buildStarPoints();
    this._buildSpeedParticles();
  }

  setVisible(visible, activeCar) {
    this.visible = visible;
    this.highway.visible = visible;
    this.speedParticles.visible = visible;
    this.starPoints.visible = visible;

    if (visible && activeCar) {
      this._setupHeadlights(activeCar);
      if (activeCar.headlights) activeCar.headlights.visible = true;
      this.speed = 0;
    } else if (activeCar && activeCar.headlights) {
      activeCar.headlights.visible = false;
    }
  }

  _buildHighway() {
    this.highway = new THREE.Group();
    this.highway.visible = false;

    const roadGeo = new THREE.PlaneGeometry(6.5, 90);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x07080a, // dark midnight asphalt
      roughness: 0.85,
      metalness: 0.1,
    });

    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.008;
    road.receiveShadow = true;
    this.highway.add(road);

    // Dotted white highway center line stripes
    this.stripes = [];
    const stripeGeo = new THREE.BoxGeometry(0.09, 0.012, 1.7);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    for (let i = 0; i < 16; i++) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 0.015, -32 + i * 4.2);
      this.highway.add(stripe);
      this.stripes.push(stripe);
    }

    this.scene.add(this.highway);
  }

  _buildStarPoints() {
    const starCount = 380;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    const opacities = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      // Semi-spherical distribution above horizon
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8); // restrict towards upper hemisphere
      const dist = 55 + Math.random() * 30;

      pos[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = dist * Math.cos(phi) + 1.0;
      pos[i * 3 + 2] = dist * Math.sin(phi) * Math.sin(theta);

      opacities[i] = 0.2 + Math.random() * 0.8;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("opacity", new THREE.BufferAttribute(opacities, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        attribute float opacity;
        varying float vO;
        void main() {
          vO = opacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (14.0 / -mvPosition.z) * (0.8 + 0.45 * sin(uTime * 1.5 + position.x));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vO;
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.98, 0.92, (1.0 - d * 2.0) * vO);
        }
      `,
    });

    this.starPoints = new THREE.Points(geo, mat);
    this.starPoints.visible = false;
    this.scene.add(this.starPoints);
  }

  _buildSpeedParticles() {
    const pCount = 200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    this.pSpeed = new Float32Array(pCount);

    for (let i = 0; i < pCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8.0;
      pos[i * 3 + 1] = 0.05 + Math.random() * 3.5;
      pos[i * 3 + 2] = -60 + Math.random() * 68;
      this.pSpeed[i] = 0.72 + Math.random() * 0.45;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (12.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          gl_FragColor = vec4(0.85, 0.92, 1.0, (1.0 - d * 2.0) * 0.16);
        }
      `,
    });

    this.speedParticles = new THREE.Points(geo, mat);
    this.speedParticles.visible = false;
    this.scene.add(this.speedParticles);
  }

  _setupHeadlights(active) {
    if (!active || active.headlights) return;

    const hGroup = new THREE.Group();

    // Left headlight beam
    const lLight = new THREE.SpotLight(0xfff5ea, 35, 30, Math.PI / 5.5, 0.4, 1.2);
    lLight.position.set(2.4, 0.48, -0.78);

    const lTarget = new THREE.Object3D();
    lTarget.position.set(12.4, 0.0, -0.78);
    hGroup.add(lLight, lTarget);
    lLight.target = lTarget;
    lLight.castShadow = true;

    // Right headlight beam
    const rLight = new THREE.SpotLight(0xfff5ea, 35, 30, Math.PI / 5.5, 0.4, 1.2);
    rLight.position.set(2.4, 0.48, 0.78);

    const rTarget = new THREE.Object3D();
    rTarget.position.set(12.4, 0.0, 0.78);
    hGroup.add(rLight, rTarget);
    rLight.target = rTarget;
    rLight.castShadow = true;

    active.headlights = hGroup;
    active.group.add(hGroup);
  }

  update(dt, t, activeCar) {
    if (!this.visible || !activeCar) return;

    // Physics update
    this.speed += (92.0 + Math.sin(t * 0.7) * 12 - this.speed) * 0.02;
    this.rpm = 1800 + (this.speed / 130) * 2400 + Math.sin(t * 3) * 120;

    const g = activeCar.group;
    g.position.x += (this.targetX - g.position.x) * 0.06;
    g.rotation.z += (this.targetRoll - g.rotation.z) * 0.07;
    g.position.y = Math.sin(t * 24) * 0.005;

    const roadSpeed = this.speed * 0.0032;

    // Animate highway stripes
    for (const s of this.stripes) {
      s.position.z += roadSpeed;
      if (s.position.z > 34) s.position.z = -34;
    }

    // Animate speed particles
    const pp = this.speedParticles.geometry.attributes.position.array;
    for (let i = 0; i < this.pSpeed.length; i++) {
      pp[i * 3 + 2] += roadSpeed * 2.4 * this.pSpeed[i];
      if (pp[i * 3 + 2] > 8) pp[i * 3 + 2] = -60;
    }
    this.speedParticles.geometry.attributes.position.needsUpdate = true;

    // Animate wheels
    for (const w of activeCar.wheelPivots) w.rotation.z -= roadSpeed * 2.2;

    // Animate stars twinkles
    if (this.starPoints && this.starPoints.material.uniforms) {
      this.starPoints.material.uniforms.uTime.value = t;
    }
  }
}
