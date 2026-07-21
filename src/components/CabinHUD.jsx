import { useEffect, useRef, useState } from "react";
import { AMBIENT_THEMES, HIDE_PAIRS, VENEERS, METALS } from "../three/showroom/CabinExperience";

/*
 * The cabin HUD — a game-like control surface, not a scroll page.
 * Left: viewpoints (where you are). Right: the commission (what it is).
 * Bottom: the scene (what it's doing). Centre: whatever you just touched.
 */

const Arrow = () => <span className="arrow" aria-hidden="true">↗</span>;

const VIEWS = [
  ["lounge", "Lounge", "01"],
  ["driver", "Driver", "02"],
  ["passenger", "Passenger", "03"],
  ["rearLeft", "Rear · left", "04"],
  ["rearRight", "Rear · right", "05"],
  ["starlight", "Starlight", "06"],
  ["exterior", "Walk around", "07"],
  ["overhead", "Overhead", "08"],
];

const STAR_MODES = [
  ["classic", "Classic"],
  ["galaxy", "Galaxy"],
  ["milkyway", "Milky Way"],
  ["aurora", "Aurora"],
  ["comet", "Comet"],
];

const MOOD_LIST = [
  ["showroom", "Showroom"],
  ["golden", "Golden hour"],
  ["moonlight", "Moonlight"],
  ["midnight", "Midnight"],
];

const CARPETS = [
  ["#1c2c47", "Navy"],
  ["#2a1c12", "Espresso"],
  ["#3d3f43", "Anthracite"],
  ["#c9bfa8", "Cashmere"],
];

const TABS = [
  ["hides", "Hides"],
  ["trim", "Trim"],
  ["light", "Light"],
  ["sky", "Sky"],
];

