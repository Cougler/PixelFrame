#!/usr/bin/env node
// Regenerates public/kits/helmets.json from primitive shape definitions.
// Run: node scripts/generate-helmets.mjs

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const PALETTE = {
  ".": [0, 0, 0, 0],
  // Steel / chrome (silver scale)
  W: [240, 240, 240, 255],
  M: [200, 200, 205, 255],
  m: [150, 150, 160, 255],
  s: [95, 95, 110, 255],
  S: [55, 55, 70, 255],
  K: [22, 22, 28, 255],
  // Viking horns (warm browns + cream)
  H: [240, 215, 165, 255],
  h: [185, 150, 100, 255],
  b: [120, 85, 50, 255],
  B: [70, 45, 25, 255],
  // Fur
  F: [125, 95, 70, 255],
  f: [80, 55, 40, 255],
  // Gold (bounty hunter visor)
  G: [255, 210, 75, 255],
  g: [205, 150, 35, 255],
  Y: [120, 75, 15, 255],
  // Olive / sage (soldier)
  O: [140, 155, 105, 255],
  o: [100, 115, 75, 255],
  u: [60, 75, 45, 255],
  // Amber (soldier visor)
  A: [255, 165, 60, 255],
  a: [185, 95, 30, 255],
  // Knight plume + cream
  P: [248, 244, 235, 255],
  p: [190, 184, 175, 255],
  y: [110, 105, 100, 255],
  // Rivet dark
  R: [40, 35, 38, 255],
  // Engraving
  e: [70, 70, 85, 255],
  // Skin (for body neck)
  N: [225, 195, 165, 255],
};

class Sprite {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.grid = Array.from({ length: h }, () => new Array(w).fill("."));
  }
  set(x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.grid[y][x] = ch;
  }
  rect(x, y, w, h, ch) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, ch);
  }
  line(x0, y0, x1, y1, ch) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0; let y = y0;
    while (true) {
      this.set(x, y, ch);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  fillEllipse(cx, cy, rx, ry, ch) {
    if (rx < 0.5 || ry < 0.5) { this.set(cx, cy, ch); return; }
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, ch);
      }
    }
  }
  fillTopEllipse(cx, cy, rx, ry, ch) {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    for (let y = Math.floor(cy - ry); y <= cy; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, ch);
      }
    }
  }
  trapezoid(xTL, xTR, xBL, xBR, y0, y1, ch) {
    const h = y1 - y0;
    for (let dy = 0; dy <= h; dy++) {
      const t = h === 0 ? 0 : dy / h;
      const xL = Math.round(xTL + (xBL - xTL) * t);
      const xR = Math.round(xTR + (xBR - xTR) * t);
      for (let x = xL; x <= xR; x++) this.set(x, y0 + dy, ch);
    }
  }
  // Tapered "horn" — series of filled circles along a path, radius linearly tapers
  taperedStroke(x0, y0, x1, y1, rBase, rTip, ch) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const r = rBase + (rTip - rBase) * t;
      this.fillEllipse(x, y, r, r, ch);
    }
  }
  usedPalette() {
    const used = new Set();
    for (const row of this.grid) for (const c of row) used.add(c);
    const out = {};
    for (const c of used) if (PALETTE[c]) out[c] = PALETTE[c];
    return out;
  }
  toRows() { return this.grid.map((row) => row.join("")); }
}

