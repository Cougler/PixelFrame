"use client";
import { useEffect, useRef, useState } from "react";
import { useDialogStore, type DialogRequest } from "@/lib/dialog";

export default function DialogHost() {
  const dialogs = useDialogStore((s) => s.dialogs);
  // Show one at a time (queue); newest on top
  if (dialogs.length === 0) return null;
  const d = dialogs[dialogs.length - 1];
  return <DialogModal key={d.id} d={d} />;
}

function DialogModal({ d }: { d: DialogRequest }) {
  const dismiss = useDialogStore((s) => s.dismiss);
  const [value, setValue] = useState(d.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (d.type === "prompt") {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [d.type]);

  const onCancel = () => {
    if (d.type === "alert") return; // alert has no cancel
    dismiss(d.id, d.type === "prompt" ? null : false);
  };
  const onConfirm = () => {
    if (d.type === "alert") dismiss(d.id, undefined);
    else if (d.type === "confirm") dismiss(d.id, true);
    else dismiss(d.id, value);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (d.type === "alert") onConfirm();
        else onCancel();
      } else if (e.key === "Enter") {
        // For prompts, Enter is handled by the input's keyDown; ignore here.
        if (d.type === "prompt") return;
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, d.type, value]);

  const okLabel =
    d.okLabel ?? (d.type === "alert" ? "OK" : d.type === "confirm" ? "Confirm" : "OK");
  const cancelLabel = d.cancelLabel ?? "Cancel";

  return (
    <div
      onClick={d.type === "alert" ? onConfirm : onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border-2)",
          borderRadius: 8,
          padding: 20,
          width: 360,
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          fontFamily: "inherit",
        }}
      >
        {d.title && (
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            {d.title}
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: d.title ? "var(--text-dim)" : "var(--text)",
            marginBottom: d.type === "prompt" ? 10 : 16,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {d.message}
        </div>
        {d.type === "prompt" && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={d.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirm();
              }
            }}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              fontSize: 13,
              marginBottom: 16,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {d.type !== "alert" && (
            <button
              onClick={onCancel}
              style={{
                padding: "6px 12px",
                color: "var(--text-dim)",
                fontSize: 12,
                background: "transparent",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 14px",
              background: d.destructive ? "#c0392b" : "var(--accent)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
