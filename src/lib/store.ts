"use client";
import { create } from "zustand";
import type {
  Layer,
  Frame,
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
  celKey,
  getCelBuffer,
  setCelBuffer,
  deleteCelBuffer,
  cloneBuffer,
} from "./pixels";
import type { Kit, KitSprite } from "./kits";
import { decodeSprite, encodePixelsToKitFormat, findSprite } from "./kits";
import {
  isUserKit,
  loadUserKitsFromStorage,
  makeUserKit,
  saveUserKitsToStorage,
  upsertSpriteInUserKit,
} from "./user-kits";

const HISTORY_LIMIT = 100;
const DEFAULT_FRAME_DURATION = 100; // ms

// Playback timing lives outside the store so ticking it never enters history
// or the autosave signature. play()/pause()/stop() manage this RAF handle.
let playRaf = 0;
let playClock = 0;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type State = {
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  frames: Frame[];
  activeFrameId: string;
  loop: boolean;
  /** True while the timeline is playing back. */
  playing: boolean;
  /** Frame currently shown during playback (transient — never edited/persisted). */
  previewFrameId: string | null;
  /** Onion skinning — a view setting, not part of the document. */
  onion: OnionSettings;
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
  kits: Kit[] | null;
  userKits: Kit[];
  editingKitSprite: { kitId: string; spriteId: string; spriteName: string } | null;
  tabs: TabSnapshot[];
  activeTabId: string;
  tabCounter: number;
};

export type OnionSettings = {
  enabled: boolean;
  prev: number; // how many previous frames to ghost
  next: number; // how many following frames to ghost
  opacity: number; // opacity of the nearest ghost (farther ones fade)
  tint: boolean; // tint prev blue / next red
};

export type TabSnapshot = {
  id: string;
  name: string;
  /** Serialized doc state. Stale while this tab is active — the live store is authoritative. */
  doc: SerializedDoc;
  zoom: number;
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
  addFrame: () => void;
  duplicateFrame: (id: string) => void;
  deleteFrame: (id: string) => void;
  reorderFrame: (id: string, direction: -1 | 1) => void;
  setActiveFrame: (id: string) => void;
  setFrameDuration: (id: string, duration: number) => void;
  toggleLoop: () => void;
  toggleOnion: () => void;
  setOnion: (partial: Partial<OnionSettings>) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
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
  loadKits: () => Promise<void>;
  stampSprite: (
    pixels: Uint8ClampedArray,
    w: number,
    h: number,
    dropX: number,
    dropY: number,
  ) => void;
  openKitSpriteForEdit: (kitId: string, spriteId: string) => void;
  cancelKitEdit: () => void;
  saveKitSpriteEdit: (targetKitId: string) => Promise<{ success: boolean; error?: string }>;
  loadUserKits: () => Promise<void>;
  createUserKit: (name: string) => Kit;
  resizeCanvas: (w: number, h: number) => void;
  newTab: (w?: number, h?: number) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
};

