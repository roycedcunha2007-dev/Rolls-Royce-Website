# Rolls-Royce · A Digital Atelier

A cinematic, scroll-driven 3D showroom built with **real photoreal car models** —
no CSS boxes, no primitive geometry.

## The experience

- **Four real motor cars** (CC-BY, Sketchfab): Ghost, Phantom, Cullinan and the
  1955 Silver Cloud, each meshopt-compressed to ~2 MB with WebP textures.
- **Cinematic scroll** — Lenis inertial scrolling scrubs a GSAP ScrollTrigger
  camera rig through seven chapters (Overture → Design → Atelier → Sanctuary →
  Powerplant → Heritage → Commission).
- **Luxury gallery environment** — polished dark-marble floor over a clamped
  live mirror, volumetric light pillars, gradient dome, drifting dust, subtle
  bloom, ACES tone mapping, film grain + vignette.
- **The Sanctuary** — the camera glides inside a fully modelled Ghost cabin
  with a 220-star fibre-optic Starlight Headliner (custom point shader).
- **Bespoke Atelier** — live paint (6 finishes), two-tone coachwork, cabin
  hide, veneer, exterior jewellery (chrome / 24K gold / smoked), calipers.
- **Examine Power** — a glowing V12 engineering hologram over the bonnet.
- **Magic Carpet Ride** — night-highway drive simulator with steering (A/D),
  body roll, spinning wheels, speed particles and a live speedo HUD.
- **Procedural V12 audio** — Web Audio oscillator engine with per-mode
  acoustics (cabin-muffled, bonnet-open growl, RPM-linked drive pitch).
- **Commission** — confetti + a downloadable letter-of-intent with your spec.

## Run

```bash
npm install
npm run dev
```

## Adding more models (Spectre, Wraith, Dawn)

Drop a GLB into `public/models/` and add an entry to `src/data/lineup.js`.
Free CC-licensed options (require a Sketchfab login to download):

- Spectre — https://sketchfab.com/3d-models/rolls-royce-spectre-eeb553ecdf1d4aa4ab34e228636179d7
- Wraith — https://sketchfab.com/3d-models/rolls-royce-wraith-898777f41546430998f9ff95c41c3bd1
- Dawn — https://sketchfab.com/3d-models/2016-rolls-royce-dawn-0765c8e6583949adbcd6c4607b263fda

Optimise before dropping in (keeps node names / hierarchy):

```bash
npx @gltf-transform/cli dedup in.glb a.glb
npx @gltf-transform/cli resize --width 1024 --height 1024 a.glb b.glb
npx @gltf-transform/cli webp b.glb c.glb
npx @gltf-transform/cli meshopt c.glb public/models/model.glb
```

## Credits

3D models via Sketchfab under CC-BY 4.0: "Rolls Royce Ghost" by kurojishi ·
"Rolls Royce Ghost" (cabin) by impozzible · "Rolls Royce Phantom" by AlexMatei ·
"Rolls Royce Cullinan" · "Rolls Royce Silver Cloud" by bluoppVR.
Studio HDRI by Poly Haven (CC0). This is a fan-made design study, not
affiliated with Rolls-Royce Motor Cars.
