"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { loadDoc, loadTabs, saveTabs } from "@/lib/persist";
import Canvas from "./Canvas";
import ToolBar from "./ToolBar";
import TopBar from "./TopBar";
import LayersPanel from "./LayersPanel";
import PalettePanel from "./PalettePanel";
import StatusBar from "./StatusBar";
import KitEditBanner from "./KitEditBanner";
import TabBar from "./TabBar";
import Timeline from "./Timeline";
import DialogHost from "./DialogHost";
import type { Tool } from "@/lib/types";

const KEY_TO_TOOL: Record<string, Tool> = {
  b: "pencil",
  e: "eraser",
  g: "bucket",
  i: "eyedropper",
  l: "line",
  r: "rectangle",
  o: "ellipse",
  m: "select",
  w: "colorErase",
};

export default function Editor() {
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load: prefer multi-tab snapshot; fall back to legacy single doc.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadTabs();
      if (cancelled) return;
      if (saved) {
        const target = saved.tabs.find((t) => t.id === saved.activeTabId) ?? saved.tabs[0];
        useStore.getState().loadDocument(target.doc);
        useStore.setState({
          tabs: saved.tabs,
          activeTabId: target.id,
          tabCounter: Math.max(saved.tabs.length, 1),
          zoom: target.zoom,
        });
      } else {
        // Migrate legacy single-doc save into the first tab.
        const legacy = await loadDoc();
        if (legacy) {
          useStore.getState().loadDocument(legacy);
          const s = useStore.getState();
          const first = s.tabs[0];
          if (first) {
            useStore.setState({
              tabs: [{ ...first, doc: { ...legacy, pixelData: {} }, zoom: s.zoom }],
            });
          }
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave: snapshot every tab (active one fresh from live state) and save.
  useEffect(() => {
    if (!hydrated) return;
    const unsub = useStore.subscribe((state, prev) => {
      const sigA =
        state.layers.map((l) => `${l.id}:${l.rev}`).join("|") +
        `|${state.width}x${state.height}|${state.activeTabId}|${state.tabs.length}|${state.tabs.map((t) => `${t.id}:${t.name}`).join(",")}` +
        `|${state.activeFrameId}|${state.frames.map((f) => `${f.id}:${f.duration}`).join(",")}|${state.loop ? 1 : 0}`;
      const sigB =
        prev.layers.map((l) => `${l.id}:${l.rev}`).join("|") +
        `|${prev.width}x${prev.height}|${prev.activeTabId}|${prev.tabs.length}|${prev.tabs.map((t) => `${t.id}:${t.name}`).join(",")}` +
        `|${prev.activeFrameId}|${prev.frames.map((f) => `${f.id}:${f.duration}`).join(",")}|${prev.loop ? 1 : 0}`;
      const palA = state.palette.join(",");
      const palB = prev.palette.join(",");
      if (sigA !== sigB || palA !== palB || state.activeColor !== prev.activeColor) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const s = useStore.getState();
          const tabs = s.tabs.map((t) =>
            t.id === s.activeTabId
              ? { ...t, doc: s.serialize(), zoom: s.zoom }
              : t,
          );
          saveTabs(tabs, s.activeTabId);
        }, 600);
      }
    });
    return () => unsub();
  }, [hydrated]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useStore.getState().redo();
        return;
      }
      if (meta && e.key.toLowerCase() === "x") {
        if (useStore.getState().selection) {
          e.preventDefault();
          useStore.getState().cutSelection();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "c") {
        if (useStore.getState().selection) {
          e.preventDefault();
          useStore.getState().copySelection();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        if (useStore.getState().clipboard) {
          e.preventDefault();
          useStore.getState().pasteClipboard();
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const s = useStore.getState();
        // commit any current floating, then auto-lift the entire active layer
        if (s.floating) s.commitFloating();
        s.setTool("select");
        s.liftRect({ x: 0, y: 0, w: s.width, h: s.height }, useStore.getState().activeLayerId);
        return;
      }
      if (e.key === "Enter" || e.key === "Return") {
        if (useStore.getState().floating) {
          e.preventDefault();
          useStore.getState().commitFloating();
        }
        return;
      }
      if (e.key === "Escape") {
        const s = useStore.getState();
        if (s.floating) {
          e.preventDefault();
          s.cancelFloating();
        } else if (s.selection) {
          s.setSelection(null);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const s = useStore.getState();
        if (s.floating || s.selection) {
          e.preventDefault();
          s.deleteSelectionContents();
        }
        return;
      }

      const k = e.key.toLowerCase();
      const tool = KEY_TO_TOOL[k];
      if (tool) {
        e.preventDefault();
        useStore.getState().setTool(tool);
      }

      if (e.key === "[") {
        e.preventDefault();
        useStore.getState().setBrushSize(useStore.getState().brushSize - 1);
      }
      if (e.key === "]") {
        e.preventDefault();
        useStore.getState().setBrushSize(useStore.getState().brushSize + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <TabBar />
      <KitEditBanner />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ToolBar />
        <Canvas />
        <div
          style={{
            width: 240,
            background: "var(--panel)",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <LayersPanel />
          <PalettePanel />
        </div>
      </div>
      <Timeline />
      <StatusBar />
      <DialogHost />
    </div>
  );
}
