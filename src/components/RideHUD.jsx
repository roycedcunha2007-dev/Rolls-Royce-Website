import { useEffect, useRef, useState } from "react";

/*
 * RideHUD — a Rolls-Royce instrument suite, not a racing UI.
 *
 * Everything on the cluster is fed from ShowroomDrive.getTelemetry(), which
 * derives each figure from simulation state. There are no placeholder
 * readouts here: range falls as fuel burns, the gear comes from the shift
 * map, the temperature tracks the mode and the deepening night.
 *
 * Left: the cluster. Centre: driving modes. Right: cameras and vehicle
 * controls. The whole thing is a single glass layer over the drive.
 */

const MODES = [
  ["comfort", "Comfort"],
  ["magic", "Magic Carpet"],
  ["sport", "Sport"],
  ["night", "Night"],
  ["rain", "Rain"],
  ["personal", "Personal"],
];

// Grouped so fourteen cameras read as a rig, not a wall of buttons.
const CAM_GROUPS = [
  ["Onboard", [["driver", "Driver"], ["passenger", "Passenger"], ["interior", "Lounge"], ["bonnet", "Bonnet"], ["bumper", "Bumper"], ["spirit", "Nose"], ["rear", "Rear"]]],
  ["Cinematic", [["chase", "Chase"], ["orbit", "Orbit"], ["roadside", "Roadside"], ["skyline", "Skyline"], ["wheel", "Wheel"], ["drone", "Drone"], ["top", "Overhead"]]],
];