// ───────────────────── VIKING (48x48) ─────────────────────
function viking(W) {
  const s = new Sprite(W, W);
  const u = W / 48; // scale unit
  const cx = W / 2 - 0.5;

  // --- Horns (drawn first, so dome covers their base) ---
  // Left horn: base near (12, 18) curving to tip at (1, 6)
  s.taperedStroke(1 * u, 6 * u, 13 * u, 18 * u, 1 * u, 3 * u, "b");
  s.taperedStroke(1 * u, 7 * u, 12 * u, 18 * u, 0.6 * u, 2 * u, "h");
  s.taperedStroke(1 * u, 8 * u, 11 * u, 18 * u, 0.4 * u, 1.2 * u, "H");
  s.fillEllipse(1 * u, 6 * u, 1 * u, 1 * u, "B"); // dark tip
  // Right horn (mirror)
  s.taperedStroke((W - 1) - 1 * u, 6 * u, (W - 1) - 13 * u, 18 * u, 1 * u, 3 * u, "b");
  s.taperedStroke((W - 1) - 1 * u, 7 * u, (W - 1) - 12 * u, 18 * u, 0.6 * u, 2 * u, "h");
  s.taperedStroke((W - 1) - 1 * u, 8 * u, (W - 1) - 11 * u, 18 * u, 0.4 * u, 1.2 * u, "H");
  s.fillEllipse((W - 1) - 1 * u, 6 * u, 1 * u, 1 * u, "B");

  // --- Dome ---
  s.fillEllipse(cx, 18 * u, 13 * u, 12 * u, "s");           // silhouette
  s.fillEllipse(cx, 18 * u, 12 * u, 11 * u, "m");           // mid steel
  s.fillEllipse(cx - 3 * u, 15 * u, 6 * u, 4.5 * u, "M");   // upper highlight
  s.fillEllipse(cx - 4 * u, 14 * u, 2.5 * u, 1.8 * u, "W"); // hot spot

  // Shadow on right of dome
  for (let y = 11 * u; y < 27 * u; y++) {
    const dy = (y - 18 * u) / (12 * u);
    if (Math.abs(dy) > 1) continue;
    const xEdge = cx + (12 * u) * Math.sqrt(1 - dy * dy);
    for (let x = Math.floor(xEdge - 2 * u); x <= Math.ceil(xEdge); x++) {
      if (s.grid[Math.round(y)] && s.grid[Math.round(y)][x] === "m") {
        s.set(x, y, "s");
      }
    }
  }

  // --- Brow band (engraved) ---
  s.rect(7 * u, 22 * u, 34 * u, 5 * u, "S");
  s.rect(7 * u, 23 * u, 34 * u, 1 * u, "s");
  s.rect(7 * u, 26 * u, 34 * u, 1 * u, "K");
  // engraved pattern (dots)
  for (let i = 0; i < 8; i++) s.set(10 * u + i * 4 * u, 24 * u, "e");

  // --- Center vertical engraved strip (dome + nose) ---
  s.rect(cx - 1, 9 * u, 3, 13 * u, "s");
  s.line(cx, 9 * u, cx, 21 * u, "e");

  // --- Y-shape face mask ---
  // Left cheek plate
  s.trapezoid(8 * u, cx - 4 * u, 10 * u, cx - 5 * u, 27 * u, 38 * u, "S");
  s.trapezoid(9 * u, cx - 5 * u, 11 * u, cx - 6 * u, 28 * u, 36 * u, "s");
  s.trapezoid(10 * u, cx - 6 * u, 12 * u, cx - 7 * u, 29 * u, 34 * u, "m");
  // Right cheek plate
  s.trapezoid(cx + 4 * u, 40 * u, cx + 5 * u, 38 * u, 27 * u, 38 * u, "S");
  s.trapezoid(cx + 5 * u, 39 * u, cx + 6 * u, 37 * u, 28 * u, 36 * u, "s");
  s.trapezoid(cx + 6 * u, 38 * u, cx + 7 * u, 36 * u, 29 * u, 34 * u, "m");
  // Nose guard
  s.rect(cx - 3 * u, 22 * u, 6 * u, 18 * u, "S");
  s.rect(cx - 2 * u, 23 * u, 4 * u, 16 * u, "s");
  s.rect(cx - 1 * u, 24 * u, 2 * u, 14 * u, "m");
  // Nose taper at bottom
  s.set(cx, 40 * u, "S");
  s.set(cx - 1, 40 * u, "S");
  s.set(cx, 41 * u, "S");

  // --- Eye slits ---
  s.rect(cx - 9 * u, 28 * u, 5 * u, 2 * u, "K");
  s.rect(cx + 4 * u, 28 * u, 5 * u, 2 * u, "K");

  // --- Dagger points on bottom of cheek plates ---
  s.line(11 * u, 38 * u, 10 * u, 43 * u, "S");
  s.line(15 * u, 38 * u, 15 * u, 42 * u, "S");
  s.line((W - 1) - 11 * u, 38 * u, (W - 1) - 10 * u, 43 * u, "S");
  s.line((W - 1) - 15 * u, 38 * u, (W - 1) - 15 * u, 42 * u, "S");

  // --- Rivets ---
  const rivetXs = [12, 16, W / u - 16 - 1, W / u - 12 - 1];
  for (const rx of rivetXs) {
    s.fillEllipse(rx * u, 30 * u, 0.6 * u, 0.6 * u, "R");
    s.fillEllipse(rx * u, 34 * u, 0.6 * u, 0.6 * u, "R");
  }

  // --- Fur tufts behind cheek plates ---
  s.fillEllipse(7 * u, 40 * u, 3 * u, 2.5 * u, "F");
  s.fillEllipse(6 * u, 41 * u, 1.5 * u, 1.5 * u, "f");
  s.fillEllipse((W - 1) - 7 * u, 40 * u, 3 * u, 2.5 * u, "F");
  s.fillEllipse((W - 1) - 6 * u, 41 * u, 1.5 * u, 1.5 * u, "f");

  return s;
}

