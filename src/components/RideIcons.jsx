/*
 * Thin-stroke line icons for the ride rail.
 *
 * Drawn on a 24-unit grid at 1.2 stroke so they sit at the same optical
 * weight as the interface's hairline borders — a heavier icon set is the
 * fastest way to make a luxury interface look like a dashboard utility.
 */
const S = {
  width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round",
};

export const IconLights = () => (
  <svg {...S}><circle cx="9" cy="12" r="4" /><path d="M15 8.5h5M15 12h6.5M15 15.5h5M9 4.5v1.5M4.2 6.6l1 1M3 12h1.5M4.2 17.4l1-1M9 18v1.5" /></svg>
);
export const IconCamera = () => (
  <svg {...S}><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-1.8h7.2L16.3 7h3.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><circle cx="12" cy="12.6" r="3.4" /></svg>
);
export const IconDrive = () => (
  <svg {...S}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 3.5V9M4.2 16.5l4.9-2.9M19.8 16.5l-4.9-2.9" /></svg>
);
export const IconAmbient = () => (
  <svg {...S}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" /></svg>
);
export const IconSeats = () => (
  <svg {...S}><path d="M7 4.5h4.5A2.5 2.5 0 0 1 14 7v6H9.5A2.5 2.5 0 0 1 7 10.5z" /><path d="M14 13h3.2a2 2 0 0 1 2 2v4.5M7 13v6.5" /></svg>
);
export const IconMusic = () => (
  <svg {...S}><path d="M9 18V6.5l10-2V16" /><circle cx="6.6" cy="18" r="2.4" /><circle cx="16.6" cy="16" r="2.4" /></svg>
);
export const IconWheel = () => (
  <svg {...S}><path d="M4 15.5h16M5.5 15.5l1.6-5.2A2 2 0 0 1 9 8.8h6a2 2 0 0 1 1.9 1.5l1.6 5.2" /><circle cx="7.5" cy="17.5" r="1.7" /><circle cx="16.5" cy="17.5" r="1.7" /></svg>
);
export const IconExpand = () => (
  <svg {...S}><path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15" /></svg>
);
export const IconWave = () => (
  <svg {...S}><path d="M4 12h1.6M8 8.2v7.6M12 5.5v13M16 8.8v6.4M20 11h0.5" /></svg>
);
export const IconExit = () => (
  <svg {...S}><path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" /><path d="M10 8.5 6.5 12 10 15.5M6.5 12H15" /></svg>
);