export type SerializedDoc = {
  version: 1 | 2;
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  palette: string[];
  activeColor: string;
  // v1: keyed by layerId. v2: keyed by celKey(layerId, frameId).
  pixelData: Record<string, string>;
  // v2 animation fields — absent on legacy v1 saves (migrated on load).
  frames?: Frame[];
  activeFrameId?: string;
  loop?: boolean;
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

function blankSerializedDoc(w: number, h: number): SerializedDoc {
  const layerId = uid();
  const frameId = uid();
  return {
    version: 2,
    width: w,
    height: h,
    layers: [{ id: layerId, name: "Layer 1", visible: true, locked: false, opacity: 1, rev: 0 }],
    activeLayerId: layerId,
    frames: [{ id: frameId, name: "Frame 1", duration: DEFAULT_FRAME_DURATION }],
    activeFrameId: frameId,
    loop: true,
    palette: PICO8.slice(),
    activeColor: PICO8[7],
    pixelData: {},
  };
}

function fitZoom(w: number, h: number): number {
  return Math.max(2, Math.min(24, Math.floor(480 / Math.max(w, h))));
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

function makeFrame(name: string): Frame {
  return { id: uid(), name, duration: DEFAULT_FRAME_DURATION };
}

function defaultDoc(width: number, height: number) {
  const layer = makeLayer("Layer 1");
  const frame = makeFrame("Frame 1");
  setCelBuffer(layer.id, frame.id, createPixelBuffer(width, height));
  return {
    width,
    height,
    layers: [layer],
    activeLayerId: layer.id,
    frames: [frame],
    activeFrameId: frame.id,
  };
}

const initial = defaultDoc(32, 32);
const initialTabId = uid();
const initialTabDoc: SerializedDoc = {
  version: 2,
  width: initial.width,
  height: initial.height,
  layers: initial.layers,
  activeLayerId: initial.activeLayerId,
  frames: initial.frames,
  activeFrameId: initial.activeFrameId,
  loop: true,
  palette: PICO8.slice(),
  activeColor: PICO8[7],
  pixelData: {},
};

export const useStore = create<State & Actions>((set, get) => {
  // Buffer for the active layer on the active frame — the default edit target.
  const activeCel = (layerId: string) => getCelBuffer(layerId, get().activeFrameId);
  // Wipe every cel of the current document (all layer×frame buffers).
  const wipeAllCels = () => {
    const st = get();
    for (const f of st.frames) for (const l of st.layers) deleteCelBuffer(l.id, f.id);
  };

  return {
  width: initial.width,
  height: initial.height,
  layers: initial.layers,
  activeLayerId: initial.activeLayerId,
  frames: initial.frames,
  activeFrameId: initial.activeFrameId,
  loop: true,
  playing: false,
  previewFrameId: null,
  onion: { enabled: false, prev: 1, next: 1, opacity: 0.35, tint: true },
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
  kits: null,
  userKits: [],
  editingKitSprite: null,
  tabs: [{ id: initialTabId, name: "Untitled", doc: initialTabDoc, zoom: 12 }],
  activeTabId: initialTabId,
  tabCounter: 1,

  newDocument: (width, height) => {
    // wipe existing cels across all frames
    wipeAllCels();
    const fresh = defaultDoc(width, height);
    set({
      ...fresh,
      loop: true,
      playing: false,
      previewFrameId: null,
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      zoom: fitZoom(width, height),
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
    const st = get();
    const layer = makeLayer(`Layer ${st.layers.length + 1}`);
    // a new layer gets an empty cel on every frame
    for (const f of st.frames) {
      setCelBuffer(layer.id, f.id, createPixelBuffer(st.width, st.height));
    }
    set({ layers: [...st.layers, layer], activeLayerId: layer.id });
  },

  duplicateLayer: (id) => {
    const st = get();
    const src = st.layers.find((l) => l.id === id);
    if (!src) return;
    const layer: Layer = { ...src, id: uid(), name: `${src.name} copy`, rev: 0 };
    // clone the source layer's cel on every frame
    for (const f of st.frames) {
      const srcBuf = getCelBuffer(id, f.id);
      setCelBuffer(
        layer.id,
        f.id,
        srcBuf ? cloneBuffer(srcBuf) : createPixelBuffer(st.width, st.height),
      );
    }
    const idx = st.layers.findIndex((l) => l.id === id);
    const next = st.layers.slice();
    next.splice(idx + 1, 0, layer);
    set({ layers: next, activeLayerId: layer.id });
  },

  deleteLayer: (id) => {
    const st = get();
    if (st.layers.length <= 1) return;
    // drop this layer's cel on every frame
    for (const f of st.frames) deleteCelBuffer(id, f.id);
    const idx = st.layers.findIndex((l) => l.id === id);
    const next = st.layers.filter((l) => l.id !== id);
    const nextActive = st.activeLayerId === id ? next[Math.max(0, idx - 1)].id : st.activeLayerId;
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

  // ---- Frames / timeline ----

  setActiveFrame: (id) => {
    const st = get();
    if (st.playing) get().stop();
    if (!st.frames.some((f) => f.id === id)) return;
    set({ activeFrameId: id, selection: null, floating: null });
  },

  addFrame: () => {
    const st = get();
    const frame = makeFrame(`Frame ${st.frames.length + 1}`);
    // new frame is blank: an empty cel for every layer
    for (const l of st.layers) setCelBuffer(l.id, frame.id, createPixelBuffer(st.width, st.height));
    const idx = st.frames.findIndex((f) => f.id === st.activeFrameId);
    const frames = st.frames.slice();
    frames.splice(idx + 1, 0, frame);
    set({ frames, activeFrameId: frame.id, selection: null, floating: null });
  },

  duplicateFrame: (id) => {
    const st = get();
    const src = st.frames.find((f) => f.id === id);
    if (!src) return;
    const frame = makeFrame(`${src.name} copy`);
    frame.duration = src.duration;
    // copy every layer's cel from the source frame
    for (const l of st.layers) {
      const srcBuf = getCelBuffer(l.id, src.id);
      setCelBuffer(
        l.id,
        frame.id,
        srcBuf ? cloneBuffer(srcBuf) : createPixelBuffer(st.width, st.height),
      );
    }
    const idx = st.frames.findIndex((f) => f.id === src.id);
    const frames = st.frames.slice();
    frames.splice(idx + 1, 0, frame);
    set({ frames, activeFrameId: frame.id, selection: null, floating: null });
  },

  deleteFrame: (id) => {
    const st = get();
    if (st.frames.length <= 1) return;
    for (const l of st.layers) deleteCelBuffer(l.id, id);
    const idx = st.frames.findIndex((f) => f.id === id);
    const frames = st.frames.filter((f) => f.id !== id);
    const nextActive =
      st.activeFrameId === id ? frames[Math.max(0, idx - 1)].id : st.activeFrameId;
    set({ frames, activeFrameId: nextActive, selection: null, floating: null });
  },

  reorderFrame: (id, direction) => {
    const frames = get().frames.slice();
    const i = frames.findIndex((f) => f.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= frames.length) return;
    [frames[i], frames[j]] = [frames[j], frames[i]];
    set({ frames });
  },

  setFrameDuration: (id, duration) => {
    const d = Math.max(10, Math.min(10000, Math.round(duration)));
    set({ frames: get().frames.map((f) => (f.id === id ? { ...f, duration: d } : f)) });
  },

  toggleLoop: () => set({ loop: !get().loop }),

  toggleOnion: () => set({ onion: { ...get().onion, enabled: !get().onion.enabled } }),

  setOnion: (partial) => set({ onion: { ...get().onion, ...partial } }),

  play: () => {
    const st = get();
    if (st.playing || st.frames.length < 2) return;
    set({ playing: true, previewFrameId: st.activeFrameId });
    playClock = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = get();
      if (!s.playing) return;
      playClock += now - last;
      last = now;
      let idx = s.frames.findIndex((f) => f.id === s.previewFrameId);
      if (idx < 0) idx = 0;
      let guard = 0;
      while (playClock >= s.frames[idx].duration && guard++ < 10000) {
        playClock -= s.frames[idx].duration;
        idx++;
        if (idx >= s.frames.length) {
          if (s.loop) {
            idx = 0;
          } else {
            set({ playing: false, previewFrameId: null });
            return;
          }
        }
      }
      set({ previewFrameId: s.frames[idx].id });
      playRaf = requestAnimationFrame(tick);
    };
    playRaf = requestAnimationFrame(tick);
  },

  pause: () => {
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    set({ playing: false });
  },

  stop: () => {
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    playClock = 0;
    set({ playing: false, previewFrameId: null });
  },

  pushHistory: (entry) => {
    const history = [...get().history, entry];
    if (history.length > HISTORY_LIMIT) history.shift();
    set({ history, redoStack: [] });
  },

  beginStroke: (layerId) => {
    const buf = activeCel(layerId);
    if (!buf) return null;
    return cloneBuffer(buf);
  },

  commitStroke: (layerId, before) => {
    const buf = activeCel(layerId);
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
    get().pushHistory({ type: "pixels", layerId, frameId: get().activeFrameId, before, after });
    get().bumpLayerRev(layerId);
  },

  undo: () => {
    const history = get().history.slice();
    const entry = history.pop();
    if (!entry) return;
    const buf = getCelBuffer(entry.layerId, entry.frameId);
    if (buf) {
      buf.set(entry.before);
    }
    // jump to where the change happened so it's visible
    set({
      history,
      redoStack: [...get().redoStack, entry],
      activeFrameId: entry.frameId,
      activeLayerId: entry.layerId,
    });
    get().bumpLayerRev(entry.layerId);
  },

  redo: () => {
    const redo = get().redoStack.slice();
    const entry = redo.pop();
    if (!entry) return;
    const buf = getCelBuffer(entry.layerId, entry.frameId);
    if (buf) {
      buf.set(entry.after);
    }
    set({
      redoStack: redo,
      history: [...get().history, entry],
      activeFrameId: entry.frameId,
      activeLayerId: entry.layerId,
    });
    get().bumpLayerRev(entry.layerId);
  },

  loadDocument: (snap) => {
    // drop the outgoing document's cels before loading the new one
    wipeAllCels();

    let frames: Frame[];
    let activeFrameId: string;
    if (snap.frames && snap.frames.length > 0) {
      // v2: cels keyed by celKey(layerId, frameId)
      frames = snap.frames;
      activeFrameId =
        snap.activeFrameId && frames.some((f) => f.id === snap.activeFrameId)
          ? snap.activeFrameId
          : frames[0].id;
      for (const f of frames) {
        for (const l of snap.layers) {
          const data = snap.pixelData[celKey(l.id, f.id)];
          setCelBuffer(
            l.id,
            f.id,
            data ? base64ToBuffer(data) : createPixelBuffer(snap.width, snap.height),
          );
        }
      }
    } else {
      // v1 migration: a single frame whose pixelData is keyed by layerId
      const frame = makeFrame("Frame 1");
      frames = [frame];
      activeFrameId = frame.id;
      for (const l of snap.layers) {
        const data = snap.pixelData[l.id];
        setCelBuffer(
          l.id,
          frame.id,
          data ? base64ToBuffer(data) : createPixelBuffer(snap.width, snap.height),
        );
      }
    }

    set({
      width: snap.width,
      height: snap.height,
      layers: snap.layers,
      activeLayerId: snap.activeLayerId,
      frames,
      activeFrameId,
      loop: snap.loop ?? true,
      playing: false,
      previewFrameId: null,
      palette: snap.palette,
      activeColor: snap.activeColor,
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      zoom: fitZoom(snap.width, snap.height),
      docVersion: get().docVersion + 1,
    });
  },

  resizeCanvas: (w, h) => {
    const state = get();
    w = Math.max(1, Math.min(512, Math.round(w)));
    h = Math.max(1, Math.min(512, Math.round(h)));
    if (w === state.width && h === state.height) return;
    const copyW = Math.min(state.width, w);
    const copyH = Math.min(state.height, h);
    // resize every cel (each layer × frame buffer)
    for (const layer of state.layers) {
      for (const frame of state.frames) {
        const oldBuf = getCelBuffer(layer.id, frame.id);
        if (!oldBuf) continue;
        const newBuf = createPixelBuffer(w, h);
        for (let y = 0; y < copyH; y++) {
          const srcRow = y * state.width;
          const dstRow = y * w;
          for (let x = 0; x < copyW; x++) {
            const srcI = (srcRow + x) * 4;
            const dstI = (dstRow + x) * 4;
            newBuf[dstI] = oldBuf[srcI];
            newBuf[dstI + 1] = oldBuf[srcI + 1];
            newBuf[dstI + 2] = oldBuf[srcI + 2];
            newBuf[dstI + 3] = oldBuf[srcI + 3];
          }
        }
        setCelBuffer(layer.id, frame.id, newBuf);
      }
    }
    set({
      width: w,
      height: h,
      layers: state.layers.map((l) => ({ ...l, rev: l.rev + 1 })),
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      zoom: fitZoom(w, h),
      docVersion: state.docVersion + 1,
    });
  },

  newTab: (w = 32, h = 32) => {
    const state = get();
    const counter = state.tabCounter + 1;
    const snapshotted = state.tabs.map((t) =>
      t.id === state.activeTabId
        ? { ...t, doc: state.serialize(), zoom: state.zoom }
        : t,
    );
    const newId = uid();
    const blank = blankSerializedDoc(w, h);
    state.loadDocument(blank);
    set({
      tabs: [
        ...snapshotted,
        { id: newId, name: `Untitled ${counter}`, doc: blank, zoom: fitZoom(w, h) },
      ],
      activeTabId: newId,
      tabCounter: counter,
      zoom: fitZoom(w, h),
    });
  },

  closeTab: (id) => {
    const state = get();
    if (state.tabs.length <= 1) return;
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    if (id === state.activeTabId) {
      const neighborIdx = idx > 0 ? idx - 1 : idx + 1;
      const neighbor = state.tabs[neighborIdx];
      state.loadDocument(neighbor.doc);
      set({
        tabs: state.tabs.filter((t) => t.id !== id),
        activeTabId: neighbor.id,
        zoom: neighbor.zoom,
      });
    } else {
      set({ tabs: state.tabs.filter((t) => t.id !== id) });
    }
  },

  switchTab: (id) => {
    const state = get();
    if (id === state.activeTabId) return;
    const target = state.tabs.find((t) => t.id === id);
    if (!target) return;
    const snapshotted = state.tabs.map((t) =>
      t.id === state.activeTabId
        ? { ...t, doc: state.serialize(), zoom: state.zoom }
        : t,
    );
    state.loadDocument(target.doc);
    set({ tabs: snapshotted, activeTabId: id, zoom: target.zoom });
  },

  renameTab: (id, name) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, name } : t)) });
  },

  serialize: () => {
    const s = get();
    const pixelData: Record<string, string> = {};
    for (const f of s.frames) {
      for (const l of s.layers) {
        const buf = getCelBuffer(l.id, f.id);
        if (buf) pixelData[celKey(l.id, f.id)] = bufferToBase64(buf);
      }
    }
    return {
      version: 2,
      width: s.width,
      height: s.height,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      frames: s.frames,
      activeFrameId: s.activeFrameId,
      loop: s.loop,
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
    const buf = activeCel(layerId);
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
    const buf = activeCel(targetLayerId);
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
    const buf = activeCel(f.origLayerId);
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

  loadKits: async () => {
    if (get().kits) return;
    const { loadAllKits } = await import("./kits");
    const kits = await loadAllKits();
    set({ kits });
  },

  openKitSpriteForEdit: (kitId, spriteId) => {
    const state = get();
    const all = [...(state.kits || []), ...state.userKits];
    const sprite = findSprite(all, kitId, spriteId);
    if (!sprite) return;
    // Snapshot the current tab before swapping in the new doc
    const snapshotted = state.tabs.map((t) =>
      t.id === state.activeTabId
        ? { ...t, doc: state.serialize(), zoom: state.zoom }
        : t,
    );
    // Wipe current cels; install the sprite as a single layer/frame in a fresh tab
    for (const f of state.frames) for (const l of state.layers) deleteCelBuffer(l.id, f.id);
    const pixels = decodeSprite(sprite);
    const layer = makeLayer("Edit");
    const frame = makeFrame("Frame 1");
    const buf = createPixelBuffer(sprite.w, sprite.h);
    buf.set(pixels);
    setCelBuffer(layer.id, frame.id, buf);
    const newTabId = uid();
    const newDoc: SerializedDoc = {
      version: 2,
      width: sprite.w,
      height: sprite.h,
      layers: [layer],
      activeLayerId: layer.id,
      frames: [frame],
      activeFrameId: frame.id,
      loop: true,
      palette: PICO8.slice(),
      activeColor: PICO8[7],
      pixelData: {},
    };
    const newZoom = Math.max(8, Math.min(32, Math.floor(480 / Math.max(sprite.w, sprite.h))));
    set({
      width: sprite.w,
      height: sprite.h,
      layers: [layer],
      activeLayerId: layer.id,
      frames: [frame],
      activeFrameId: frame.id,
      loop: true,
      playing: false,
      previewFrameId: null,
      palette: newDoc.palette,
      activeColor: newDoc.activeColor,
      history: [],
      redoStack: [],
      selection: null,
      floating: null,
      editingKitSprite: { kitId, spriteId, spriteName: sprite.name },
      tabs: [
        ...snapshotted,
        { id: newTabId, name: sprite.name, doc: newDoc, zoom: newZoom },
      ],
      activeTabId: newTabId,
      tabCounter: state.tabCounter + 1,
      zoom: newZoom,
      docVersion: state.docVersion + 1,
    });
  },

  cancelKitEdit: () => {
    set({ editingKitSprite: null });
  },

  loadUserKits: async () => {
    const userKits = await loadUserKitsFromStorage();
    set({ userKits });
  },

  createUserKit: (name) => {
    const kit = makeUserKit(name);
    const next = [...get().userKits, kit];
    set({ userKits: next });
    // fire-and-forget persistence
    saveUserKitsToStorage(next).catch((e) => console.error("Failed to persist user kits:", e));
    return kit;
  },

  saveKitSpriteEdit: async (targetKitId) => {
    const state = get();
    const editing = state.editingKitSprite;
    if (!editing) return { success: false, error: "Not editing a kit sprite" };
    const buf = activeCel(state.activeLayerId);
    if (!buf) return { success: false, error: "No active layer buffer" };
    const { palette, rows } = encodePixelsToKitFormat(buf, state.width, state.height);

    if (isUserKit(targetKitId)) {
      const userKits = get().userKits.slice();
      const kit = userKits.find((k) => k.id === targetKitId);
      if (!kit) return { success: false, error: "User kit not found" };
      const sprite: KitSprite = {
        id: editing.spriteId,
        name: editing.spriteName,
        w: state.width,
        h: state.height,
        palette,
        rows,
      };
      upsertSpriteInUserKit(kit, sprite);
      try {
        await saveUserKitsToStorage(userKits);
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
      set({ userKits });
      return { success: true };
    }

    // Stock kit save (admin-only once auth lands; for now write to disk in dev)
    try {
      const res = await fetch("/api/kits/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: targetKitId,
          spriteId: editing.spriteId,
          w: state.width,
          h: state.height,
          palette,
          rows,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || res.statusText };
      }
      set({ kits: null });
      await get().loadKits();
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  stampSprite: (pixels, w, h, dropX, dropY) => {
    const s = get();
    if (s.floating) get().commitFloating();
    const origX = Math.floor(dropX - w / 2);
    const origY = Math.floor(dropY - h / 2);
    set({
      selection: null,
      prevTool: get().tool,
      tool: "select",
      floating: {
        pixels: new Uint8ClampedArray(pixels),
        w,
        h,
        origX,
        origY,
        origLayerId: get().activeLayerId,
        transform: {
          cx: origX + w / 2,
          cy: origY + h / 2,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      },
    });
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
    const buf = activeCel(s.activeLayerId);
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
    const buf = activeCel(s.activeLayerId);
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
    const buf = activeCel(s.activeLayerId);
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
  };
});
