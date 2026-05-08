import type { RGBA } from "./types";

const pixelStore = new Map<string, Uint8ClampedArray>();

export function createPixelBuffer(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

export function setLayerBuffer(id: string, pixels: Uint8ClampedArray) {
  pixelStore.set(id, pixels);
}

export function getLayerBuffer(id: string): Uint8ClampedArray | undefined {
  return pixelStore.get(id);
}

export function deleteLayerBuffer(id: string) {
  pixelStore.delete(id);
}

export function cloneBuffer(buf: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(buf);
}

export function clearBuffer(id: string) {
  const buf = pixelStore.get(id);
  if (buf) buf.fill(0);
}

export function setPixel(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: RGBA,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  buf[i] = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}

export function getPixel(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): RGBA | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const i = (y * width + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

export function paintBrush(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  rgba: RGBA,
) {
  if (size <= 1) {
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return;
    const i = (cy * width + cx) * 4;
    buf[i] = rgba[0];
    buf[i + 1] = rgba[1];
    buf[i + 2] = rgba[2];
    buf[i + 3] = rgba[3];
    return;
  }
  const half = (size - 1) / 2;
  const offMin = -Math.floor(half);
  const offMax = Math.ceil(half);
  for (let dy = offMin; dy <= offMax; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = offMin; dx <= offMax; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      buf[i] = rgba[0];
      buf[i + 1] = rgba[1];
      buf[i + 2] = rgba[2];
      buf[i + 3] = rgba[3];
    }
  }
}

export function clearPixel(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  buf[i] = 0;
  buf[i + 1] = 0;
  buf[i + 2] = 0;
  buf[i + 3] = 0;
}

export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cb: (x: number, y: number) => void,
) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  // safety cap
  let safety = 100000;
  while (safety-- > 0) {
    cb(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function strokeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cb: (x: number, y: number) => void,
) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (let x = minX; x <= maxX; x++) {
    cb(x, minY);
    cb(x, maxY);
  }
  for (let y = minY + 1; y < maxY; y++) {
    cb(minX, y);
    cb(maxX, y);
  }
}

export function fillRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cb: (x: number, y: number) => void,
) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      cb(x, y);
    }
  }
}

export function strokeEllipse(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cb: (x: number, y: number) => void,
) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const a = (maxX - minX) / 2;
  const b = (maxY - minY) / 2;
  if (a <= 0 || b <= 0) {
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) cb(x, y);
    return;
  }
  const cx = minX + a;
  const cy = minY + b;
  const drawn = new Set<string>();
  const plot = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (drawn.has(k)) return;
    drawn.add(k);
    cb(x, y);
  };
  // midpoint ellipse algorithm
  let x = 0;
  let y = b;
  let d1 = b * b - a * a * b + 0.25 * a * a;
  let dx = 2 * b * b * x;
  let dy = 2 * a * a * y;
  while (dx < dy) {
    plot(Math.round(cx + x), Math.round(cy + y));
    plot(Math.round(cx - x), Math.round(cy + y));
    plot(Math.round(cx + x), Math.round(cy - y));
    plot(Math.round(cx - x), Math.round(cy - y));
    if (d1 < 0) {
      x++;
      dx += 2 * b * b;
      d1 += dx + b * b;
    } else {
      x++;
      y--;
      dx += 2 * b * b;
      dy -= 2 * a * a;
      d1 += dx - dy + b * b;
    }
  }
  let d2 =
    b * b * (x + 0.5) * (x + 0.5) +
    a * a * (y - 1) * (y - 1) -
    a * a * b * b;
  while (y >= 0) {
    plot(Math.round(cx + x), Math.round(cy + y));
    plot(Math.round(cx - x), Math.round(cy + y));
    plot(Math.round(cx + x), Math.round(cy - y));
    plot(Math.round(cx - x), Math.round(cy - y));
    if (d2 > 0) {
      y--;
      dy -= 2 * a * a;
      d2 += a * a - dy;
    } else {
      y--;
      x++;
      dx += 2 * b * b;
      dy -= 2 * a * a;
      d2 += dx - dy + a * a;
    }
  }
}

export function fillEllipse(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cb: (x: number, y: number) => void,
) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const a = (maxX - minX) / 2;
  const b = (maxY - minY) / 2;
  const cx = minX + a;
  const cy = minY + b;
  if (a <= 0 || b <= 0) {
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) cb(x, y);
    return;
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / a;
      const dy = (y - cy) / b;
      if (dx * dx + dy * dy <= 1) cb(x, y);
    }
  }
}

export function eraseByColor(
  buf: Uint8ClampedArray,
  target: RGBA,
): boolean {
  let changed = false;
  for (let i = 0; i < buf.length; i += 4) {
    if (
      buf[i] === target[0] &&
      buf[i + 1] === target[1] &&
      buf[i + 2] === target[2] &&
      buf[i + 3] === target[3]
    ) {
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 0;
      changed = true;
    }
  }
  return changed;
}

export function floodFill(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  fill: RGBA,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const targetIdx = (y * width + x) * 4;
  const tr = buf[targetIdx];
  const tg = buf[targetIdx + 1];
  const tb = buf[targetIdx + 2];
  const ta = buf[targetIdx + 3];
  if (tr === fill[0] && tg === fill[1] && tb === fill[2] && ta === fill[3]) return;
  const stack: number[] = [x, y];
  while (stack.length) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const i = (py * width + px) * 4;
    if (
      buf[i] !== tr ||
      buf[i + 1] !== tg ||
      buf[i + 2] !== tb ||
      buf[i + 3] !== ta
    )
      continue;
    buf[i] = fill[0];
    buf[i + 1] = fill[1];
    buf[i + 2] = fill[2];
    buf[i + 3] = fill[3];
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
}
