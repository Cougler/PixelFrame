import type { FloatingSelection, HandleId, Transform } from "./types";

export type ScreenPoint = { x: number; y: number };

// Each scale handle has an "anchor" (opposite point that stays fixed during drag)
// and a "target" (the point being dragged). Both expressed as fractions of (sw, sh)
// where +/-0.5 are the bounds.
export const HANDLE_ANCHORS: Record<
  Exclude<HandleId, "rotate" | "move">,
  { ax: number; ay: number; tx: number; ty: number }
> = {
  tl: { ax: 0.5, ay: 0.5, tx: -0.5, ty: -0.5 },
  t: { ax: 0, ay: 0.5, tx: 0, ty: -0.5 },
  tr: { ax: -0.5, ay: 0.5, tx: 0.5, ty: -0.5 },
  r: { ax: -0.5, ay: 0, tx: 0.5, ty: 0 },
  br: { ax: -0.5, ay: -0.5, tx: 0.5, ty: 0.5 },
  b: { ax: 0, ay: -0.5, tx: 0, ty: 0.5 },
  bl: { ax: 0.5, ay: -0.5, tx: -0.5, ty: 0.5 },
  l: { ax: 0.5, ay: 0, tx: -0.5, ty: 0 },
};

export type HandleScreenMap = {
  tl: ScreenPoint;
  t: ScreenPoint;
  tr: ScreenPoint;
  r: ScreenPoint;
  br: ScreenPoint;
  b: ScreenPoint;
  bl: ScreenPoint;
  l: ScreenPoint;
  rotate: ScreenPoint;
};

export function worldFromLocal(
  lx: number,
  ly: number,
  t: Transform,
): { x: number; y: number } {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    x: lx * cos - ly * sin + t.cx,
    y: lx * sin + ly * cos + t.cy,
  };
}

export function localFromWorld(
  wx: number,
  wy: number,
  t: Transform,
): { x: number; y: number } {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const dx = wx - t.cx;
  const dy = wy - t.cy;
  return {
    x: cos * dx + sin * dy,
    y: -sin * dx + cos * dy,
  };
}

export function getCorners(f: FloatingSelection): {
  tl: ScreenPoint;
  tr: ScreenPoint;
  br: ScreenPoint;
  bl: ScreenPoint;
} {
  const sw = f.w * f.transform.scaleX;
  const sh = f.h * f.transform.scaleY;
  const tl = worldFromLocal(-sw / 2, -sh / 2, f.transform);
  const tr = worldFromLocal(sw / 2, -sh / 2, f.transform);
  const br = worldFromLocal(sw / 2, sh / 2, f.transform);
  const bl = worldFromLocal(-sw / 2, sh / 2, f.transform);
  return { tl, tr, br, bl };
}

export function getHandlePositionsScreen(
  f: FloatingSelection,
  panX: number,
  panY: number,
  zoom: number,
): HandleScreenMap {
  const c = getCorners(f);
  const toScreen = (p: ScreenPoint): ScreenPoint => ({
    x: panX + p.x * zoom,
    y: panY + p.y * zoom,
  });
  const tl = toScreen(c.tl);
  const tr = toScreen(c.tr);
  const br = toScreen(c.br);
  const bl = toScreen(c.bl);
  const t = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const r = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
  const b = { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 };
  const l = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };

  // rotation handle: 28px outward from top-edge midpoint, perpendicular to top edge,
  // away from center.
  const center = toScreen({ x: f.transform.cx, y: f.transform.cy });
  const dx = t.x - center.x;
  const dy = t.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const rotate = {
    x: t.x + (dx / len) * 28,
    y: t.y + (dy / len) * 28,
  };
  return { tl, t, tr, r, br, b, bl, l, rotate };
}

