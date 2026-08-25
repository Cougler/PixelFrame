"use client";
import { getCelBuffer } from "./pixels";
import type { Layer } from "./types";

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

export function exportPng(
  layers: Layer[],
  width: number,
  height: number,
  frameId: string,
  scale = 1,
) {
  const composed = compositeToCanvas(layers, width, height, frameId);
  let final = composed;
  if (scale !== 1) {
    final = document.createElement("canvas");
    final.width = width * scale;
    final.height = height * scale;
    const fctx = final.getContext("2d")!;
    fctx.imageSmoothingEnabled = false;
    fctx.drawImage(composed, 0, 0, width * scale, height * scale);
  }
  final.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprite-${width}x${height}${scale > 1 ? `@${scale}x` : ""}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
