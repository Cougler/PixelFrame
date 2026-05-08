"use client";
import { useStore } from "@/lib/store";

export default function StatusBar() {
  const cursor = useStore((s) => s.cursorPixel);
  const zoom = useStore((s) => s.zoom);
  const tool = useStore((s) => s.tool);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  return (
    <div
      style={{
        height: 24,
        background: "var(--panel)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 16,
        fontSize: 11,
        color: "var(--text-muted)",
        fontFamily: "ui-monospace, SF Mono, monospace",
        flexShrink: 0,
      }}
    >
      <span>{tool}</span>
      <span>·</span>
      <span>
        {cursor ? `${cursor.x}, ${cursor.y}` : "—"}
      </span>
      <span>·</span>
      <span>{Math.round(zoom * 100) / 100}x</span>
      <span style={{ marginLeft: "auto" }}>
        {width} × {height} px
      </span>
    </div>
  );
}
