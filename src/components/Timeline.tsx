"use client";
import { useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Repeat,
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Ghost,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { compositeToCanvas } from "@/lib/export";
import { promptDialog } from "@/lib/dialog";
import type { Layer } from "@/lib/types";

const COL_W = 60;
const THUMB = 42;
const LABEL_W = 84;
const ROW_H = 22;

// One frame's composited thumbnail. Only redraws when its own content (or a
// structural/visibility change) actually alters the picture — a frame's cels
// only mutate while it's the active frame, so non-active thumbs stay cheap.
function FrameThumb({
  frameId,
  layers,
  width,
  height,
  sig,
}: {
  frameId: string;
  layers: Layer[];
  width: number;
  height: number;
  sig: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.min(THUMB / width, THUMB / height);
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const full = compositeToCanvas(layers, width, height, frameId);
    ctx.drawImage(full, 0, 0, dw, dh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, dw, dh]);
  return (
    <canvas
      ref={ref}
      width={dw}
      height={dh}
      style={{
        width: dw,
        height: dh,
        imageRendering: "pixelated",
        background:
          "repeating-conic-gradient(#3a3a3a 0% 25%, #2c2c2c 0% 50%) 50% / 8px 8px",
        borderRadius: 2,
      }}
    />
  );
}

export default function Timeline() {
  const frames = useStore((s) => s.frames);
  const layers = useStore((s) => s.layers);
  const activeFrameId = useStore((s) => s.activeFrameId);
  const activeLayerId = useStore((s) => s.activeLayerId);
  const previewFrameId = useStore((s) => s.previewFrameId);
  const playing = useStore((s) => s.playing);
  const loop = useStore((s) => s.loop);
  const onion = useStore((s) => s.onion);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const addFrame = useStore((s) => s.addFrame);
  const duplicateFrame = useStore((s) => s.duplicateFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const reorderFrame = useStore((s) => s.reorderFrame);
  const setActiveFrame = useStore((s) => s.setActiveFrame);
  const setFrameDuration = useStore((s) => s.setFrameDuration);
  const setActiveLayer = useStore((s) => s.setActiveLayer);
  const toggleLoop = useStore((s) => s.toggleLoop);
  const toggleOnion = useStore((s) => s.toggleOnion);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const stop = useStore((s) => s.stop);

  // The frame the playhead is on (preview while playing, else the edit frame).
  const playheadId = playing && previewFrameId ? previewFrameId : activeFrameId;

  // Thumbnail signatures: a frame redraws on structure/visibility changes, plus
  // — only for the active frame — on per-stroke layer revs (content edits).
  const structSig =
    `${width}x${height}|` +
    layers.map((l) => `${l.id}:${l.visible ? 1 : 0}:${l.opacity}`).join(",");
  const revSig = layers.map((l) => l.rev).join(",");

  const editDuration = async (frameId: string, current: number) => {
    const v = await promptDialog({
      title: "Frame duration",
      message: "How long should this frame show, in milliseconds?",
      defaultValue: String(current),
      placeholder: "100",
      okLabel: "Set",
    });
    if (v == null) return;
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) setFrameDuration(frameId, n);
  };

  // top-most layer first (matches the layers panel reading order)
  const rows = [...layers].reverse();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
        maxHeight: 220,
      }}
    >
      {/* playback controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderBottom: "1px solid var(--border)",
          height: 30,
        }}
      >
        <IconButton title={playing ? "Pause" : "Play"} onClick={() => (playing ? pause() : play())}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </IconButton>
        <IconButton title="Stop" onClick={() => stop()}>
          <Square size={13} />
        </IconButton>
        <IconButton title={loop ? "Looping" : "Not looping"} onClick={() => toggleLoop()} active={loop}>
          <Repeat size={13} />
        </IconButton>
        <IconButton
          title={onion.enabled ? "Onion skin on" : "Onion skin off"}
          onClick={() => toggleOnion()}
          active={onion.enabled}
        >
          <Ghost size={14} />
        </IconButton>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
          frame {Math.max(0, frames.findIndex((f) => f.id === playheadId)) + 1}/{frames.length}
        </span>
        <div style={{ flex: 1 }} />
        <IconButton title="Add frame" onClick={() => addFrame()}>
          <Plus size={14} />
        </IconButton>
      </div>

      {/* grid */}
      <div style={{ overflow: "auto" }}>
        {/* frame header row */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div
            style={{
              width: LABEL_W,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel-2)",
            }}
          />
          {frames.map((frame, i) => {
            const isActive = frame.id === activeFrameId;
            const isPlayhead = frame.id === playheadId;
            const sig = `${structSig}|${frame.id}|${isActive ? revSig : ""}`;
            return (
              <div
                key={frame.id}
                onClick={() => setActiveFrame(frame.id)}
                title="Click to select frame"
                className="pf-frame-col"
                style={{
                  width: COL_W,
                  flexShrink: 0,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  cursor: "pointer",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  borderTop: isPlayhead ? "2px solid var(--accent)" : "2px solid transparent",
                  background: isActive ? "var(--active)" : "transparent",
                  position: "relative",
                }}
              >
                <FrameThumb
                  frameId={frame.id}
                  layers={layers}
                  width={width}
                  height={height}
                  sig={sig}
                />
                <span style={{ fontSize: 10, color: isActive ? "var(--accent)" : "var(--text-dim)" }}>
                  {i + 1}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    editDuration(frame.id, frame.duration);
                  }}
                  title="Click to set duration"
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {frame.duration}ms
                </span>
                {/* hover controls */}
                <div className="pf-frame-actions" style={{ position: "absolute", top: 1, right: 1, display: "flex", gap: 1 }}>
                  <MiniButton title="Move left" disabled={i === 0} onClick={(e) => { e.stopPropagation(); reorderFrame(frame.id, -1); }}>
                    <ChevronLeft size={10} />
                  </MiniButton>
                  <MiniButton title="Move right" disabled={i === frames.length - 1} onClick={(e) => { e.stopPropagation(); reorderFrame(frame.id, 1); }}>
                    <ChevronRight size={10} />
                  </MiniButton>
                  <MiniButton title="Duplicate frame" onClick={(e) => { e.stopPropagation(); duplicateFrame(frame.id); }}>
                    <Copy size={10} />
                  </MiniButton>
                  <MiniButton title="Delete frame" disabled={frames.length <= 1} onClick={(e) => { e.stopPropagation(); deleteFrame(frame.id); }}>
                    <Trash2 size={10} />
                  </MiniButton>
                </div>
              </div>
            );
          })}
        </div>

        {/* one row per layer; cells are the (layer, frame) cels */}
        {rows.map((layer) => (
          <div key={layer.id} style={{ display: "flex", alignItems: "stretch" }}>
            <div
              onClick={() => setActiveLayer(layer.id)}
              title={layer.name}
              style={{
                width: LABEL_W,
                flexShrink: 0,
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                padding: "0 6px",
                fontSize: 11,
                color: layer.id === activeLayerId ? "var(--text)" : "var(--text-dim)",
                background: layer.id === activeLayerId ? "var(--active)" : "var(--panel-2)",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: layer.visible ? 1 : 0.5,
              }}
            >
              {layer.name}
            </div>
            {frames.map((frame) => {
              const isCell = layer.id === activeLayerId && frame.id === activeFrameId;
              const inActiveCol = frame.id === activeFrameId;
              return (
                <div
                  key={frame.id}
                  onClick={() => {
                    setActiveLayer(layer.id);
                    setActiveFrame(frame.id);
                  }}
                  style={{
                    width: COL_W,
                    height: ROW_H,
                    flexShrink: 0,
                    borderRight: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                    background: isCell
                      ? "var(--accent)"
                      : inActiveCol
                        ? "var(--active)"
                        : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: isCell ? "#fff" : "var(--border-2)",
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <style>{`
        .pf-frame-actions { opacity: 0; transition: opacity 0.1s; }
        .pf-frame-col:hover .pf-frame-actions { opacity: 1; }
      `}</style>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 22,
        borderRadius: 4,
        background: active ? "var(--active)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-dim)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? "var(--active)" : "transparent")}
    >
      {children}
    </button>
  );
}

function MiniButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: 2,
        background: "var(--panel)",
        color: disabled ? "var(--border-2)" : "var(--text-muted)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
