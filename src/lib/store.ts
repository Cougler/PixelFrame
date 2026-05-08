"use client";
import { create } from "zustand";
import type {
  Layer,
  Tool,
  ShapeMode,
  HistoryEntry,
  Selection,
  Clipboard,
  FloatingSelection,
  Transform,
} from "./types";
import { PICO8 } from "./color";
import {
  createPixelBuffer,
  setLayerBuffer,
  getLayerBuffer,
  deleteLayerBuffer,
  cloneBuffer,
} from "./pixels";

const HISTORY_LIMIT = 100;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type State = {
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  palette: string[];
  activeColor: string;
  paletteLocked: boolean;
  tool: Tool;
  prevTool: Tool;
  shapeMode: ShapeMode;
  zoom: number;
  showGrid: boolean;
  brushSize: number;
  history: HistoryEntry[];
  redoStack: HistoryEntry[];
  cursorPixel: { x: number; y: number } | null;
  selection: Selection | null;
  clipboard: Clipboard | null;
  floating: FloatingSelection | null;
  docVersion: number;
};

type Actions = {
  newDocument: (width: number, height: number) => void;
  setTool: (tool: Tool) => void;
  setShapeMode: (mode: ShapeMode) => void;
  setActiveColor: (hex: string) => void;
  addPaletteColor: (hex: string) => void;
  removePaletteColor: (hex: string) => void;
  togglePaletteLocked: () => void;
  setZoom: (zoom: number) => void;
  setShowGrid: (v: boolean) => void;
  setBrushSize: (size: number) => void;
  setCursorPixel: (p: { x: number; y: number } | null) => void;
  addLayer: () => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  toggleLayerLocked: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  reorderLayer: (id: string, direction: -1 | 1) => void;
  setActiveLayer: (id: string) => void;
  bumpLayerRev: (id: string) => void;
  pushHistory: (entry: HistoryEntry) => void;
  beginStroke: (layerId: string) => Uint8ClampedArray | null;
  commitStroke: (layerId: string, before: Uint8ClampedArray) => void;
  undo: () => void;
  redo: () => void;
  loadDocument: (snap: SerializedDoc) => void;
  serialize: () => SerializedDoc;
  setSelection: (sel: Selection | null) => void;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  deleteSelectionContents: () => void;
  liftRect: (rect: Selection, layerId: string) => void;
  updateFloatingTransform: (transform: Transform) => void;
  commitFloating: () => void;
  cancelFloating: () => void;
  discardFloating: () => void;
};

export type SerializedDoc = {
  version: 1;
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  palette: string[];
  activeColor: string;
  pixelData: Record<string, string>;
};

function bufferToBase64(buf: Uint8ClampedArray): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    const sub = buf.subarray(i, Math.min(i + chunk, buf.length));
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  if (typeof btoa !== "undefined") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

