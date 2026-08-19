/** Pixel Forge — Fluorescent Drafting Board: full pixel laboratory with hard-edge sprites and local exports. */
import { useEffect, useMemo, useRef, useState } from "react";
import { StickerOverlay, primeMotionPermission } from "./botlab-sticker";

/*
 * Parts are 16x16 grids: "." is transparent, letters are palette slots:
 *   o outline  a primary  b shade  c accent  d panel  e glow
 * Layers composite in order: body, head, eyes, mouth, top.
 * Shared anchors: heads top out at row 2 and bottom at row 8, eyes live in
 * rows 4-6 / cols 5-10, mouths in rows 6-7 / cols 5-10, bodies start at row 8.
 */

const _ = "................";

type Part = {
  name: string;
  grid: string[];
  /* per-body idle: "head" bobs the head group, "all" bobs the whole sprite;
     altRows swaps body rows on the off-beat (tread roll, thruster flicker) */
  idle?: { bob?: "head" | "all"; altRows?: Record<number, string> };
};

const BODIES: Part[] = [
  {
    name: "box",
    grid: [
      _, _, _, _, _, _, _, _,
      "....oooooooo....",
      "..oooaaaaaaooo..",
      "..oaoaddddaoao..",
      "..oaoaddddaoao..",
      "..oooaaaaaaooo..",
      "....oooooooo....",
      ".....oo..oo.....",
      "....ooo..ooo....",
    ],
    idle: { bob: "head" },
  },
  {
    name: "tread",
    grid: [
      _, _, _, _, _, _, _, _,
      "...oooooooooo...",
      "...oaaaaaaaao...",
      "...oaddddddao...",
      "...oaddddddao...",
      "...oaaaaaaaao...",
      "..oooooooooooo..",
      "..obbobbobbobb..",
      "..oooooooooooo..",
    ],
    idle: { altRows: { 14: "..bbobbobbobbo.." } },
  },
  {
    name: "hover",
    grid: [
      _, _, _, _, _, _, _, _,
      ".....oooooo.....",
      "....oaaaaaao....",
      "....oacaacao....",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "....oooooooo....",
      ".....e.ee.e.....",
      _,
    ],
    idle: { bob: "all", altRows: { 14: ".....ee..ee....." } },
  },
  {
    name: "strider",
    grid: [
      _, _, _, _, _, _, _, _,
      ".....oooooo.....",
      ".....oaaaao.....",
      "...o.oaddao.o...",
      "...o.oaaaao.o...",
      ".....oaaaao.....",
      "......oooo......",
      "......o..o......",
      ".....oo..oo.....",
    ],
    idle: { bob: "head" },
  },
  {
    name: "pod",
    grid: [
      _, _, _, _, _, _, _, _,
      ".....oooooo.....",
      "....oaaaaaao....",
      "...oaaaaaaaao...",
      "...oaaaaaabao...",
      "....oaaaabao....",
      ".....oooooo.....",
      "....oo....oo....",
      _,
    ],
    idle: { bob: "head" },
  },
];

