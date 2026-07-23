import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconLights, IconCamera, IconDrive, IconAmbient, IconSeats,
  IconMusic, IconWheel, IconExpand, IconWave, IconExit,
} from "./RideIcons";

/*
 * RideHUD — the instrument suite of the Digital Atelier.
 *
 * Layout follows a strict grid rather than "components placed on screen":
 *   bottom-left   the cluster, the only panel the eye should rest on
 *   bottom-centre driving modes, the primary choice
 *   right         a single control rail; each item opens one flyout
 *   bottom-right  three quick actions
 * The car occupies the negative space between them and is never covered.
 *
 * Every readout is derived in ShowroomDrive.getTelemetry(); nothing on this
 * cluster is a literal. Every control that existed before still exists —
 * the rail groups them, it does not replace them.
 */

const MODES = [
  ["comfort", "Comfort"],
  ["magic", "Magic Carpet"],
  ["sport", "Sport"],
  ["night", "Night"],
  ["rain", "Rain"],
  ["personal", "Personal"],
];

const CAM_GROUPS = [
  ["Onboard", [
    ["driver", "Driver"], ["passenger", "Passenger"], ["interior", "Rear lounge"],
    ["bonnet", "Bonnet"], ["bumper", "Front grille"], ["spirit", "Nose"], ["rear", "Rear"],
  ]],
  ["Cinematic", [
    ["chase", "Chase"], ["orbit", "Orbit"], ["roadside", "Roadside"], ["skyline", "Skyline"],
    ["wheel", "Wheel"], ["drone", "Drone"], ["top", "Helicopter"],
  ]],
];

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/* Chase a target every frame so needles never step between 8 Hz telemetry. */
function useEased(value, rate = 0.16) {
  const [shown, setShown] = useState(value ?? 0);
  const target = useRef(value ?? 0);
  const current = useRef(value ?? 0);
  target.current = value ?? 0;
  useEffect(() => {
    let raf;
    const tick = () => {
      const d = target.current - current.current;
      if (Math.abs(d) > 0.01) { current.current += d * rate; setShown(current.current); }
      else if (current.current !== target.current) { current.current = target.current; setShown(target.current); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate]);
  return shown;
}

/* A pressable surface with a gold ripple — the click needs a physical reply. */
function Press({ className = "", children, onClick, ...rest }) {
  const [ripples, setRipples] = useState([]);
  const fire = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((p) => [...p, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    setTimeout(() => setRipples((p) => p.filter((q) => q.id !== id)), 620);
    onClick?.(e);
  };
  return (
    <button className={`rr-press ${className}`} onClick={fire} {...rest}>
      {children}
      {ripples.map((r) => <i key={r.id} className="rr-ripple" style={{ left: r.x, top: r.y }} />)}
    </button>
  );
}

export default function RideHUD({ showroomApi, telemetry, onHalt }) {
  const [mode, setMode] = useState("comfort");
  const [cam, setCam] = useState("chase");
  const [cine, setCine] = useState(false);
  const [beam, setBeam] = useState(false);
  const [hazards, setHazards] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const [music, setMusic] = useState(false);
  const [cabinLit, setCabinLit] = useState(true);
  const [photo, setPhoto] = useState(false);
  const [panel, setPanel] = useState(null);
  const [clock, setClock] = useState("");

  const api = () => showroomApi.current;
  const sfx = () => showroomApi.current?.cabin?.sfx;

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const d = api()?.drive;
    if (d) d.onBlink = () => sfx()?.click();
    return () => {
      if (d) { d.onBlink = null; d.onTunnel = null; }
      const s = sfx();
      s?.setWind(0);
      s?.setTyre(0);
    };
  }, []);

  const spd = telemetry?.speed ?? 0;
  const inTunnel = !!telemetry?.tunnel;

  useEffect(() => {
    const s = sfx();
    if (!s) return;
    const level = Math.min(1, spd / 150);
    s.setWind(level);
    s.setTyre(level, inTunnel);
  }, [spd, inTunnel]);

  /* Esc closes the open flyout — a panel you cannot dismiss is a trap. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setPanel(null); setPhoto(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rpm = telemetry?.rpm ?? 620;
  const reserve = telemetry?.reserve ?? 100;
  const accent = telemetry?.accent ?? "#c9a961";
  const heading = telemetry?.heading ?? 341;
  const compass = COMPASS[Math.round(heading / 22.5) % 16];

  const easedSpd = useEased(spd, 0.16);
  const easedReserve = useEased(reserve, 0.09);
  const easedRpm = useEased(rpm, 0.14);
  const needle = -120 + Math.min(1, easedSpd / 200) * 240;

  const pickMode = (id) => {
    setMode(id);
    api()?.setRideMode(id);
    const s = sfx();
    s?.click();
    s?.setRain(id === "rain");
    showroomApi.current?.cabin?.v12?.setMode(id === "sport" ? "drive" : "cabin");
  };

  const pickCam = (id) => {
    setCam(id);
    setCine(false);
    api()?.setCinematic(false);
    api()?.setRideCam(id);
    sfx()?.click();
  };

  const toggleCine = () => {
    const n = !cine;
    setCine(n);
    api()?.setCinematic(n);
    sfx()?.chime();
  };

  const toggleFullscreen = useCallback(() => {
    sfx()?.click();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  /* ---- photo mode: pure cinema, every control withdraws ---- */
  if (photo) {
    return (
      <div className="ride-hud photo" data-ui>
        <div className="letterbox top" />
        <div className="letterbox bottom" />
        <div className="photo-readout">
          <b>{Math.round(easedSpd)}</b><span>mph</span>
          <i />
          <em>{telemetry?.modeName ?? "Comfort"}</em>
        </div>
        <Press className="photo-exit" onClick={() => setPhoto(false)}>Exit photo mode</Press>
      </div>
    );
  }

  const RAIL = [
    {
      id: "lights", label: "Lights", Icon: IconLights,
      live: beam || hazards || !!indicator,
      body: (
        <>
          <div className="fly-grid">
            <Press className={`fly-cell ${beam ? "on" : ""}`} onClick={() => { const n = !beam; setBeam(n); api()?.setHighBeam(n); sfx()?.click(); }}>
              <span>High beam</span><em>{beam ? "On" : "Off"}</em>
            </Press>
            <Press className={`fly-cell ${hazards ? "on" : ""}`} onClick={() => { const n = !hazards; setHazards(n); api()?.setHazards(n); }}>
              <span>Hazards</span><em>{hazards ? "On" : "Off"}</em>
            </Press>
          </div>
          <p className="fly-label">Indicators</p>
          <div className="fly-grid">
            <Press className={`fly-cell ${indicator === "L" ? "on" : ""}`} onClick={() => { setIndicator(indicator === "L" ? null : "L"); api()?.setIndicator("L"); }}>
              <span>◀ Left</span><em>{indicator === "L" ? "On" : "Off"}</em>
            </Press>
            <Press className={`fly-cell ${indicator === "R" ? "on" : ""}`} onClick={() => { setIndicator(indicator === "R" ? null : "R"); api()?.setIndicator("R"); }}>
              <span>Right ▶</span><em>{indicator === "R" ? "On" : "Off"}</em>
            </Press>
          </div>
        </>
      ),
    },
    {
      id: "camera", label: "Camera", Icon: IconCamera,
      live: cine,
      body: (
        <>
          {CAM_GROUPS.map(([g, cams]) => (
            <div key={g}>
              <p className="fly-label">{g}</p>
              <div className="fly-grid">
                {cams.map(([id, label]) => (
                  <Press key={id} className={`fly-cell tight ${!cine && cam === id ? "on" : ""}`} onClick={() => pickCam(id)}>
                    <span>{label}</span>
                  </Press>
                ))}
              </div>
            </div>
          ))}
          <p className="fly-label">Direction</p>
          <div className="fly-grid">
            <Press className={`fly-cell ${cine ? "on" : ""}`} onClick={toggleCine}>
              <span>Cinematic</span><em>{cine ? "Running" : "Off"}</em>
            </Press>
            <Press className="fly-cell" onClick={() => { setPhoto(true); sfx()?.click(); }}>
              <span>Photo mode</span><em>Enter</em>
            </Press>
          </div>
        </>
      ),
    },
    {
      id: "drive", label: "Drive assist", Icon: IconDrive,
      body: (
        <>
          <div className="fly-grid">
            <Press className="fly-cell" onClick={() => { api()?.resetFreeLook(); sfx()?.click(); }}>
              <span>Recentre view</span><em>Reset</em>
            </Press>
            <Press className="fly-cell" onClick={() => sfx()?.horn()}>
              <span>Horn</span><em>Sound</em>
            </Press>
          </div>
          <p className="fly-label">Controls</p>
          <dl className="fly-keys">
            <div><dt>W</dt><dd>Accelerate</dd></div>
            <div><dt>S</dt><dd>Brake</dd></div>
            <div><dt>A / D</dt><dd>Steer</dd></div>
            <div><dt>Drag</dt><dd>Look around</dd></div>
          </dl>
        </>
      ),
    },
    {
      id: "ambient", label: "Ambient", Icon: IconAmbient,
      live: cabinLit,
      body: (
        <>
          <div className="fly-grid">
            <Press className={`fly-cell ${cabinLit ? "on" : ""}`} onClick={() => { const n = !cabinLit; setCabinLit(n); api()?.setCabinLight(n); sfx()?.click(); }}>
              <span>Cabin light</span><em>{cabinLit ? "On" : "Off"}</em>
            </Press>
            <Press className={`fly-cell ${music ? "on" : ""}`} onClick={() => { const n = !music; setMusic(n); sfx()?.setAmbience(n); }}>
              <span>Ambience</span><em>{music ? "On" : "Off"}</em>
            </Press>
          </div>
          <p className="fly-note">The cabin glow lights the seated cameras. Ambience is a distant orchestral pad, mixed under the road.</p>
        </>
      ),
    },
    {
      id: "seats", label: "Seats", Icon: IconSeats,
      body: (
        <>
          <p className="fly-label">Seated views</p>
          <div className="fly-grid">
            {[["driver", "Driver"], ["passenger", "Passenger"], ["interior", "Rear lounge"], ["rear", "Rear glass"]].map(([id, label]) => (
              <Press key={id} className={`fly-cell tight ${!cine && cam === id ? "on" : ""}`} onClick={() => pickCam(id)}>
                <span>{label}</span>
              </Press>
            ))}
          </div>
          <p className="fly-note">Take a seat, then drag to look around the cabin.</p>
        </>
      ),
    },
    {
      id: "music", label: "Music", Icon: IconMusic,
      live: music,
      body: (
        <>
          <div className="fly-grid">
            <Press className={`fly-cell ${music ? "on" : ""}`} onClick={() => { const n = !music; setMusic(n); sfx()?.setAmbience(n); }}>
              <span>Orchestral</span><em>{music ? "Playing" : "Paused"}</em>
            </Press>
            <Press className="fly-cell" onClick={() => sfx()?.chime()}>
              <span>Chime</span><em>Play</em>
            </Press>
          </div>
          <p className="fly-note">Road, wind and tyre noise follow speed automatically and harden inside a tunnel.</p>
        </>
      ),
    },
    {
      id: "atelier", label: "Atelier", Icon: IconExit,
      body: (
        <>
          <p className="fly-note">Bring the motor car gently to rest and return to the pavilion.</p>
          <Press className="fly-cell wide halt" onClick={onHalt}>
            <span>Slow to a halt</span><em>Return</em>
          </Press>
        </>
      ),
    },
  ];

  const open = RAIL.find((r) => r.id === panel);

  return (
    <div className="ride-hud" data-ui style={{ "--accent": accent }}>

      {/* ============ instrument cluster ============ */}
      <aside className="rr-cluster" style={{ animationDelay: "80ms" }}>
        <div className="rr-dial">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <defs>
              <radialGradient id="dialFace" cx="50%" cy="42%" r="62%">
                <stop offset="0%" stopColor="rgba(255,255,255,.07)" />
                <stop offset="70%" stopColor="rgba(255,255,255,.015)" />
                <stop offset="100%" stopColor="rgba(0,0,0,.32)" />
              </radialGradient>
              <linearGradient id="dialRim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,.30)" />
                <stop offset="55%" stopColor="rgba(255,255,255,.05)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.16)" />
              </linearGradient>
            </defs>

            <circle cx="110" cy="110" r="93" fill="url(#dialFace)" stroke="url(#dialRim)" strokeWidth="1.1" />
            <circle cx="110" cy="110" r="86" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="1" />

            {/* minor ticks every 10 mph across a 240° sweep */}
            {[...Array(21)].map((_, i) => {
              const a = (-120 + i * 12) * (Math.PI / 180);
              const major = i % 5 === 0;
              const r1 = major ? 68 : 74, r2 = 80;
              return (
                <line key={i}
                  x1={110 + Math.sin(a) * r1} y1={110 - Math.cos(a) * r1}
                  x2={110 + Math.sin(a) * r2} y2={110 - Math.cos(a) * r2}
                  stroke={major ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.2)"}
                  strokeWidth={major ? 1.5 : 0.9} strokeLinecap="round"
                />
              );
            })}

            {/* numerals */}
            {[0, 50, 100, 150, 200].map((v) => {
              const a = (-120 + (v / 200) * 240) * (Math.PI / 180);
              return (
                <text key={v} className="rr-num"
                  x={110 + Math.sin(a) * 56} y={110 - Math.cos(a) * 56 + 3.4}
                  textAnchor="middle">{v}</text>
              );
            })}

            {/* power reserve, drawn as the dial's inner ring */}
            <circle cx="110" cy="110" r="46" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="2.4" />
            <circle cx="110" cy="110" r="46" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round"
              strokeDasharray={`${(easedReserve / 100) * 289} 400`}
              transform="rotate(-90 110 110)" opacity="0.85" />

            <text className="rr-monogram" x="110" y="58" textAnchor="middle">RR</text>

            <g transform={`rotate(${needle} 110 110)`}>
              <line x1="110" y1="118" x2="110" y2="38" stroke={accent} strokeWidth="5" strokeLinecap="round" opacity="0.16" />
              <line x1="110" y1="118" x2="110" y2="38" stroke={accent} strokeWidth="2" strokeLinecap="round" />
            </g>
            <circle cx="110" cy="110" r="6" fill="#0b0d12" stroke={accent} strokeWidth="1.2" />
            <circle cx="110" cy="110" r="2" fill={accent} />
          </svg>

          <div className="rr-readout">
            <b>{Math.round(easedSpd)}</b>
            <span>mph</span>
          </div>
        </div>

        <div className="rr-stats">
          <div><b>{telemetry?.gear ?? "N"}</b><span>Gear</span></div>
          <div><b>{telemetry?.temp != null ? `${telemetry.temp.toFixed(1)}°C` : "—"}</b><span>Temp</span></div>
          <div><b>{compass}</b><span>Heading</span></div>
          <div><b>{clock}</b><span>Time</span></div>
        </div>

        <div className="rr-sub">
          <p><b>{telemetry?.trip != null ? telemetry.trip.toFixed(1) : "—"}</b> Trip</p>
          <i />
          <p><b>{Math.round(easedRpm).toLocaleString()}</b> Rpm</p>
          <i />
          <p><b>{telemetry?.range ?? "—"}</b> Mi range</p>
        </div>

        <div className="rr-reserve">
          <span>Power reserve</span>
          <div className="rr-bar"><i style={{ width: `${easedReserve}%` }} /></div>
          <b>{Math.round(easedReserve)}%</b>
        </div>
      </aside>

      {/* ============ control rail ============ */}
      <nav className="rr-rail" aria-label="Vehicle controls">
        {RAIL.map((r, i) => (
          <Press key={r.id}
            className={`rail-item ${panel === r.id ? "open" : ""} ${r.live ? "live" : ""}`}
            style={{ animationDelay: `${140 + i * 55}ms` }}
            aria-expanded={panel === r.id}
            onClick={() => { setPanel(panel === r.id ? null : r.id); sfx()?.click(); }}
          >
            <r.Icon />
            <span>{r.label}</span>
          </Press>
        ))}
      </nav>

      {open && (
        <div className="rr-flyout" key={open.id}>
          <header>
            <p>{open.label}</p>
            <button className="fly-close" onClick={() => setPanel(null)} aria-label="Close">×</button>
          </header>
          <div className="fly-body">{open.body}</div>
        </div>
      )}

      {/* ============ driving modes ============ */}
      <nav className="rr-modes" aria-label="Driving mode" style={{ animationDelay: "200ms" }}>
        {MODES.map(([id, label]) => (
          <Press key={id} className={mode === id ? "on" : ""} onClick={() => pickMode(id)}>{label}</Press>
        ))}
      </nav>

      {/* ============ quick actions ============ */}
      <div className="rr-quick" style={{ animationDelay: "260ms" }}>
        <Press className={cine ? "on" : ""} onClick={toggleCine} title="Cinematic direction"><IconWave /></Press>
        <Press onClick={() => { setPhoto(true); sfx()?.click(); }} title="Photo mode"><IconWheel /></Press>
        <Press onClick={toggleFullscreen} title="Fullscreen"><IconExpand /></Press>
      </div>

      {inTunnel && <p className="rr-flag">Tunnel</p>}
      <p className="rr-hint">W accelerate · S brake · A / D steer · drag to look around</p>
    </div>
  );
}