/* Smoothly chase a target so needles never snap between telemetry ticks. */
function useEased(value, rate = 0.18) {
  const [shown, setShown] = useState(value ?? 0);
  const target = useRef(value ?? 0);
  const current = useRef(value ?? 0);
  target.current = value ?? 0;
  useEffect(() => {
    let raf;
    const tick = () => {
      const d = target.current - current.current;
      if (Math.abs(d) > 0.01) {
        current.current += d * rate;
        setShown(current.current);
      } else if (current.current !== target.current) {
        current.current = target.current;
        setShown(target.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate]);
  return shown;
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
  const [clock, setClock] = useState("");

  const api = () => showroomApi.current;
  const sfx = () => showroomApi.current?.cabin?.sfx;

  /* wall clock */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, []);

  /* indicator relay tick; silence the road when the HUD unmounts */
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

  /* wind and tyre roar follow road speed; the tunnel hardens the tyres */
  useEffect(() => {
    const s = sfx();
    if (!s) return;
    const level = Math.min(1, spd / 150);
    s.setWind(level);
    s.setTyre(level, inTunnel);
  }, [spd, inTunnel]);

  const rpm = telemetry?.rpm ?? 620;
  const reserve = telemetry?.reserve ?? 100;
  const accent = telemetry?.accent ?? "#d8b878";
  const heading = telemetry?.heading ?? 341;
  const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(heading / 22.5) % 16];

  // ease the two moving indicators so 8 Hz telemetry reads as continuous
  const easedSpd = useEased(spd, 0.16);
  const easedReserve = useEased(reserve, 0.1);
  const needle = -120 + Math.min(1, easedSpd / 160) * 240;

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

  if (photo) {
    return (
      <div className="ride-hud photo" data-ui>
        <div className="letterbox top" />
        <div className="letterbox bottom" />
        <button className="photo-exit" onClick={() => setPhoto(false)}>Exit photo mode</button>
      </div>
    );
  }

  return (
    <div className="ride-hud" data-ui style={{ "--accent": accent }}>
      {/* ---- instrument cluster ---- */}
      <div className="cluster">
        <svg viewBox="0 0 200 130" className="dial">
          <path d="M 30 108 A 78 78 0 1 1 170 108" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
          {[...Array(9)].map((_, i) => {
            const a = (-120 + i * 30) * (Math.PI / 180);
            const x1 = 100 + Math.sin(a) * 72, y1 = 92 - Math.cos(a) * 72;
            const x2 = 100 + Math.sin(a) * 79, y2 = 92 - Math.cos(a) * 79;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.4)" strokeWidth="1.4" />;
          })}
          {/* power reserve — the Rolls inversion of a rev counter */}
          <path d="M 62 116 A 46 46 0 0 1 138 116" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
          <path
            d="M 62 116 A 46 46 0 0 1 138 116"
            fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(easedReserve / 100) * 96} 200`} opacity="0.9"
          />
          <g transform={`rotate(${needle} 100 92)`}>
            <line x1="100" y1="92" x2="100" y2="24" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="92" r="4.5" fill="#0c0e12" stroke={accent} strokeWidth="1.4" />
        </svg>
        <div className="cluster-digital">
          <b>{Math.round(easedSpd)}</b>
          <span>mph</span>
        </div>
        <div className="cluster-row">
          <span>{telemetry?.gear ?? "N"}</span>
          <span>{compass}</span>
          <span>{telemetry?.temp != null ? `${telemetry.temp.toFixed(1)}°C` : "—"}</span>
          <span>{clock}</span>
        </div>
        <div className="cluster-row sub">
          <span>{Math.round(rpm).toLocaleString()} rpm</span>
          <span>{telemetry?.trip != null ? `${telemetry.trip.toFixed(1)} mi trip` : "—"}</span>
          <span>{telemetry?.range != null ? `${telemetry.range} mi range` : "—"}</span>
        </div>
        <p className="cluster-note">Power reserve {Math.round(easedReserve)}%</p>
      </div>

      {/* ---- driving modes ---- */}
      <nav className="mode-dock" aria-label="Driving mode">
        {MODES.map(([id, label]) => (
          <button key={id} className={mode === id ? "is-active" : ""} onClick={() => pickMode(id)}>{label}</button>
        ))}
      </nav>

      {/* ---- cameras ---- */}
      <nav className="cam-dock" aria-label="Camera">
        {CAM_GROUPS.map(([groupName, cams]) => (
          <div className="cam-group" key={groupName}>
            <p className="cam-group-label">{groupName}</p>
            <div className="cam-grid">
              {cams.map(([id, label]) => (
                <button key={id} className={!cine && cam === id ? "is-active" : ""} onClick={() => pickCam(id)}>{label}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="cam-actions">
          <button
            className={cine ? "is-active" : ""}
            onClick={() => { const n = !cine; setCine(n); api()?.setCinematic(n); sfx()?.chime(); }}
          >Cinematic</button>
          <button onClick={() => { setPhoto(true); sfx()?.click(); }}>Photo</button>
        </div>
      </nav>

      {/* ---- vehicle controls ---- */}
      <div className="ctrl-dock">
        <button className={beam ? "is-live" : ""} onClick={() => { const n = !beam; setBeam(n); api()?.setHighBeam(n); sfx()?.click(); }}>High beam</button>
        <button className={indicator === "L" ? "is-live" : ""} onClick={() => { setIndicator(indicator === "L" ? null : "L"); api()?.setIndicator("L"); }}>◀ Ind</button>
        <button className={indicator === "R" ? "is-live" : ""} onClick={() => { setIndicator(indicator === "R" ? null : "R"); api()?.setIndicator("R"); }}>Ind ▶</button>
        <button className={hazards ? "is-live" : ""} onClick={() => { const n = !hazards; setHazards(n); api()?.setHazards(n); }}>Hazards</button>
        <button className={cabinLit ? "is-live" : ""} onClick={() => { const n = !cabinLit; setCabinLit(n); api()?.setCabinLight(n); sfx()?.click(); }}>Cabin light</button>
        <button onClick={() => sfx()?.horn()}>Horn</button>
        <button className={music ? "is-live" : ""} onClick={() => { const n = !music; setMusic(n); sfx()?.setAmbience(n); }}>Music</button>
        <button onClick={() => { api()?.resetFreeLook(); sfx()?.click(); }}>Recentre view</button>
        <button className="halt" onClick={onHalt}>Slow to a halt</button>
      </div>

      {inTunnel && <p className="ride-flag">Tunnel</p>}
      <p className="ride-hint">W accelerate · S brake · A / D steer · drag to look around</p>
    </div>
  );
}
