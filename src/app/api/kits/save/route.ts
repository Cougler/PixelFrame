import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { resolve } from "path";

// TODO(auth): admin-only once user roles exist. Currently anyone can hit this
// in dev. In prod we should gate on a session with role === "admin".

type SaveBody = {
  kitId: string;
  spriteId: string;
  w: number;
  h: number;
  palette: Record<string, [number, number, number, number]>;
  rows: string[];
};

const ID_RE = /^[a-z0-9-]+$/;

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
  if (typeof w !== "number" || typeof h !== "number" || w <= 0 || h <= 0) {
    return NextResponse.json({ error: "Invalid dimensions" }, { status: 400 });
  }
  if (!palette || typeof palette !== "object" || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Invalid palette/rows" }, { status: 400 });
  }
  if (rows.length !== h) {
    return NextResponse.json({ error: "rows length doesn't match h" }, { status: 400 });
  }
  for (const r of rows) {
    if (typeof r !== "string" || r.length !== w) {
      return NextResponse.json({ error: "row width doesn't match w" }, { status: 400 });
    }
  }

  const path = resolve(process.cwd(), "public/kits", `${kitId}.json`);
  let kit: { categories: Record<string, Array<{ id: string; w: number; h: number; palette: unknown; rows: string[] }>> };
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

  await fs.writeFile(path, JSON.stringify(kit, null, 2) + "\n", "utf-8");
  return NextResponse.json({ success: true });
}
