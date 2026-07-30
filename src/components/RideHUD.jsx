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

/* =====================================================================
 * INSTRUMENTS
 *
 * Drawn the way the real things are made, because a ring of flat SVG
 * strokes always reads as a progress bar wearing a motor car's clothes.
 * Each gauge is four physical layers:
 *
 *   knurl   the milled grip cut into the outer case
 *   bezel   a turned metal ring — a conic sweep is the only way to get
 *           the highlight to travel around it the way light actually does
 *   face    engine-turned guilloché under printed ticks
 *   glass   one specular sweep and an inner vignette, over everything
 *
 * The needle sits between face and glass and casts a shadow onto the
 * printing, which is the detail that makes it read as a part rather than
 * a drawing of one.
 * ===================================================================== */

function Gauge({ className = "", children, sweep }) {
  return (
    <div className={`gauge ${className}`}>
      <i className="gauge-knurl" />
      <i className="gauge-bezel" />
      <div className="gauge-face">{children}</div>
      <i className="gauge-glass" style={sweep ? { "--sweep": sweep } : undefined} />
    </div>
  );
}

/* the pointer: tapered, polished, counterweighted, and casting a shadow */
function Needle({ angle, cx, cy, len, tail, w = 3.1, fill = "url(#steel)", accent }) {
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`}>
      <g transform="translate(2.6 3.4)" opacity=".5" filter="url(#soften)">
        <path d={`M ${cx} ${cy - len} L ${cx + w} ${cy + 6} L ${cx - w} ${cy + 6} Z`} fill="#000" />
        <ellipse cx={cx} cy={cy + tail * 0.6} rx={w * 1.9} ry={tail} fill="#000" />
      </g>
      <ellipse cx={cx} cy={cy + tail * 0.6} rx={w * 1.9} ry={tail} fill={fill} />
      <path d={`M ${cx} ${cy - len} L ${cx + w} ${cy + 6} L ${cx - w} ${cy + 6} Z`} fill={fill} />
      {accent && (
        <path d={`M ${cx} ${cy - len} L ${cx + w * 0.42} ${cy - len * 0.44} L ${cx - w * 0.42} ${cy - len * 0.44} Z`} fill={accent} />
      )}
    </g>
  );
}

function GaugeDefs({ accent }) {
  return (
    <defs>
      {/* a polished taper is bright down its spine and dark at both edges */}
      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#5c626b" />
        <stop offset="34%" stopColor="#e8edf3" />
        <stop offset="52%" stopColor="#ffffff" />
        <stop offset="70%" stopColor="#aeb5be" />
        <stop offset="100%" stopColor="#4a4f57" />
      </linearGradient>
      <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6b5526" />
        <stop offset="38%" stopColor={accent} />
        <stop offset="55%" stopColor="#f6e6bd" />
        <stop offset="100%" stopColor="#5d4a21" />
      </linearGradient>
      <radialGradient id="boss" cx="38%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#f2f5f9" />
        <stop offset="42%" stopColor="#9aa2ac" />
        <stop offset="78%" stopColor="#3f444c" />
        <stop offset="100%" stopColor="#14171c" />
      </radialGradient>
      <filter id="soften" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.7" />
      </filter>
      <filter id="lampGlow" x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  );
}

/* The speedometer: 0–200 over 240°, printed every 5, numbered every 25. */
function Speedo({ value, accent }) {
  const C = 130, MAX = 200, START = -120, SWEEP = 240;
  const ang = (v) => START + Math.min(1, Math.max(0, v / MAX)) * SWEEP;
  const pt = (r, deg) => {
    const a = (deg - 90) * (Math.PI / 180);
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };

  const ticks = [];
  for (let v = 0; v <= MAX; v += 5) {
    const major = v % 25 === 0;
    const mid = !major && v % 25 === 12.5;
    const a = ang(v);
    const [x1, y1] = pt(major ? 88 : mid ? 93 : 95, a);
    const [x2, y2] = pt(102, a);
    ticks.push(
      <line key={v} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={major ? "#e6e2d6" : "rgba(226,222,210,.4)"}
        strokeWidth={major ? 2.6 : 1.1} strokeLinecap="butt" />
    );
  }

  return (
    <svg viewBox="0 0 260 260" aria-hidden="true">
      <GaugeDefs accent={accent} />

      {/* the printed chapter ring sits on the face, under everything */}
      <circle cx={C} cy={C} r={103} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
      <circle cx={C} cy={C} r={86} fill="none" stroke="rgba(255,255,255,.045)" strokeWidth="1" />
      {ticks}

      {[0, 25, 50, 75, 100, 125, 150, 175, 200].map((v) => {
        const [x, y] = pt(72, ang(v));
        return (
          <text key={v} className="g-num" x={x} y={y + 5} textAnchor="middle">{v}</text>
        );
      })}

      {/* the maker's mark, printed low where no numeral can reach it */}
      <text className="g-monogram" x={C} y={146} textAnchor="middle">ROLLS-ROYCE</text>

      <Needle angle={ang(value)} cx={C} cy={C} len={92} tail={13} w={3.4} accent={accent} />

      {/* the pivot: a turned boss with a jewelled centre */}
      <circle cx={C} cy={C} r={13} fill="url(#boss)" />
      <circle cx={C} cy={C} r={13} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="1" />
      <circle cx={C} cy={C} r={4.6} fill="#0a0c10" />
      <circle cx={C} cy={C} r={2.2} fill={accent} opacity=".9" />
    </svg>
  );
}

/* The Power Reserve — the one dial that is unmistakably Rolls-Royce. */
function Reserve({ value, accent }) {
  const C = 70, START = -128, SWEEP = 256;
  const ang = (v) => START + Math.min(1, Math.max(0, v / 100)) * SWEEP;
  const pt = (r, deg) => {
    const a = (deg - 90) * (Math.PI / 180);
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };
  const ticks = [];
  for (let v = 0; v <= 100; v += 10) {
    const major = v % 50 === 0;
    const a = ang(v);
    const [x1, y1] = pt(major ? 40 : 44, a);
    const [x2, y2] = pt(50, a);
    ticks.push(
      <line key={v} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={major ? "#e6e2d6" : "rgba(226,222,210,.38)"}
        strokeWidth={major ? 2 : 1} />
    );
  }
  return (
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <GaugeDefs accent={accent} />
      {ticks}
      <text className="g-legend sm" x={C} y={50} textAnchor="middle">POWER</text>
      <text className="g-legend sm" x={C} y={61} textAnchor="middle">RESERVE</text>
      <text className="g-pct" x={C} y={104} textAnchor="middle">%</text>
      <Needle angle={ang(value)} cx={C} cy={C} len={44} tail={7} w={2.2} fill="url(#brass)" />
      <circle cx={C} cy={C} r={7} fill="url(#boss)" />
      <circle cx={C} cy={C} r={2.4} fill="#0a0c10" />
    </svg>
  );
}

/*
 * A mechanical roller counter. Each drum is its own cylinder: dark at the
 * top and bottom where it curves away, lit across the middle. The tenths
 * drum is the reversed one, exactly as on a real odometer.
 */
function Roller({ value, digits = 4, tenths = false, label }) {
  const scaled = Math.max(0, Math.round((value ?? 0) * (tenths ? 10 : 1)));
  const s = String(scaled).padStart(digits + (tenths ? 1 : 0), "0").slice(-(digits + (tenths ? 1 : 0)));
  const cells = s.split("");
  return (
    <div className="rr-roller">
      <span className="roller-label">{label}</span>
      <div className="roller-drums">
        {cells.map((d, i) => (
          <i key={i} className={tenths && i === cells.length - 1 ? "tenth" : ""}>{d}</i>
        ))}
      </div>
    </div>
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
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
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

      {/* ============ instrument binnacle ============ */}
      <aside className="rr-cluster" style={{ animationDelay: "80ms" }}>
        <div className="binnacle-hood" />

        <Gauge className="g-speedo">
          <Speedo value={easedSpd} accent={accent} />
          {/* The digital window, recessed into the dial and lit from behind.
              Gear reads in it alongside the speed, as it does on a real
              cluster — floating on the face it fouled the numerals. */}
          <div className="gauge-window">
            <u>{telemetry?.gear ?? "N"}</u>
            <b>{String(Math.round(easedSpd)).padStart(3, " ")}</b>
            <span>mph</span>
          </div>
        </Gauge>

        {/* engraved data plate, screwed to the binnacle below the dial */}
        <div className="rr-plate">
          <div><b>{telemetry?.temp != null ? `${telemetry.temp.toFixed(1)}°` : "—"}</b><span>Temp</span></div>
          <i />
          <div><b>{compass}</b><span>Heading</span></div>
          <i />
          <div><b>{clock}</b><span>Time</span></div>
          <i />
          <div><b>{Math.round(easedRpm).toLocaleString()}</b><span>Rpm</span></div>
        </div>

        <div className="rr-lower">
          <Gauge className="g-reserve">
            <Reserve value={easedReserve} accent={accent} />
          </Gauge>
          <div className="rr-counters">
            <Roller label="Trip" value={telemetry?.trip ?? 0} digits={3} tenths />
            <Roller label="Range" value={telemetry?.range ?? 0} digits={3} />
          </div>
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
            <i className="rail-lamp" />
            <r.Icon />
            <span>{r.label}</span>
            <i className="rail-edge" />
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
          <Press key={id} className={`mode-key ${mode === id ? "on" : ""}`} onClick={() => pickMode(id)}>
            <i className="key-lamp" />
            <span>{label}</span>
          </Press>
        ))}
      </nav>

      {/* ============ quick actions ============ */}
      <div className="rr-quick" style={{ animationDelay: "260ms" }}>
        {[
          [cine ? "on" : "", toggleCine, "Cinematic direction", IconWave],
          ["", () => { setPhoto(true); sfx()?.click(); }, "Photo mode", IconWheel],
          ["", toggleFullscreen, "Fullscreen", IconExpand],
        ].map(([cls, fn, title, Icon], i) => (
          /* knurled grip, turned bezel, polished cap — built from real
             elements rather than pseudo-elements so each layer is its own
             surface that can be lit independently */
          <Press key={i} className={`knob ${cls}`} onClick={fn} title={title}>
            <i className="knob-bezel" />
            <i className="knob-cap" />
            <Icon />
          </Press>
        ))}
      </div>

      {inTunnel && <p className="rr-flag">Tunnel</p>}
      <p className="rr-hint">W accelerate · S brake · A / D steer · drag to look around</p>
    </div>
  );
}
