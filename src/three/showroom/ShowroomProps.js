import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/*
 * Curated contents of the atelier: the exhibit platform, brand signage,
 * heritage gallery, bespoke material displays, and designer furniture.
 * Furniture is deliberately low, soft-edged and floating (shadow gaps),
 * in the manner of Minotti / B&B Italia pieces.
 */
export class ShowroomProps {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._materials();
    this._plinth();
    this._signageWall();
    this._heritageFrames();
    this._materialsWall();
    this._lounge();
    this._consultation();
    this._reception();
    this._spiritVitrine();
    this._objects();
    this._planters();
  }

  setVisible(value) { this.group.visible = value; }

  update(t, turn = 0) {
    if (this.plinthTop) this.plinthTop.rotation.y = turn;
    if (this.kinOuter) { this.kinOuter.rotation.y = t * 0.3; this.kinInner.rotation.x = t * -0.5; }
  }
  // Back-compat alias (Showroom may still call this).
  updateKineticSculpture(t) { this.update(t, this.plinthTop ? this.plinthTop.rotation.y : 0); }

  /* ------------------------------------------------ materials */
  _materials() {
    this.honedBlack = new THREE.MeshPhysicalMaterial({ color: 0x121311, roughness: 0.34, metalness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 0.9 });
    this.glossBlack = new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, roughness: 0.12, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
    this.travertine = new THREE.MeshStandardMaterial({ map: this._travertineTexture(), color: 0xbfb6a4, roughness: 0.72 });
    this.walnut = new THREE.MeshPhysicalMaterial({ color: 0x543b26, roughness: 0.32, metalness: 0.04, clearcoat: 0.2 });
    this.bronze = new THREE.MeshStandardMaterial({ color: 0x8d7047, roughness: 0.24, metalness: 0.95, envMapIntensity: 1.3 });
    this.cognac = new THREE.MeshPhysicalMaterial({ color: 0x6e4a2f, roughness: 0.58, metalness: 0, sheen: 0.4, sheenColor: 0x8a6a4a, envMapIntensity: 0.5 });
    this.cream = new THREE.MeshPhysicalMaterial({ color: 0xcfc8b8, roughness: 0.62, metalness: 0, sheen: 0.35, sheenColor: 0xf2ead8, envMapIntensity: 0.45 });
    this.charcoalFabric = new THREE.MeshStandardMaterial({ color: 0x33322f, roughness: 0.92 });
    this.glass = new THREE.MeshPhysicalMaterial({ color: 0xd6dcda, roughness: 0.04, metalness: 0.02, transmission: 0.72, thickness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    this.led = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    this.paper = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.9 });
  }

  addBox(size, pos, mat, container = this.group, rounded = 0) {
    const geo = rounded > 0 ? new RoundedBoxGeometry(...size, 3, rounded) : new THREE.BoxGeometry(...size);
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...pos);
    o.castShadow = o.receiveShadow = true;
    container.add(o);
    return o;
  }

  /* ------------------------------------------------ exhibit platform */
  _plinth() {
    const g = new THREE.Group(); g.position.set(0, 0, -0.3); this.group.add(g);
    // Honed black stone base with a gentle chamfer.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.62, 0.14, 120), this.honedBlack);
    base.position.y = 0.07; base.receiveShadow = true; base.castShadow = false; g.add(base);
    // Bronze fillet at the top edge.
    const fillet = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.018, 10, 140), this.bronze);
    fillet.rotation.x = Math.PI / 2; fillet.position.y = 0.145; g.add(fillet);
    // Recessed LED ring washing the marble around the platform.
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(4.66, 0.012, 8, 140), this.led);
    glowRing.rotation.x = Math.PI / 2; glowRing.position.y = 0.022; glowRing.castShadow = false; g.add(glowRing);
    // Rotating gloss top — turns with the car.
    this.plinthTop = new THREE.Mesh(new THREE.CylinderGeometry(4.34, 4.34, 0.025, 120), this.glossBlack);
    this.plinthTop.position.y = 0.155; this.plinthTop.receiveShadow = true; g.add(this.plinthTop);
    // Subtle radial brush pattern on the top via polar texture.
    this.plinthTop.material = this.plinthTop.material.clone();
    this.plinthTop.material.map = this._radialBrushTexture();
  }

  /* ------------------------------------------------ signage on the rear gallery wall */
  _signageWall() {
    // Backlit monogram + wordmark, as on the marque's own showroom walls.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 4.4),
      new THREE.MeshStandardMaterial({
        map: this._signTexture(), emissiveMap: this._signTexture(), emissive: 0xfff6e8,
        emissiveIntensity: 0.5, color: 0x090a0b, roughness: 0.4,
      })
    );
    sign.position.set(0, 4.1, -26.72);
    this.group.add(sign);
  }

  /* ------------------------------------------------ heritage gallery */
  _heritageFrames() {
    // Two framed works flank the monogram in the rear gallery, two more on the
    // main-hall screen wall piers — curated, individually lit.
    const spots = [
      { pos: [-9.6, 3.7, -26.78], ry: 0, idx: 0 },
      { pos: [9.6, 3.7, -26.78], ry: 0, idx: 1 },
      { pos: [-13.9, 3.9, -20.2], ry: Math.PI / 2, idx: 2 },
      { pos: [13.9, 3.9, -20.2], ry: -Math.PI / 2, idx: 3 },
    ];
    for (const { pos, ry, idx } of spots) {
      const unit = new THREE.Group();
      unit.position.set(...pos); unit.rotation.y = ry; this.group.add(unit);
      this.addBox([4.7, 3.1, 0.12], [0, 0, 0], this.glossBlack, unit);
      this.addBox([4.5, 2.9, 0.05], [0, 0, 0.05], this.bronze, unit);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(4.26, 2.66),
        new THREE.MeshStandardMaterial({ map: this._artTexture(idx), roughness: 0.55 })
      );
      art.position.z = 0.085; unit.add(art);
      // Slim bronze picture light.
      this.addBox([2.4, 0.06, 0.16], [0, 1.72, 0.16], this.bronze, unit);
      const glow = this.addBox([2.2, 0.02, 0.05], [0, 1.68, 0.18], this.led, unit);
      glow.castShadow = false;
      // Label plaque.
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.28),
        new THREE.MeshStandardMaterial({ map: this._labelTexture(["1904 · THE MEETING", "THE SPIRIT OF ECSTASY", "COACHBUILT WITHOUT LIMIT", "THE ARCHITECTURE OF SILENCE"][idx]), roughness: 0.5 })
      );
      label.position.set(0, -1.86, 0.08); unit.add(label);
    }
  }

  /* ------------------------------------------------ bespoke materials wall (left) */
  _materialsWall() {
    // Two illuminated display cases proud of the walnut wall: paint & veneer, leather & thread.
    for (const [zc, kind] of [[4, "paint"], [11.5, "leather"]]) {
      const caseG = new THREE.Group(); caseG.position.set(-15.45, 0, zc); this.group.add(caseG);
      this.addBox([0.5, 3.6, 4.9], [0, 2.15, 0], this.glossBlack, caseG);
      // Warm backlit rear panel.
      const back = this.addBox([0.04, 3.2, 4.5], [0.24, 2.15, 0], this.led, caseG);
      back.material = new THREE.MeshBasicMaterial({ color: 0xffedd2 });
      back.castShadow = false;
      // Shelves.
      for (const y of [1.15, 2.15, 3.15]) this.addBox([0.42, 0.03, 4.5], [0.03, y, 0], this.bronze, caseG);
      // Specimens.
      if (kind === "paint") {
        const paints = [0x1c2e4a, 0x0b0b0e, 0xe8e6df, 0x0e2b20, 0x5c0f16, 0x9aa3ab, 0x2a1a33, 0x6b5836];
        paints.forEach((hex, i) => {
          const y = 1.35 + Math.floor(i / 4) * 1.0, z = -1.6 + (i % 4) * 1.06;
          const chip = this.addBox([0.05, 0.6, 0.42], [0.16, y, z], new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.85, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }), caseG, 0.02);
          chip.rotation.z = -0.12;
        });
        // Veneer fan on the top shelf.
        for (let i = 0; i < 5; i++) {
          const leafV = this.addBox([0.04, 0.5, 0.34], [0.16, 3.44, -0.9 + i * 0.44], new THREE.MeshPhysicalMaterial({ color: [0x4a2c18, 0x141417, 0xb9a88a, 0x5c3a20, 0x2e2018][i], roughness: 0.25, clearcoat: 0.7 }), caseG, 0.015);
          leafV.rotation.x = 0.16 * (i - 2);
        }
      } else {
        const hides = [0xded8ca, 0x22406b, 0xb0723a, 0x8f1d22, 0x4a4e54, 0x2c2620, 0x74604a, 0x9c9384];
        hides.forEach((hex, i) => {
          const y = 1.32 + Math.floor(i / 4) * 1.0, z = -1.6 + (i % 4) * 1.06;
          this.addBox([0.09, 0.5, 0.5], [0.14, y, z], new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.62, sheen: 0.5, sheenColor: 0xffffff }), caseG, 0.045);
        });
        // Thread spools on top shelf.
        for (let i = 0; i < 6; i++) {
          const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 14), new THREE.MeshStandardMaterial({ color: [0xc9b98a, 0x30425e, 0x7a2a28, 0x3c3c3c, 0xa8825c, 0x6a7a6a][i], roughness: 0.8 }));
          spool.position.set(0.14, 3.42, -1.35 + i * 0.55); spool.castShadow = true; caseG.add(spool);
        }
      }
      // Case title.
      const title = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.3),
        new THREE.MeshStandardMaterial({ map: this._labelTexture(kind === "paint" ? "COACHWORK · VENEER" : "HIDE · THREAD"), roughness: 0.5 })
      );
      title.rotation.y = Math.PI / 2; title.position.set(0.27, 4.05, 0); caseG.add(title);
    }
  }

  /* ------------------------------------------------ lounge by the glazing */
  _lounge() {
    const g = new THREE.Group(); g.position.set(11.6, 0, 10.6); g.rotation.y = Math.PI / 2 + 0.18; this.group.add(g);
    // Rug grounds the composition.
    const rug = this.addBox([6.2, 0.015, 4.4], [0, 0.01, 0], new THREE.MeshStandardMaterial({ color: 0x494439, roughness: 1 }), g);
    rug.castShadow = false;
    // Long low sofa: floating base, three soft seat modules, low back.
    const sofa = new THREE.Group(); sofa.position.set(0, 0, -1.45); g.add(sofa);
    this.addBox([4.3, 0.16, 1.15], [0, 0.18, 0], this.honedBlack, sofa);        // plinth (shadow gap)
    this.addBox([4.42, 0.24, 1.28], [0, 0.4, 0], this.charcoalFabric, sofa, 0.06); // frame
    for (let i = -1; i <= 1; i++) this.addBox([1.36, 0.2, 1.1], [i * 1.42, 0.58, 0.04], this.cream, sofa, 0.07);
    for (let i = -1; i <= 1; i++) this.addBox([1.3, 0.5, 0.24], [i * 1.4, 0.86, -0.5], this.cream, sofa, 0.08);
    this.addBox([0.26, 0.44, 1.16], [-2.2, 0.66, 0], this.charcoalFabric, sofa, 0.08);
    this.addBox([0.26, 0.44, 1.16], [2.2, 0.66, 0], this.charcoalFabric, sofa, 0.08);
    // Two cognac leather armchairs opposite.
    for (const [px, ry] of [[-1.35, 2.6], [1.35, -2.6 + Math.PI * 2]]) this._armchair(g, [px, 0, 1.5], Math.PI + ry * 0.14);
    // Travertine drum coffee table + curated objects.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.34, 64), this.travertine);
    drum.position.set(0, 0.26, 0.15); drum.castShadow = drum.receiveShadow = true; g.add(drum);
    this.addBox([0.5, 0.035, 0.36], [-0.15, 0.46, 0.1], this.paper, g, 0.01);
    this.addBox([0.44, 0.035, 0.32], [-0.12, 0.5, 0.12], this.cognac, g, 0.01).rotation.y = 0.22;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), this.bronze);
    bowl.rotation.x = Math.PI; bowl.position.set(0.38, 0.5, 0.2); g.add(bowl);
    // Bronze arc floor lamp with a warm shade.
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 32), this.honedBlack);
    lampBase.position.set(-2.9, 0.03, 0.9); g.add(lampBase);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.02, 8, 48, Math.PI * 0.52), this.bronze);
    arc.position.set(-2.9, 0.06, 0.9); arc.rotation.z = Math.PI * 0.46; arc.rotation.y = Math.PI / 2 * 0 + 0; g.add(arc);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.22, 32, 1, true), this.glossBlack);
    shade.position.set(-1.55, 1.52, 0.9); g.add(shade);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), this.led);
    bulb.position.set(-1.55, 1.42, 0.9); bulb.castShadow = false; g.add(bulb);
  }

  _armchair(container, pos, angle) {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = angle; container.add(g);
    this.addBox([1.02, 0.14, 0.94], [0, 0.16, 0], this.honedBlack, g);
    this.addBox([1.06, 0.3, 0.98], [0, 0.38, 0], this.cognac, g, 0.09);
    this.addBox([0.94, 0.16, 0.86], [0, 0.56, 0.02], this.cognac, g, 0.07);
    this.addBox([0.96, 0.56, 0.22], [0, 0.72, -0.38], this.cognac, g, 0.09);
    this.addBox([0.2, 0.34, 0.9], [-0.44, 0.6, 0], this.cognac, g, 0.08);
    this.addBox([0.2, 0.34, 0.9], [0.44, 0.6, 0], this.cognac, g, 0.08);
    return g;
  }

  /* ------------------------------------------------ consultation under the mezzanine */
  _consultation() {
    const g = new THREE.Group(); g.position.set(-11.8, 0, -9.6); this.group.add(g);
    // Walnut worktable with a stone top.
    this.addBox([2.9, 0.68, 1.3], [0, 0.36, 0], this.walnut, g);
    this.addBox([3.05, 0.05, 1.42], [0, 0.73, 0], this.travertine, g);
    // A fanned set of bespoke swatches on the table.
    for (let i = 0; i < 9; i++) {
      const sw = this.addBox([0.3, 0.02, 0.2], [-0.9 + (i % 5) * 0.42, 0.77, -0.28 + Math.floor(i / 5) * 0.44], new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.05 + i * 0.09, 0.32, 0.3 + (i % 3) * 0.14), roughness: 0.72 }), g, 0.008);
      sw.rotation.y = (i % 4) * 0.12;
    }
    this._armchair(g, [-1.1, 0, 1.35], 0.5);
    this._armchair(g, [1.1, 0, 1.35], -0.5);
    // Pendant.
    const pend = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.1, 48), this.glossBlack);
    pend.position.set(0, 4.3, 0); g.add(pend);
    const pendLight = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.015, 48), this.led);
    pendLight.position.set(0, 4.24, 0); pendLight.castShadow = false; g.add(pendLight);
  }

  /* ------------------------------------------------ reception near the entry */
  _reception() {
    const g = new THREE.Group(); g.position.set(-11.6, 0, 16.4); g.rotation.y = -0.5; this.group.add(g);
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.75, 1.02, 64, 1, false, 0, Math.PI * 1.2), this.walnut);
    desk.position.y = 0.51; desk.rotation.y = -0.6; desk.castShadow = desk.receiveShadow = true; g.add(desk);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 1.98, 0.05, 64, 1, false, 0, Math.PI * 1.2), this.travertine);
    top.position.y = 1.06; top.rotation.y = -0.6; g.add(top);
    const reveal = new THREE.Mesh(new THREE.CylinderGeometry(1.76, 1.76, 0.02, 64, 1, false, 0, Math.PI * 1.2), this.led);
    reveal.position.y = 0.04; reveal.rotation.y = -0.6; reveal.castShadow = false; g.add(reveal);
    // Marble slab with orchid.
    this.addBox([0.9, 0.5, 0.9], [2.4, 0.25, -0.8], this.travertine, g);
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 20), this.glossBlack);
    vase.position.set(2.4, 0.65, -0.8); g.add(vase);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x3c5238, roughness: 0.8 }));
    stem.position.set(2.4, 1.05, -0.8); stem.rotation.z = 0.2; g.add(stem);
    for (let i = 0; i < 5; i++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 }));
      bloom.position.set(2.32 + Math.sin(i * 2.1) * 0.08, 1.18 + i * 0.06, -0.8 + Math.cos(i * 1.8) * 0.08);
      bloom.scale.set(1.4, 0.5, 1.1); g.add(bloom);
    }
  }

  /* ------------------------------------------------ Spirit of Ecstasy vitrine */
  _spiritVitrine() {
    const g = new THREE.Group(); g.position.set(6.9, 0, -11.6); this.group.add(g);
    // Stone pedestal with bronze reveal and glass case.
    this.addBox([0.95, 1.15, 0.95], [0, 0.575, 0], this.honedBlack, g);
    this.addBox([0.99, 0.03, 0.99], [0, 1.17, 0], this.bronze, g);
    const caseGlass = this.addBox([0.85, 1.0, 0.85], [0, 1.7, 0], this.glass, g);
    caseGlass.castShadow = false;
    // Etched, backlit silhouette of the figurine.
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.78),
      new THREE.MeshStandardMaterial({
        map: this._spiritTexture(), emissiveMap: this._spiritTexture(),
        emissive: 0xffedd2, emissiveIntensity: 0.85, transparent: true, side: THREE.DoubleSide,
      })
    );
    panel.rotation.y = -Math.PI / 4; panel.position.set(0, 1.62, 0); g.add(panel);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.015, 24), this.led);
    under.position.set(0, 1.19, 0); under.castShadow = false; g.add(under);
  }

  /* ------------------------------------------------ curated objects + kinetic piece */
  _objects() {
    // Kinetic bronze rings near the entry glazing.
    const g = new THREE.Group(); g.position.set(13.8, 0, 18.2); this.group.add(g);
    this.addBox([0.8, 1.5, 0.8], [0, 0.75, 0], this.honedBlack, g);
    this.kinOuter = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.03, 10, 72), this.bronze);
    this.kinOuter.position.y = 2.0; this.kinOuter.rotation.x = 0.35; g.add(this.kinOuter);
    this.kinInner = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 10, 64), this.cream);
    this.kinInner.position.y = 2.0; this.kinInner.rotation.z = 0.8; g.add(this.kinInner);

    // Vitrine pair along the left wall: timepiece and decanter.
    for (const [z, kind] of [[-2.5, "watch"], [-5.5, "decanter"]]) {
      const v = new THREE.Group(); v.position.set(-14.6, 0, z); this.group.add(v);
      this.addBox([0.7, 1.05, 0.7], [0, 0.52, 0], this.glossBlack, v);
      this.addBox([0.74, 0.025, 0.74], [0, 1.06, 0], this.bronze, v);
      const cg = this.addBox([0.6, 0.7, 0.6], [0, 1.45, 0], this.glass, v);
      cg.castShadow = false;
      if (kind === "watch") {
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 32), this.cream);
        face.rotation.x = Math.PI / 2.6; face.position.set(0, 1.36, 0); v.add(face);
        const bez = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 10, 40), this.bronze);
        bez.rotation.x = Math.PI / 2.6 + Math.PI / 2; bez.position.set(0, 1.36, 0); v.add(bez);
        const strap = this.addBox([0.07, 0.26, 0.02], [0, 1.2, 0.08], this.cognac, v, 0.008);
        strap.rotation.x = -0.5;
      } else {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 18), this.glass);
        body.position.set(0, 1.28, 0); body.scale.set(1, 1.25, 1); v.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.18, 16), this.glass);
        neck.position.set(0, 1.5, 0); v.add(neck);
        const stopper = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), this.bronze);
        stopper.position.set(0, 1.62, 0); v.add(stopper);
        const whisky = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0x7a4515, roughness: 0.1, transmission: 0.5, transparent: true, opacity: 0.85 }));
        whisky.position.set(0, 1.25, 0); whisky.scale.set(1, 1.1, 1); v.add(whisky);
      }
    }
  }

  /* ------------------------------------------------ interior planting, sparse */
  _planters() {
    for (const [x, z, ry] of [[-13.6, 19.2, 0.4], [14.2, -11.8, 2.2]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; this.group.add(g);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.72, 40), this.honedBlack);
      pot.position.y = 0.36; pot.castShadow = true; g.add(pot);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.1, 8), new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 0.9 }));
      trunk.position.y = 1.6; trunk.rotation.z = 0.08; g.add(trunk);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x42523c, roughness: 0.85 });
      for (let i = 0; i < 7; i++) {
        const cluster = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + (i % 3) * 0.13, 1), leafMat);
        cluster.position.set(Math.sin(i * 2.4) * 0.42 + 0.1, 2.5 + (i % 4) * 0.28, Math.cos(i * 1.9) * 0.4);
        cluster.scale.set(1.3, 0.55, 1.05); cluster.rotation.y = i * 1.2; cluster.castShadow = true;
        g.add(cluster);
      }
    }
  }

  /* ------------------------------------------------ canvas textures */
  _travertineTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#bdb4a1"; x.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 3) {
      x.fillStyle = `rgba(${120 + Math.random() * 30 | 0},${110 + Math.random() * 26 | 0},${92 + Math.random() * 22 | 0},${0.12 + Math.random() * 0.14})`;
      x.fillRect(0, y, 256, 1.4);
    }
    for (let i = 0; i < 340; i++) {
      x.fillStyle = `rgba(88,78,62,${Math.random() * 0.2})`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.4, 0.9);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  _radialBrushTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = "#141517"; x.fillRect(0, 0, 512, 512);
    x.translate(256, 256);
    for (let i = 0; i < 720; i++) {
      x.rotate(Math.PI / 360);
      x.strokeStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(30, 0); x.lineTo(256, 0); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _signTexture() {
    if (this._signTex) return this._signTex;
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = "#08090a"; x.fillRect(0, 0, 1024, 512);
    x.fillStyle = "#efe9dd"; x.textAlign = "center";
    // Interlocked RR monogram.
    x.font = "150px Georgia";
    x.save(); x.globalAlpha = 0.95; x.fillText("R", 488, 210); x.fillText("R", 536, 230); x.restore();
    x.strokeStyle = "rgba(239,233,221,.85)"; x.lineWidth = 2.4;
    x.strokeRect(408, 76, 208, 178);
    // Wordmark.
    x.font = "58px Georgia"; x.letterSpacing = "18px";
    x.fillText("ROLLS-ROYCE", 512, 366);
    x.font = "26px Georgia"; x.letterSpacing = "12px";
    x.fillStyle = "#b7a475";
    x.fillText("MOTOR CARS", 512, 428);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this._signTex = t; return t;
  }

  _spiritTexture() {
    if (this._spiritTex) return this._spiritTex;
    const c = document.createElement("canvas"); c.width = 256; c.height = 320;
    const x = c.getContext("2d");
    x.clearRect(0, 0, 256, 320);
    x.strokeStyle = "rgba(255,240,214,.9)"; x.lineWidth = 2.2; x.lineCap = "round";
    // Flowing, wing-back figure suggested in a few strokes.
    x.beginPath(); x.moveTo(96, 288);
    x.bezierCurveTo(108, 220, 116, 170, 128, 120);
    x.bezierCurveTo(134, 92, 142, 66, 152, 52); x.stroke();
    x.beginPath(); x.moveTo(128, 120);
    x.bezierCurveTo(160, 120, 206, 150, 224, 210);
    x.bezierCurveTo(196, 186, 166, 172, 138, 172); x.stroke();
    x.beginPath(); x.moveTo(152, 52); x.bezierCurveTo(160, 44, 168, 40, 176, 40); x.stroke();
    x.beginPath(); x.moveTo(96, 288); x.bezierCurveTo(120, 292, 150, 292, 172, 286); x.stroke();
    const t = new THREE.CanvasTexture(c); this._spiritTex = t; return t;
  }

  _labelTexture(text) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 84;
    const x = c.getContext("2d");
    x.fillStyle = "#111210"; x.fillRect(0, 0, 512, 84);
    x.strokeStyle = "rgba(183,164,117,.5)"; x.strokeRect(6, 6, 500, 72);
    x.fillStyle = "#cfc4a8"; x.font = "22px Georgia"; x.textAlign = "center"; x.textBaseline = "middle";
    x.letterSpacing = "6px";
    x.fillText(text, 256, 44);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _artTexture(index) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 320;
    const x = c.getContext("2d");
    const palettes = [["#20282e", "#0b0d0e"], ["#2a2118", "#0d0b08"], ["#1c2620", "#090c0a"], ["#26222c", "#0b0a0e"]];
    const grad = x.createLinearGradient(0, 0, 512, 320);
    grad.addColorStop(0, palettes[index][0]); grad.addColorStop(1, palettes[index][1]);
    x.fillStyle = grad; x.fillRect(0, 0, 512, 320);
    x.strokeStyle = "rgba(216,194,148,.75)"; x.lineWidth = 1.6; x.lineCap = "round";
    if (index === 1) {
      // Spirit of Ecstasy flowing lines.
      x.beginPath(); x.moveTo(200, 280); x.bezierCurveTo(226, 190, 240, 130, 268, 84); x.stroke();
      x.beginPath(); x.moveTo(268, 84); x.bezierCurveTo(320, 96, 380, 150, 402, 232); x.stroke();
      x.beginPath(); x.moveTo(268, 84); x.bezierCurveTo(300, 110, 330, 160, 336, 220); x.stroke();
    } else {
      // Coachwork silhouette studies.
      x.beginPath(); x.moveTo(50, 226);
      x.bezierCurveTo(120, 150 + index * 12, 190, 218, 268, 190);
      x.bezierCurveTo(346, 140, 408, 196, 468, 168); x.stroke();
      for (let i = 0; i < 2; i++) { x.beginPath(); x.arc(150 + i * 190, 232, 34, 0, Math.PI * 2); x.stroke(); }
    }
    x.fillStyle = "#ddd6c6"; x.font = "17px Georgia"; x.letterSpacing = "3px";
    x.fillText(["1904 — THE BEGINNING", "A SPIRIT IN FLIGHT", "BESPOKE WITHOUT LIMIT", "THE POWER OF STILLNESS"][index], 36, 44);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
}
