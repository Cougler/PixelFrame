"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";

const PRESETS = [16, 24, 32, 48];

export default function CanvasSizePicker({ onPicked }: { onPicked?: () => void }) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const resize = useStore((s) => s.resizeCanvas);
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState(width);
  const [ch, setCh] = useState(height);

  const pick = (n: number) => {
    resize(n, n);
    onPicked?.();
  };

  const applyCustom = () => {
    resize(cw, ch);
    setCustom(false);
    onPicked?.();
  };

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    background: active ? "var(--active)" : "var(--panel-2)",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border-2)",
    color: active ? "var(--accent)" : "var(--text-dim)",
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {PRESETS.map((n) => {
        const active = width === n && height === n;
        return (
          <button key={n} onClick={() => pick(n)} style={btn(active)}>
            {n}×{n}
          </button>
        );
      })}
      {!custom ? (
        <button
          onClick={() => {
            setCw(width);
            setCh(height);
            setCustom(true);
          }}
          style={btn(false)}
        >
          Custom
        </button>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="number"
            value={cw}
            onChange={(e) => setCw(Number(e.target.value))}
            min={1}
            max={512}
            style={{
              width: 50,
              padding: "3px 4px",
              fontSize: 11,
              background: "var(--panel-2)",
              border: "1px solid var(--border-2)",
              color: "var(--text)",
              borderRadius: 3,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>×</span>
          <input
            type="number"
            value={ch}
            onChange={(e) => setCh(Number(e.target.value))}
            min={1}
            max={512}
            style={{
              width: 50,
              padding: "3px 4px",
              fontSize: 11,
              background: "var(--panel-2)",
              border: "1px solid var(--border-2)",
              color: "var(--text)",
              borderRadius: 3,
            }}
          />
          <button
            onClick={applyCustom}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          <button
            onClick={() => setCustom(false)}
            title="Cancel"
            style={{
              padding: "3px 6px",
              fontSize: 11,
              color: "var(--text-dim)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
