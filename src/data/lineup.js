// The real 3D lineup. Every entry is a genuine photogrammetry/CAD-derived
// model (CC-BY, credited in the footer) — no CSS boxes anywhere.

export const LINEUP = {
  Phantom: {
    file: "/models/phantom.glb",
    tagline: "The flagship saloon. Imposing scale, stately proportions.",
    specs: {
      engine: "6.75L Twin-Turbo V12",
      power: "563 bhp / 900 Nm",
      accel: "0–60 mph in 5.1s",
      price: "From $460,000",
    },
    description:
      "The ultimate pinnacle of luxury. Standing as the grand flagship, Phantom represents the peak of bespoke craftsmanship and imposing stateliness.",
    length: 5.9,
    capabilities: { doors: false, bonnet: false, interior: false },
  },
  Ghost: {
    file: "/models/ghost.glb",
    tagline: "Post-opulent. The illuminated Pantheon grille.",
    specs: {
      engine: "6.75L Twin-Turbo V12",
      power: "563 bhp / 850 Nm",
      accel: "0–60 mph in 4.6s",
      price: "From $340,000",
    },
    description:
      "Post-opulent beauty. Characterised by minimalist luxury and advanced acoustic shielding, Ghost is the sanctuary designed for modern excellence.",
    length: 5.55,
    capabilities: { doors: false, bonnet: false, interior: true },
  },
  Cullinan: {
    file: "/models/cullinan.glb",
    tagline: "The luxury SUV. Effortless, everywhere.",
    specs: {
      engine: "6.75L Twin-Turbo V12",
      power: "563 bhp / 850 Nm",
      accel: "0–60 mph in 5.0s",
      price: "From $390,000",
    },
    description:
      "Supreme liberty. The pinnacle of luxury SUV engineering, enabling the famous 'magic carpet ride' across the most challenging terrain.",
    length: 5.34,
    capabilities: { doors: false, bonnet: false, interior: false },
  },
  "Silver Cloud": {
    file: "/models/silvercloud.glb",
    tagline: "1955. Where the promise was made.",
    specs: {
      engine: "4.9L Inline-Six",
      power: "155 bhp",
      accel: "0–60 mph in 13.5s",
      price: "Heritage — priceless",
    },
    description:
      "Seventy years before Ghost, the Silver Cloud defined effortless motoring. At sixty miles an hour, the loudest noise came from the electric clock.",
    length: 5.38,
    capabilities: { doors: false, bonnet: false, interior: false },
  },
};

export const INTERIOR_CAR_FILE = "/models/ghost-interior.glb";

export const PAINTS = [
  { name: "Arctic White", hex: "#e8e6df" },
  { name: "Silver Haze", hex: "#a4aab0" },
  { name: "Salamanca Blue", hex: "#1c2e4a" },
  { name: "Midnight Sapphire", hex: "#0d1526" },
  { name: "Black Diamond", hex: "#0b0b0e" },
  { name: "English Emerald", hex: "#0e2b20" },
];

export const TWO_TONE = [
  { name: "Monotone", hex: null },
  { name: "Arctic White", hex: "#e8e6df" },
  { name: "Silver Satin", hex: "#b9bec4" },
  { name: "Midnight", hex: "#0a0e18" },
];

export const LEATHERS = [
  { name: "Arctic White", hex: "#ded8ca" },
  { name: "Navy Blue", hex: "#22406b" },
  { name: "Moccasin Tan", hex: "#b0723a" },
  { name: "Hotspur Red", hex: "#8f1d22" },
  { name: "Slate Grey", hex: "#4a4e54" },
];

export const WOODS = [
  { name: "Open-Pore Walnut", hex: "#4a2c18" },
  { name: "Piano Black", hex: "#141417" },
  { name: "Bleached Ash", hex: "#b9a88a" },
];

export const JEWELLERY = [
  { name: "Polished Chrome", id: "chrome" },
  { name: "24K Gold", id: "gold" },
  { name: "Smoked Onyx", id: "smoked" },
];

export const CALIPERS = [
  { name: "Ice Blue", hex: "#7fb2ff" },
  { name: "Black Badge Yellow", hex: "#e8c832" },
  { name: "Hotspur Red", hex: "#c22730" },
  { name: "Silver", hex: "#c7ccd2" },
];
