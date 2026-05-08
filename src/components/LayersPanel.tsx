"use client";
import { useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@/lib/store";

export default function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const activeLayerId = useStore((s) => s.activeLayerId);

  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const addLayer = useStore((s) => s.addLayer);
  const deleteLayer = useStore((s) => s.deleteLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const toggleVisible = useStore((s) => s.toggleLayerVisible);
  const toggleLocked = useStore((s) => s.toggleLayerLocked);
  const renameLayer = useStore((s) => s.renameLayer);
  const setOpacity = useStore((s) => s.setLayerOpacity);
  const reorderLayer = useStore((s) => s.reorderLayer);

  const [editingId, setEditingId] = useState<string | null>(null);

  // render top to bottom (reverse order)
  const ordered = [...layers].reverse();
  const active = layers.find((l) => l.id === activeLayerId);

  return (
    <div
      style={{
        background: "var(--panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Layers
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={addLayer}
            title="New layer"
            style={{ width: 22, height: 22, color: "var(--text-dim)", borderRadius: 4 }}
          >
            <Plus size={14} />
          </button>
          {active && (
            <button
              onClick={() => duplicateLayer(active.id)}
              title="Duplicate"
              style={{ width: 22, height: 22, color: "var(--text-dim)", borderRadius: 4 }}
            >
              <Copy size={12} />
            </button>
          )}
          {active && layers.length > 1 && (
            <button
              onClick={() => deleteLayer(active.id)}
              title="Delete"
              style={{ width: 22, height: 22, color: "var(--text-dim)", borderRadius: 4 }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {active && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>OPACITY</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(active.opacity * 100)}
            onChange={(e) => setOpacity(active.id, Number(e.target.value) / 100)}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 10, color: "var(--text-dim)", width: 28, textAlign: "right" }}>
            {Math.round(active.opacity * 100)}
          </span>
        </div>
      )}

      <div className="scroll-thin" style={{ flex: 1, overflowY: "auto" }}>
        {ordered.map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: isActive ? "var(--active)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget.style.background = "var(--hover)");
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget.style.background = "transparent");
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisible(layer.id);
                }}
                style={{ color: layer.visible ? "var(--text)" : "var(--text-muted)" }}
                title={layer.visible ? "Hide" : "Show"}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLocked(layer.id);
                }}
                style={{ color: layer.locked ? "var(--accent)" : "var(--text-muted)" }}
                title={layer.locked ? "Locked" : "Unlocked"}
              >
                {layer.locked ? <Lock size={11} /> : <LockOpen size={11} />}
              </button>

              {editingId === layer.id ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  onBlur={(e) => {
                    renameLayer(layer.id, e.target.value || layer.name);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  style={{
                    flex: 1,
                    background: "var(--panel-2)",
                    border: "1px solid var(--border-2)",
                    borderRadius: 3,
                    color: "var(--text)",
                    padding: "2px 4px",
                    fontSize: 11,
                  }}
                />
              ) : (
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(layer.id);
                  }}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: layer.visible ? "var(--text)" : "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {layer.name}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    reorderLayer(layer.id, 1);
                  }}
                  style={{ color: "var(--text-muted)", padding: 0, height: 12 }}
                  title="Move up"
                >
                  <ChevronUp size={10} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    reorderLayer(layer.id, -1);
                  }}
                  style={{ color: "var(--text-muted)", padding: 0, height: 12 }}
                  title="Move down"
                >
                  <ChevronDown size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