export default function CabinHUD({ showroomApi, onExit }) {
  const [view, setView] = useState("lounge");
  const [tab, setTab] = useState("hides");
  const [panelOpen, setPanelOpen] = useState(true);
  const [touch, setTouch] = useState(null);
  const [found, setFound] = useState(0);
  const [note, setNote] = useState(null);

  const [hide, setHide] = useState(HIDE_PAIRS[0].id);
  const [carpet, setCarpet] = useState(CARPETS[0][0]);
  const [veneer, setVeneer] = useState("walnut");
  const [metal, setMetal] = useState("chrome");
  const [ambient, setAmbient] = useState("champagne");
  const [mood, setMood] = useState("moonlight");
  const [stars, setStars] = useState({ density: 420, brightness: 1.25, speed: 1.0, mode: "classic" });
  const [engine, setEngine] = useState(false);
  const [rain, setRain] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [seat, setSeat] = useState(null);
  const [sound, setSound] = useState(true);

  const touchTimer = useRef(null);
  const noteTimer = useRef(null);
  const cabin = () => showroomApi.current?.cabin;

  const say = (msg, ms = 3800) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), ms);
  };

  /* Subscribe to raycast taps coming from the engine. */
  useEffect(() => {
    const c = cabin();
    if (!c) return;
    c.onTap = ({ label, act, x, y, count }) => {
      setTouch({ label, x, y, key: Math.random() });
      setFound(count);
      clearTimeout(touchTimer.current);
      touchTimer.current = setTimeout(() => setTouch(null), 1900);
      // touching a surface that has its own commission controls opens them
      if (act && act.startsWith("panel:")) {
        const which = act.slice(6);
        setTab(which === "starlight" ? "sky" : which === "glass" ? "light" : "trim");
        setPanelOpen(true);
      }
      if (count === 6) say("Six details found. Keep going — the cabin has more to say.");
      if (count === 11) say("Connoisseur. You have touched nearly everything here.");
    };
    return () => {
      if (c) c.onTap = null;
      clearTimeout(touchTimer.current);
      clearTimeout(noteTimer.current);
    };
  }, []);

  const go = (id) => {
    setView(id);
    cabin()?.viewpoint(id);
    // entering the Starlight view opens the sky controls and pours on the stars
    if (id === "starlight") {
      setTab("sky");
      setPanelOpen(true);
      const boosted = {
        ...stars,
        density: Math.max(stars.density, 620),
        brightness: Math.max(stars.brightness, 1.45),
      };
      setStars(boosted);
      cabin()?.regenStars(boosted);
    }
  };

  const applyStars = (patch) => {
    const next = { ...stars, ...patch };
    setStars(next);
    cabin()?.regenStars(next);
  };

  const toggleEngine = () => {
    const on = !engine;
    setEngine(on);
    cabin()?.engineStart(on);
    say(on ? "Powerplant awake. The fascia is alive." : "Silence restored.");
  };

  const toggleRain = () => {
    const on = !rain;
    setRain(on);
    cabin()?.setRain(on);
    if (on) setMood("moonlight");
    say(on ? "Rain outside. Inside, you can barely hear it." : "The weather has cleared.");
  };

  return (
    <div className="cabin-hud" data-ui>
      {/* ---- top bar ---- */}
      <div className="cabin-top">
        <div className="cabin-title">
          <p className="kicker">Private commission · Goodwood</p>
          <small>{found} details touched · drag to look · right-drag to move · scroll to zoom</small>
        </div>
        <div className="cabin-top-actions">
          <button
            className="text-button pale"
            onClick={() => {
              const c = cabin();
              if (!c) return;
              const on = !sound;
              c.sfx.enabled = on;
              if (!on) { c.sfx.setAmbience(false); c.sfx.setRain(false); }
              else { c.sfx.setAmbience(true); if (rain) c.sfx.setRain(true); }
              setSound(on);
            }}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button className="outline-button slim" onClick={onExit}>Leave the cabin <Arrow /></button>
        </div>
      </div>

      {/* ---- viewpoint dock ---- */}
      <nav className="view-dock" aria-label="Viewpoints">
        {VIEWS.map(([id, label, n]) => (
          <button key={id} className={view === id ? "is-active" : ""} onClick={() => go(id)}>
            <span>{n}</span>
            <em>{label}</em>
          </button>
        ))}
      </nav>

      {/* ---- scene controls ---- */}
      <div className="scene-dock">
        <button className={engine ? "is-live" : ""} onClick={toggleEngine}>
          <i className="dot" />{engine ? "Engine running" : "Engine start"}
        </button>
        <button className={rain ? "is-live" : ""} onClick={toggleRain}>{rain ? "Rain on" : "Rain"}</button>
        <button
          className={privacy ? "is-live" : ""}
          onClick={() => { const p = !privacy; setPrivacy(p); cabin()?.setGlass({ privacy: p }); }}
        >
          {privacy ? "Privacy glass" : "Clear glass"}
        </button>
        <button onClick={() => { cabin()?.indicate(4); }}>Indicators</button>
        <button onClick={() => { cabin()?.flashLamps(); }}>Welcome lights</button>
        <button onClick={() => { cabin()?.shower(); say("A meteor shower, across your own sky."); }}>Shooting stars</button>
      </div>

      {/* ---- commission panel ---- */}
      <aside className={`commission-dock ${panelOpen ? "" : "is-closed"}`}>
        <button className="dock-handle" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? "Hide" : "Commission"}
        </button>

        {panelOpen && (
          <div className="dock-body" data-lenis-prevent>
            <p className="kicker">The commission</p>
            <div className="dock-tabs">
              {TABS.map(([id, label]) => (
                <button key={id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>

            {tab === "hides" && (
              <div className="dock-section">
                <h4>Two-tone hide</h4>
                <div className="hide-grid">
                  {HIDE_PAIRS.map((p) => (
                    <button
                      key={p.id}
                      className={`hide-chip ${hide === p.id ? "is-active" : ""}`}
                      onClick={() => { setHide(p.id); cabin()?.setHides(p.id); }}
                      title={p.name}
                    >
                      <i style={{ background: `linear-gradient(135deg, #${p.seat.toString(16).padStart(6, "0")} 0 50%, #${p.perf.toString(16).padStart(6, "0")} 50% 100%)` }} />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <h4>Carpet</h4>
                <div className="swatch-row">
                  {CARPETS.map(([hex, label]) => (
                    <button
                      key={hex}
                      className={`swatch-dot ${carpet === hex ? "is-active" : ""}`}
                      style={{ "--dot": hex }}
                      onClick={() => { setCarpet(hex); cabin()?.setCarpet(hex); }}
                      title={label}
                    ><i /><span>{label}</span></button>
                  ))}
                </div>
                <h4>Seat climate</h4>
                <div className="chip-row">
                  {[["heat", "Warm"], ["cool", "Cool"], [null, "Rest"]].map(([id, label]) => (
                    <button key={label} className={`material-option ${seat === id ? "is-active" : ""}`}
                      onClick={() => { setSeat(id); cabin()?.setSeatClimate(id); }}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {tab === "trim" && (
              <div className="dock-section">
                <h4>Veneer</h4>
                <div className="chip-row">
                  {VENEERS.map((v) => (
                    <button key={v.id} className={`material-option ${veneer === v.id ? "is-active" : ""}`}
                      onClick={() => { setVeneer(v.id); cabin()?.setVeneer(v.id); }}>{v.name}</button>
                  ))}
                </div>
                <h4>Metal finish</h4>
                <div className="swatch-row">
                  {METALS.map((m) => (
                    <button
                      key={m.id}
                      className={`swatch-dot ${metal === m.id ? "is-active" : ""}`}
                      style={{ "--dot": `#${m.hex.toString(16).padStart(6, "0")}` }}
                      onClick={() => { setMetal(m.id); cabin()?.setMetal(m.id); }}
                      title={m.name}
                    ><i /><span>{m.name}</span></button>
                  ))}
                </div>
                <p className="dock-note">Touch any surface in the cabin to learn what it is.</p>
              </div>
            )}

            {tab === "light" && (
              <div className="dock-section">
                <h4>Ambient illumination</h4>
                <div className="swatch-row wrap">
                  {AMBIENT_THEMES.map((t) => (
                    <button
                      key={t.id}
                      className={`swatch-dot ${ambient === t.id ? "is-active" : ""}`}
                      style={{ "--dot": t.hex }}
                      onClick={() => { setAmbient(t.id); cabin()?.setAmbientTheme(t.hex); }}
                      title={t.name}
                    ><i /><span>{t.name}</span></button>
                  ))}
                </div>
                <h4>Hour of day</h4>
                <div className="chip-row">
                  {MOOD_LIST.map(([id, label]) => (
                    <button key={id} className={`material-option ${mood === id ? "is-active" : ""}`}
                      onClick={() => { setMood(id); cabin()?.setMood(id); }}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {tab === "sky" && (
              <div className="dock-section">
                <h4>Starlight headliner</h4>
                <div className="chip-row">
                  {STAR_MODES.map(([id, label]) => (
                    <button key={id} className={`material-option ${stars.mode === id ? "is-active" : ""}`}
                      onClick={() => applyStars({ mode: id })}>{label}</button>
                  ))}
                </div>
                <label className="control-slider">
                  <span>Stars · {stars.density}</span>
                  <input type="range" min="80" max="900" step="10" value={stars.density}
                    onChange={(e) => applyStars({ density: +e.target.value })} />
                </label>
                <label className="control-slider">
                  <span>Brightness</span>
                  <input type="range" min="0.2" max="2" step="0.05" value={stars.brightness}
                    onChange={(e) => applyStars({ brightness: +e.target.value })} />
                </label>
                <label className="control-slider">
                  <span>Twinkle</span>
                  <input type="range" min="0.2" max="2.6" step="0.1" value={stars.speed}
                    onChange={(e) => applyStars({ speed: +e.target.value })} />
                </label>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ---- what you just touched ---- */}
      {touch && (
        <div className="touch-tag" key={touch.key} style={{ left: touch.x, top: touch.y }}>
          {touch.label}
        </div>
      )}

      {note && <div className="cabin-toast">{note}</div>}
    </div>
  );
}
