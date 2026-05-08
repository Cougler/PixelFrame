"use client";
import { Check, X, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";

export default function FloatingActions() {
  const floating = useStore((s) => s.floating);
  const commit = useStore((s) => s.commitFloating);
  const cancel = useStore((s) => s.cancelFloating);
  const discard = useStore((s) => s.discardFloating);

  if (!floating) return null;

  const t = floating.transform;
  const sw = floating.w * t.scaleX;
  const sh = floating.h * t.scaleY;
  const hasMoved =
    t.cx !== floating.origX + floating.w / 2 ||
    t.cy !== floating.origY + floating.h / 2 ||
    t.scaleX !== 1 ||
    t.scaleY !== 1 ||
    t.rotation !== 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        background: "var(--panel)",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: 10,
        fontSize: 11,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SF Mono, monospace",
          color: "var(--text-muted)",
          paddingRight: 4,
          borderRight: "1px solid var(--border)",
          marginRight: 2,
        }}
      >
        {Math.round(Math.abs(sw))}×{Math.round(Math.abs(sh))}
        {t.rotation !== 0 ? `  ${Math.round((t.rotation * 180) / Math.PI)}°` : ""}
      </div>

      <button
        onClick={commit}
        title="Apply (Enter)"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: 4,
          fontWeight: 500,
          fontSize: 11,
        }}
      >
        <Check size={12} /> Apply
        <span style={{ opacity: 0.7, marginLeft: 4, fontWeight: 400 }}>↵</span>
      </button>

      <button
        onClick={cancel}
        title="Cancel (Esc) — restores original pixels"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: "transparent",
          color: "var(--text-dim)",
          borderRadius: 4,
          fontSize: 11,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <X size={12} /> Cancel
        <span style={{ opacity: 0.6, marginLeft: 4, fontFamily: "ui-monospace, SF Mono, monospace" }}>
          esc
        </span>
      </button>

      <button
        onClick={discard}
        title="Discard (Delete) — leaves the cut, no bake"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: "transparent",
          color: "var(--text-muted)",
          borderRadius: 4,
          fontSize: 11,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Trash2 size={11} />
      </button>

      {hasMoved && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4, borderLeft: "1px solid var(--border)" }}>
          modified
        </div>
      )}
    </div>
  );
}
