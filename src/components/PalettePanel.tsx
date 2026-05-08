"use client";
import { useState } from "react";
import { Plus, Lock, LockOpen, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { generateRamp } from "@/lib/color";

export default function PalettePanel() {
  const palette = useStore((s) => s.palette);
  const activeColor = useStore((s) => s.activeColor);
  const paletteLocked = useStore((s) => s.paletteLocked);
  const setActiveColor = useStore((s) => s.setActiveColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const removePaletteColor = useStore((s) => s.removePaletteColor);
  const togglePaletteLocked = useStore((s) => s.togglePaletteLocked);

  const [editing, setEditing] = useState(false);
  const ramp = generateRamp(activeColor, 5);

  return (
    <div
      style={{
        background: "var(--panel)",
        borderTop: "1px solid var(--border)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Color
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          style={{
            color: editing ? "var(--accent)" : "var(--text-muted)",
            fontSize: 11,
          }}
        >
          {editing ? "done" : "edit"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: activeColor,
            border: "1px solid var(--border-2)",
          }}
        />
        <input
          type="color"
          value={activeColor}
          onChange={(e) => setActiveColor(e.target.value.toUpperCase())}
          style={{ width: 32, height: 36, background: "transparent", border: "none", padding: 0 }}
        />
        <input
          type="text"
          value={activeColor}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) setActiveColor(v.toUpperCase());
            else setActiveColor(v);
          }}
          style={{
            flex: 1,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
            padding: "6px 8px",
            fontFamily: "ui-monospace, SF Mono, monospace",
            fontSize: 11,
          }}
        />
      </div>

      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>RAMP PREVIEW</div>
        <div style={{ display: "flex", gap: 2 }}>
          {ramp.map((c, i) => (
            <button
              key={i}
              onClick={() => addPaletteColor(c)}
              title={`Add ${c}`}
              style={{
                flex: 1,
                height: 24,
                background: c,
                border: "1px solid var(--border-2)",
                borderRadius: 3,
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Palette
        </div>
        <button
          onClick={togglePaletteLocked}
          title={paletteLocked ? "Unlock palette" : "Lock palette"}
          style={{
            color: paletteLocked ? "var(--accent)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
          }}
        >
          {paletteLocked ? <Lock size={11} /> : <LockOpen size={11} />}
          {paletteLocked ? "locked" : "open"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 3,
        }}
      >
        {palette.map((c) => {
          const active = c.toUpperCase() === activeColor.toUpperCase();
          return (
            <div key={c} style={{ position: "relative" }}>
              <button
                onClick={() => setActiveColor(c)}
                title={c}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  background: c,
                  borderRadius: 3,
                  border: active ? "2px solid var(--accent)" : "1px solid var(--border-2)",
                  boxShadow: active ? "0 0 0 1px var(--bg)" : "none",
                }}
              />
              {editing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePaletteColor(c);
                  }}
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 14,
                    height: 14,
                    background: "var(--bg)",
                    border: "1px solid var(--border-2)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-dim)",
                  }}
                >
                  <Trash2 size={8} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => addPaletteColor(activeColor)}
          title="Add active color to palette"
          style={{
            aspectRatio: "1 / 1",
            background: "var(--panel-2)",
            borderRadius: 3,
            border: "1px dashed var(--border-2)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
