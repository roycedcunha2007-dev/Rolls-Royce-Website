import * as THREE from "three";

/*
 * The architectural shell of the atelier.
 *
 * Plan (metres):
 *   Main hall      x ∈ [-16, 16], z ∈ [-13.6, 21], ceiling 9.6
 *   Rear gallery   x ∈ [-14, 14], z ∈ [-27, -13.6], ceiling 7.8 (the sanctuary room)
 *   Garden         x > 16.6 beyond the full-height glazing
 *   Mezzanine      left rear corner, y = 5.0
 *
 * The car front faces +x. The camera lives mostly in the +x / +z quadrant.
 */
export class ShowroomArchitecture {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._materials();
    this._hall();
    this._rearGallery();
    this._ceiling();
    this._mezzanine();
    this._garden();
  }

  setVisible(value) { this.group.visible = value; }

  /* ------------------------------------------------ materials */
  _materials() {
    this.plaster = new THREE.MeshStandardMaterial({ map: this._plasterTexture(), color: 0xd6d1c6, roughness: 0.94, metalness: 0 });
    this.ceilingMat = new THREE.MeshStandardMaterial({ color: 0xdfdacf, roughness: 0.96, metalness: 0 });
    this.graphite = new THREE.MeshPhysicalMaterial({ color: 0x101113, roughness: 0.24, metalness: 0.62, clearcoat: 0.7, clearcoatRoughness: 0.14, envMapIntensity: 1.15 });
    this.graphiteMatte = new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.62, metalness: 0.28 });
    this.walnut = new THREE.MeshPhysicalMaterial({ map: this._walnutTexture(), color: 0x8a6844, roughness: 0.34, metalness: 0.04, clearcoat: 0.22, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
    this.limestone = new THREE.MeshStandardMaterial({ map: this._stoneTexture(), color: 0xbcb6a8, roughness: 0.82, metalness: 0.02 });
    this.bronze = new THREE.MeshStandardMaterial({ color: 0x8d7047, roughness: 0.26, metalness: 0.96, envMapIntensity: 1.25 });
    this.darkBronze = new THREE.MeshStandardMaterial({ color: 0x453a2c, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.9 });
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0xc9d4d0, roughness: 0.03, metalness: 0.05, transmission: 0.62, thickness: 0.2,
      transparent: true, opacity: 0.24, side: THREE.DoubleSide, envMapIntensity: 1.2,
    });
    this.glow = new THREE.MeshBasicMaterial({ color: 0xffe9c4, toneMapped: false });
    this.softGlow = new THREE.MeshBasicMaterial({ color: 0xf3e2c4 });
    this.water = new THREE.MeshPhysicalMaterial({ color: 0x0a1411, roughness: 0.045, metalness: 0.72, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 });
    this.lawn = new THREE.MeshStandardMaterial({ color: 0x24382b, roughness: 0.95 });
    this.hedge = new THREE.MeshStandardMaterial({ color: 0x28422f, roughness: 0.9 });
    this.foliage = new THREE.MeshStandardMaterial({ color: 0x263826, roughness: 0.96 });
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x3c362e, roughness: 0.94 });
  }

  box(size, pos, material, group = this.group, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...pos);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  /* ------------------------------------------------ main hall */
  _hall() {
    // ---- Left wall (x = -16): full-height walnut with bronze reveals and plaster upper band.
    this.box([0.5, 9.6, 36], [-16.25, 4.8, 3.2], this.plaster);
    // Walnut panelling in rhythm — tall boards with recessed bronze shadow gaps.
    for (let z = -13; z <= 20; z += 2.24) {
      this.box([0.16, 7.4, 2.04], [-15.95, 3.7, z], this.walnut);
      this.box([0.1, 7.4, 0.1], [-15.94, 3.7, z + 1.12], this.graphiteMatte, this.group, false);
    }
    // Continuous bronze cornice + LED reveal above panelling.
    this.box([0.2, 0.14, 34.5], [-15.9, 7.46, 3.2], this.bronze, this.group, false);
    const wash = this.box([0.05, 0.05, 33.5], [-15.86, 7.36, 3.2], this.glow, this.group, false);
    wash.castShadow = false;
    // Plinth skirting.
    this.box([0.22, 0.35, 36], [-15.92, 0.18, 3.2], this.graphiteMatte, this.group, false);

    // ---- Right glazing (x = +16): slender bronze mullions, continuous glass.
    const facade = new THREE.Group(); facade.position.set(16, 0, 0); this.group.add(facade);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(48, 9.6), this.glass);
    pane.rotation.y = -Math.PI / 2; pane.position.set(0, 4.8, -3); facade.add(pane);
    for (let z = -27; z <= 21; z += 3.2) this.box([0.16, 9.6, 0.1], [0.02, 4.8, z], this.darkBronze, facade);
    this.box([0.2, 0.24, 48], [0, 9.5, -3], this.darkBronze, facade);
    this.box([0.24, 0.16, 48], [0, 0.08, -3], this.darkBronze, facade);

    // ---- Front wall (z = +21): glazing beside a stone entry portal.
    this.box([33, 9.6, 0.4], [0, 4.8, 21.2], this.limestone);
    const entry = new THREE.Group(); entry.position.set(-6, 0, 21); this.group.add(entry);
    this.box([7.2, 8.6, 0.7], [0, 4.3, -0.05], this.graphite, entry);
    this.box([6.2, 7.8, 0.2], [0, 3.9, 0.18], this.graphiteMatte, entry, false);
    this.box([0.18, 7.8, 0.3], [-3.05, 3.9, 0.3], this.bronze, entry, false);
    this.box([0.18, 7.8, 0.3], [3.05, 3.9, 0.3], this.bronze, entry, false);
    this.box([6.4, 0.18, 0.3], [0, 7.85, 0.3], this.bronze, entry, false);

    // ---- Rear screen wall (z = -13.6) with the central portal to the sanctuary gallery.
    // Two flanking graphite panels + deep bronze portal frame.
    this.box([11.2, 9.6, 0.55], [-10.6, 4.8, -13.6], this.plaster);
    this.box([11.2, 9.6, 0.55], [10.6, 4.8, -13.6], this.plaster);
    this.box([10.1, 2.5, 0.55], [0, 8.35, -13.6], this.plaster);
    // Portal reveal — layered bronze + graphite depth.
    const portal = new THREE.Group(); portal.position.set(0, 0, -13.6); this.group.add(portal);
    this.box([0.5, 7.1, 1.1], [-5.05, 3.55, 0], this.graphite, portal);
    this.box([0.5, 7.1, 1.1], [5.05, 3.55, 0], this.graphite, portal);
    this.box([10.6, 0.5, 1.1], [0, 7.05, 0], this.graphite, portal);
    this.box([0.12, 6.8, 0.14], [-4.72, 3.4, 0.58], this.bronze, portal, false);
    this.box([0.12, 6.8, 0.14], [4.72, 3.4, 0.58], this.bronze, portal, false);
    this.box([9.6, 0.12, 0.14], [0, 6.74, 0.58], this.bronze, portal, false);
    // Concealed warm light inside the portal soffit.
    const soffit = this.box([9.2, 0.04, 0.06], [0, 6.64, 0.4], this.glow, portal, false);
    soffit.castShadow = false;

    // ---- Fluted graphite feature panels flanking the portal (wall treatment).
    for (const sx of [-1, 1]) {
      const panel = new THREE.Group(); panel.position.set(sx * 10.6, 0, -13.28); this.group.add(panel);
      for (let x = -4.4; x <= 4.4; x += 0.44) {
        const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.9, 10, 1, false, Math.PI, Math.PI), this.graphite);
        flute.position.set(x, 3.45, 0); flute.rotation.y = Math.PI;
        flute.castShadow = false; flute.receiveShadow = true;
        panel.add(flute);
      }
      this.box([9.4, 0.16, 0.3], [0, 6.98, 0.02], this.bronze, panel, false);
      this.box([9.4, 0.24, 0.34], [0, 0.12, 0.02], this.graphiteMatte, panel, false);
    }
  }

  /* ------------------------------------------------ rear sanctuary gallery */
  _rearGallery() {
    const g = new THREE.Group(); this.group.add(g);
    // Envelope — darker, more intimate.
    this.box([28.6, 7.8, 0.5], [0, 3.9, -27.2], this.graphiteMatte, g);   // rear wall base
    this.box([0.5, 7.8, 14], [-14.2, 3.9, -20.4], this.graphiteMatte, g); // left
    this.box([0.5, 7.8, 14], [14.2, 3.9, -20.4], this.graphiteMatte, g);  // right
    // Gallery ceiling with a single long cove.
    this.box([28.6, 0.4, 14], [0, 7.9, -20.4], this.graphiteMatte, g, false);
    const cove = this.box([22, 0.05, 0.08], [0, 7.66, -16.2], this.glow, g, false);
    cove.castShadow = false;

    // Rear feature wall: black gloss panels with bronze seams (signage added by props).
    for (let x = -13; x <= 13; x += 2.6) {
      this.box([2.44, 7.2, 0.18], [x, 3.6, -26.85], this.graphite, g, false);
      this.box([0.06, 7.2, 0.2], [x + 1.28, 3.6, -26.84], this.darkBronze, g, false);
    }
  }

  /* ------------------------------------------------ ceiling */
  _ceiling() {
    // Main slab with a deep recessed tray above the exhibit.
    const shape = new THREE.Shape();
    shape.moveTo(-16.3, -13.6); shape.lineTo(16.3, -13.6); shape.lineTo(16.3, 21); shape.lineTo(-16.3, 21); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-7.5, -6.4); hole.lineTo(7.5, -6.4); hole.lineTo(7.5, 5.4); hole.lineTo(-7.5, 5.4); hole.closePath();
    shape.holes.push(hole);
    const slabGeo = new THREE.ShapeGeometry(shape, 4);
    const slab = new THREE.Mesh(slabGeo, this.ceilingMat);
    slab.rotation.x = Math.PI / 2; slab.position.y = 9.6;
    slab.receiveShadow = true;
    this.group.add(slab);

    // The tray itself — raised, warm-lit perimeter cove. Its inner faces carry a
    // faint emissive warmth so the recess reads as light-filled, not raw grey.
    this.trayMat = new THREE.MeshStandardMaterial({ color: 0xe8dfd0, roughness: 0.9, emissive: 0xffe9cd, emissiveIntensity: 0.34 });
    this.box([15.4, 0.2, 12.2], [0, 10.42, -0.5], this.trayMat, this.group, false);
    // Tray sides.
    this.box([15.0, 0.9, 0.18], [0, 10.0, -6.3], this.trayMat, this.group, false);
    this.box([15.0, 0.9, 0.18], [0, 10.0, 5.3], this.trayMat, this.group, false);
    this.box([0.18, 0.9, 11.8], [-7.4, 10.0, -0.5], this.trayMat, this.group, false);
    this.box([0.18, 0.9, 11.8], [7.4, 10.0, -0.5], this.trayMat, this.group, false);
    // Cove light strips hidden at the tray lip.
    for (const [size, pos] of [
      [[14.4, 0.05, 0.08], [0, 9.72, -6.12]],
      [[14.4, 0.05, 0.08], [0, 9.72, 5.12]],
      [[0.08, 0.05, 11.2], [-7.22, 9.72, -0.5]],
      [[0.08, 0.05, 11.2], [7.22, 9.72, -0.5]],
    ]) {
      const s = this.box(size, pos, this.glow, this.group, false);
      s.castShadow = false;
    }

    // Recessed downlight discs — the quiet grid from the reference photograph.
    const trim = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.4 });
    const discGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14);
    const ringGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.015, 14);
    for (let x = -13; x <= 13; x += 3.4) {
      for (let z = -12; z <= 19; z += 3.1) {
        if (Math.abs(x) < 8.6 && z > -7.4 && z < 6.4) continue; // skip tray zone
        const ring = new THREE.Mesh(ringGeo, trim);
        ring.position.set(x, 9.585, z); ring.castShadow = false;
        const disc = new THREE.Mesh(discGeo, this.softGlow);
        disc.position.set(x, 9.578, z); disc.castShadow = false;
        this.group.add(ring, disc);
      }
    }
  }

  /* ------------------------------------------------ mezzanine + stair */
  _mezzanine() {
    const g = new THREE.Group(); this.group.add(g);
    // Floating slab over the consultation corner.
    this.box([7.6, 0.42, 8.2], [-12.2, 5.0, -9.4], this.graphiteMatte, g);
    this.box([7.6, 0.05, 0.1], [-12.2, 4.76, -5.32], this.glow, g, false).castShadow = false;
    // Walnut soffit ribs under the slab.
    for (let x = -15.6; x <= -8.8; x += 0.62) this.box([0.16, 0.14, 7.8], [x, 4.72, -9.4], this.walnut, g, false);
    // Glass balustrade with bronze capping.
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.05), this.glass);
    rail.position.set(-12.2, 5.75, -5.35); g.add(rail);
    this.box([7.6, 0.07, 0.1], [-12.2, 6.3, -5.35], this.bronze, g, false);
    const rail2 = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 1.05), this.glass);
    rail2.rotation.y = Math.PI / 2; rail2.position.set(-8.45, 5.75, -9.4); g.add(rail2);
    this.box([0.1, 0.07, 8.2], [-8.45, 6.3, -9.4], this.bronze, g, false);

    // Stone stair, floating treads with a bronze stringer, rising along the left wall.
    for (let i = 0; i < 15; i++) {
      const tread = this.box([1.5, 0.11, 0.62], [-14.9, 0.32 + i * 0.31, -0.2 - i * 0.5], this.limestone, g);
      tread.castShadow = true;
      this.box([1.4, 0.02, 0.05], [-14.9, 0.26 + i * 0.31, -0.48 - i * 0.5], this.glow, g, false).castShadow = false;
    }
    const hand = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 8.6, 10), this.bronze);
    hand.position.set(-14.12, 3.5, -3.9); hand.rotation.x = Math.PI / 2 + 0.55; g.add(hand);
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.95, 8), this.darkBronze);
      post.position.set(-14.12, 0.82 + i * 0.93, -0.35 - i * 1.5); g.add(post);
    }
  }

  /* ------------------------------------------------ garden (entirely x > 16.6) */
  _garden() {
    const g = new THREE.Group(); this.group.add(g);
    // Ground plane.
    const lawnMesh = new THREE.Mesh(new THREE.PlaneGeometry(46, 72), this.lawn);
    lawnMesh.rotation.x = -Math.PI / 2; lawnMesh.position.set(39.5, -0.05, -3); lawnMesh.receiveShadow = true; g.add(lawnMesh);
    // Stone apron directly outside the glazing.
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 50), this.limestone.clone());
    apron.rotation.x = -Math.PI / 2; apron.position.set(18.2, 0.005, -3); apron.receiveShadow = true; g.add(apron);

    // Long reflecting pool parallel to the glazing.
    this.box([5.6, 0.28, 34], [22.9, -0.05, -3], this.limestone, g);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 33.4), this.water);
    water.rotation.x = -Math.PI / 2; water.position.set(22.9, 0.115, -3); g.add(water);
    // Three quiet fountain discs down the pool's centre line.
    for (const z of [-13, -3, 7]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 32), this.limestone);
      disc.position.set(22.9, 0.18, z); g.add(disc);
    }

    // Clipped hedge bands beyond the pool.
    for (let z = -19; z <= 13; z += 8) {
      this.box([1.4, 0.85, 5.8], [27.3, 0.42, z], this.hedge, g);
      this.box([1.1, 0.55, 3.6], [30.2, 0.27, z + 3.4], this.hedge, g);
    }
    // Stone pathway slabs leading to the pavilion.
    for (let x = 26.5; x < 41; x += 1.7) this.box([1.3, 0.07, 2.2], [x, 0.02, 4.5 + Math.sin(x * 0.55) * 0.4], this.limestone, g, false);

    // Sculptural specimen trees — irregular layered canopies, kept far from the glass.
    const treeSpots = [[31, -13, 5.6], [36, 6, 6.6], [42, -4, 7.2], [33, 14, 5.2], [45, 12, 6.0], [46, -18, 6.6]];
    treeSpots.forEach(([x, z, h], idx) => {
      const tree = new THREE.Group(); tree.position.set(x, 0, z); tree.rotation.y = idx * 1.3; g.add(tree);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.17, h, 8), this.trunkMat);
      trunk.position.y = h / 2; trunk.castShadow = true; tree.add(trunk);
      const lean = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h * 0.55, 7), this.trunkMat);
      lean.position.set(0.32, h * 0.62, 0.1); lean.rotation.z = -0.5; tree.add(lean);
      for (let i = 0; i < 9; i++) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + (i % 4) * 0.28, 1), this.foliage);
        crown.position.set(
          Math.sin(i * 2.1) * (0.9 + (i % 3) * 0.5),
          h * 0.72 + Math.cos(i * 1.4) * h * 0.16,
          Math.cos(i * 2.6) * (0.8 + (i % 2) * 0.55)
        );
        crown.scale.set(1.35, 0.62, 1.1); crown.rotation.set(i, i * 0.6, 0);
        crown.castShadow = true; tree.add(crown);
      }
    });

    // A distant stone pavilion gives the landscape architectural depth.
    const pav = new THREE.Group(); pav.position.set(44, 0, -14); g.add(pav);
    this.box([7, 3.4, 5], [0, 1.7, 0], this.limestone, pav);
    this.box([8.2, 0.3, 6.2], [0, 3.55, 0], this.graphiteMatte, pav);
    this.box([2.2, 2.4, 0.2], [0, 1.2, 2.55], this.graphite, pav, false);

    // Painted countryside horizon, unaffected by fog.
    const horizon = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 34),
      new THREE.MeshBasicMaterial({ map: this._horizonTexture(), fog: false, toneMapped: false })
    );
    horizon.position.set(64, 12, -6); horizon.rotation.y = -Math.PI / 2; g.add(horizon);

    // Front court beyond the entry glazing (z > 21): gravel + hedges + trees.
    const court = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), this.lawn);
    court.rotation.x = -Math.PI / 2; court.position.set(-4, -0.04, 35); g.add(court);
    for (const [x, z] of [[-12, 26], [-2, 28], [8, 25.5]]) this.box([5.4, 1.0, 1.5], [x, 0.5, z], this.hedge, g);
    const horizonN = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 30),
      new THREE.MeshBasicMaterial({ map: this._horizonTexture(), fog: false, toneMapped: false })
    );
    horizonN.position.set(0, 10, 52); horizonN.rotation.y = Math.PI; g.add(horizonN);
  }

  /* ------------------------------------------------ canvas textures */
  _plasterTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#d8d3c8"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(${100 + Math.random() * 40 | 0},${98 + Math.random() * 40 | 0},${90 + Math.random() * 38 | 0},${Math.random() * 0.05})`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); return t;
  }

  _stoneTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = "#b9b4a6"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      x.fillStyle = `rgba(70,68,60,${Math.random() * 0.07})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 2.4, Math.random() * 2.4);
    }
    x.strokeStyle = "rgba(88,84,74,.35)"; x.lineWidth = 1.2;
    for (let i = 0; i <= 512; i += 128) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
    for (let i = 0; i <= 512; i += 256) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.5, 2.5); return t;
  }

  _walnutTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 1024;
    const x = c.getContext("2d");
    const base = x.createLinearGradient(0, 0, 256, 0);
    base.addColorStop(0, "#4d3722"); base.addColorStop(0.5, "#5a4128"); base.addColorStop(1, "#48331f");
    x.fillStyle = base; x.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 62; i++) {
      const px = i * 4.2 + Math.random() * 6;
      x.strokeStyle = `rgba(${26 + Math.random() * 30 | 0},${16 + Math.random() * 20 | 0},${8 + Math.random() * 12 | 0},${0.24 + Math.random() * 0.3})`;
      x.lineWidth = 0.8 + Math.random() * 1.6;
      x.beginPath(); x.moveTo(px, 0);
      x.bezierCurveTo(px + 9, 300 + Math.random() * 80, px - 9, 620 + Math.random() * 90, px + Math.random() * 10 - 5, 1024);
      x.stroke();
    }
    // Occasional cathedral figure.
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = "rgba(30,19,10,.3)"; x.lineWidth = 1.4;
      const cy = 160 + i * 240 + Math.random() * 60;
      for (let r = 8; r < 46; r += 9) {
        x.beginPath(); x.ellipse(128 + (i % 2) * 40 - 20, cy, r * 0.55, r * 1.9, 0, 0, Math.PI * 2); x.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); return t;
  }

  _horizonTexture() {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const x = c.getContext("2d");
    // Soft overcast English sky, warm at the horizon line.
    const sky = x.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#8fa0a8"); sky.addColorStop(0.5, "#b8bcae");
    sky.addColorStop(0.72, "#c9c3ac"); sky.addColorStop(1, "#5d7263");
    x.fillStyle = sky; x.fillRect(0, 0, 1024, 512);
    // Rolling downs in three receding layers.
    for (let layer = 0; layer < 3; layer++) {
      x.fillStyle = `rgba(${40 - layer * 7},${60 - layer * 6},${46 - layer * 5},${0.35 + layer * 0.2})`;
      x.beginPath(); x.moveTo(0, 512);
      for (let px = 0; px <= 1024; px += 16) {
        const y = 360 - layer * 26 + Math.sin(px * 0.008 + layer * 5) * 26 + Math.sin(px * 0.025 + layer * 2) * 9;
        x.lineTo(px, y);
      }
      x.lineTo(1024, 512); x.closePath(); x.fill();
      // Tree clumps on each ridge.
      for (let i = 0; i < 15; i++) {
        const px = Math.random() * 1024;
        const py = 358 - layer * 26 + Math.sin(px * 0.008 + layer * 5) * 26;
        x.fillStyle = `rgba(${30 - layer * 5},${46 - layer * 5},${34 - layer * 4},${0.5 + layer * 0.16})`;
        x.beginPath(); x.ellipse(px, py, 14 + Math.random() * 22, 9 + Math.random() * 10, 0, 0, Math.PI * 2); x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
}
