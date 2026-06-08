import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { resolve } from "path";

// TODO(auth): admin-only once user roles exist. Currently anyone can hit this
// in dev. In prod we should gate on a session with role === "admin".
//
// This route mutates a file in `public/kits/`, which only works in dev /
// self-hosted Next.js. Serverless targets (Vercel, Netlify, etc.) have a
// read-only runtime filesystem and will 500 here — the kit registry will need
// to move to a DB before this can run in prod.

type SaveBody = {
  kitId: string;
  spriteId: string;
  w: number;
  h: number;
  palette: Record<string, [number, number, number, number]>;
  rows: string[];
};

const ID_RE = /^[a-z0-9-]+$/;
const MAX_DIM = 512; // matches resizeCanvas cap in src/lib/store.ts
const MAX_PALETTE_ENTRIES = 256;

// Per-kit in-process mutex: two saves to the same kit serialize instead of
// clobbering each other's read-modify-write. Entries are dropped once the
// chain drains so a long-lived process doesn't accumulate stale kit IDs.
const kitLocks = new Map<string, Promise<unknown>>();

function withKitLock<T>(kitId: string, fn: () => Promise<T>): Promise<T> {
  const prev = kitLocks.get(kitId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => fn());
  kitLocks.set(kitId, next);
  next.catch(() => undefined).finally(() => {
    if (kitLocks.get(kitId) === next) kitLocks.delete(kitId);
  });
  return next;
}

function isPaletteEntry(v: unknown): v is [number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 4) return false;
  for (const n of v) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { kitId, spriteId, w, h, palette, rows } = body;
  if (!ID_RE.test(kitId)) return NextResponse.json({ error: "Invalid kitId" }, { status: 400 });
  if (!ID_RE.test(spriteId)) return NextResponse.json({ error: "Invalid spriteId" }, { status: 400 });
  if (
    typeof w !== "number" ||
    typeof h !== "number" ||
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w <= 0 ||
    h <= 0 ||
    w > MAX_DIM ||
    h > MAX_DIM
  ) {
    return NextResponse.json({ error: `Invalid dimensions (1..${MAX_DIM})` }, { status: 400 });
  }
  if (!palette || typeof palette !== "object" || Array.isArray(palette) || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Invalid palette/rows" }, { status: 400 });
  }
  const paletteEntries = Object.entries(palette);
  if (paletteEntries.length > MAX_PALETTE_ENTRIES) {
    return NextResponse.json(
      { error: `Too many palette entries (max ${MAX_PALETTE_ENTRIES})` },
      { status: 400 },
    );
  }
  for (const [, v] of paletteEntries) {
    if (!isPaletteEntry(v)) {
      return NextResponse.json({ error: "Invalid palette entry" }, { status: 400 });
    }
  }
  if (rows.length !== h) {
    return NextResponse.json({ error: "rows length doesn't match h" }, { status: 400 });
  }
  for (const r of rows) {
    if (typeof r !== "string" || r.length !== w) {
      return NextResponse.json({ error: "row width doesn't match w" }, { status: 400 });
    }
  }

  return withKitLock(kitId, async () => {
    const path = resolve(process.cwd(), "public/kits", `${kitId}.json`);
    let kit: {
      categories: Record<
        string,
        Array<{ id: string; w: number; h: number; palette: unknown; rows: string[] }>
      >;
    };
    try {
      const raw = await fs.readFile(path, "utf-8");
      kit = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Kit not found" }, { status: 404 });
    }

    let found = false;
    for (const cat of Object.values(kit.categories)) {
      for (const sp of cat) {
        if (sp.id === spriteId) {
          if (sp.w !== w || sp.h !== h) {
            return NextResponse.json(
              { error: `Size mismatch: existing ${sp.w}x${sp.h}, got ${w}x${h}` },
              { status: 400 },
            );
          }
          sp.palette = palette;
          sp.rows = rows;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) return NextResponse.json({ error: "Sprite not found" }, { status: 404 });

    // Atomic write: stage to a sibling .tmp then rename so a crash mid-write
    // can't leave the kit JSON half-written.
    const tmpPath = `${path}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(kit, null, 2) + "\n", "utf-8");
    await fs.rename(tmpPath, path);
    return NextResponse.json({ success: true });
  });
}
