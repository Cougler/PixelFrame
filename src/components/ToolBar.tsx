"use client";
import { useState } from "react";
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Minus,
  Square,
  Circle,
  Grid3x3,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  BoxSelect,
  Wand2,
  Package,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Tool } from "@/lib/types";
import KitsPanel from "./KitsPanel";

const tools: { id: Tool; icon: React.ComponentType<{ size?: number }>; label: string; key: string }[] = [
  { id: "select", icon: BoxSelect, label: "Select", key: "M" },
  { id: "pencil", icon: Pencil, label: "Pencil", key: "B" },
  { id: "eraser", icon: Eraser, label: "Eraser", key: "E" },
  { id: "bucket", icon: PaintBucket, label: "Bucket", key: "G" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", key: "I" },
  {
    id: "colorErase",
    icon: Wand2,
    label: "Color eraser — click a pixel to wipe all matching pixels (Shift = all layers, right-click = active color)",
    key: "W",
  },
  { id: "line", icon: Minus, label: "Line", key: "L" },
  { id: "rectangle", icon: Square, label: "Rectangle", key: "R" },
  { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
];

const BRUSH_SIZES = [1, 2, 3, 4, 6, 8, 12, 16];

export default function ToolBar() {
  const tool = useStore((s) => s.tool);
  const shapeMode = useStore((s) => s.shapeMode);
  const showGrid = useStore((s) => s.showGrid);
  const zoom = useStore((s) => s.zoom);
  const brushSize = useStore((s) => s.brushSize);

  const setTool = useStore((s) => s.setTool);
  const setShapeMode = useStore((s) => s.setShapeMode);
  const setShowGrid = useStore((s) => s.setShowGrid);
  const setZoom = useStore((s) => s.setZoom);
  const setBrushSize = useStore((s) => s.setBrushSize);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const showShape = tool === "rectangle" || tool === "ellipse";
  const showBrush = tool === "pencil" || tool === "eraser";
  const [kitsOpen, setKitsOpen] = useState(false);

  // 8px top padding, then N tool buttons at 40h + 2 gap = 42 each
  const kitsAnchorTop = 8 + tools.length * 42;

  return (
    <div
      className="no-select"
      style={{
        width: 56,
        background: "var(--panel)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: 2,
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {tools.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: active ? "var(--active)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-dim)",
            }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget.style.background = "var(--hover)");
            }}
            onMouseLeave={(e) => {
              if (!active) (e.currentTarget.style.background = "transparent");
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}

      <button
        onClick={() => setKitsOpen((v) => !v)}
        title="Kits — drag pre-made sprites onto the canvas"
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: kitsOpen ? "var(--active)" : "transparent",
          color: kitsOpen ? "var(--accent)" : "var(--text-dim)",
        }}
        onMouseEnter={(e) => {
          if (!kitsOpen) e.currentTarget.style.background = "var(--hover)";
        }}
        onMouseLeave={(e) => {
          if (!kitsOpen) e.currentTarget.style.background = "transparent";
        }}
      >
        <Package size={18} />
      </button>

      <div style={{ flex: 1 }} />

      {showShape && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
          <button
            onClick={() => setShapeMode("stroke")}
            title="Stroke"
            style={{
              width: 40,
              height: 28,
              borderRadius: 4,
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: shapeMode === "stroke" ? "var(--accent)" : "var(--text-muted)",
              background: shapeMode === "stroke" ? "var(--active)" : "transparent",
            }}
          >
            stroke
          </button>
          <button
            onClick={() => setShapeMode("fill")}
            title="Fill"
            style={{
              width: 40,
              height: 28,
              borderRadius: 4,
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: shapeMode === "fill" ? "var(--accent)" : "var(--text-muted)",
              background: shapeMode === "fill" ? "var(--active)" : "transparent",
            }}
          >
            fill
          </button>
        </div>
      )}

      <button
        onClick={() => setShowGrid(!showGrid)}
        title="Toggle grid"
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: showGrid ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        <Grid3x3 size={16} />
      </button>

      <button
        onClick={undo}
        title="Undo (⌘Z)"
        style={{
          width: 40,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
        }}
      >
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        title="Redo (⌘⇧Z)"
        style={{
          width: 40,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
        }}
      >
        <Redo2 size={16} />
      </button>

      <button
        onClick={() => setZoom(zoom * 1.25)}
        title="Zoom in"
        style={{
          width: 40,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
        }}
      >
        <ZoomIn size={16} />
      </button>
      <button
        onClick={() => setZoom(zoom / 1.25)}
        title="Zoom out"
        style={{
          width: 40,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
        }}
      >
        <ZoomOut size={16} />
      </button>

      {showBrush && <BrushPopover toolIndex={tools.findIndex((t) => t.id === tool)} />}
      {kitsOpen && <KitsPanel anchorTop={kitsAnchorTop} />}
    </div>
  );
}

function BrushPopover({ toolIndex }: { toolIndex: number }) {
  const brushSize = useStore((s) => s.brushSize);
  const setBrushSize = useStore((s) => s.setBrushSize);

  // Toolbar layout: 8px top padding, each tool button is 40px tall with 2px gap → 42px each.
  const buttonTop = 8 + toolIndex * 42;
  // Anchor the popover's top to the top of the active tool button so it extends
  // downward instead of centering (which can run off the top of the screen).
  const top = buttonTop;
  // Arrow points at the active tool's vertical center. The button is 40px tall,
  // so the center is 20px below the popover's top.
  const arrowTop = 20 - 6;
  const cellHeight = 30;

  return (
    <div
      style={{
        position: "absolute",
        left: 56 + 6, // toolbar width + small gap
        top,
        background: "var(--panel)",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
        padding: 6,
        boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        zIndex: 20,
      }}
    >
      {/* arrow pointing back at the active tool */}
      <div
        style={{
          position: "absolute",
          left: -6,
          top: arrowTop,
          width: 0,
          height: 0,
          borderTop: "6px solid transparent",
          borderBottom: "6px solid transparent",
          borderRight: "6px solid var(--border-2)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -5,
          top: arrowTop,
          width: 0,
          height: 0,
          borderTop: "6px solid transparent",
          borderBottom: "6px solid transparent",
          borderRight: "6px solid var(--panel)",
        }}
      />

      {BRUSH_SIZES.map((n) => {
        const active = brushSize === n;
        // visual square: scale brush size to a fitting display size, capped to 22px
        const visual = Math.min(22, 2 + n * 1.4);
        return (
          <button
            key={n}
            onClick={() => setBrushSize(n)}
            title={`${n}px`}
            style={{
              width: 36,
              height: cellHeight,
              borderRadius: 4,
              background: active ? "var(--active)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: active ? "1px solid var(--accent)" : "1px solid transparent",
              transition: "background 80ms",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "var(--hover)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              style={{
                width: visual,
                height: visual,
                background: active ? "var(--accent)" : "var(--text-dim)",
                borderRadius: 1,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