const HEADS: Part[] = [
  {
    name: "cube",
    grid: [
      _, _,
      "....oooooooo....",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "....oooooooo....",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "dome",
    grid: [
      _, _,
      "......oooo......",
      "....ooaaaaoo....",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oooooooooo...",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "crt",
    grid: [
      _, _,
      "..oooooooooooo..",
      "..oaaaaaaaaaao..",
      "..oaddddddddao..",
      "..oaddddddddao..",
      "..oaddddddddao..",
      "..oaddddddddao..",
      "..oooooooooooo..",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "wedge",
    grid: [
      _, _,
      ".....oooooo.....",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "..oaaaaaaaaaao..",
      "..oooooooooooo..",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "pail",
    grid: [
      _, _,
      "...oooooooooo...",
      "...obbbbbbbbo...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "....oaaaaaao....",
      ".....oooooo.....",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "cat",
    grid: [
      _,
      "....o......o....",
      "....oa....ao....",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oaaaaaaaao...",
      "...oooooooooo...",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "dog",
    grid: [
      _, _,
      "....oooooooo....",
      "..oboaaaaaaobo..",
      "..oboaaaaaaobo..",
      "..oooaaaaaaooo..",
      "....oaaaaaao....",
      "....oaaaaaao....",
      "....oooooooo....",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "bear",
    grid: [
      _,
      "...oo......oo...",
      "..oaaooooooaao..",
      "..oaaaaaaaaaao..",
      "..oaaaaaaaaaao..",
      "..oaaaaaaaaaao..",
      "..oaaaddddaaao..",
      "..oaaaddddaaao..",
      "..oooooooooooo..",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "lion",
    grid: [
      _,
      "...b.b.bb.b.b...",
      "..bbbbbbbbbbbb..",
      "..bboooooooobb..",
      "..bboaaaaaaobb..",
      "..bboaaaaaaobb..",
      "..bboaaaaaaobb..",
      "..bboaaaaaaobb..",
      "..bboooooooobb..",
      _, _, _, _, _, _, _,
    ],
  },
  {
    name: "raccoon",
    grid: [
      _,
      "...o........o...",
      "...oo......oo...",
      "...oaooooooao...",
      "...obbbbbbbbo...",
      "...obbbbbbbbo...",
      "...oaaaaaaaao...",
      "...oaaddddaao...",
      "...oooooooooo...",
      _, _, _, _, _, _, _,
    ],
  },
];

const EYES: Part[] = [
  {
    name: "dots",
    grid: [_, _, _, _, _, "......o..o......", _, _, _, _, _, _, _, _, _, _],
  },
  {
    name: "blocks",
    grid: [
      _, _, _, _,
      ".....ee..ee.....",
      ".....ee..ee.....",
      _, _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "visor",
    grid: [_, _, _, _, _, ".....eeeeee.....", _, _, _, _, _, _, _, _, _, _],
  },
  {
    name: "cyclops",
    grid: [
      _, _, _, _,
      "......oooo......",
      "......oeeo......",
      "......oooo......",
      _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "sleep",
    grid: [_, _, _, _, _, ".....oo..oo.....", _, _, _, _, _, _, _, _, _, _],
  },
];

const MOUTHS: Part[] = [
  {
    name: "grill",
    grid: [_, _, _, _, _, _, _, "......o.o.o.....", _, _, _, _, _, _, _, _],
  },
  {
    name: "line",
    grid: [_, _, _, _, _, _, _, "......oooo......", _, _, _, _, _, _, _, _],
  },
  {
    name: "smile",
    grid: [
      _, _, _, _, _, _,
      ".....o....o.....",
      "......oooo......",
      _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "speaker",
    grid: [_, _, _, _, _, _, _, ".....oeoeoe.....", _, _, _, _, _, _, _, _],
  },
  { name: "none", grid: Array(16).fill(_) },
];

const TOPS: Part[] = [
  {
    name: "antenna",
    grid: [
      ".......e........",
      ".......o........",
      ".......o........",
      _, _, _, _, _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "horns",
    grid: [
      ".....e....e.....",
      ".....o....o.....",
      ".....o....o.....",
      _, _, _, _, _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "beacon",
    grid: [
      ".......ee.......",
      "......eeee......",
      "......oooo......",
      _, _, _, _, _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "fin",
    grid: [
      "........c.......",
      ".......cc.......",
      "......ccc.......",
      _, _, _, _, _, _, _, _, _, _, _, _, _,
    ],
  },
  {
    name: "cap",
    grid: [
      _,
      ".....cccccc.....",
      "....cccccccc....",
      _, _, _, _, _, _, _, _, _, _, _, _, _,
    ],
  },
  { name: "none", grid: Array(16).fill(_) },
];

/* oDark replaces the o (outline) slot when the page is dark, where the
   near-black outlines vanish into the background */
const PALETTES = [
  {
    name: "factory",
    colors: { o: "#23262d", a: "#9aa3ae", b: "#6f7680", c: "#e2582a", d: "#d9dee4", e: "#ffd23e" },
    oDark: "#4d545f",
  },
  {
    name: "copper",
    colors: { o: "#2b1d10", a: "#c98a4b", b: "#9c6430", c: "#3fb8af", d: "#eed9b4", e: "#9ef5dc" },
    oDark: "#6a4a28",
  },
  {
    name: "dmg",
    colors: { o: "#0f380f", a: "#8bac0f", b: "#306230", c: "#306230", d: "#9bbc0f", e: "#e0f8d0" },
    oDark: "#2b542b",
  },
  {
    name: "sakura",
    colors: { o: "#42213d", a: "#f085a6", b: "#c65b85", c: "#7bd1f0", d: "#ffd9e6", e: "#fff3a0" },
    oDark: "#6d3a64",
  },
  {
    name: "stealth",
    colors: { o: "#0c0f14", a: "#333a46", b: "#232833", c: "#ff3860", d: "#49525f", e: "#27e0ff" },
    oDark: "#4d5666",
  },
  {
    name: "hazard",
    colors: { o: "#221f18", a: "#e6c229", b: "#b7941a", c: "#2b2f36", d: "#f4e9b6", e: "#ff4136" },
    oDark: "#5f5735",
  },
] as const;

if (import.meta.env.DEV) {
  for (const p of [...BODIES, ...HEADS, ...EYES, ...MOUTHS, ...TOPS])
    if (p.grid.length !== 16 || p.grid.some((r) => r.length !== 16))
      console.error("bad part grid:", p.name);
}

/* animation variants: lists of [frame, duration ms]; every idle cycle's
   total divides 4000ms so any combination loops cleanly every 4s */
type Frames = [Anim, number][];
export const total = (f: Frames) => f.reduce((s, [, d]) => s + d, 0);
export const frameAt = (f: Frames, t: number): Anim => {
  for (const [a, d] of f) {
    if (t < d) return a;
    t -= d;
  }
  return {};
};

const INTROS: { name: string; frames: Frames }[] = [
  {
    // fall from above, land with a squash, small rebound, settle
    name: "hop",
    frames: [
      [{ dy: -16 }, 55],
      [{ dy: -11 }, 55],
      [{ dy: -6 }, 55],
      [{ dy: -2 }, 55],
      [{ bob: true }, 110],
      [{ dy: -4 }, 55],
      [{ dy: -2 }, 55],
      [{ bob: true }, 55],
      [{}, 55],
    ],
  },
  {
    // built row by row from the ground up
    name: "print",
    frames: Array.from({ length: 16 }, (_, i) => [{ reveal: i }, 24] as [Anim, number]),
  },
  {
    // skid in from the left with a slight overshoot
    name: "slide",
    frames: [
      [{ dx: -16 }, 45],
      [{ dx: -12 }, 45],
      [{ dx: -8 }, 45],
      [{ dx: -5 }, 45],
      [{ dx: -3 }, 45],
      [{ dx: -1 }, 45],
      [{ dx: 1 }, 45],
      [{}, 45],
    ],
  },
  {
    // layers stack up: body, head, eyes, mouth, top
    name: "assemble",
    frames: [
      [{ layers: 1 }, 110],
      [{ layers: 2 }, 110],
      [{ layers: 3 }, 110],
      [{ layers: 4 }, 110],
      [{ layers: 5 }, 110],
    ],
  },
  {
    // flicker into existence
    name: "teleport",
    frames: [
      [{ hide: true }, 70],
      [{}, 70],
      [{ hide: true }, 70],
      [{}, 70],
      [{ hide: true }, 70],
      [{}, 70],
    ],
  },
];

export const IDLES: { name: string; frames: Frames }[] = [
  {
    // still ~3s, blink mid-rest, double bob at the end of the cycle
    name: "calm",
    frames: [
      [{}, 1500],
      [{ blink: true }, 200],
      [{}, 1300],
      [{ bob: true }, 250],
      [{}, 250],
      [{ bob: true }, 250],
      [{}, 250],
    ],
  },
  {
    // steady bounce
    name: "bounce",
    frames: [
      [{}, 400],
      [{ bob: true }, 400],
    ],
  },
  {
    // asleep and breathing, briefly opens its eyes
    name: "doze",
    frames: [
      [{ blink: true }, 700],
      [{ blink: true, bob: true }, 700],
      [{ blink: true }, 700],
      [{ blink: true, bob: true }, 700],
      [{}, 1200],
    ],
  },
  {
    // nervous double twitch, later a quick blink
    name: "twitch",
    frames: [
      [{}, 900],
      [{ bob: true }, 80],
      [{}, 90],
      [{ bob: true }, 80],
      [{}, 1300],
      [{ blink: true }, 120],
      [{}, 1430],
    ],
  },
  { name: "off", frames: [[{}, 1000]] },
];

export type Bot = {
  body: number;
  head: number;
  eyes: number;
  mouth: number;
  top: number;
  palette: number;
  intro: number;
  idle: number;
};

const BOT_KEYS = [
  "body",
  "head",
  "eyes",
  "mouth",
  "top",
  "palette",
  "intro",
  "idle",
] as const;

const SLOTS = [
  ["body", BODIES],
  ["head", HEADS],
  ["eyes", EYES],
  ["mouth", MOUTHS],
  ["top", TOPS],
] as const;

function bot(
  body: string,
  head: string,
  eyes: string,
  mouth: string,
  top: string,
  palette: string,
  intro = "hop",
  idle = "calm",
): Bot {
  return {
    body: BODIES.findIndex((p) => p.name === body),
    head: HEADS.findIndex((p) => p.name === head),
    eyes: EYES.findIndex((p) => p.name === eyes),
    mouth: MOUTHS.findIndex((p) => p.name === mouth),
    top: TOPS.findIndex((p) => p.name === top),
    palette: PALETTES.findIndex((p) => p.name === palette),
    intro: INTROS.findIndex((v) => v.name === intro),
    idle: IDLES.findIndex((v) => v.name === idle),
  };
}

export const PRESETS: { name: string; bot: Bot }[] = [
  { name: "worker", bot: bot("box", "cube", "dots", "grill", "antenna", "factory") },
  { name: "scout", bot: bot("strider", "wedge", "visor", "none", "horns", "stealth", "slide", "twitch") },
  { name: "heavy", bot: bot("tread", "pail", "cyclops", "grill", "none", "hazard", "assemble", "calm") },
  { name: "buddy", bot: bot("pod", "dome", "blocks", "smile", "beacon", "sakura", "hop", "bounce") },
  { name: "handheld", bot: bot("box", "crt", "sleep", "line", "cap", "dmg", "print", "calm") },
  { name: "drifter", bot: bot("hover", "dome", "sleep", "none", "fin", "copper", "teleport", "doze") },
  { name: "cat", bot: bot("strider", "cat", "sleep", "smile", "none", "copper", "hop", "doze") },
  { name: "dog", bot: bot("pod", "dog", "dots", "smile", "none", "factory", "hop", "bounce") },
  { name: "bear", bot: bot("pod", "bear", "dots", "none", "none", "sakura", "assemble", "doze") },
  { name: "lion", bot: bot("box", "lion", "dots", "line", "none", "hazard", "assemble", "off") },
  { name: "raccoon", bot: bot("strider", "raccoon", "dots", "none", "none", "factory", "teleport", "twitch") },
];

export function randomBot(): Bot {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    body: r(BODIES.length),
    head: r(HEADS.length),
    eyes: r(EYES.length),
    mouth: r(MOUTHS.length),
    top: r(TOPS.length),
    palette: r(PALETTES.length),
    intro: r(INTROS.length),
    idle: r(IDLES.length),
  };
}

/* dy/dx: whole-sprite offset, bob: apply the body's idle transforms,
   blink: swap eyes for the closed "sleep" frame, layers: draw only the
   first N layers, hide: draw nothing, reveal: rows shown from the bottom up */
type Anim = {
  dy?: number;
  dx?: number;
  bob?: boolean;
  blink?: boolean;
  layers?: number;
  hide?: boolean;
  reveal?: number;
};

export function composeGrid(b: Bot, anim: Anim = {}): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: 16 }, () =>
    Array(16).fill(null),
  );
  if (anim.hide) return grid;
  const { dy = 0, dx = 0, bob = false, blink = false, layers: n = 5 } = anim;
  const idle = BODIES[b.body].idle ?? {};
  let bodyGrid = BODIES[b.body].grid;
  if (bob && idle.altRows)
    bodyGrid = bodyGrid.map((row, y) => idle.altRows![y] ?? row);
  const dyAll = dy + (bob && idle.bob === "all" ? 1 : 0);
  const dyHead = dy + (bob && idle.bob ? 1 : 0);
  const eyes = blink ? EYES.find((e) => e.name === "sleep")! : EYES[b.eyes];
  const layers: [string[], number][] = [
    [bodyGrid, dyAll],
    [HEADS[b.head].grid, dyHead],
    [eyes.grid, dyHead],
    [MOUTHS[b.mouth].grid, dyHead],
    [TOPS[b.top].grid, dyHead],
  ];
  for (const [part, d] of layers.slice(0, n))
    part.forEach((row, y) => {
      const yy = y + d;
      if (yy < 0 || yy > 15) return;
      for (let x = 0; x < 16; x++) {
        const xx = x + dx;
        if (row[x] !== "." && xx >= 0 && xx <= 15) grid[yy][xx] = row[x];
      }
    });
  return grid;
}

export function paint(
  ctx: CanvasRenderingContext2D,
  b: Bot,
  scale: number,
  anim: Anim = {},
  dark = false,
) {
  ctx.clearRect(0, 0, 16 * scale, 16 * scale);
  const pal = PALETTES[b.palette];
  const colors: Record<string, string> = dark
    ? { ...pal.colors, o: pal.oDark }
    : pal.colors;
  composeGrid(b, anim).forEach((row, y) =>
    row.forEach((ch, x) => {
      if (!ch || y < 16 - (anim.reveal ?? 16)) return;
      ctx.fillStyle = colors[ch] ?? "#ff00ff";
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
}

function SpriteCanvas({
  bot: b,
  scale,
  intro = false,
  phase = 0,
  dark = false,
  className = "",
}: {
  bot: Bot;
  scale: number;
  intro?: boolean;
  phase?: number;
  dark?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(ctx, b, scale, {}, dark);
      return;
    }
    const introFrames = INTROS[b.intro].frames;
    const idleFrames = IDLES[b.idle].frames;
    const introTotal = intro ? total(introFrames) : 0;
    const idleTotal = total(idleFrames);
    const start = performance.now();
    let raf = 0;
    let last = "";
    const tick = (now: number) => {
      // rAF timestamps can predate the captured start time
      const t = Math.max(0, now - start);
      const anim =
        t < introTotal
          ? frameAt(introFrames, t)
          : frameAt(idleFrames, (t - introTotal + phase) % idleTotal);
      const key = JSON.stringify(anim);
      if (key !== last) {
        last = key;
        paint(ctx, b, scale, anim, dark);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [b, scale, intro, phase, dark]);

  return (
    <canvas
      ref={ref}
      width={16 * scale}
      height={16 * scale}
      className={`checker [image-rendering:pixelated] ${className}`}
      style={{ ["--checker-size" as string]: `${scale * 4}px` }}
    />
  );
}

function exportPng(b: Bot, n?: number) {
  const scale = 16;
  const c = document.createElement("canvas");
  c.width = c.height = 16 * scale;
  paint(c.getContext("2d")!, b, scale);
  const a = document.createElement("a");
  a.download = `bot-${BODIES[b.body].name}-${HEADS[b.head].name}-${PALETTES[b.palette].name}${n ? `-${n}` : ""}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

/* GIF-flavored LZW, uncompressed variant: emit literal 4-bit codes and a
   clear code every 6 pixels so the code table (8 colors) never grows */
function lzwEncode(pixels: Uint8Array): number[] {
  const clear = 8;
  const eoi = 9;
  const size = 4;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let n = 0;
  for (const p of Array.from(pixels)) {
    emit(p);
    if (++n === 6) {
      emit(clear);
      n = 0;
    }
  }
  emit(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}

function exportGif(b: Bot) {
  const scale = 8;
  const w = 16 * scale;
  const letters = ["o", "a", "b", "c", "d", "e"];
  const transp = 7;
  const colors: Record<string, string> = PALETTES[b.palette].colors;
  const bytes: number[] = [];
  const push = (...v: number[]) => bytes.push(...v);
  // header + logical screen descriptor (8-entry global color table)
  push(...Array.from("GIF89a").map((c) => c.charCodeAt(0)));
  push(w & 255, w >> 8, w & 255, w >> 8, 0xf2, 0, 0);
  for (const L of letters) {
    const hex = colors[L];
    push(
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    );
  }
  push(0, 0, 0, 0, 0, 0); // pad table to 8 entries
  // netscape extension: loop forever
  push(0x21, 0xff, 11);
  push(...Array.from("NETSCAPE2.0").map((c) => c.charCodeAt(0)));
  push(3, 1, 0, 0, 0);
  for (const [anim, ms] of IDLES[b.idle].frames) {
    const grid = composeGrid(b, anim);
    const delay = Math.max(2, Math.round(ms / 10)); // centiseconds
    // graphic control: dispose to background, transparent index
    push(0x21, 0xf9, 4, 0x09, delay & 255, delay >> 8, transp, 0);
    push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, w & 255, w >> 8, 0);
    const px = new Uint8Array(w * w);
    let p = 0;
    for (let y = 0; y < 16; y++)
      for (let sy = 0; sy < scale; sy++)
        for (let x = 0; x < 16; x++) {
          const ch = grid[y][x];
          const idx = ch ? letters.indexOf(ch) : transp;
          px.fill(idx < 0 ? transp : idx, p, p + scale);
          p += scale;
        }
    push(3); // lzw minimum code size
    const data = lzwEncode(px);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  }
  push(0x3b);
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: "image/gif" }),
  );
  const a = document.createElement("a");
  a.download = `bot-${BODIES[b.body].name}-${HEADS[b.head].name}-${PALETTES[b.palette].name}.gif`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

function describe(b: Bot) {
  return `${BODIES[b.body].name} / ${HEADS[b.head].name} / ${EYES[b.eyes].name} / ${MOUTHS[b.mouth].name} / ${TOPS[b.top].name} / ${PALETTES[b.palette].name} / ${INTROS[b.intro].name} / ${IDLES[b.idle].name}`;
}

export const button =
  "border border-faint/40 px-2 py-0.5 hover:opacity-50 transition-opacity duration-150";

/* One option row. Mobile: label above a horizontally scrolling row of
   bordered chips (edge to edge). Desktop: label + inline text options. */
function Picker({
  label,
  items,
  selected,
  onSelect,
  colored = false,
}: {
  label: string;
  items: React.ReactNode[];
  selected?: number;
  onSelect: (i: number) => void;
  colored?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
      <span className="text-faint sm:w-14 sm:shrink-0">{label}</span>
      <div className="flex gap-2 overflow-x-auto -mx-6 px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:contents">
        {items.map((item, i) => {
          const on = i === selected;
          const mobile = on
            ? "border-ink text-ink"
            : colored
              ? "border-faint/40 opacity-55"
              : "border-faint/40 text-faint";
          const desktop = on
            ? "sm:underline sm:underline-offset-4"
            : "sm:hover:opacity-50";
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`shrink-0 border px-2 py-0.5 whitespace-nowrap transition-opacity duration-150 sm:border-0 sm:px-0 sm:py-0 ${mobile} ${desktop}`}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Botlab() {
  const [current, setCurrent] = useState<Bot>(PRESETS[0].bot);
  const [sheet, setSheet] = useState<Bot[]>([]);
  const [saved, setSaved] = useState<Bot[]>([]);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    // defer so the opening click doesn't immediately close it
    const id = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("keydown", close);
    });
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuOpen]);
  const stickerGrid = useMemo(() => composeGrid(current), [current]);
  const stickerColors = useMemo<Record<string, string>>(
    () => ({ ...PALETTES[current.palette].colors }),
    [current.palette],
  );
  const [sysDark, setSysDark] = useState(false);
  const dark = theme ? theme === "dark" : sysDark;

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setSheet(Array.from({ length: 16 }, randomBot));
    try {
      const stored: Partial<Bot>[] = JSON.parse(
        localStorage.getItem("botlab-saved") ?? "[]",
      );
      // saves from before intro/idle existed default to hop/calm
      setSaved(stored.map((s) => ({ ...PRESETS[0].bot, ...s })));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const persist = (next: Bot[]) => {
    setSaved(next);
    localStorage.setItem("botlab-saved", JSON.stringify(next));
  };

  const savedIdx = saved.findIndex((b) =>
    BOT_KEYS.every((k) => b[k] === current[k]),
  );

  return (
    <div className="max-w-4xl mx-auto lowercase">
      <div className="flex items-baseline justify-between mb-1">
        <h1>botlab</h1>
        <button
          className={button}
          onClick={() =>
            setTheme(
              theme === null ? "light" : theme === "light" ? "dark" : null,
            )
          }
        >
          theme: {theme ?? "auto"}
        </button>
      </div>
      <p className="text-faint mb-8">8-bit robot sprite constructor</p>

      <div className="flex flex-col sm:flex-row gap-8 sm:gap-12">
        <div className="shrink-0 flex flex-col items-start gap-4 sticky top-0 z-10 bg-paper -mx-6 px-6 pb-4 border-b border-faint/30 sm:static sm:bg-transparent sm:mx-0 sm:px-0 sm:pb-0 sm:border-0">
          <SpriteCanvas
            bot={current}
            scale={20 * zoom}
            intro
            dark={dark}
            className="w-full h-auto sm:w-auto"
          />
          <div className="hidden sm:flex gap-4">
            {[0.1, 0.25, 0.5, 1].map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={
                  z === zoom
                    ? "underline underline-offset-4"
                    : "text-faint hover:opacity-50 transition-opacity duration-150"
                }
              >
                {z}x
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              className="bg-ink text-paper border border-ink px-3 py-0.5 hover:opacity-70 transition-opacity duration-150"
              onClick={() => {
                primeMotionPermission();
                setPrinting(true);
              }}
            >
              create sticker
            </button>
            <button className={button} onClick={() => setCurrent(randomBot())}>
              randomize
            </button>
            <button
              className={button}
              title={savedIdx >= 0 ? "remove from saved" : "save"}
              onClick={() =>
                persist(
                  savedIdx >= 0
                    ? saved.filter((_, i) => i !== savedIdx)
                    : [...saved, current],
                )
              }
            >
              {savedIdx >= 0 ? "♥" : "♡"}
            </button>
            <div className="relative">
              <button
                className={button}
                title="export"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 z-20 flex flex-col items-stretch bg-paper border border-faint/40 min-w-max"
                >
                  {(
                    [
                      ["export png", () => exportPng(current)],
                      ["export gif", () => exportGif(current)],
                    ] as const
                  ).map(([label, run]) => (
                    <button
                      key={label}
                      role="menuitem"
                      className="text-left px-3 py-1 hover:opacity-50 transition-opacity duration-150"
                      onClick={() => {
                        setMenuOpen(false);
                        run();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:gap-3 min-w-0">
          {SLOTS.map(([slot, parts]) => (
            <Picker
              key={slot}
              label={slot}
              items={parts.map((p) => p.name)}
              selected={current[slot]}
              onSelect={(i) => setCurrent({ ...current, [slot]: i })}
            />
          ))}

          {(
            [
              ["intro", INTROS],
              ["idle", IDLES],
            ] as const
          ).map(([slot, variants]) => (
            <Picker
              key={slot}
              label={slot}
              items={variants.map((v) => v.name)}
              selected={current[slot]}
              onSelect={(i) => setCurrent({ ...current, [slot]: i })}
            />
          ))}

          <Picker
            label="palette"
            items={PALETTES.map((p) => {
              // color the name's letters with the palette's own swatches,
              // skipping ones that vanish against the current background
              const vals = [
                p.colors.a,
                p.colors.b,
                p.colors.c,
                p.colors.d,
                p.colors.e,
                dark ? p.oDark : p.colors.o,
              ];
              const ok = vals.filter((h) => {
                const l =
                  (0.2126 * parseInt(h.slice(1, 3), 16) +
                    0.7152 * parseInt(h.slice(3, 5), 16) +
                    0.0722 * parseInt(h.slice(5, 7), 16)) /
                  255;
                return dark ? l > 0.28 : l < 0.72;
              });
              const cols = ok.length ? ok : vals;
              return (
                <>
                  {Array.from(p.name).map((ch, j) => (
                    <span key={j} style={{ color: cols[j % cols.length] }}>
                      {ch}
                    </span>
                  ))}
                </>
              );
            })}
            selected={current.palette}
            onSelect={(i) => setCurrent({ ...current, palette: i })}
            colored
          />

          <div className="sm:mt-4">
            <Picker
              label="presets"
              items={PRESETS.map((p) => p.name)}
              onSelect={(i) => setCurrent(PRESETS[i].bot)}
            />
          </div>
        </div>
      </div>

      {saved.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline gap-4 mb-4">
            <h2>saved</h2>
            <button
              className={button}
              onClick={() =>
                saved.forEach((b, i) =>
                  setTimeout(() => exportPng(b, i + 1), i * 300),
                )
              }
            >
              download all
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:flex sm:flex-wrap">
            {saved.map((b, i) => (
              <button
                key={i}
                onClick={() => persist(saved.filter((_, j) => j !== i))}
                className="hover:opacity-40 transition-opacity duration-150"
                title={`${describe(b)} — click to unsave`}
              >
                <SpriteCanvas bot={b} scale={6} phase={i * 137} dark={dark} className="w-full h-auto sm:w-auto" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <div className="flex items-baseline gap-4 mb-4">
          <h2>contact sheet</h2>
          <button
            className={button}
            onClick={() => setSheet(Array.from({ length: 16 }, randomBot))}
          >
            reroll
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:flex sm:flex-wrap">
          {sheet.map((b, i) => (
            <button
              key={i}
              onClick={() => setCurrent(b)}
              className="hover:opacity-70 transition-opacity duration-150"
              title={describe(b)}
            >
              <SpriteCanvas bot={b} scale={6} phase={i * 137} dark={dark} className="w-full h-auto sm:w-auto" />
            </button>
          ))}
        </div>
      </section>

      {printing && (
        <StickerOverlay
          grid={stickerGrid}
          colors={stickerColors}
          name={`bot-${BODIES[current.body].name}-${HEADS[current.head].name}-${PALETTES[current.palette].name}`}
          onClose={() => setPrinting(false)}
          onRandomize={() => setCurrent(randomBot())}
        />
      )}
    </div>
  );
}