export function hitTestHandle(
  f: FloatingSelection,
  panX: number,
  panY: number,
  zoom: number,
  sx: number,
  sy: number,
): HandleId | null {
  const handles = getHandlePositionsScreen(f, panX, panY, zoom);
  const order: (keyof HandleScreenMap)[] = [
    "rotate",
    "tl",
    "tr",
    "br",
    "bl",
    "t",
    "r",
    "b",
    "l",
  ];
  const radius = 11;
  for (const id of order) {
    const h = handles[id];
    if (Math.hypot(h.x - sx, h.y - sy) <= radius) return id as HandleId;
  }
  // inside the (rotated, scaled) bounding box?
  const ax = (sx - panX) / zoom;
  const ay = (sy - panY) / zoom;
  const local = localFromWorld(ax, ay, f.transform);
  const sw = f.w * f.transform.scaleX;
  const sh = f.h * f.transform.scaleY;
  const halfW = Math.abs(sw) / 2;
  const halfH = Math.abs(sh) / 2;
  if (local.x >= -halfW && local.x <= halfW && local.y >= -halfH && local.y <= halfH) {
    return "move";
  }
  return null;
}

export function applyMoveDrag(
  start: Transform,
  startWorld: ScreenPoint,
  currWorld: ScreenPoint,
): Transform {
  return {
    ...start,
    cx: start.cx + (currWorld.x - startWorld.x),
    cy: start.cy + (currWorld.y - startWorld.y),
  };
}

export function applyRotateDrag(
  start: Transform,
  startWorld: ScreenPoint,
  currWorld: ScreenPoint,
  shift: boolean,
): Transform {
  const startAngle = Math.atan2(startWorld.y - start.cy, startWorld.x - start.cx);
  const currAngle = Math.atan2(currWorld.y - start.cy, currWorld.x - start.cx);
  let rot = start.rotation + (currAngle - startAngle);
  if (shift) {
    const step = Math.PI / 12; // 15°
    rot = Math.round(rot / step) * step;
  }
  return { ...start, rotation: rot };
}

export function applyScaleDrag(
  f: FloatingSelection,
  start: Transform,
  currWorld: ScreenPoint,
  handle: Exclude<HandleId, "rotate" | "move">,
  shift: boolean,
): Transform {
  const cfg = HANDLE_ANCHORS[handle];
  const cos = Math.cos(start.rotation);
  const sin = Math.sin(start.rotation);
  const swOld = f.w * start.scaleX;
  const shOld = f.h * start.scaleY;

  // anchor in world (using the old transform; anchor stays fixed)
  const aLx = cfg.ax * swOld;
  const aLy = cfg.ay * shOld;
  const anchor = {
    x: start.cx + cos * aLx - sin * aLy,
    y: start.cy + sin * aLx + cos * aLy,
  };

  // pointer offset from anchor in local (un-rotated) frame
  const ox = currWorld.x - anchor.x;
  const oy = currWorld.y - anchor.y;
  const localX = cos * ox + sin * oy;
  const localY = -sin * ox + cos * oy;

  const dx = cfg.tx - cfg.ax;
  const dy = cfg.ty - cfg.ay;

  let newSW = swOld;
  let newSH = shOld;
  if (dx !== 0) newSW = localX / dx;
  if (dy !== 0) newSH = localY / dy;

  // clamp to a minimum so things don't flip wildly when dragged through anchor
  const MIN = 1; // 1 artwork pixel
  if (Math.abs(newSW) < MIN) newSW = Math.sign(newSW || 1) * MIN;
  if (Math.abs(newSH) < MIN) newSH = Math.sign(newSH || 1) * MIN;

  // shift = uniform scale on corner handles
  if (shift && dx !== 0 && dy !== 0) {
    const sxNew = newSW / f.w;
    const syNew = newSH / f.h;
    const mag = Math.max(Math.abs(sxNew), Math.abs(syNew));
    newSW = (Math.sign(sxNew) || 1) * mag * f.w;
    newSH = (Math.sign(syNew) || 1) * mag * f.h;
  }

  const newScaleX = newSW / f.w;
  const newScaleY = newSH / f.h;

  // new center keeps anchor fixed
  const aLx2 = cfg.ax * newSW;
  const aLy2 = cfg.ay * newSH;
  const newCx = anchor.x - (cos * aLx2 - sin * aLy2);
  const newCy = anchor.y - (sin * aLx2 + cos * aLy2);

  return {
    cx: newCx,
    cy: newCy,
    scaleX: newScaleX,
    scaleY: newScaleY,
    rotation: start.rotation,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number,
): ScreenPoint {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}
