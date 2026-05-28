"use client";
import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import CanvasSizePicker from "./CanvasSizePicker";
import { promptDialog } from "@/lib/dialog";

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const switchTab = useStore((s) => s.switchTab);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);
  const renameTab = useStore((s) => s.renameTab);
  const [sizePopoverTabId, setSizePopoverTabId] = useState<string | null>(null);

  useEffect(() => {
    if (!sizePopoverTabId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-size-popover]")) return;
      setSizePopoverTabId(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [sizePopoverTabId]);

  const onSizeClick = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabId !== activeTabId) switchTab(tabId);
    setSizePopoverTabId(tabId === sizePopoverTabId ? null : tabId);
  };

  const onRename = async (tabId: string, current: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = await promptDialog({
      title: "Rename tab",
      message: "Give this tab a new name.",
      defaultValue: current,
      placeholder: "Tab name",
      okLabel: "Rename",
    });
    if (name && name.trim()) renameTab(tabId, name.trim());
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        background: "var(--panel-2)",
        borderBottom: "1px solid var(--border)",
        height: 32,
        padding: "0 4px",
        gap: 2,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const w = isActive ? width : tab.doc.width;
        const h = isActive ? height : tab.doc.height;
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              height: 28,
              background: isActive ? "var(--panel)" : "transparent",
              borderRight: "1px solid var(--border)",
              borderTop: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontSize: 11,
              color: isActive ? "var(--text)" : "var(--text-dim)",
              userSelect: "none",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <span
              onDoubleClick={(e) => onRename(tab.id, tab.name, e)}
              title="Double-click to rename"
              style={{ whiteSpace: "nowrap" }}
            >
              {tab.name}
            </span>
            <button
              onClick={(e) => onSizeClick(tab.id, e)}
              title="Click to change size"
              data-size-popover
              style={{
                fontSize: 10,
                padding: "1px 5px",
                background: "var(--hover)",
                color: "var(--text-muted)",
                borderRadius: 3,
                cursor: "pointer",
                fontFamily: "ui-monospace, SF Mono, monospace",
              }}
            >
              {w}×{h}
            </button>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                title="Close tab"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <X size={11} />
              </button>
            )}
            {sizePopoverTabId === tab.id && isActive && (
              <div
                data-size-popover
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--panel)",
                  border: "1px solid var(--border-2)",
                  borderRadius: 6,
                  padding: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  zIndex: 50,
                  whiteSpace: "nowrap",
                }}
              >
                <CanvasSizePicker onPicked={() => setSizePopoverTabId(null)} />
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={() => newTab()}
        title="New tab"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          marginLeft: 4,
          height: 26,
          background: "transparent",
          color: "var(--text-dim)",
          fontSize: 11,
          borderRadius: 4,
          cursor: "pointer",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Plus size={12} /> New
      </button>
    </div>
  );
}
