import * as THREE from "three";

/*
 * PlanarReflection — a true mirrored render of the world, for the boulevard.
 *
 * Everything before this faked wet asphalt: an environment map for the base
 * sheen plus additive streak sprites locked to each light. That gets the
 * SHEEN right and the geometry of the reflection wrong — a streak sprite is
 * a decal that always faces the same way, so a tower never lengthens down
 * the road as you approach it and a tail lamp never bends when the car ahead
 * changes lane. In the reference frame the carriageway carries a genuine,
 * perspective-correct image of the city: that is the difference between
 * "shiny road" and "wet road".
 *
 * So: render the scene once more from a camera mirrored through the road
 * plane, into a half-resolution HDR target, and let the road material sample
 * it through a projection matrix. Notes on the choices:
 *
 *   · three's own Reflector is unusable here — its oblique near-plane clip
 *     produces NaN against this scene's additive shader cones under a
 *     logarithmic depth buffer, which UnrealBloomPass then smears into a
 *     black frame. This class does no projection-matrix surgery at all;
 *     anything below the water line is simply hidden for the pass.
 *   · HALF FLOAT, because the reflection must stay HDR. three disables tone
 *     mapping when rendering to a target, so the texture holds linear light
 *     and the road can add it in BEFORE its own tonemapping_fragment — a
 *     street lamp's reflection therefore blooms exactly as the lamp does.
 *   · rendered every other frame. A reflection that is blurred by roughness
 *     and rippling anyway cannot be told apart at 30 Hz, and the second
 *     scene traversal is the whole cost of the effect.
 */
export class PlanarReflection {
  constructor({ planeY = 0.0, scale = 0.5, every = 2, far = 230 } = {}) {
    this.planeY = planeY;
    this.scale = scale;
    this.every = every;
    this.far = far;
    this.enabled = true;

    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.target = null;

    this._frame = 0;
    this._hidden = [];
    this._wasVisible = [];
    this._size = new THREE.Vector2();
    this._camPos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
  }

  get texture() { return this.target ? this.target.texture : null; }

  /* Anything at or below the water line, and every flat decal lying ON the
   * carriageway: reflecting those gives a doubled, self-referential image. */
  exclude(...objs) { for (const o of objs) if (o) this._hidden.push(o); }

  /* the next update() renders regardless of the frame counter */
  force() { this._frame = 0; }

  _ensure(renderer) {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(64, Math.floor(this._size.x * this.scale));
    const h = Math.max(64, Math.floor(this._size.y * this.scale));
    if (this.target && this.target.width === w && this.target.height === h) return;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.target.texture.name = "planarReflection";
  }

  update(renderer, scene, camera) {
    if (!this.enabled) return;
    this._ensure(renderer);
    if (this._frame++ % this.every !== 0) return;

    /*
     * The mirrored camera. Reflect the eye through the plane, reflect the
     * forward and up vectors, and let lookAt rebuild an orthonormal frame
     * from them — which keeps the handedness a normal render expects, so
     * face culling and winding need no special-casing.
     */
    camera.getWorldPosition(this._camPos);
    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot);
    this._up.set(0, 1, 0).applyMatrix4(this._rot);
    this._look.y *= -1;
    this._up.y *= -1;

    const rc = this.camera;
    rc.position.set(this._camPos.x, 2 * this.planeY - this._camPos.y, this._camPos.z);
    rc.up.copy(this._up);
    this._tgt.copy(rc.position).add(this._look);
    rc.lookAt(this._tgt);
    rc.near = camera.near;
    /*
     * A SHORT far plane, and it is the whole performance story of this
     * effect. The main camera reaches 700 m so the skyline and the horizon
     * card are in frame; the mirror does not need them. Anything past a
     * couple of hundred metres reflects into the last few rows of pixels
     * at the top of a half-resolution buffer, where it is then blurred by
     * roughness and drowned by fog — so drawing the far city twice buys
     * nothing at all. Culling it here is most of the second traversal.
     */
    rc.far = Math.min(camera.far, this.far);
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld(true);

    /* world position -> [0,1] reflection UV */
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(rc.projectionMatrix);
    this.textureMatrix.multiply(rc.matrixWorldInverse);

    // ---- hide what must not appear in its own mirror ----
    this._wasVisible.length = 0;
    for (const o of this._hidden) {
      this._wasVisible.push(o.visible);
      o.visible = false;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;      // the main pass already did it
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadowAuto;

    for (let i = 0; i < this._hidden.length; i++) this._hidden[i].visible = this._wasVisible[i];
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
  }
}

