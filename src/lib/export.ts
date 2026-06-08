"use client";
import { getCelBuffer } from "./pixels";
import { encodeGif } from "./gif";
import type { Frame, Layer } from "./types";

export function compositeToCanvas(
  layers: Layer[],
  width: number,
  height: number,
  frameId: string,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const buf = getCelBuffer(layer.id, frameId);
    if (!buf) continue;
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tctx = tmp.getContext("2d")!;
    const data = new Uint8ClampedArray(buf);
    tctx.putImageData(new ImageData(data, width, height), 0, 0);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(tmp, 0, 0);
  }
  ctx.globalAlpha = 1;
  return out;
}

// Composite one frame at an integer scale (nearest-neighbor, no smoothing).
function frameCanvas(
  layers: Layer[],
  width: number,
  height: number,
  frameId: string,
  scale: number,
): HTMLCanvasElement {
  const base = compositeToCanvas(layers, width, height, frameId);
  if (scale === 1) return base;
  const out = document.createElement("canvas");
  out.width = width * scale;
  out.height = height * scale;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, width * scale, height * scale);
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPng(
  layers: Layer[],
  width: number,
  height: number,
  frameId: string,
  scale = 1,
) {
  const final = frameCanvas(layers, width, height, frameId, scale);
  final.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `sprite-${width}x${height}${scale > 1 ? `@${scale}x` : ""}.png`);
  }, "image/png");
}

// Animated GIF of every frame, using each frame's duration for timing.
export function exportGif(
  layers: Layer[],
  width: number,
  height: number,
  frames: Frame[],
  opts: { scale?: number; loop?: boolean } = {},
) {
  const scale = opts.scale ?? 1;
  const gifFrames = frames.map((f) => {
    const c = frameCanvas(layers, width, height, f.id, scale);
    const ctx = c.getContext("2d")!;
    return { data: ctx.getImageData(0, 0, c.width, c.height).data, delayMs: f.duration };
  });
  const blob = encodeGif(gifFrames, width * scale, height * scale, { loop: opts.loop ?? true });
  downloadBlob(blob, `animation-${width}x${height}-${frames.length}f.gif`);
}

// Horizontal-grid sprite sheet PNG plus an Aseprite-style JSON sidecar that
// game engines can read for frame rects and per-frame durations.
export function exportSpriteSheet(
  layers: Layer[],
  width: number,
  height: number,
  frames: Frame[],
  opts: { scale?: number; columns?: number } = {},
) {
  const scale = opts.scale ?? 1;
  const fw = width * scale;
  const fh = height * scale;
  const cols = opts.columns ?? Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);

  const sheet = document.createElement("canvas");
  sheet.width = cols * fw;
  sheet.height = rows * fh;
  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const jsonFrames = frames.map((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * fw;
    const y = row * fh;
    ctx.drawImage(frameCanvas(layers, width, height, f.id, scale), x, y);
    return {
      filename: f.name,
      frame: { x, y, w: fw, h: fh },
      duration: f.duration,
    };
  });

  const meta = {
    app: "PixelFrame",
    version: "1.0",
    image: "spritesheet.png",
    format: "RGBA8888",
    size: { w: sheet.width, h: sheet.height },
    scale: String(scale),
    frameSize: { w: fw, h: fh },
    columns: cols,
  };
  const json = JSON.stringify({ frames: jsonFrames, meta }, null, 2);

  sheet.toBlob((blob) => {
    if (blob) downloadBlob(blob, "spritesheet.png");
  }, "image/png");
  // stagger the second download so browsers don't drop it
  setTimeout(() => {
    downloadBlob(new Blob([json], { type: "application/json" }), "spritesheet.json");
  }, 300);
}

// One PNG per frame (frame-001.png, …). Staggered so browsers allow the batch.
export function exportPngSequence(
  layers: Layer[],
  width: number,
  height: number,
  frames: Frame[],
  scale = 1,
) {
  frames.forEach((f, i) => {
    setTimeout(() => {
      const c = frameCanvas(layers, width, height, f.id, scale);
      c.toBlob((blob) => {
        if (blob) downloadBlob(blob, `frame-${String(i + 1).padStart(3, "0")}.png`);
      }, "image/png");
    }, i * 200);
  });
}
