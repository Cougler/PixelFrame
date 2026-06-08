export type KitPalette = Record<string, [number, number, number, number]>;

export type KitSprite = {
  id: string;
  name: string;
  w: number;
  h: number;
  palette: KitPalette;
  rows: string[];
};

export type Kit = {
  id: string;
  name: string;
  version: number;
  format: string;
  categories: Record<string, KitSprite[]>;
};

type KitManifest = {
  version: number;
  kits: { id: string; name: string; file: string }[];
};

export async function loadAllKits(): Promise<Kit[]> {
  const res = await fetch("/kits/manifest.json");
  if (!res.ok) throw new Error("Failed to load kit manifest");
  const manifest: KitManifest = await res.json();
  return Promise.all(
    manifest.kits.map(async (entry) => {
      const r = await fetch(`/kits/${entry.file}`);
      if (!r.ok) throw new Error(`Failed to load kit: ${entry.file}`);
      return (await r.json()) as Kit;
    }),
  );
}

export function decodeSprite(sprite: KitSprite): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(sprite.w * sprite.h * 4);
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const rgba = sprite.palette[row[x]];
      if (!rgba) continue;
      const i = (y * sprite.w + x) * 4;
      pixels[i] = rgba[0];
      pixels[i + 1] = rgba[1];
      pixels[i + 2] = rgba[2];
      pixels[i + 3] = rgba[3];
    }
  }
  return pixels;
}

export function findSprite(
  kits: Kit[],
  kitId: string,
  spriteId: string,
): KitSprite | null {
  const kit = kits.find((k) => k.id === kitId);
  if (!kit) return null;
  for (const cat of Object.values(kit.categories)) {
    const s = cat.find((sp) => sp.id === spriteId);
    if (s) return s;
  }
  return null;
}

export function renderSpriteThumbnail(sprite: KitSprite): string {
  const c = document.createElement("canvas");
  c.width = sprite.w;
  c.height = sprite.h;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const pixels = decodeSprite(sprite);
  const img = ctx.createImageData(sprite.w, sprite.h);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export const SPRITE_DRAG_TYPE = "application/x-pixelframe-sprite";

/**
 * Encode a Uint8ClampedArray of RGBA pixels into the kit's indexed-palette
 * format. Each unique non-transparent color gets a single alphanumeric char.
 * Transparent (a=0) is always ".".
 */
export function encodePixelsToKitFormat(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
): { palette: KitPalette; rows: string[] } {
  const palette: KitPalette = { ".": [0, 0, 0, 0] };
  const colorToChar = new Map<string, string>();
  colorToChar.set("0,0,0,0", ".");
  const pool =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let nextIdx = 0;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = pixels[i + 3];
      const key = a === 0 ? "0,0,0,0" : `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${a}`;
      let ch = colorToChar.get(key);
      if (!ch) {
        if (nextIdx >= pool.length) {
          throw new Error(`Too many unique colors (max ${pool.length})`);
        }
        ch = pool[nextIdx++];
        colorToChar.set(key, ch);
        palette[ch] =
          a === 0
            ? [0, 0, 0, 0]
            : [pixels[i], pixels[i + 1], pixels[i + 2], a];
      }
      row += ch;
    }
    rows.push(row);
  }
  return { palette, rows };
}