// ───────────────────── SPACE BOUNTY HUNTER (Mandalorian-ish) ─────────────────────
function spaceHunter(W) {
  const s = new Sprite(W, W);
  const u = W / 48;
  const cx = W / 2 - 0.5;

  // --- Dome (chrome) ---
  s.fillEllipse(cx, 18 * u, 16 * u, 14 * u, "S");
  s.fillEllipse(cx, 18 * u, 15 * u, 13 * u, "m");
  s.fillEllipse(cx, 17 * u, 14 * u, 12 * u, "M");
  s.fillEllipse(cx - 4 * u, 13 * u, 7 * u, 4 * u, "W");
  s.fillEllipse(cx - 5 * u, 12 * u, 3 * u, 1.5 * u, "W");

  // --- Center forehead ridge (front-to-back fin) ---
  // A vertical bright stripe down the center with subtle shadow on right
  s.rect(cx - 2, 6 * u, 5, 18 * u, "M");
  s.rect(cx - 1, 6 * u, 3, 18 * u, "W");
  s.line(cx + 1, 8 * u, cx + 1, 22 * u, "m");
  // top notch
  s.set(cx, 5 * u, "M");
  s.set(cx + 1, 5 * u, "M");

  // --- Gold T-visor ---
  // Horizontal bar
  s.rect(8 * u, 22 * u, 32 * u, 6 * u, "Y");      // outline dark
  s.rect(9 * u, 23 * u, 30 * u, 4 * u, "g");      // mid gold
  s.rect(10 * u, 23 * u, 28 * u, 2 * u, "G");     // bright gold
  s.rect(10 * u, 25 * u, 28 * u, 1 * u, "g");
  // Vertical bar (T's stem)
  s.rect(20 * u, 27 * u, 8 * u, 11 * u, "Y");
  s.rect(21 * u, 28 * u, 6 * u, 9 * u, "g");
  s.rect(22 * u, 28 * u, 4 * u, 7 * u, "G");
  // T tapers as it goes down (narrowing chin shape)
  s.line(22 * u, 36 * u, 24 * u, 39 * u, "g");
  s.line((W - 1) - 22 * u, 36 * u, (W - 1) - 24 * u, 39 * u, "g");
  s.set(cx, 40 * u, "Y");

  // --- Cheek armor (silver, angular) ---
  // Left cheek panel
  s.trapezoid(6 * u, 19 * u, 11 * u, 20 * u, 24 * u, 38 * u, "S");
  s.trapezoid(7 * u, 19 * u, 12 * u, 20 * u, 25 * u, 37 * u, "s");
  s.trapezoid(8 * u, 19 * u, 13 * u, 19 * u, 26 * u, 36 * u, "m");
  // Right cheek panel (mirror)
  s.trapezoid(29 * u, 42 * u, 28 * u, 37 * u, 24 * u, 38 * u, "S");
  s.trapezoid(29 * u, 41 * u, 28 * u, 36 * u, 25 * u, 37 * u, "s");
  s.trapezoid(29 * u, 40 * u, 29 * u, 35 * u, 26 * u, 36 * u, "m");

  // Panel seam highlights on cheeks
  s.line(11 * u, 28 * u, 14 * u, 34 * u, "M");
  s.line((W - 1) - 11 * u, 28 * u, (W - 1) - 14 * u, 34 * u, "M");

  // --- Bottom chin opening (separates the T's stem from cheek armor) ---
  // (handled implicitly — T stem narrows, cheeks come in)

  return s;
}