/*
 * Wire a MeshStandardMaterial to sample the reflection.
 *
 * Injected rather than written as a bespoke ShaderMaterial so the road keeps
 * every bit of the standard pipeline — IBL, the street lamps' real lights,
 * shadows, and the logarithmic depth chunks a custom shader in this project
 * silently breaks on.
 *
 * Three things turn a projected texture into a wet road:
 *
 *   FRESNEL   reflectivity climbs toward grazing angles, so the image
 *             stretches away down the boulevard and all but vanishes on the
 *             tarmac directly beneath the camera. This is what makes the
 *             reflection obey perspective instead of lying flat.
 *   ROUGHNESS the same map that makes the wetness uneven also drives a
 *             vertical blur, so the wheel tracks mirror and the dry crown
 *             merely glistens. Nothing on a real street is a clean mirror.
 *   RIPPLE    a slow lateral wobble whose amplitude grows with distance from
 *             the eye, because that is where a reflection is long enough to
 *             show water moving under it.
 */
export function applyPlanarReflection(material, { reflection, strength = 1.0, blur = 1.0, ripple = 1.0 }) {
  const u = {
    tReflect: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflStrength: { value: strength },
    uReflBlur: { value: blur },
    uReflRipple: { value: ripple },
    uReflTime: { value: 0 },
  };
  material.userData.reflectUniforms = u;
  material.userData.reflection = reflection;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform mat4 uReflMatrix;
         varying vec4 vReflCoord;
         varying vec3 vReflWorld;`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vec4 reflWorld = modelMatrix * vec4(transformed, 1.0);
         vReflWorld = reflWorld.xyz;
         vReflCoord = uReflMatrix * reflWorld;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform sampler2D tReflect;
         uniform float uReflStrength, uReflBlur, uReflRipple, uReflTime;
         varying vec4 vReflCoord;
         varying vec3 vReflWorld;`
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
        {
          float w = max(vReflCoord.w, 1e-4);
          vec2 ruv = vReflCoord.xy / w;

          /* how wet this patch is. The roughness map is dark where water
             stands, so smooth == wet == reflective. The window is narrow on
             purpose: the dry crown has to fall right out of it, or the whole
             carriageway mirrors at once and reads as a flood. */
          float wet = 1.0 - smoothstep(0.42, 0.86, roughnessFactor);

          /* Fresnel off the shading normal. n.z in view space IS cos(theta)
             for a flat road, but going through vViewPosition keeps this
             honest on the camber and in the puddles. */
          vec3 vDir = normalize(vViewPosition);
          float cosT = clamp(dot(vDir, normal), 0.0, 1.0);
          float fres = 0.028 + 0.972 * pow(1.0 - cosT, 5.0);

          /* ripple: two beats, one slow and long, one fine, both scrolling
             with the road so the water reads as moving under the car */
          float far = clamp(w * 0.012, 0.0, 1.0);
          float rip = uReflRipple * (0.00018 + far * 0.00110);
          vec2 wob = vec2(
            sin(vReflWorld.z * 0.42 + uReflTime * 1.3) * rip
              + sin(vReflWorld.z * 1.9 - uReflTime * 2.1) * rip * 0.40,
            sin(vReflWorld.x * 0.9 + uReflTime * 0.9) * rip * 0.30
          );

          /* Vertical-weighted blur. Stretched along the reflection's own
             axis so highlights smear DOWN the road the way they do in
             standing water, never sideways into a smudge. */
          float b = uReflBlur * (0.0010 + roughnessFactor * 0.014) * (0.35 + far);
          vec3 refl = vec3(0.0);
          refl += texture2D(tReflect, ruv + wob).rgb                       * 0.300;
          refl += texture2D(tReflect, ruv + wob + vec2(0.0,  b)).rgb       * 0.185;
          refl += texture2D(tReflect, ruv + wob + vec2(0.0, -b)).rgb       * 0.185;
          refl += texture2D(tReflect, ruv + wob + vec2(0.0,  b * 2.3)).rgb * 0.090;
          refl += texture2D(tReflect, ruv + wob + vec2(0.0, -b * 2.3)).rgb * 0.090;
          refl += texture2D(tReflect, ruv + wob + vec2( b * 0.42, 0.0)).rgb * 0.075;
          refl += texture2D(tReflect, ruv + wob + vec2(-b * 0.42, 0.0)).rgb * 0.075;

          /* clamp: a single blown practical in the mirror otherwise turns
             into a white lake once bloom gets hold of it */
          refl = min(refl, vec3(14.0));

          float edge = smoothstep(0.0, 0.035, ruv.x) * smoothstep(1.0, 0.965, ruv.x)
                     * smoothstep(0.0, 0.035, ruv.y) * smoothstep(1.0, 0.965, ruv.y);

          gl_FragColor.rgb += refl * fres * wet * edge * uReflStrength;
        }`
      );

    material.userData.shader = shader;
  };
  material.needsUpdate = true;
  return material;
}

/* called once per frame from the ride update */
export function syncPlanarReflection(material, reflection, time) {
  const u = material?.userData?.reflectUniforms;
  if (!u || !reflection) return;
  u.tReflect.value = reflection.texture;
  u.uReflMatrix.value.copy(reflection.textureMatrix);
  u.uReflTime.value = time;
}
