import { useEffect, useState } from "react";

import arduinoUno from "../../assets/components/arduino-uno.webp";
import arduinoNano from "../../assets/components/arduino-nano.webp";
import esp32 from "../../assets/components/esp32-devkit.webp";
import multimeter from "../../assets/components/multimeter.webp";
import oscilloscope from "../../assets/components/oscilloscope.webp";
import breadboard from "../../assets/components/breadboard.webp";
import jumperWire from "../../assets/components/jumper-wire.webp";
import ledRed from "../../assets/components/led-red.webp";
import resistor220 from "../../assets/components/resistor-220.webp";
import resistor10k from "../../assets/components/resistor-10k.webp";
import servo from "../../assets/components/servo-sg90.webp";
import ultrasonic from "../../assets/components/ultrasonic-hc-sr04.webp";

interface CatalogueItem {
  code: string;
  name: string;
  category: string;
  sizeClass: "EXPENSIVE" | "SMALL";
  image: string;
  tint: string;
}

// Mirrors the twelve components in backend/prisma/seed.ts.
const CATALOGUE: CatalogueItem[] = [
  { code: "ARD-UNO-R3", name: "Arduino Uno R3", category: "Microcontroller", sizeClass: "EXPENSIVE", image: arduinoUno, tint: "from-teal-500/30" },
  { code: "MULTI-DIG", name: "Digital Multimeter", category: "Instrument", sizeClass: "EXPENSIVE", image: multimeter, tint: "from-yellow-400/30" },
  { code: "RES-220OHM", name: "Resistor 220Ω", category: "Passive", sizeClass: "SMALL", image: resistor220, tint: "from-amber-300/25" },
  { code: "ESP32-DEV", name: "ESP32 DevKit", category: "Microcontroller", sizeClass: "EXPENSIVE", image: esp32, tint: "from-slate-400/30" },
  { code: "LED-RED-5MM", name: "Red LED 5mm", category: "Passive", sizeClass: "SMALL", image: ledRed, tint: "from-rose-500/30" },
  { code: "OSCIL-50MHZ", name: "Oscilloscope", category: "Instrument", sizeClass: "EXPENSIVE", image: oscilloscope, tint: "from-emerald-400/30" },
  { code: "SERVO-SG90", name: "Servo SG90", category: "Motor", sizeClass: "SMALL", image: servo, tint: "from-blue-500/30" },
  { code: "BREAD-830PT", name: "Breadboard 830pt", category: "Component Holder", sizeClass: "SMALL", image: breadboard, tint: "from-slate-200/25" },
  { code: "ARD-NANO", name: "Arduino Nano", category: "Microcontroller", sizeClass: "EXPENSIVE", image: arduinoNano, tint: "from-brand-600/30" },
  { code: "JUMP-MM", name: "Jumper Wire M-M", category: "Passive", sizeClass: "SMALL", image: jumperWire, tint: "from-fuchsia-500/25" },
  { code: "ULTRA-HC-SR04", name: "Ultrasonic HC-SR04", category: "Sensor", sizeClass: "SMALL", image: ultrasonic, tint: "from-sky-400/30" },
  { code: "RES-10KOHM", name: "Resistor 10kΩ", category: "Passive", sizeClass: "SMALL", image: resistor10k, tint: "from-orange-400/25" },
];

const INTERVAL_MS = 2000;

type Shape = "hero" | "tall" | "compact" | "wide";

// Bento layout on a 4×3 grid: hero, tall, two compact and two wide tiles.
// Offsets are distinct mod 12 so no two tiles ever show the same component.
const TILES: { area: string; offset: number; shape: Shape }[] = [
  { area: "col-span-2 row-span-2", offset: 0, shape: "hero" },
  { area: "col-span-1 row-span-2", offset: 2, shape: "tall" },
  { area: "col-span-1 row-span-1", offset: 4, shape: "compact" },
  { area: "col-span-1 row-span-1", offset: 6, shape: "compact" },
  { area: "col-span-2 row-span-1", offset: 8, shape: "wide" },
  { area: "col-span-2 row-span-1", offset: 10, shape: "wide" },
];