// ───────────────────── SOLDIER FUTURE (sci-fi tactical, front view) ─────────────────────
function soldierFuture(W) {
  const s = new Sprite(W, W);
  const u = W / 48;
  const cx = W / 2 - 0.5;

  // --- Outer shell (olive) ---
  s.fillEllipse(cx, 22 * u, 18 * u, 18 * u, "u");
  s.fillEllipse(cx, 22 * u, 17 * u, 17 * u, "o");
  s.fillEllipse(cx, 20 * u, 16 * u, 14 * u, "O");
  // top highlight
  s.fillEllipse(cx - 3 * u, 12 * u, 8 * u, 3 * u, "O");
  s.fillEllipse(cx - 4 * u, 11 * u, 3 * u, 1.2 * u, "M");

  // --- Forehead plate (raised hex-ish panel above visor) ---
  s.trapezoid(15 * u, 33 * u, 13 * u, 35 * u, 14 * u, 22 * u, "o");
  s.trapezoid(16 * u, 32 * u, 14 * u, 34 * u, 15 * u, 21 * u, "O");
  // panel seam lines
  s.line(15 * u, 14 * u, 13 * u, 22 * u, "u");
  s.line(33 * u, 14 * u, 35 * u, 22 * u, "u");

  // --- Amber wraparound visor ---
  s.trapezoid(10 * u, 38 * u, 11 * u, 37 * u, 22 * u, 30 * u, "u");
  s.trapezoid(11 * u, 37 * u, 12 * u, 36 * u, 23 * u, 29 * u, "a");
  s.trapezoid(12 * u, 36 * u, 13 * u, 35 * u, 24 * u, 28 * u, "A");
  // visor highlight (a thin diagonal stripe)
  s.line(14 * u, 25 * u, 22 * u, 25 * u, "G");

  // --- Lower jaw / chin plate ---
  s.trapezoid(12 * u, 36 * u, 16 * u, 32 * u, 30 * u, 40 * u, "o");
  s.trapezoid(13 * u, 35 * u, 17 * u, 31 * u, 31 * u, 39 * u, "O");
  // chin seam
  s.line(20 * u, 33 * u, 28 * u, 33 * u, "u");
  // breath grille
  s.rect(20 * u, 35 * u, 8 * u, 1, "u");
  s.set(22 * u, 36 * u, "u");
  s.set(24 * u, 36 * u, "u");
  s.set(26 * u, 36 * u, "u");

  // --- Side panel seams (tech detail) ---
  s.line(10 * u, 22 * u, 13 * u, 28 * u, "u");
  s.line(38 * u, 22 * u, 35 * u, 28 * u, "u");
  s.line(8 * u, 18 * u, 10 * u, 14 * u, "u");
  s.line(40 * u, 18 * u, 38 * u, 14 * u, "u");

  // --- Small status dot (amber, like the ref) ---
  s.set(13 * u, 18 * u, "A");
  s.set(35 * u, 18 * u, "A");

  return s;
}

