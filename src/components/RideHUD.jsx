import { useEffect, useRef, useState } from "react";

/*
 * RideHUD — a Rolls-Royce instrument suite, not a racing UI.
 * Left: glass instrument cluster (speed dial, power reserve, gear, compass,
 * temperature, range, clock). Centre: driving modes. Right: cameras,
 * cinematic mode, photo mode. Top strip: lamps, indicators, horn, music.
 */

const MODES = [
  ["comfort", "Comfort"],
  ["magic", "Magic Carpet"],
  ["sport", "Sport"],
  ["night", "Night"],
  ["rain", "Rain"],
];

const CAMS = [
  ["chase", "Chase"],
  ["bonnet", "Bonnet"],
  ["roadside", "Roadside"],
  ["drone", "Drone"],
  ["skyline", "Skyline"],
  ["wheel", "Wheel"],
];

export default function RideHUD({ showroomApi, telemetry, onHalt }) {
  const [mode, setMode] = useState("comfort");
  const [cam, setCam] = useState("chase");
  const [cine, setCine] = useState(false);
  const [beam, setBeam] = useState(false);
  const [hazards, setHazards] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const [music, setMusic] = useState(false);
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

  /* indicator relay tick + wind follows speed */
  useEffect(() => {
    const d = api()?.drive;
    if (d) d.onBlink = () => sfx()?.click();
    return () => { if (d) d.onBlink = null; sfx()?.setWind(0); };
  }, []);

  useEffect(() => {
    const s = sfx();
    if (s && telemetry) s.setWind(Math.min(1, (telemetry.speed || 0) / 150));
  }, [telemetry?.speed]);

  const spd = telemetry?.speed ?? 0;
  const reserve = telemetry?.reserve ?? 100;
  const accent = telemetry?.accent ?? "#d8b878";
  const heading = telemetry?.heading ?? 341;
  const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(heading / 22.5) % 16];
  const needle = -120 + Math.min(1, spd / 160) * 240;

  const pickMode = (id) => {
    setMode(id);
    api()?.setRideMode(id);
    const s = sfx();
    s?.click();
    if (id === "rain") s?.setRain(true); else s?.setRain(false);
    const v12 = showroomApi.current?.cabin?.v12;
    if (v12) v12.setMode(id === "sport" ? "drive" : "cabin");
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
          {/* speed arc */}
          <path d="M 30 108 A 78 78 0 1 1 170 108" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
          {[...Array(9)].map((_, i) => {
            const a = (-120 + i * 30) * (Math.PI / 180);
            const x1 = 100 + Math.sin(a) * 72, y1 = 92 - Math.cos(a) * 72;
            const x2 = 100 + Math.sin(a) * 79, y2 = 92 - Math.cos(a) * 79;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.4)" strokeWidth="1.4" />;
          })}
          {/* power reserve arc */}
          <path d="M 62 116 A 46 46 0 0 1 138 116" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3" />
          <path
            d="M 62 116 A 46 46 0 0 1 138 116"
            fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(reserve / 100) * 96} 200`} opacity="0.9"
          />
          {/* needle */}
          <g transform={`rotate(${needle} 100 92)`}>
            <line x1="100" y1="92" x2="100" y2="24" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="92" r="4.5" fill="#0c0e12" stroke={accent} strokeWidth="1.4" />
        </svg>
        <div className="cluster-digital">
          <b>{spd}</b>
          <span>mph</span>
        </div>
        <div className="cluster-row">
          <span>{telemetry?.gear ?? "D"}</span>
          <span>{compass}</span>
          <span>11°C</span>
          <span>{clock}</span>
          <span>412 mi</span>
        </div>
        <p className="cluster-note">Power reserve {reserve}%</p>
      </div>

      {/* ---- driving modes ---- */}
      <nav className="mode-dock" aria-label="Driving mode">
        {MODES.map(([id, label]) => (
          <button key={id} className={mode === id ? "is-active" : ""} onClick={() => pickMode(id)}>{label}</button>
        ))}
      </nav>

      {/* ---- cameras ---- */}
      <nav className="cam-dock" aria-label="Camera">
        {CAMS.map(([id, label]) => (
          <button key={id} className={!cine && cam === id ? "is-active" : ""} onClick={() => pickCam(id)}>{label}</button>
        ))}
        <button
          className={cine ? "is-active wide" : "wide"}
          onClick={() => { const n = !cine; setCine(n); api()?.setCinematic(n); sfx()?.chime(); }}
        >Cinematic</button>
        <button className="wide" onClick={() => { setPhoto(true); sfx()?.click(); }}>Photo</button>
      </nav>

      {/* ---- vehicle controls ---- */}
      <div className="ctrl-dock">
        <button className={beam ? "is-live" : ""} onClick={() => { const n = !beam; setBeam(n); api()?.setHighBeam(n); sfx()?.click(); }}>High beam</button>
        <button className={indicator === "L" ? "is-live" : ""} onClick={() => { const n = indicator === "L" ? null : "L"; setIndicator(n); api()?.setIndicator("L"); }}>◀ Ind</button>
        <button className={indicator === "R" ? "is-live" : ""} onClick={() => { const n = indicator === "R" ? null : "R"; setIndicator(n); api()?.setIndicator("R"); }}>Ind ▶</button>
        <button className={hazards ? "is-live" : ""} onClick={() => { const n = !hazards; setHazards(n); api()?.setHazards(n); }}>Hazards</button>
        <button onClick={() => sfx()?.horn()}>Horn</button>
        <button className={music ? "is-live" : ""} onClick={() => { const n = !music; setMusic(n); sfx()?.setAmbience(n); }}>Music</button>
        <button className="halt" onClick={onHalt}>Slow to a halt</button>
      </div>

      <p className="ride-hint">W accelerate · S brake · A / D steer</p>
    </div>
  );
}
