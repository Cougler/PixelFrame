// Minimal dependency-free animated GIF89a encoder.
//
// Pixel art fits GIF's model well: small, flat palettes. We build one global
// color table from the most frequent opaque colors (up to 255) plus a single
// transparent index (GIF only supports 1-bit transparency), map every pixel to
// an index, LZW-compress each frame, and emit per-frame delays + a NETSCAPE
// loop block. Colors beyond 255 are mapped to their nearest palette entry.

export type GifFrameInput = {
  /** RGBA pixels, width*height*4. */
  data: Uint8ClampedArray;
  /** Frame duration in milliseconds. */
  delayMs: number;
};

const ALPHA_THRESHOLD = 128; // alpha below this becomes transparent

type RGB = [number, number, number];

function buildPalette(frames: GifFrameInput[]): { palette: RGB[]; transparentIndex: number } {
  // Count opaque color frequencies across all frames.
  const counts = new Map<number, number>();
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < ALPHA_THRESHOLD) continue;
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  // Most frequent first, capped at 255 (index 255 reserved for transparent).
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 255);
  const palette: RGB[] = sorted.map(([key]) => [(key >> 16) & 255, (key >> 8) & 255, key & 255]);
  if (palette.length === 0) palette.push([0, 0, 0]); // degenerate all-transparent doc
  const transparentIndex = palette.length;
  return { palette, transparentIndex };
}

function makeMapper(palette: RGB[]) {
  // Cache exact colors; fall back to nearest-by-squared-distance for the rest.
  const exact = new Map<number, number>();
  palette.forEach((c, i) => exact.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  const cache = new Map<number, number>();
  return (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    cache.set(key, best);
    return best;
  };
}

// Growable byte buffer.
class ByteBuffer {
  private bytes: number[] = [];
  byte(b: number) {
    this.bytes.push(b & 0xff);
  }
  bytesArr(arr: number[]) {
    for (const b of arr) this.bytes.push(b & 0xff);
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff);
  }
  u16(n: number) {
    this.bytes.push(n & 0xff, (n >> 8) & 0xff);
  }
  toUint8Array() {
    return new Uint8Array(this.bytes);
  }
}

// GIF LZW: produce the compressed code stream (LSB-first bit packing), already
// split into ≤255-byte sub-blocks each prefixed by its length, terminated by 0.
function lzwCompress(minCodeSize: number, indices: Uint8Array): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let dict = new Map<string, number>();
  let nextCode = endCode + 1;
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };

  // bit accumulator → bytes
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  resetDict();
  writeCode(clearCode);

  if (indices.length > 0) {
    let prefix = String.fromCharCode(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const c = String.fromCharCode(indices[i]);
      const combined = prefix + c;
      if (dict.has(combined)) {
        prefix = combined;
      } else {
        writeCode(dict.get(prefix)!);
        dict.set(combined, nextCode);
        nextCode++;
        if (nextCode === 4096) {
          // dictionary full (max 12-bit code): emit clear and start fresh
          writeCode(clearCode);
          resetDict();
        } else if (nextCode > 1 << codeSize && codeSize < 12) {
          // Grow the code width one code *late*: the decoder rebuilds its
          // dictionary a step behind the encoder, so growing exactly at
          // 1<<codeSize would desync every subsequent code.
          codeSize++;
        }
        prefix = c;
      }
    }
    writeCode(dict.get(prefix)!);
  }
  writeCode(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  // chunk into sub-blocks
  const blocks: number[] = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(chunk.length);
    for (const b of chunk) blocks.push(b);
  }
  blocks.push(0); // block terminator
  return blocks;
}

export function encodeGif(
  frames: GifFrameInput[],
  width: number,
  height: number,
  opts: { loop?: boolean } = {},
): Blob {
  const { palette, transparentIndex } = buildPalette(frames);
  const map = makeMapper(palette);

  // palette is padded up to a power-of-two table; index size drives code size
  const paletteCount = transparentIndex + 1; // opaque colors + transparent
  let bits = 2;
  while (1 << bits < paletteCount) bits++; // minCodeSize, 2..8
  const tableSize = 1 << bits;

  const buf = new ByteBuffer();
  // Header
  buf.str("GIF89a");
  // Logical Screen Descriptor
  buf.u16(width);
  buf.u16(height);
  // packed: global color table flag (1), color resolution (bits-1), sort (0), GCT size (bits-1)
  buf.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
  buf.byte(transparentIndex & 0xff); // background color index
  buf.byte(0); // pixel aspect ratio
  // Global Color Table (tableSize entries)
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i];
    if (c) buf.bytesArr([c[0], c[1], c[2]]);
    else buf.bytesArr([0, 0, 0]);
  }

  // NETSCAPE2.0 looping extension (0 = infinite). Omit to play once.
  if (opts.loop) {
    buf.byte(0x21);
    buf.byte(0xff);
    buf.byte(11);
    buf.str("NETSCAPE2.0");
    buf.byte(3);
    buf.byte(1);
    buf.u16(0); // loop count: 0 = forever
    buf.byte(0);
  }

  for (const frame of frames) {
    // Graphic Control Extension
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10));
    buf.byte(0x21);
    buf.byte(0xf9);
    buf.byte(4);
    // packed: reserved(3) | disposal(3)=2 restore-to-bg | userInput(1)=0 | transparentFlag(1)=1
    buf.byte((2 << 2) | 0x01);
    buf.u16(delayCs);
    buf.byte(transparentIndex & 0xff);
    buf.byte(0);

    // Image Descriptor
    buf.byte(0x2c);
    buf.u16(0); // left
    buf.u16(0); // top
    buf.u16(width);
    buf.u16(height);
    buf.byte(0); // no local color table

    // Index stream
    const d = frame.data;
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      indices[p] = d[i + 3] < ALPHA_THRESHOLD ? transparentIndex : map(d[i], d[i + 1], d[i + 2]);
    }

    buf.byte(bits); // LZW minimum code size
    buf.bytesArr(lzwCompress(bits, indices));
  }

  buf.byte(0x3b); // trailer
  return new Blob([buf.toUint8Array()], { type: "image/gif" });
}
