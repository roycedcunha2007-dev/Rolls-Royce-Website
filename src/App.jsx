import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Experience from "./components/Experience";
import CabinHUD from "./components/CabinHUD";
import { LINEUP, PAINTS, TWO_TONE, LEATHERS, WOODS, JEWELLERY, CALIPERS } from "./data/lineup";

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = [
  ["arrival", "Arrival"], ["gallery", "The marque"], ["atelier", "Bespoke"],
  ["sanctuary", "Sanctuary"], ["craft", "Craftsmanship"], ["commission", "Commission"],
];

const Arrow = () => <span className="arrow" aria-hidden="true">↗</span>;

function OptionRow({ label, items, active, onChange, color = false }) {
  return <div className="option-row">
    <div className="option-label"><span>{label}</span><span>{active.name}</span></div>
    <div className="option-list">
      {items.map((item) => <button key={item.name} className={`material-option ${active.name === item.name ? "is-active" : ""}`} onClick={() => onChange(item)}>
        {color && <i style={{ background: item.hex || "linear-gradient(135deg,#243248,#c7c2b7)" }} />}{item.name}
      </button>)}
    </div>
  </div>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(3);
  const [activeModel, setActiveModel] = useState("Ghost");
  const [paint, setPaint] = useState(PAINTS[2]);
  const [twoTone, setTwoTone] = useState(TWO_TONE[0]);
  const [leather, setLeather] = useState(LEATHERS[0]);
  const [wood, setWood] = useState(WOODS[0]);
  const [jewellery, setJewellery] = useState(JEWELLERY[0]);
  const [caliper, setCaliper] = useState(CALIPERS[0]);
  const [section, setSection] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [bonnetOpen, setBonnetOpen] = useState(false);
  const [driveMode, setDriveMode] = useState(false);
  const [driveView, setDriveView] = useState("side");
  const [ridePhase, setRidePhase] = useState("pavilion");
  const [cabinMode, setCabinMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const lenisRef = useRef();
  const showroomApi = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.82 });
    lenisRef.current = lenis;
    let frame;
    const update = (time) => { lenis.raf(time); frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    lenis.on("scroll", ScrollTrigger.update);
    const ctx = gsap.context(() => {
      document.querySelectorAll("[data-reveal]").forEach((element) => {
        gsap.fromTo(element, { y: 38, opacity: 0 }, { y: 0, opacity: 1, duration: 1.15, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 83%" } });
      });
      CHAPTERS.forEach(([id], index) => ScrollTrigger.create({ trigger: `#${id}`, start: "top 52%", end: "bottom 52%", onEnter: () => setSection(index), onEnterBack: () => setSection(index) }));
    });
    return () => { cancelAnimationFrame(frame); lenis.destroy(); ctx.revert(); };
  }, []);

  useEffect(() => { if (section === 3) setDoorsOpen(true); else setDoorsOpen(false); setBonnetOpen(section === 4); }, [section]);
  useEffect(() => { if (driveMode || cabinMode) lenisRef.current?.stop(); else lenisRef.current?.start(); }, [driveMode, cabinMode]);
  useEffect(() => { if (driveMode) { setDriveView("side"); setRidePhase("pavilion"); } }, [driveMode]);
  const startRide = () => {
    showroomApi.current?.startRide();
    const c = showroomApi.current?.cabin;
    if (c) { c.engineStart(true); c.v12?.setMode("drive"); }
    setRidePhase("riding");
  };
  const stopRide = () => {
    showroomApi.current?.stopRide();
    showroomApi.current?.cabin?.engineStart(false);
    setRidePhase("pavilion");
  };

  const enterCabin = () => {
    const cabin = showroomApi.current?.cabin;
    if (!cabin) return;
    cabin.enter();
    setCabinMode(true);
  };
  const leaveCabin = () => {
    showroomApi.current?.cabin?.exit();
    setCabinMode(false);
  };
  const go = (id) => lenisRef.current?.scrollTo(`#${id}`, { duration: 1.7, offset: -20 });
  const commission = () => {
    const text = `ROLLS-ROYCE DIGITAL ATELIER\n\nMotor car: ${activeModel}\nCoachwork: ${paint.name}${twoTone.hex ? ` / ${twoTone.name}` : ""}\nCabin: ${leather.name}\nVeneer: ${wood.name}\nJewellery: ${jewellery.name}\n\nA private consultation has been requested.`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = `RR-${activeModel}-atelier.txt`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="atelier-shell">
    <Experience apiRef={showroomApi} activeModel={activeModel} paint={paint.hex} twoTone={twoTone.hex} leather={leather.hex} wood={wood.hex} jewellery={jewellery.id} caliper={caliper.hex} doorsOpen={doorsOpen} bonnetOpen={bonnetOpen} driveMode={driveMode} sectionIndex={section} onProgress={setProgress} onReady={() => setLoading(false)} onBusy={setBusy} />

    {loading && <div className="prelude"><div className="prelude-mark">RR</div><p>Rolls-Royce</p><div className="loading-line"><i style={{ width: `${Math.max(progress, 5)}%` }} /></div><small>Preparing the private atelier · {progress}%</small></div>}

    <header className="topbar">
      <button className="brand" onClick={() => go("arrival")} aria-label="Return to arrival"><b>ROLLS-ROYCE</b><span>Motor Cars · Digital Atelier</span></button>
      <nav className="model-nav" aria-label="Motor car selection">{Object.keys(LINEUP).map((model) => <button disabled={busy} className={model === activeModel ? "current" : ""} onClick={() => setActiveModel(model)} key={model}>{model}</button>)}</nav>
      <div className="header-actions">{!cabinMode && <><button className="text-button" onClick={() => setPanelOpen(true)}>Configure <Arrow /></button><button className={`drive-button ${driveMode ? "live" : ""}`} onClick={() => setDriveMode(!driveMode)}>{driveMode ? "Return to atelier" : "Enter the pavilion"}</button></>}</div>
    </header>

    {driveMode && <div className="pavilion-hud" data-ui>
      <div className="pavilion-caption">
        <p className="kicker">{ridePhase === "riding" ? "The magic carpet ride · through the city" : "The private pavilion · overlooking the city"}</p>
        <h3>{activeModel}</h3>
      </div>
      {ridePhase === "pavilion" ? <>
        <nav className="view-switch" aria-label="Camera view">
          {[["front", "Front view"], ["side", "Side view"], ["rear", "Rear view"]].map(([id, label]) => (
            <button key={id} className={driveView === id ? "is-active" : ""} onClick={() => { setDriveView(id); showroomApi.current?.setDriveView(id); }}>{label}</button>
          ))}
        </nav>
        <button className="engine-start" onClick={startRide}><span className="es-dot" />Start engine</button>
      </> : <button className="engine-start halt" onClick={stopRide}>Slow to a halt</button>}
    </div>}

    {!driveMode && !cabinMode && <><aside className="chapter-rail">{CHAPTERS.map(([id, label], index) => <button onClick={() => go(id)} key={id} className={index === section ? "active" : ""}><i /><span>{String(index + 1).padStart(2, "0")}</span><em>{label}</em></button>)}</aside><div className="view-hint">Drag to explore <i>↔</i></div></>}

    {cabinMode && <CabinHUD showroomApi={showroomApi} onExit={leaveCabin} />}

    <main className={driveMode || cabinMode ? "narrative is-hidden" : "narrative"} id="scroll-root">
      <section id="arrival" className="scene-section arrival"><div className="arrival-copy" data-reveal><p className="kicker">Goodwood · West Sussex</p><h1>{activeModel}<em> in residence.</em></h1><div className="rule" /><p className="lede">An intimate encounter with a motor car imagined without compromise, set within a contemporary house of craftsmanship.</p><button className="outline-button" onClick={() => go("gallery")}>Begin the private viewing <Arrow /></button></div><p className="vertical-caption">A study in quiet confidence</p></section>

      <section id="gallery" className="scene-section left-copy"><div className="story-card" data-reveal><p className="kicker">01 · The marque</p><h2>Spaces made for <em>the art of arrival.</em></h2><p>The car is only one part of the composition. A limestone gallery, warm walnut and an open English landscape are held in a single, deliberate frame.</p><div className="stat-row"><span><b>119</b> years of craft</span><span><b>1</b> commission at a time</span></div></div></section>

      <section id="atelier" className="scene-section atelier-section"><div className="atelier-intro" data-reveal><p className="kicker">02 · Bespoke atelier</p><h2>Nothing should be <em>quite like it.</em></h2><p>Every decision begins with a material, a memory and a conversation.</p><button className="outline-button" onClick={() => setPanelOpen(true)}>Open the material library <Arrow /></button></div><div className="specimen-card" data-reveal><span>Current commission</span><strong>{paint.name}</strong><i style={{ background: paint.hex }} /><small>{leather.name} leather · {wood.name} veneer</small></div></section>

      <section id="sanctuary" className="scene-section sanctuary-section"><div className="sanctuary-copy" data-reveal><p className="kicker">03 · A private world</p><h2>The most <em>personal room</em> in the house.</h2><p>Step inside and the website ends. Take the driver's seat or the rear lounge, look wherever you like, walk the coachwork, touch any surface to learn what it is, and commission the cabin around you in real time.</p><button className="outline-button" disabled={loading} onClick={enterCabin}>Step inside the sanctuary <Arrow /></button></div></section>

      <section id="craft" className="scene-section right-copy"><div className="story-card dark" data-reveal><p className="kicker">04 · The details</p><h2>Precision, with <em>a human pulse.</em></h2><p>Polished metal, hand-finished veneer and a twelve-cylinder heart. The details deserve their own moment in the light.</p><button className="text-button pale" onClick={() => setBonnetOpen(!bonnetOpen)}>{bonnetOpen ? "Conceal the powerplant" : "Examine the powerplant"} <Arrow /></button></div></section>

      <section id="commission" className="scene-section commission-section"><div className="commission-copy" data-reveal><p className="kicker">05 · Your commission</p><h2>Made for <em>no one else.</em></h2><p>Begin a private conversation with a Rolls-Royce specialist. There is no configurator at the end of this experience—only the start of yours.</p><button className="commission-button" onClick={commission}>Request a private consultation <Arrow /></button></div><footer><span>Rolls-Royce Motor Cars</span><span>Digital Atelier · 2026</span><span>Designed around you</span></footer></section>
    </main>

    {panelOpen && <div className="config-overlay" role="dialog" aria-modal="true" aria-label="Bespoke material library"><button className="scrim" onClick={() => setPanelOpen(false)} aria-label="Close material library" /><aside className="config-panel" data-lenis-prevent><button className="close" onClick={() => setPanelOpen(false)}>Close <span>×</span></button><p className="kicker">The material library</p><h2>Your <em>{activeModel}</em></h2><p className="panel-copy">A private study in colour, tactility and light.</p><OptionRow label="Coachwork" items={PAINTS} active={paint} onChange={setPaint} color /><OptionRow label="Upper coachwork" items={TWO_TONE} active={twoTone} onChange={setTwoTone} color /><OptionRow label="Leather" items={LEATHERS} active={leather} onChange={setLeather} color /><OptionRow label="Veneer" items={WOODS} active={wood} onChange={setWood} /><OptionRow label="Jewellery" items={JEWELLERY} active={jewellery} onChange={setJewellery} /><OptionRow label="Brake calipers" items={CALIPERS} active={caliper} onChange={setCaliper} color /><button className="commission-button full" onClick={commission}>Save this private commission <Arrow /></button></aside></div>}
  </div>;
}
