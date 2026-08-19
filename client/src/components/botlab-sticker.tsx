/** Pixel Forge — Fluorescent Drafting Board: iridescent physical-sticker preview for locally composed sprites. */
import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Holographic sticker preview + die-cut SVG export for a composed sprite.
 * The sticker is the sprite plus a PAD-cell white border; the WebGL shader
 * turns white into a stepped pastel hologram lit from a point the user
 * drags around. The SVG carries the artwork and a magenta CutContour path
 * along the border's outer edge (white vinyl assumed, so no bleed needed).
 */

type Cell = string | null;
type Rgb = [number, number, number];
const PAD = 1;
const IMAGE_SLOTS = ["a", "b", "c", "d", "e", "o", "f", "g", "h", "i", "j", "k", "l", "m", "n", "p"] as const;

type ImageCard = { grid: Cell[][]; colors: Record<string, string>; name: string };
type ImageSource = { image: HTMLImageElement; name: string };
type FaceBox = { x: number; y: number; width: number; height: number };

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (color: Rgb) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
const hex = (r: number, g: number, b: number) => `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;

async function faceCrop(image: HTMLImageElement, portrait: boolean) {
  const fallback = Math.min(image.naturalWidth, image.naturalHeight);
  let side = fallback;
  let sx = (image.naturalWidth - side) / 2;
  let sy = (image.naturalHeight - side) / 2;
  if (!portrait || !("FaceDetector" in window)) return { sx, sy, side };
  try {
    type Detector = { detect: (input: HTMLImageElement) => Promise<{ boundingBox: FaceBox }[]> };
    const DetectorCtor = (window as unknown as { FaceDetector: new (options: { fastMode: boolean; maxDetectedFaces: number }) => Detector }).FaceDetector;
    const face = (await new DetectorCtor({ fastMode: true, maxDetectedFaces: 1 }).detect(image))[0]?.boundingBox;
    if (!face) return { sx, sy, side };
    side = Math.min(Math.max(face.width, face.height) * 2.55, image.naturalWidth, image.naturalHeight);
    sx = Math.max(0, Math.min(image.naturalWidth - side, face.x + face.width / 2 - side / 2));
    sy = Math.max(0, Math.min(image.naturalHeight - side, face.y + face.height * 0.48 - side / 2));
  } catch { /* FaceDetector is an optional local browser enhancement. */ }
  return { sx, sy, side };
}

function adaptivePalette(data: Uint8ClampedArray, colorLimit: number): Rgb[] {
  const samples: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 28) samples.push([data[i], data[i + 1], data[i + 2]]);
  if (!samples.length) return Array.from({ length: colorLimit }, () => [240, 240, 240]);
  const sorted = [...samples].sort((a, b) => luminance(a) - luminance(b));
  let centroids: Rgb[] = Array.from({ length: colorLimit }, (_, index) => sorted[Math.min(sorted.length - 1, Math.round((index / Math.max(1, colorLimit - 1)) * (sorted.length - 1)))]);
  for (let round = 0; round < 7; round++) {
    const groups = centroids.map(() => [] as Rgb[]);
    samples.forEach((sample) => {
      let closest = 0;
      let distance = Number.POSITIVE_INFINITY;
      centroids.forEach((center, index) => {
        const next = (sample[0] - center[0]) ** 2 + (sample[1] - center[1]) ** 2 + (sample[2] - center[2]) ** 2;
        if (next < distance) { distance = next; closest = index; }
      });
      groups[closest].push(sample);
    });
    centroids = groups.map((group, index) => group.length ? [group.reduce((sum, c) => sum + c[0], 0) / group.length, group.reduce((sum, c) => sum + c[1], 0) / group.length, group.reduce((sum, c) => sum + c[2], 0) / group.length] : centroids[index]) as Rgb[];
  }
  return centroids;
}

function enhanceDetails(data: Uint8ClampedArray, size: number, portrait: boolean) {
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = (y * size + x) * 4;
    const at = (px: number, py: number) => {
      const p = (py * size + px) * 4;
      return (source[p] + source[p + 1] + source[p + 2]) / 3;
    };
    const local = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4;
    const current = (source[i] + source[i + 1] + source[i + 2]) / 3;
    const eyeZone = portrait && x > size * 0.2 && x < size * 0.8 && y > size * 0.26 && y < size * 0.58;
    const boost = Math.min(0.5, Math.abs(current - local) / 255 * (eyeZone ? 4 : 1.8));
    const sign = current < local ? -1 : 1;
    for (let channel = 0; channel < 3; channel++) data[i + channel] = clamp(source[i + channel] + sign * source[i + channel] * boost);
    if (eyeZone && current < local - 9) for (let channel = 0; channel < 3; channel++) data[i + channel] = clamp(data[i + channel] * 0.62);
  }
}

async function pixelateImageCard(source: ImageSource, size: number, colorLimit: number, portrait: boolean, detailBoost: boolean): Promise<ImageCard> {
  const surface = document.createElement("canvas");
  surface.width = surface.height = size;
  const ctx = surface.getContext("2d", { willReadFrequently: true })!;
  const { sx, sy, side } = await faceCrop(source.image, portrait);
  ctx.drawImage(source.image, sx, sy, side, side, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  if (detailBoost) enhanceDetails(imageData.data, size, portrait);
  const palette = adaptivePalette(imageData.data, colorLimit);
  const colors: Record<string, string> = {};
  IMAGE_SLOTS.forEach((slot, index) => { const color = palette[index % palette.length]; colors[slot] = hex(color[0], color[1], color[2]); });
  const grid: Cell[][] = Array.from({ length: size }, () => Array<Cell>(size).fill(null));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4;
    if (imageData.data[index + 3] < 28) continue;
    let best = 0, distance = Number.POSITIVE_INFINITY;
    palette.forEach((color, paletteIndex) => { const next = (imageData.data[index] - color[0]) ** 2 + (imageData.data[index + 1] - color[1]) ** 2 + (imageData.data[index + 2] - color[2]) ** 2; if (next < distance) { distance = next; best = paletteIndex; } });
    grid[y][x] = IMAGE_SLOTS[best];
  }
  return { grid, colors, name: source.name };
}

/* sprite letter under a sticker grid cell, or null */
const spriteAt = (grid: Cell[][], y: number, x: number): Cell =>
  grid[y - PAD]?.[x - PAD] ?? null;
/* default die-cut corner radius in cells (convex and concave corners) */
const R_DEFAULT = 0.42;

const button =
  "border border-faint/40 px-2 py-0.5 hover:opacity-50 transition-opacity duration-150";

/* sprite dilated by PAD cells (8-connected), enclosed holes filled */
function stickerMask(grid: Cell[][]): boolean[][] {
  const size = grid.length + 2 * PAD;
  const m: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!spriteAt(grid, y, x)) continue;
      for (let dy = -PAD; dy <= PAD; dy++)
        for (let dx = -PAD; dx <= PAD; dx++) m[y + dy][x + dx] = true;
    }
  const outside: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );
  const stack: [number, number][] = [];
  for (let i = 0; i < size; i++)
    stack.push([0, i], [size - 1, i], [i, 0], [i, size - 1]);
  while (stack.length) {
    const [y, x] = stack.pop()!;
    if (y < 0 || x < 0 || y >= size || x >= size || outside[y][x] || m[y][x])
      continue;
    outside[y][x] = true;
    stack.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]);
  }
  return m.map((row, y) => row.map((v, x) => v || !outside[y][x]));
}

/* mask silhouette as closed loops: emit each cell's exposed edges clockwise,
   so shared edges cancel and what remains links into the outline */
function outlinePath(m: boolean[][], R: number): string {
  const size = m.length;
  const at = (y: number, x: number) =>
    y >= 0 && x >= 0 && y < size && x < size && m[y][x];
  const edges = new Map<string, [number, number][]>();
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const k = `${x1},${y1}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k)!.push([x2, y2]);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!m[y][x]) continue;
      if (!at(y - 1, x)) add(x, y, x + 1, y);
      if (!at(y, x + 1)) add(x + 1, y, x + 1, y + 1);
      if (!at(y + 1, x)) add(x + 1, y + 1, x, y + 1);
      if (!at(y, x - 1)) add(x, y + 1, x, y);
    }
  let d = "";
  for (const [start, ends] of Array.from(edges.entries())) {
    while (ends.length) {
      const [sx, sy] = start.split(",").map(Number);
      const pts: [number, number][] = [];
      let cur: [number, number] = [sx, sy];
      for (let guard = 0; guard < size * size * 4; guard++) {
        const list = edges.get(`${cur[0]},${cur[1]}`);
        if (!list?.length) break;
        pts.push(cur);
        cur = list.pop()!;
        if (cur[0] === sx && cur[1] === sy) break;
      }
      const simple = pts.filter((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length];
        const b = pts[(i + 1) % pts.length];
        return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
      });
      if (simple.length < 3) continue;
      // every vertex is a right-angle turn: replace it with a quarter arc
      const n = simple.length;
      const f = (v: number) => +v.toFixed(2);
      if (R <= 0) {
        d += "M" + simple.map(([x, y]) => `${x} ${y}`).join("L") + "Z";
        continue;
      }
      let seg = "";
      for (let i = 0; i < n; i++) {
        const a = simple[(i + n - 1) % n];
        const p = simple[i];
        const b = simple[(i + 1) % n];
        const din = [Math.sign(p[0] - a[0]), Math.sign(p[1] - a[1])];
        const dout = [Math.sign(b[0] - p[0]), Math.sign(b[1] - p[1])];
        const p1 = [p[0] - din[0] * R, p[1] - din[1] * R];
        const p2 = [p[0] + dout[0] * R, p[1] + dout[1] * R];
        const sweep = din[0] * dout[1] - din[1] * dout[0] > 0 ? 1 : 0;
        seg += `${i === 0 ? "M" : "L"}${f(p1[0])} ${f(p1[1])}A${R} ${R} 0 0 ${sweep} ${f(p2[0])} ${f(p2[1])}`;
      }
      d += seg + "Z";
    }
  }
  return d;
}