// Where the photo sits in each tile shape; labels overlay it.
const PHOTO_BOX: Record<Shape, string> = {
  hero: "inset-x-6 top-10 bottom-16",
  tall: "inset-x-2 top-8 bottom-10",
  compact: "inset-x-2 top-6 bottom-6",
  wide: "right-3 top-3 bottom-3 left-[38%]",
};

function Tile({ item, previous, tick, shape, delay, area }: {
  item: CatalogueItem;
  previous: CatalogueItem | null;
  tick: number;
  shape: Shape;
  delay: number;
  area: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm transition-transform duration-500 hover:-translate-y-1 hover:border-brand-300/40 ${area}`}
    >
      {previous && (
        <div key={`out-${tick}`} className="tile-out absolute inset-0" style={{ animationDelay: `${delay}ms` }} aria-hidden="true">
          <TileFace item={previous} shape={shape} />
        </div>
      )}
      <div key={`in-${tick}`} className="tile-in absolute inset-0" style={{ animationDelay: `${delay}ms` }}>
        <TileFace item={item} shape={shape} />
      </div>
    </div>
  );
}

function TileFace({ item, shape }: { item: CatalogueItem; shape: Shape }) {
  const hero = shape === "hero";
  return (
    <div className={`relative h-full bg-gradient-to-br ${item.tint} to-transparent`}>
      <div className={`absolute ${PHOTO_BOX[shape]} transition-transform duration-500 group-hover:scale-105`}>
        <img
          src={item.image}
          alt={item.name}
          draggable={false}
          className="tile-float h-full w-full object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.55)]"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />

      <div className={`absolute inset-x-0 top-0 flex items-start gap-2 p-2.5 sm:p-3 ${hero ? "justify-between" : "justify-end"}`}>
        {hero && (
          <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] tracking-wider text-brand-200/90">
            {item.code}
          </span>
        )}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide sm:px-2 sm:text-[10px] ${
            item.sizeClass === "EXPENSIVE" ? "bg-amber-300/90 text-amber-950" : "bg-emerald-300/90 text-emerald-950"
          }`}
        >
          {item.sizeClass}
        </span>
      </div>

      <div className={`absolute bottom-0 left-0 p-2.5 sm:p-3.5 ${shape === "wide" ? "max-w-[45%]" : "right-0"}`}>
        <p className={`font-display font-semibold leading-tight text-white drop-shadow ${hero ? "text-lg sm:text-xl" : "text-xs sm:text-sm"}`}>
          {item.name}
        </p>
        {(hero || shape === "wide") && <p className="mt-0.5 text-[11px] text-slate-300 sm:text-xs">{item.category}</p>}
      </div>
    </div>
  );
}

export default function ComponentCollage() {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setTick((t) => t + 1), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  // Preload every photo so a tile never swaps to a half-loaded image.
  useEffect(() => {
    CATALOGUE.forEach((item) => {
      const img = new Image();
      img.src = item.image;
    });
  }, []);

  const at = (t: number, offset: number) => CATALOGUE[(t + offset) % CATALOGUE.length];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-500/20 via-brand-600/10 to-amber-400/20 blur-2xl" />
      <div className="grid aspect-[4/3] w-full grid-cols-4 grid-rows-3 gap-3 sm:gap-4">
        {TILES.map((tile, i) => (
          <Tile
            key={i}
            area={tile.area}
            shape={tile.shape}
            delay={i * 110}
            tick={tick}
            item={at(tick, tile.offset)}
            previous={tick === 0 ? null : at(tick - 1, tile.offset)}
          />
        ))}
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-amber-300" : "animate-pulse bg-emerald-400"}`} />
        {paused ? "Paused — move away to resume" : "Live from the seeded catalogue · hover to pause"}
      </p>
    </div>
  );
}
