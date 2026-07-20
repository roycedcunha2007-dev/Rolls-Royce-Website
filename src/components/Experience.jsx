import React, { useEffect, useRef } from "react";
import { Showroom } from "../three/Showroom";

/*
 * Thin React shell around the imperative Showroom engine.
 * All scene mutations flow through the ref-stored instance so the WebGL
 * world is never rebuilt on re-render.
 */
export default function Experience({
  activeModel,
  paint,
  twoTone,
  leather,
  wood,
  jewellery,
  caliper,
  doorsOpen,
  bonnetOpen,
  driveMode,
  sectionIndex,
  onProgress,
  onReady,
  onTelemetry,
  onBusy,
  apiRef,
}) {
  const containerRef = useRef(null);
  const showroomRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onProgress, onReady, onTelemetry, onBusy };

  useEffect(() => {
    const showroom = new Showroom(containerRef.current, {
      onProgress: (p) => cbRef.current.onProgress?.(p),
      onReady: () => cbRef.current.onReady?.(),
      onTelemetry: (t) => cbRef.current.onTelemetry?.(t),
      onBusy: (b) => cbRef.current.onBusy?.(b),
    });
    showroomRef.current = showroom;
    if (apiRef) apiRef.current = showroom;
    return () => {
      if (apiRef) apiRef.current = null;
      showroom.dispose();
    };
  }, []);

  useEffect(() => { showroomRef.current?.setModel(activeModel); }, [activeModel]);
  useEffect(() => { showroomRef.current?.setPaint(paint); }, [paint]);
  useEffect(() => { showroomRef.current?.setTwoTone(twoTone); }, [twoTone]);
  useEffect(() => { showroomRef.current?.setLeather(leather); }, [leather]);
  useEffect(() => { showroomRef.current?.setWood(wood); }, [wood]);
  useEffect(() => { showroomRef.current?.setJewellery(jewellery); }, [jewellery]);
  useEffect(() => { showroomRef.current?.setCaliper(caliper); }, [caliper]);
  useEffect(() => { showroomRef.current?.setDoors(doorsOpen); }, [doorsOpen]);
  useEffect(() => { showroomRef.current?.setBonnet(bonnetOpen); }, [bonnetOpen]);
  useEffect(() => { showroomRef.current?.setDrive(driveMode); }, [driveMode]);
  useEffect(() => { showroomRef.current?.setSectionIndex(sectionIndex); }, [sectionIndex]);

  return <div ref={containerRef} className="fixed inset-0 canvas-grab" aria-hidden="true" />;
}