// ───────────────────── KNIGHT (great helm with side-flowing plume) ─────────────────────
function knight(W) {
  const s = new Sprite(W, W);
  const u = W / 48;
  const cx = W / 2 - 0.5 + 2 * u; // shift slightly right since plume is on left

  // --- Plume (flows to the LEFT, multiple strands) ---
  // Background dark base
  s.taperedStroke(cx - 2 * u, 6 * u, 2 * u, 28 * u, 4 * u, 1 * u, "y");
  // mid strands
  s.taperedStroke(cx - 2 * u, 7 * u, 3 * u, 26 * u, 3 * u, 0.8 * u, "p");
  s.taperedStroke(cx - 3 * u, 8 * u, 4 * u, 28 * u, 2.5 * u, 0.7 * u, "p");
  // bright top layer
  s.taperedStroke(cx - 3 * u, 7 * u, 4 * u, 22 * u, 1.8 * u, 0.5 * u, "P");
  s.taperedStroke(cx - 2 * u, 6 * u, 6 * u, 18 * u, 1.5 * u, 0.5 * u, "P");
  s.taperedStroke(cx - 2 * u, 9 * u, 5 * u, 30 * u, 1.5 * u, 0.5 * u, "P");

  // --- Plume mount knot at base ---
  s.fillEllipse(cx - 2 * u, 8 * u, 2 * u, 1.5 * u, "y");
  s.fillEllipse(cx - 2 * u, 8 * u, 1.2 * u, 0.9 * u, "p");

  // --- Helmet dome (great helm: rounded top, articulated) ---
  s.fillEllipse(cx, 18 * u, 12 * u, 12 * u, "S");
  s.fillEllipse(cx, 18 * u, 11 * u, 11 * u, "m");
  s.fillEllipse(cx - 2 * u, 14 * u, 5 * u, 3.5 * u, "M");
  s.fillEllipse(cx - 3 * u, 13 * u, 2 * u, 1.2 * u, "W");
  // top crest pip where plume mounts
  s.fillEllipse(cx - 1 * u, 7 * u, 1.5 * u, 1 * u, "s");

  // --- Visor (face plate) ---
  // Outer dark frame
  s.trapezoid(cx - 11 * u, cx + 11 * u, cx - 10 * u, cx + 10 * u, 22 * u, 38 * u, "S");
  s.trapezoid(cx - 10 * u, cx + 10 * u, cx - 9 * u, cx + 9 * u, 23 * u, 37 * u, "s");
  s.trapezoid(cx - 9 * u, cx + 9 * u, cx - 8 * u, cx + 8 * u, 24 * u, 35 * u, "m");

  // --- Eye slit (horizontal bar) ---
  s.rect(cx - 8 * u, 26 * u, 16 * u, 2 * u, "K");
  // a small upper edge highlight
  s.line(cx - 8 * u, 25 * u, cx + 8 * u, 25 * u, "S");

  // --- Breath holes / vertical slits below eye slit ---
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    s.rect(cx + i * 2 * u, 30 * u, 1, 3 * u, "K");
  }
  // small round breath holes
  s.set(cx - 5 * u, 35 * u, "K");
  s.set(cx - 3 * u, 36 * u, "K");
  s.set(cx + 3 * u, 36 * u, "K");
  s.set(cx + 5 * u, 35 * u, "K");

  // --- Rivets along visor edge ---
  for (let yr = 23; yr <= 35; yr += 4) {
    s.fillEllipse(cx - 10 * u, yr * u, 0.6 * u, 0.6 * u, "R");
    s.fillEllipse(cx + 10 * u, yr * u, 0.6 * u, 0.6 * u, "R");
  }

  // --- Gorget / neck plates flange at bottom ---
  s.trapezoid(cx - 12 * u, cx + 12 * u, cx - 8 * u, cx + 8 * u, 38 * u, 42 * u, "S");
  s.trapezoid(cx - 11 * u, cx + 11 * u, cx - 7 * u, cx + 7 * u, 39 * u, 41 * u, "s");

  return s;
}

// ───────────────────── 16×16 HAND-TUNED HELMETS ─────────────────────
function defineFromRows(rows, w, h) {
  if (rows.length !== h) throw new Error(`Expected ${h} rows, got ${rows.length}`);
  for (const r of rows) {
    if (r.length !== w) throw new Error(`Expected width ${w}, got "${r}" (${r.length})`);
  }
  const used = new Set();
  for (const r of rows) for (const c of r) used.add(c);
  const palette = {};
  for (const c of used) if (PALETTE[c]) palette[c] = PALETTE[c];
  return { w, h, palette, rows, usedPalette: () => palette, toRows: () => rows };
}

