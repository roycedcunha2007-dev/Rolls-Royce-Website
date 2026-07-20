import * as THREE from "three";

/*
 * Polished Calacatta marble floor with true planar reflections.
 * A mirrored camera renders the scene into a target which is projected into a
 * MeshPhysicalMaterial, so the floor still receives shadows, spotlights and
 * clearcoat response — the reflection is blended in, glossy but not mirror-like.
 */
export class ShowroomFloor {
  constructor(scene) {
    this.scene = scene;

    this.renderTarget = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.reflectCamera = new THREE.PerspectiveCamera();
    this.reflectPlane = new THREE.Plane();
    this.normal = new THREE.Vector3();
    this.coplanarPoint = new THREE.Vector3();
    this.textureMatrix = new THREE.Matrix4();

    this.marbleTexture = this._calacattaTexture();

    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xcdc8bc,
      map: this.marbleTexture,
      roughness: 0.16,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.55,
    });

    const scope = this;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.tDiffuse = { value: scope.renderTarget.texture };
      shader.uniforms.textureMatrix = { value: scope.textureMatrix };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec4 vReflectUv;
         uniform mat4 textureMatrix;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vReflectUv = textureMatrix * vec4( transformed, 1.0 );`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying vec4 vReflectUv;
         uniform sampler2D tDiffuse;`
      );
      // Clamp the reflection: HDR spikes here would otherwise smear through bloom.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         vec4 reflectCol = texture2DProj( tDiffuse, vReflectUv );
         reflectCol.rgb = clamp(reflectCol.rgb, vec3(0.0), vec3(2.5));
         diffuseColor.rgb = mix(diffuseColor.rgb, reflectCol.rgb, 0.30);`
      );
    };

    // Interior slab only — the garden has its own ground.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(32.6, 49), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, -0.001, -3.4);
    this.mesh.receiveShadow = true;

    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      scope.update(renderer, scene, camera);
    };

    scene.add(this.mesh);
  }

  update(renderer, scene, camera) {
    if (renderer.currentRenderTarget !== null) return;

    this.normal.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    this.coplanarPoint.copy(this.mesh.position);
    this.reflectPlane.setFromNormalAndCoplanarPoint(this.normal, this.coplanarPoint);
    this.reflectPlane.applyMatrix4(camera.matrixWorldToLocal);

    const n = this.reflectPlane.normal, k = this.reflectPlane.constant;
    const reflectionMatrix = new THREE.Matrix4().set(
      1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, -2 * n.x * k,
      -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, -2 * n.y * k,
      -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, -2 * n.z * k,
      0, 0, 0, 1
    );

    this.reflectCamera.copy(camera);
    this.reflectCamera.projectionMatrix.copy(camera.projectionMatrix);
    this.reflectCamera.matrixWorld.copy(camera.matrixWorld).multiply(reflectionMatrix);
    this.reflectCamera.matrixWorldInverse.copy(this.reflectCamera.matrixWorld).invert();

    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(this.reflectCamera.projectionMatrix);
    this.textureMatrix.multiply(this.reflectCamera.matrixWorldInverse);
    this.textureMatrix.multiply(this.mesh.matrixWorld);

    this.mesh.visible = false;
    const currentRenderTarget = renderer.getRenderTarget();
    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowMapEnabled = renderer.shadowMap.enabled;

    renderer.xr.enabled = false;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(this.renderTarget);
    renderer.state.bindTexture(renderer.context.TEXTURE_2D, null);
    renderer.clear();
    renderer.render(scene, this.reflectCamera);

    renderer.setRenderTarget(currentRenderTarget);
    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.enabled = currentShadowMapEnabled;
    this.mesh.visible = true;
  }

  _calacattaTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const x = c.getContext("2d");

    // Warm cream base with subtle tonal drift.
    const base = x.createLinearGradient(0, 0, 1024, 1024);
    base.addColorStop(0, "#e7e2d6");
    base.addColorStop(0.45, "#ded9cc");
    base.addColorStop(1, "#e4dfd2");
    x.fillStyle = base; x.fillRect(0, 0, 1024, 1024);

    // Soft grey clouding.
    for (let i = 0; i < 42; i++) {
      const gx = Math.random() * 1024, gy = Math.random() * 1024, r = 70 + Math.random() * 190;
      const cloud = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      cloud.addColorStop(0, `rgba(158,156,148,${0.05 + Math.random() * 0.06})`);
      cloud.addColorStop(1, "rgba(158,156,148,0)");
      x.fillStyle = cloud; x.beginPath(); x.arc(gx, gy, r, 0, Math.PI * 2); x.fill();
    }

    // Primary diagonal veins — broad, soft, directional like true Calacatta.
    const vein = (startX, startY, drift, width, alpha, warm) => {
      x.strokeStyle = warm
        ? `rgba(168,146,108,${alpha})`
        : `rgba(120,122,118,${alpha})`;
      x.lineWidth = width;
      x.beginPath();
      let px = startX, py = startY;
      x.moveTo(px, py);
      while (py < 1024 + 100 && px < 1024 + 100) {
        px += 26 + Math.random() * 34 + drift;
        py += 30 + Math.random() * 42;
        x.lineTo(px + (Math.random() - 0.5) * 22, py);
      }
      x.stroke();
    };
    for (let i = 0; i < 7; i++) {
      const sx = Math.random() * 900 - 260;
      vein(sx, -40, 4, 5 + Math.random() * 8, 0.10, false);
      vein(sx + 12, -40, 4, 1.6, 0.16, false);   // dark core line inside the wide vein
      if (i % 3 === 0) vein(sx - 20, -40, 6, 2.4, 0.10, true); // gold companion
    }
    // Fine hairline web.
    x.lineWidth = 0.7;
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(130,130,124,${0.05 + Math.random() * 0.07})`;
      x.beginPath();
      let px = Math.random() * 1024, py = Math.random() * 1024;
      x.moveTo(px, py);
      for (let s = 0; s < 8; s++) {
        px += (Math.random() - 0.3) * 70; py += (Math.random() - 0.4) * 70;
        x.lineTo(px, py);
      }
      x.stroke();
    }

    // Tile seams — large-format slabs, hairline dark joints.
    x.strokeStyle = "rgba(96,92,82,.5)"; x.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 512) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5.5, 8);
    tex.anisotropy = 8;
    return tex;
  }
}