function stickerSvg(
  grid: Cell[][],
  colors: Record<string, string>,
  mask: boolean[][],
  radius: number,
): string {
  const size = mask.length;
  const fillAt = (y: number, x: number): string | null => {
    const ch = spriteAt(grid, y, x);
    return ch ? colors[ch] : mask[y][x] ? "#ffffff" : null;
  };
  let art = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      const f = fillAt(y, x);
      let w = 1;
      while (x + w < size && fillAt(y, x + w) === f) w++;
      if (f) art += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${f}"/>`;
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="76.2mm" height="76.2mm" shape-rendering="crispEdges">
<g id="artwork">${art}</g>
<g id="cutline"><title>CutContour</title><path d="${outlinePath(mask, radius)}" fill="none" stroke="#ff00ff" stroke-width="0.05"/></g>
</svg>`;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x, -aPos.y) * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* Laminated vinyl lit by a fixed key light, viewed at the sticker's tilt.
   White areas are holographic foil: a silver metallic base under a spectral
   iridescent sweep whose phase follows the view angle (so bands travel as
   the sticker tilts), plus micro-flake glitter — each flake has its own
   jittered normal, so glints flare and die as the half-vector passes over
   them. Printed pixels are matte ink under the same gloss laminate. */
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTilt;
uniform float uGrid;
uniform vec2 uRes;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 spectrum(float x) {
  return clamp(0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67))), 0.0, 1.0);
}
uniform float uRadius;
bool solidAt(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid || cell.y >= uGrid) return false;
  return texture2D(uTex, (cell + 0.5) / uGrid).a > 0.5;
}
// signed distance (in cells, positive inside) to the die-cut line: straight
// along exposed sides, quarter arcs at convex corners, fillets in concave ones
float cutDist(vec2 cell, vec2 f, bool s) {
  float r = uRadius;
  bool L = solidAt(cell + vec2(-1.0, 0.0)), Rt = solidAt(cell + vec2(1.0, 0.0));
  bool T = solidAt(cell + vec2(0.0, -1.0)), B = solidAt(cell + vec2(0.0, 1.0));
  float d = s ? 1e3 : -1e3;
  if (s) {
    if (!L) d = min(d, f.x);
    if (!Rt) d = min(d, 1.0 - f.x);
    if (!T) d = min(d, f.y);
    if (!B) d = min(d, 1.0 - f.y);
  }
  // per corner, in local coords (u,v) measured from that corner:
  //   solid + both sides open      -> convex quarter arc
  //   solid + one side open + diag -> the neighbour's fillet owns this edge
  //   empty + both sides + diag    -> concave fillet
  for (int k = 0; k < 4; k++) {
    bool right = (k == 1 || k == 3);
    bool bottom = (k >= 2);
    vec2 uv = vec2(right ? 1.0 - f.x : f.x, bottom ? 1.0 - f.y : f.y);
    if (uv.x >= r || uv.y >= r) continue;
    bool A = right ? Rt : L;
    bool Bv = bottom ? B : T;
    bool Dg = solidAt(cell + vec2(right ? 1.0 : -1.0, bottom ? 1.0 : -1.0));
    if (s) {
      if (!A && !Bv) d = r - length(uv - vec2(r, r));
      else if (!A && Bv && Dg) d = length(uv - vec2(-r, r)) - r;
      else if (A && !Bv && Dg) d = length(uv - vec2(r, -r)) - r;
    } else if (A && Bv && Dg) {
      d = max(d, length(uv - vec2(r, r)) - r);
    }
  }
  return d;
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 f = fract(vUv * uGrid);
  bool s = solidAt(cell);
  float d = cutDist(cell, f, s);
  float px = uGrid / uRes.x;
  float alpha = smoothstep(-0.5 * px, 0.5 * px, d);
  if (alpha <= 0.0) discard;
  vec4 c = s ? texture2D(uTex, vUv) : vec4(1.0);

  // surface frame: sticker normal after tilt, camera on +z, key light upper-left
  vec3 N = normalize(vec3(sin(uTilt.x), -sin(uTilt.y), cos(uTilt.x) * cos(uTilt.y)));
  vec3 V = normalize(vec3((0.5 - vUv) * vec2(0.5, -0.5), 1.4));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 4.0);
  float specBroad = pow(ndh, 22.0);
  float specTight = pow(ndh, 260.0);

  // holographic field: iridescent sweep whose phase follows the view angle
  vec2 uvS = vUv * vec2(1.0, uRes.y / uRes.x);
  float ang = N.x * 1.3 - N.y * 0.9;
  float coord = uvS.x * 0.9 + uvS.y * 0.7;
  float w = coord * 1.35 + ang * 2.6 + (noise(uvS * 4.0) - 0.5) * 0.22;
  vec3 iri = spectrum(w);
  vec3 field = (0.45 + 0.85 * iri) * (0.75 + 0.35 * ndl);
  // flakes sized relative to the sticker (~1/100 of its width) so the
  // glitter looks the same at any resolution
  vec2 flake = floor(gl_FragCoord.xy * 100.0 / uRes.x);
  vec2 jit = (vec2(hash(flake), hash(flake + 7.31)) - 0.5) * 0.9;
  vec3 Nf = normalize(N + vec3(jit, 0.0));
  float glint = pow(max(dot(Nf, H), 0.0), 420.0) * step(0.55, hash(flake + 3.3));
  vec3 glintCol = glint * (0.7 + 1.1 * spectrum(hash(flake + 1.7)));
  vec3 gloss = vec3(specBroad * 0.35 + specTight * 0.9 + fresnel * 0.18);

  // bare foil (the white border)
  vec3 silver = vec3(0.78, 0.80, 0.85);
  vec3 foil = silver * field + glintCol + gloss;

  // printed ink over the same vinyl: fine grain, glossy laminate, and —
  // like real thin inks — the holographic base shows through light colors
  // (multiply-style), while dark inks stay opaque
  float grain = 1.0 + (noise(uvS * 160.0) - 0.5) * 0.14;
  vec3 ink = c.rgb * grain * (0.84 + 0.24 * ndl);
  ink += vec3(specBroad * 0.30 + specTight * 0.85 + fresnel * 0.14);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float thin = smoothstep(0.45, 0.95, lum);
  vec3 inkHolo = c.rgb * grain * field + glintCol * 0.8 + gloss;
  ink = mix(ink, inkHolo, thin);

  float white = smoothstep(0.86, 0.97, min(c.r, min(c.g, c.b)));
  vec3 col = mix(ink, foil, white);

  // die-cut edge: a hairline darkening where the vinyl ends (device px)
  float edge = 1.0 - smoothstep(1.1 * px, 3.4 * px, d);
  col *= 1.0 - 0.22 * edge;

  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

function initGl(canvas: HTMLCanvasElement, tex: Uint8Array, gridSize: number) {
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridSize, gridSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1f(gl.getUniformLocation(prog, "uGrid"), gridSize);
  const uRadius = gl.getUniformLocation(prog, "uRadius");
  const uTilt = gl.getUniformLocation(prog, "uTilt");
  const uRes = gl.getUniformLocation(prog, "uRes");
  gl.clearColor(0, 0, 0, 0);
  return {
    resize(w: number, h: number) {
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    },
    draw(tilt: [number, number], radius: number) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uTilt, tilt[0], tilt[1]);
      gl.uniform1f(uRadius, radius);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

const MOTION_KEY = "botlab-motion";

type DOE = { requestPermission?: () => Promise<string> };
const motionSupported = () =>
  "DeviceOrientationEvent" in window && "ontouchstart" in window;

/* motion is on by default on phones unless the user switched it off */
const motionWanted = () => localStorage.getItem(MOTION_KEY) !== "off";

/* Call from a user gesture (the print tap): iOS only grants orientation
   access from a gesture, so when motion is wanted we ask here so the
   overlay can start it without another tap. */
export function primeMotionPermission() {
  if (!motionSupported() || !motionWanted()) return;
  (DeviceOrientationEvent as unknown as DOE).requestPermission?.().catch(
    () => {},
  );
}

export function StickerOverlay({
  grid,
  colors,
  name,
  onClose,
  onRandomize,
}: {
  grid: Cell[][];
  colors: Record<string, string>;
  name: string;
  onClose: () => void;
  onRandomize: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [radius, setRadius] = useState(R_DEFAULT);
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);
  const [imageCard, setImageCard] = useState<ImageCard | null>(null);
  const [imageResolution, setImageResolution] = useState(48);
  const [colorLimit, setColorLimit] = useState(12);
  const [portraitFocus, setPortraitFocus] = useState(true);
  const [detailBoost, setDetailBoost] = useState(true);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  useEffect(() => {
    let cancelled = false;
    if (!imageSource) { setImageCard(null); return; }
    setImageCard(null);
    pixelateImageCard(imageSource, imageResolution, colorLimit, portraitFocus, detailBoost).then((card) => { if (!cancelled) setImageCard(card); });
    return () => { cancelled = true; };
  }, [imageSource, imageResolution, colorLimit, portraitFocus, detailBoost]);
  const activeGrid = imageCard?.grid ?? grid;
  const activeColors = imageCard?.colors ?? colors;
  const activeName = imageCard?.name ?? name;
  const mask = useMemo(() => stickerMask(activeGrid), [activeGrid]);
  const stickerSize = activeGrid.length + 2 * PAD;
  // tilt survives WebGL re-inits (e.g. when the bot is randomized)
  const tiltRef = useRef<[number, number]>([0, 0]);
  const baseRef = useRef<[number, number]>([0, 0]);
  // phone gyroscope: raw [gamma, beta] in degrees and the calibration
  // reading that maps to "flat"; iOS needs a tap-triggered permission
  const [motion, setMotion] = useState<"unavailable" | "off" | "on">(
    "unavailable",
  );
  const gyroRef = useRef<{
    raw: [number, number] | null;
    cal: [number, number] | null;
  }>({ raw: null, cal: null });

  useEffect(() => {
    if (motionSupported()) setMotion(motionWanted() ? "on" : "off");
  }, []);

  useEffect(() => {
    if (motion !== "on") return;
    let got = false;
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      got = true;
      gyroRef.current.raw = [e.gamma, e.beta];
      gyroRef.current.cal ??= [e.gamma, e.beta];
    };
    window.addEventListener("deviceorientation", onOri);
    // resumed from a saved preference but iOS didn't grant access this
    // session: show "off" so a tap can re-request it (keep the preference)
    const check = window.setTimeout(() => {
      if (!got && (DeviceOrientationEvent as unknown as DOE).requestPermission)
        setMotion("off");
    }, 2000);
    return () => {
      clearTimeout(check);
      window.removeEventListener("deviceorientation", onOri);
      gyroRef.current = { raw: null, cal: null };
    };
  }, [motion]);

  const toggleMotion = async () => {
    if (motion === "on") {
      localStorage.setItem(MOTION_KEY, "off");
      return setMotion("off");
    }
    const D = DeviceOrientationEvent as unknown as DOE;
    if (D.requestPermission) {
      try {
        if ((await D.requestPermission()) !== "granted") return;
      } catch {
        return;
      }
    }
    localStorage.setItem(MOTION_KEY, "on");
    setMotion("on");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const tex = new Uint8Array(stickerSize * stickerSize * 4);
    for (let y = 0; y < stickerSize; y++)
      for (let x = 0; x < stickerSize; x++) {
        const ch = spriteAt(activeGrid, y, x);
        const hex = ch ? activeColors[ch] : mask[y][x] ? "#ffffff" : null;
        if (!hex) continue;
        const i = (y * stickerSize + x) * 4;
        tex[i] = parseInt(hex.slice(1, 3), 16);
        tex[i + 1] = parseInt(hex.slice(3, 5), 16);
        tex[i + 2] = parseInt(hex.slice(5, 7), 16);
        tex[i + 3] = 255;
      }
    const ctx = initGl(canvas, tex, stickerSize);
    if (!ctx) return;

    // layout size, not the bounding rect: the pop-in transform would
    // otherwise size the buffer at 35% on first render
    const fit = () => {
      const dpr = devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.resize(w, h);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    // tilt (radians about y, x): eased toward the drag target while dragging;
    // otherwise a gentle wobble around `base`, which is re-anchored to
    // wherever the user let go so the idle motion never fights them
    const MAX = 0.42;
    const tilt = tiltRef.current;
    let base = baseRef.current;
    let target: [number, number] | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const wobble = (now: number): [number, number] => {
      if (reduced) return [0, 0];
      const t = (now - t0) / 1000;
      return [Math.sin(t * 0.55) * 0.14, Math.cos(t * 0.41) * 0.1];
    };
    let dragging = false;
    let dragStart = [0, 0];
    let tiltStart = [0, 0];
    const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));
    const onDown = (e: PointerEvent) => {
      dragging = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
      dragStart = [e.clientX, e.clientY];
      tiltStart = [...tilt];
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const r = canvas.getBoundingClientRect();
      target = [
        clamp(tiltStart[0] + ((e.clientX - dragStart[0]) / r.width) * 1.2),
        clamp(tiltStart[1] + ((e.clientY - dragStart[1]) / r.height) * 1.2),
      ];
    };
    // degrees of phone tilt → radians of sticker tilt
    const GYRO_K = (Math.PI / 180) * 0.6;
    const gyroTilt = (): [number, number] | null => {
      const { raw, cal } = gyroRef.current;
      if (!raw || !cal) return null;
      return [clamp((raw[0] - cal[0]) * GYRO_K), clamp((raw[1] - cal[1]) * GYRO_K)];
    };
    const onUp = () => {
      dragging = false;
      target = null;
      const w = wobble(performance.now());
      base = [tilt[0] - w[0], tilt[1] - w[1]];
      baseRef.current = base;
      // re-calibrate the gyro so it continues from where the drag ended
      const { raw } = gyroRef.current;
      if (raw)
        gyroRef.current.cal = [raw[0] - tilt[0] / GYRO_K, raw[1] - tilt[1] / GYRO_K];
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = wobble(now);
      const goal =
        target ?? gyroTilt() ?? [clamp(base[0] + w[0]), clamp(base[1] + w[1])];
      // frame-rate independent easing (≈ 0.25 / 0.12 per frame at 60fps)
      const k = 1 - Math.exp(-dt * (target ? 17 : 8));
      tilt[0] += (goal[0] - tilt[0]) * k;
      tilt[1] += (goal[1] - tilt[1]) * k;
      ctx.draw(tilt, radiusRef.current);
      const deg = 180 / Math.PI;
      canvas.style.transform = `rotateX(${-tilt[1] * deg}deg) rotateY(${tilt[0] * deg}deg)`;
      canvas.style.filter = `drop-shadow(${-tilt[0] * 40}px ${18 + tilt[1] * 30}px 28px rgba(0,0,0,0.38))`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [activeGrid, activeColors, mask, stickerSize]);

  const exportSvg = () => {
    const blob = new Blob([stickerSvg(activeGrid, activeColors, mask, radius)], {
      type: "image/svg+xml",
    });
    const a = document.createElement("a");
    a.download = `${activeName}-sticker.svg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${activeName}-sticker.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const onUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const cleanName = (file.name.replace(/\.[^/.]+$/, "") || "image-card").replace(/[^a-z0-9-_]+/gi, "-");
      setImageSource({ image, name: cleanName });
      URL.revokeObjectURL(url);
      event.target.value = "";
    };
    image.src = url;
  };

  return (
    <div className="fixed inset-0 z-50 bg-paper flex flex-col items-center justify-center gap-8 lowercase">
      <div
        ref={boxRef}
        className="sticker-pop relative w-[min(92vw,60vh)] h-[min(92vw,60vh)] sm:w-[min(72vw,56vh)] sm:h-[min(72vw,56vh)] [perspective:1100px]"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-grab active:cursor-grabbing will-change-transform"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <label className="flex items-center gap-3 text-faint">
          <span>corners</span>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-32 accent-ink"
          />
          <span className="w-12 tabular-nums">
            {((radius / stickerSize) * 76.2).toFixed(1)}mm
          </span>
        </label>
        <div className="flex flex-wrap justify-center gap-3">
          <input ref={uploadRef} onChange={onUpload} accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" type="file" />
          <button className={button} onClick={() => uploadRef.current?.click()}>
            {imageSource ? "replace image" : "upload image"}
          </button>
          {imageSource && (
            <button className={button} onClick={() => setImageSource(null)}>
              use bot
            </button>
          )}
          {motion !== "unavailable" && (
            <button className={button} onClick={toggleMotion}>
              motion: {motion}
            </button>
          )}
          <button className={button} onClick={() => { setImageSource(null); onRandomize(); }}>
            randomize
          </button>
          <button className={button} onClick={exportPng}>
            export png
          </button>
          <button className={button} onClick={exportSvg}>
            export svg
          </button>
          <button className={button} onClick={onClose}>
            close
          </button>
        </div>
        {imageSource && (
          <div className="flex flex-wrap justify-center gap-2 text-faint">
            <span className="px-1 py-0.5">portrait card</span>
            {[32, 48, 64].map((size) => <button key={size} className={imageResolution === size ? "underline underline-offset-4" : "hover:opacity-50"} onClick={() => setImageResolution(size)}>{size}px</button>)}
            {[8, 12, 16].map((count) => <button key={count} className={colorLimit === count ? "underline underline-offset-4" : "hover:opacity-50"} onClick={() => setColorLimit(count)}>{count} colors</button>)}
            <button className={portraitFocus ? "underline underline-offset-4" : "hover:opacity-50"} onClick={() => setPortraitFocus((value) => !value)}>face focus: {portraitFocus ? "on" : "off"}</button>
            <button className={detailBoost ? "underline underline-offset-4" : "hover:opacity-50"} onClick={() => setDetailBoost((value) => !value)}>eye detail: {detailBoost ? "on" : "off"}</button>
          </div>
        )}
        <p className="text-faint">portrait focus → 48px flashcard · drag to tilt · esc to close</p>
      </div>
    </div>
  );
}