function viking16() {
  return defineFromRows([
    "................",
    "................",
    "B..............B",
    "Bb............bB",
    ".Bbb.smmmms.bbB.",
    "..bbsmMMMMmsbb..",
    "...smmMMMMmms...",
    ".SSSSSSSSSSSSSS.",
    ".SmmKKsSSsKKmmS.",
    ".SsmsKsSSsKsmsS.",
    ".SsmSs.SS.sSmsS.",
    ".SsSS..SS..SSsS.",
    "..SmS..SS..SmS..",
    "..FmS..SS..SmF..",
    ".FfmS..SS..SmfF.",
    "................",
  ], 16, 16);
}

function spaceHunter16() {
  return defineFromRows([
    "................",
    "....SSSSSSSS....",
    "..SmMMMMMMMMmS..",
    ".SmMMMWWWWMMMmS.",
    ".SMMMMWWWWMMMMS.",
    ".SMMMMMWWMMMMMS.",
    ".SMMMMmWWmMMMMS.",
    ".SYGGGGGGGGGGYS.",
    ".SYGGGGGGGGGGYS.",
    ".Smm.YGGGGY.mmS.",
    ".SmS.YGGGGY.SmS.",
    "..mS..YggY..Sm..",
    "..SS..YggY..SS..",
    "...S..YYYY..S...",
    ".......YY.......",
    "................",
  ], 16, 16);
}

function soldier16() {
  return defineFromRows([
    "................",
    "...uOOOOOOOOu...",
    "..uOOOOOOOOOOu..",
    ".uOOOOOMMOOOOOu.",
    ".uOOOOMmmMOOOOu.",
    ".uOOOOMMMMOOOOu.",
    ".uOOOOOOOOOOOOu.",
    ".uAAAAAAAAAAAAu.",
    ".uaAAAAGGAAAAau.",
    "..oaAAAAAAAAao..",
    "..OOOOOOOOOOOO..",
    ".oOOOOOOOOOOOOo.",
    "..ooOOOOOOOOoo..",
    "....uuOOOOuu....",
    "................",
    "................",
  ], 16, 16);
}

function knight16() {
  return defineFromRows([
    "................",
    "PP..............",
    "PPp.............",
    "PpPp............",
    "pPp.sssss.......",
    "Ppp.smmmms......",
    "Pp..smMMMMs.....",
    "pp.SsmmMMmmsS...",
    "p..SmKKKKKKmS...",
    "...SmmsSSsmmS...",
    "...SmsoSSosmS...",
    "...SmsoSSosmS...",
    "...SmmsSSsmmS...",
    "....SSmmmmSS....",
    ".....SSSSSS.....",
    "................",
  ], 16, 16);
}

