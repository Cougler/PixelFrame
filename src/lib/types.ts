export type RGBA = [number, number, number, number];

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  rev: number;
};

export type Tool =
  | "pencil"
  | "eraser"
  | "bucket"
  | "eyedropper"
  | "line"
  | "rectangle"
  | "ellipse"
  | "select"
  | "colorErase";

export type Selection = { x: number; y: number; w: number; h: number };

export type Clipboard = {
  w: number;
  h: number;
  originX: number;
  originY: number;
  pixels: Uint8ClampedArray;
};

export type Transform = {
  cx: number;
  cy: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // radians
};

export type FloatingSelection = {
  pixels: Uint8ClampedArray;
  w: number;
  h: number;
  origX: number;
  origY: number;
  origLayerId: string;
  transform: Transform;
};

export type HandleId =
  | "tl"
  | "t"
  | "tr"
  | "r"
  | "br"
  | "b"
  | "bl"
  | "l"
  | "rotate"
  | "move";

export type ShapeMode = "stroke" | "fill";

// A frame is a column in the timeline. Layers span all frames; the pixels for
// a given (layer, frame) live in a cel buffer (see pixels.ts celKey).
export type Frame = {
  id: string;
  name: string;
  duration: number; // milliseconds this frame is shown during playback
};

export type HistoryEntry = {
  type: "pixels";
  layerId: string;
  frameId: string;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
};

export type CanvasDoc = {
  width: number;
  height: number;
  layers: Layer[];
  activeLayerId: string;
  palette: string[];
  activeColor: string;
  pixelData: Record<string, number[]>;
};
