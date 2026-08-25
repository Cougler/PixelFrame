"use client";
import { useStore } from "./store";
import { getCelBuffer } from "./pixels";

const MAX_DIM = 512;

export type ImportOptions = {
  targetWidth: number;
  targetHeight: number;
  smoothing: boolean; // false = nearest neighbor, true = bilinear blend
};

export async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importPngFile(
  file: File,
  opts: ImportOptions,
): Promise<{ width: number; height: number; capped: boolean }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);

    let w = Math.max(1, Math.round(opts.targetWidth));
    let h = Math.max(1, Math.round(opts.targetHeight));
    let capped = false;
    if (w > MAX_DIM || h > MAX_DIM) {
      const r = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.max(1, Math.floor(w * r));
      h = Math.max(1, Math.floor(h * r));
      capped = true;
    }

    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.imageSmoothingEnabled = opts.smoothing;
    if (opts.smoothing) ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);

    const store = useStore.getState();
    store.newDocument(w, h);
    const { activeLayerId: activeId, activeFrameId } = useStore.getState();
    const buf = getCelBuffer(activeId, activeFrameId);
    if (buf && buf.length === data.data.length) {
      buf.set(data.data);
      useStore.getState().bumpLayerRev(activeId);
    }
    return { width: w, height: h, capped };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