// ───────────────────── 16×16 BODIES ─────────────────────
// ───── BODIES (torso only — no arms protruding, no legs) ─────
function vikingBody16() {
  return defineFromRows([
    "................",
    "......NNNN......",
    "....BHHHHHHB....",
    "...BFHHHHHHFB...",
    "...BbHHHHHHbB...",
    "...BbHHHHHHbB...",
    "...BbRRRRRRbB...",
    "...BbHHHHHHbB...",
    "...BbHHHHHHbB...",
    "...BbHHHHHHbB...",
    "....bHHHHHHb....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function spaceHunterBody16() {
  return defineFromRows([
    "................",
    "......NNNN......",
    "....SMMMMMMS....",
    "...SMWWWWWWMS...",
    "...SMMggggMMS...",
    "...SmMggggMmS...",
    "...SMMMMMMMMS...",
    "...SmMMMMMMmS...",
    "...SMggggggMS...",
    "...SmMMMMMMmS...",
    "....mMMMMMMm....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function soldierBody16() {
  return defineFromRows([
    "................",
    "......NNNN......",
    "....uOOOOOOu....",
    "...uOoOOOOoOu...",
    "...uOOAAAAOOu...",
    "...uOOAAAAOOu...",
    "...uOOAaaAOOu...",
    "...uOOAAAAOOu...",
    "...uOOOOOOOOu...",
    "...uOoOOOOoOu...",
    "....OOOOOOOO....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function knightBody16() {
  return defineFromRows([
    "................",
    "......NNNN......",
    "....SmMMMMmS....",
    "...SmMMMMMMmS...",
    "...SMMMmmMMMS...",
    "...SMmMMMMmMS...",
    "...SMMMRRMMMS...",
    "...SMMMRRMMMS...",
    "...SMmMMMMmMS...",
    "...SMMMmmMMMS...",
    "....SmMMMMmS....",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

// ───── ARMS (two arms at sides, transparent center for torso) ─────
function vikingArms16() {
  return defineFromRows([
    "................",
    "................",
    "..BBb......bBB..",
    "..BBb......bBB..",
    "..Bbb......bbB..",
    "..BFF......FFB..",
    "..FfF......FfF..",
    "..NNN......NNN..",
    "..NNN......NNN..",
    "..NNN......NNN..",
    "...NN......NN...",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function spaceHunterArms16() {
  return defineFromRows([
    "................",
    "..SMM......MMS..",
    ".SMMM......MMMS.",
    ".SMmM......MmMS.",
    "..SmM......MmS..",
    "..SgM......MgS..",
    "..SMM......MMS..",
    "..mmM......Mmm..",
    "..NNN......NNN..",
    "..NNN......NNN..",
    "...NN......NN...",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function soldierArms16() {
  return defineFromRows([
    "................",
    "..uOO......OOu..",
    "..uOo......oOu..",
    "..uOO......OOu..",
    "..uOo......oOu..",
    "..uOO......OOu..",
    "..uoO......Oou..",
    "..fff......fff..",
    "..NNN......NNN..",
    "..NNN......NNN..",
    "...NN......NN...",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

function knightArms16() {
  return defineFromRows([
    "................",
    "..SMM......MMS..",
    ".SMMM......MMMS.",
    ".SMmM......MmMS.",
    "..SmM......MmS..",
    "..SmR......RmS..",
    "..SmM......MmS..",
    "..MMM......MMM..",
    "..MMM......MMM..",
    "..MMM......MMM..",
    "...MM......MM...",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], 16, 16);
}

// ───── LEGS (two legs + boots) ─────
function vikingLegs16() {
  return defineFromRows([
    "....BB....BB....",
    "....BB....BB....",
    "....BB....BB....",
    "....Bb....bB....",
    "....Bb....bB....",
    "....Bb....bB....",
    "....bb....bb....",
    "....bb....bb....",
    "....bb....bb....",
    "....bb....bb....",
    "...BBB....BBB...",
    "...BBb....bBB...",
    "..BBbb....bbBB..",
    "..BBbb....bbBB..",
    "..BBBB....BBBB..",
    "................",
  ], 16, 16);
}

function spaceHunterLegs16() {
  return defineFromRows([
    "....SM....MS....",
    "....SM....MS....",
    "....SM....MS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....SmM..MmS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "...SmM....MmS...",
    "...SSmm..mmSS...",
    "..SSSSS..SSSSS..",
    "..SSSSS..SSSSS..",
    "..SSSSSSSSSSSS..",
    "................",
  ], 16, 16);
}

function soldierLegs16() {
  return defineFromRows([
    "....uO....Ou....",
    "....uO....Ou....",
    "....uO....Ou....",
    "....uO....Ou....",
    "....uOo..oOu....",
    "....uO....Ou....",
    "....uO....Ou....",
    "....uO....Ou....",
    "....uO....Ou....",
    "....uO....Ou....",
    "...BBuu..uuBB...",
    "...BBBB..BBBB...",
    "..BBBBB..BBBBB..",
    "..BBBBB..BBBBB..",
    "..BBBBBBBBBBBB..",
    "................",
  ], 16, 16);
}

function knightLegs16() {
  return defineFromRows([
    "....MM....MM....",
    "....SM....MS....",
    "....SM....MS....",
    "....SM....MS....",
    "....SmR..RmS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "....Sm....mS....",
    "...SmMM..MMmS...",
    "...SmMm..mMmS...",
    "..SSSMM..MMSSS..",
    "..SSMMS..SMMSS..",
    "..SSSSSSSSSSSS..",
    "................",
  ], 16, 16);
}

// ───────────────────── BUILD JSON ─────────────────────
const helmets = {
  id: "helmets",
  name: "Helmets",
  version: 1,
  format: "indexed-palette-v1",
  categories: {
    "48px": [
      { id: "viking-48",       name: "Viking Helmet",       ...sprToJson(viking(48)) },
      { id: "space-hunter-48", name: "Space Hunter Helmet", ...sprToJson(spaceHunter(48)) },
      { id: "soldier-48",      name: "Soldier Helmet",      ...sprToJson(soldierFuture(48)) },
      { id: "knight-48",       name: "Knight Helmet",       ...sprToJson(knight(48)) },
    ],
    "16px": [
      { id: "viking-16",       name: "Viking Helmet",       ...sprToJson(viking16()) },
      { id: "space-hunter-16", name: "Space Hunter Helmet", ...sprToJson(spaceHunter16()) },
      { id: "soldier-16",      name: "Soldier Helmet",      ...sprToJson(soldier16()) },
      { id: "knight-16",       name: "Knight Helmet",       ...sprToJson(knight16()) },
    ],
  },
};

function sprToJson(s) {
  return { w: s.w, h: s.h, palette: s.usedPalette(), rows: s.toRows() };
}

const bodies = {
  id: "bodies",
  name: "Bodies",
  version: 1,
  format: "indexed-palette-v1",
  categories: {
    "16px": [
      { id: "viking-body-16",       name: "Viking Body",       ...sprToJson(vikingBody16()) },
      { id: "space-hunter-body-16", name: "Space Hunter Body", ...sprToJson(spaceHunterBody16()) },
      { id: "soldier-body-16",      name: "Soldier Body",      ...sprToJson(soldierBody16()) },
      { id: "knight-body-16",       name: "Knight Body",       ...sprToJson(knightBody16()) },
    ],
  },
};

const arms = {
  id: "arms",
  name: "Arms",
  version: 1,
  format: "indexed-palette-v1",
  categories: {
    "16px": [
      { id: "viking-arms-16",       name: "Viking Arms",       ...sprToJson(vikingArms16()) },
      { id: "space-hunter-arms-16", name: "Space Hunter Arms", ...sprToJson(spaceHunterArms16()) },
      { id: "soldier-arms-16",      name: "Soldier Arms",      ...sprToJson(soldierArms16()) },
      { id: "knight-arms-16",       name: "Knight Arms",       ...sprToJson(knightArms16()) },
    ],
  },
};

const legs = {
  id: "legs",
  name: "Legs",
  version: 1,
  format: "indexed-palette-v1",
  categories: {
    "16px": [
      { id: "viking-legs-16",       name: "Viking Legs",       ...sprToJson(vikingLegs16()) },
      { id: "space-hunter-legs-16", name: "Space Hunter Legs", ...sprToJson(spaceHunterLegs16()) },
      { id: "soldier-legs-16",      name: "Soldier Legs",      ...sprToJson(soldierLegs16()) },
      { id: "knight-legs-16",       name: "Knight Legs",       ...sprToJson(knightLegs16()) },
    ],
  },
};

const manifest = {
  version: 1,
  kits: [
    { id: "helmets", name: "Helmets", file: "helmets.json" },
    { id: "bodies",  name: "Bodies",  file: "bodies.json" },
    { id: "arms",    name: "Arms",    file: "arms.json" },
    { id: "legs",    name: "Legs",    file: "legs.json" },
  ],
};

writeFileSync(resolve(PROJECT_ROOT, "public/kits/helmets.json"), JSON.stringify(helmets, null, 2) + "\n");
writeFileSync(resolve(PROJECT_ROOT, "public/kits/bodies.json"),  JSON.stringify(bodies, null, 2) + "\n");
writeFileSync(resolve(PROJECT_ROOT, "public/kits/arms.json"),    JSON.stringify(arms, null, 2) + "\n");
writeFileSync(resolve(PROJECT_ROOT, "public/kits/legs.json"),    JSON.stringify(legs, null, 2) + "\n");
writeFileSync(resolve(PROJECT_ROOT, "public/kits/manifest.json"),JSON.stringify(manifest, null, 2) + "\n");

const count = (k) => Object.values(k.categories).reduce((n, c) => n + c.length, 0);
console.log(`Wrote helmets (${count(helmets)}), bodies (${count(bodies)}), arms (${count(arms)}), legs (${count(legs)}), and manifest.`);