function base64ToBuffer(b64: string): Uint8ClampedArray {
  const binary = typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function makeLayer(name: string): Layer {
  return {
    id: uid(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    rev: 0,
  };
}

function defaultDoc(width: number, height: number) {
  const layer = makeLayer("Layer 1");
  setLayerBuffer(layer.id, createPixelBuffer(width, height));
  return {
    width,
    height,
    layers: [layer],
    activeLayerId: layer.id,
  };
}

const initial = defaultDoc(32, 32);

export const useStore = create<State & Actions>((set, get) => ({
  width: initial.width,
  height: initial.height,
  layers: initial.layers,
  activeLayerId: initial.activeLayerId,
  palette: PICO8.slice(),
  activeColor: PICO8[7],
  paletteLocked: false,
  tool: "pencil",
  prevTool: "pencil",
  shapeMode: "stroke",
  zoom: 12,
  showGrid: true,
  brushSize: 1,
  history: [],
  redoStack: [],
  cursorPixel: null,
  selection: null,
  clipboard: null,
  floating: null,
  docVersion: 0,

  newDocument: (width, height) => {
    // wipe existing buffers
    for (const l of get().layers) deleteLayerBuffer(l.id);
    const fresh = defaultDoc(width, height);
    set({
      ...fresh,
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      zoom: Math.max(2, Math.min(24, Math.floor(480 / Math.max(width, height)))),
      docVersion: get().docVersion + 1,
    });
  },

  setTool: (tool) => set({ prevTool: get().tool, tool }),
  setShapeMode: (shapeMode) => set({ shapeMode }),
  setActiveColor: (activeColor) => set({ activeColor }),
  addPaletteColor: (hex) => {
    const h = hex.toUpperCase();
    if (get().palette.includes(h)) return;
    set({ palette: [...get().palette, h] });
  },
  removePaletteColor: (hex) => {
    const h = hex.toUpperCase();
    set({ palette: get().palette.filter((c) => c !== h) });
  },
  togglePaletteLocked: () => set({ paletteLocked: !get().paletteLocked }),
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(64, zoom)) }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(32, Math.round(size))) }),
  setCursorPixel: (cursorPixel) => set({ cursorPixel }),

  addLayer: () => {
    const layer = makeLayer(`Layer ${get().layers.length + 1}`);
    setLayerBuffer(layer.id, createPixelBuffer(get().width, get().height));
    set({ layers: [...get().layers, layer], activeLayerId: layer.id });
  },

  duplicateLayer: (id) => {
    const src = get().layers.find((l) => l.id === id);
    if (!src) return;
    const buf = getLayerBuffer(id);
    if (!buf) return;
    const layer: Layer = { ...src, id: uid(), name: `${src.name} copy`, rev: 0 };
    setLayerBuffer(layer.id, cloneBuffer(buf));
    const idx = get().layers.findIndex((l) => l.id === id);
    const next = get().layers.slice();
    next.splice(idx + 1, 0, layer);
    set({ layers: next, activeLayerId: layer.id });
  },

  deleteLayer: (id) => {
    const layers = get().layers;
    if (layers.length <= 1) return;
    deleteLayerBuffer(id);
    const idx = layers.findIndex((l) => l.id === id);
    const next = layers.filter((l) => l.id !== id);
    const nextActive = get().activeLayerId === id ? next[Math.max(0, idx - 1)].id : get().activeLayerId;
    set({ layers: next, activeLayerId: nextActive });
  },

  toggleLayerVisible: (id) =>
    set({
      layers: get().layers.map((l) => (l.id === id ? { ...l, visible: !l.visible, rev: l.rev + 1 } : l)),
    }),

  toggleLayerLocked: (id) =>
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) }),

  renameLayer: (id, name) =>
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, name } : l)) }),

  setLayerOpacity: (id, opacity) =>
    set({
      layers: get().layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)), rev: l.rev + 1 } : l,
      ),
    }),

  reorderLayer: (id, direction) => {
    const layers = get().layers.slice();
    const i = layers.findIndex((l) => l.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    set({ layers });
  },

  setActiveLayer: (activeLayerId) => set({ activeLayerId }),

  bumpLayerRev: (id) =>
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, rev: l.rev + 1 } : l)) }),

  pushHistory: (entry) => {
    const history = [...get().history, entry];
    if (history.length > HISTORY_LIMIT) history.shift();
    set({ history, redoStack: [] });
  },

  beginStroke: (layerId) => {
    const buf = getLayerBuffer(layerId);
    if (!buf) return null;
    return cloneBuffer(buf);
  },

  commitStroke: (layerId, before) => {
    const buf = getLayerBuffer(layerId);
    if (!buf) return;
    // skip if no change
    let changed = false;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== before[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const after = cloneBuffer(buf);
    get().pushHistory({ type: "pixels", layerId, before, after });
    get().bumpLayerRev(layerId);
  },

  undo: () => {
    const history = get().history.slice();
    const entry = history.pop();
    if (!entry) return;
    const buf = getLayerBuffer(entry.layerId);
    if (buf) {
      buf.set(entry.before);
    }
    set({
      history,
      redoStack: [...get().redoStack, entry],
    });
    get().bumpLayerRev(entry.layerId);
  },

  redo: () => {
    const redo = get().redoStack.slice();
    const entry = redo.pop();
    if (!entry) return;
    const buf = getLayerBuffer(entry.layerId);
    if (buf) {
      buf.set(entry.after);
    }
    set({
      redoStack: redo,
      history: [...get().history, entry],
    });
    get().bumpLayerRev(entry.layerId);
  },

  loadDocument: (snap) => {
    for (const l of get().layers) deleteLayerBuffer(l.id);
    for (const l of snap.layers) {
      const data = snap.pixelData[l.id];
      if (data) setLayerBuffer(l.id, base64ToBuffer(data));
      else setLayerBuffer(l.id, createPixelBuffer(snap.width, snap.height));
    }
    set({
      width: snap.width,
      height: snap.height,
      layers: snap.layers,
      activeLayerId: snap.activeLayerId,
      palette: snap.palette,
      activeColor: snap.activeColor,
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      zoom: Math.max(2, Math.min(24, Math.floor(480 / Math.max(snap.width, snap.height)))),
      docVersion: get().docVersion + 1,
    });
  },

  serialize: () => {
    const s = get();
    const pixelData: Record<string, string> = {};
    for (const l of s.layers) {
      const buf = getLayerBuffer(l.id);
      if (buf) pixelData[l.id] = bufferToBase64(buf);
    }
    return {
      version: 1,
      width: s.width,
      height: s.height,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      palette: s.palette,
      activeColor: s.activeColor,
      pixelData,
    };
  },

  setSelection: (selection) => set({ selection }),

  liftRect: (rect, layerId) => {
    const s = get();
    // commit any existing floating first
    if (s.floating) {
      get().commitFloating();
    }
    const buf = getLayerBuffer(layerId);
    if (!buf) return;
    const before = cloneBuffer(buf);
    const pixels = new Uint8ClampedArray(rect.w * rect.h * 4);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const sx = rect.x + x;
        const sy = rect.y + y;
        if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
        const srcI = (sy * s.width + sx) * 4;
        const dstI = (y * rect.w + x) * 4;
        pixels[dstI] = buf[srcI];
        pixels[dstI + 1] = buf[srcI + 1];
        pixels[dstI + 2] = buf[srcI + 2];
        pixels[dstI + 3] = buf[srcI + 3];
        // clear in source
        buf[srcI] = 0;
        buf[srcI + 1] = 0;
        buf[srcI + 2] = 0;
        buf[srcI + 3] = 0;
      }
    }
    get().commitStroke(layerId, before);
    set({
      selection: null,
      floating: {
        pixels,
        w: rect.w,
        h: rect.h,
        origX: rect.x,
        origY: rect.y,
        origLayerId: layerId,
        transform: {
          cx: rect.x + rect.w / 2,
          cy: rect.y + rect.h / 2,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
    });
  },

  updateFloatingTransform: (transform) => {
    const f = get().floating;
    if (!f) return;
    set({ floating: { ...f, transform } });
  },

  commitFloating: () => {
    const s = get();
    const f = s.floating;
    if (!f) return;
    const targetLayerId = s.activeLayerId;
    const buf = getLayerBuffer(targetLayerId);
    if (!buf) {
      set({ floating: null });
      return;
    }
    const before = cloneBuffer(buf);

    // Render floating with transform onto an artwork-sized canvas
    const dest = document.createElement("canvas");
    dest.width = s.width;
    dest.height = s.height;
    const dctx = dest.getContext("2d");
    if (!dctx) return;
    dctx.imageSmoothingEnabled = false;
    dctx.clearRect(0, 0, s.width, s.height);

    const float = document.createElement("canvas");
    float.width = f.w;
    float.height = f.h;
    const fctx = float.getContext("2d");
    if (!fctx) return;
    fctx.putImageData(
      new ImageData(new Uint8ClampedArray(f.pixels), f.w, f.h),
      0,
      0,
    );

    dctx.save();
    dctx.translate(f.transform.cx, f.transform.cy);
    dctx.rotate(f.transform.rotation);
    dctx.scale(f.transform.scaleX, f.transform.scaleY);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(float, -f.w / 2, -f.h / 2);
    dctx.restore();

    const data = dctx.getImageData(0, 0, s.width, s.height).data;
    // Composite onto active layer (alpha-aware)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      buf[i] = data[i];
      buf[i + 1] = data[i + 1];
      buf[i + 2] = data[i + 2];
      buf[i + 3] = data[i + 3];
    }
    get().commitStroke(targetLayerId, before);
    set({ floating: null });
  },

  cancelFloating: () => {
    const s = get();
    const f = s.floating;
    if (!f) return;
    // restore original pixels back to the source layer at origX/Y
    const buf = getLayerBuffer(f.origLayerId);
    if (!buf) {
      set({ floating: null });
      return;
    }
    const before = cloneBuffer(buf);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const tx = f.origX + x;
        const ty = f.origY + y;
        if (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) continue;
        const srcI = (y * f.w + x) * 4;
        const dstI = (ty * s.width + tx) * 4;
        buf[dstI] = f.pixels[srcI];
        buf[dstI + 1] = f.pixels[srcI + 1];
        buf[dstI + 2] = f.pixels[srcI + 2];
        buf[dstI + 3] = f.pixels[srcI + 3];
      }
    }
    get().commitStroke(f.origLayerId, before);
    set({ floating: null });
  },

  discardFloating: () => {
    set({ floating: null });
  },

  // ---- legacy selection-based ops (retained for keyboard shortcuts) ----

  copySelection: () => {
    const s = get();
    const f = s.floating;
    if (f) {
      // copy current transformed result of floating
      const dest = document.createElement("canvas");
      dest.width = s.width;
      dest.height = s.height;
      const dctx = dest.getContext("2d");
      if (!dctx) return;
      dctx.imageSmoothingEnabled = false;

      const float = document.createElement("canvas");
      float.width = f.w;
      float.height = f.h;
      const fctx = float.getContext("2d");
      if (!fctx) return;
      fctx.putImageData(
        new ImageData(new Uint8ClampedArray(f.pixels), f.w, f.h),
        0,
        0,
      );

      dctx.save();
      dctx.translate(f.transform.cx, f.transform.cy);
      dctx.rotate(f.transform.rotation);
      dctx.scale(f.transform.scaleX, f.transform.scaleY);
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(float, -f.w / 2, -f.h / 2);
      dctx.restore();

      // Determine bounding box of non-transparent pixels
      const all = dctx.getImageData(0, 0, s.width, s.height).data;
      let minX = s.width;
      let minY = s.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          const i = (y * s.width + x) * 4;
          if (all[i + 3] !== 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        set({ clipboard: null });
        return;
      }
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const pixels = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const srcI = ((minY + y) * s.width + (minX + x)) * 4;
          const dstI = (y * cw + x) * 4;
          pixels[dstI] = all[srcI];
          pixels[dstI + 1] = all[srcI + 1];
          pixels[dstI + 2] = all[srcI + 2];
          pixels[dstI + 3] = all[srcI + 3];
        }
      }
      set({
        clipboard: { w: cw, h: ch, originX: minX, originY: minY, pixels },
      });
      return;
    }
    // fallback to plain selection rect
    const sel = s.selection;
    if (!sel) return;
    const buf = getLayerBuffer(s.activeLayerId);
    if (!buf) return;
    const pixels = new Uint8ClampedArray(sel.w * sel.h * 4);
    for (let y = 0; y < sel.h; y++) {
      for (let x = 0; x < sel.w; x++) {
        const sx = sel.x + x;
        const sy = sel.y + y;
        if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
        const srcI = (sy * s.width + sx) * 4;
        const dstI = (y * sel.w + x) * 4;
        pixels[dstI] = buf[srcI];
        pixels[dstI + 1] = buf[srcI + 1];
        pixels[dstI + 2] = buf[srcI + 2];
        pixels[dstI + 3] = buf[srcI + 3];
      }
    }
    set({
      clipboard: { w: sel.w, h: sel.h, originX: sel.x, originY: sel.y, pixels },
    });
  },

  cutSelection: () => {
    const s = get();
    if (s.floating) {
      get().copySelection();
      // discard floating without baking
      set({ floating: null });
      return;
    }
    // legacy: cut from selection rect
    const sel = s.selection;
    if (!sel) return;
    const buf = getLayerBuffer(s.activeLayerId);
    if (!buf) return;
    const before = cloneBuffer(buf);
    const pixels = new Uint8ClampedArray(sel.w * sel.h * 4);
    for (let y = 0; y < sel.h; y++) {
      for (let x = 0; x < sel.w; x++) {
        const sx = sel.x + x;
        const sy = sel.y + y;
        if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
        const srcI = (sy * s.width + sx) * 4;
        const dstI = (y * sel.w + x) * 4;
        pixels[dstI] = buf[srcI];
        pixels[dstI + 1] = buf[srcI + 1];
        pixels[dstI + 2] = buf[srcI + 2];
        pixels[dstI + 3] = buf[srcI + 3];
        buf[srcI] = 0;
        buf[srcI + 1] = 0;
        buf[srcI + 2] = 0;
        buf[srcI + 3] = 0;
      }
    }
    set({
      clipboard: { w: sel.w, h: sel.h, originX: sel.x, originY: sel.y, pixels },
    });
    get().commitStroke(s.activeLayerId, before);
  },

  pasteClipboard: () => {
    const s = get();
    const clip = s.clipboard;
    if (!clip) return;
    // Commit any current floating first
    if (s.floating) {
      get().commitFloating();
    }
    // Create a new floating from clipboard
    set({
      selection: null,
      floating: {
        pixels: new Uint8ClampedArray(clip.pixels),
        w: clip.w,
        h: clip.h,
        origX: clip.originX,
        origY: clip.originY,
        origLayerId: get().activeLayerId,
        transform: {
          cx: clip.originX + clip.w / 2,
          cy: clip.originY + clip.h / 2,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
    });
  },

  deleteSelectionContents: () => {
    const s = get();
    if (s.floating) {
      // discard the floating without baking — pixels are already cleared in source
      set({ floating: null });
      return;
    }
    const sel = s.selection;
    if (!sel) return;
    const buf = getLayerBuffer(s.activeLayerId);
    if (!buf) return;
    const before = cloneBuffer(buf);
    for (let y = 0; y < sel.h; y++) {
      for (let x = 0; x < sel.w; x++) {
        const sx = sel.x + x;
        const sy = sel.y + y;
        if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
        const i = (sy * s.width + sx) * 4;
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 0;
      }
    }
    get().commitStroke(s.activeLayerId, before);
  },
}));
