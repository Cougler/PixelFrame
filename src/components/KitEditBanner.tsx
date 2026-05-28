"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { promptDialog } from "@/lib/dialog";

const NEW_KIT_VALUE = "__new__";

export default function KitEditBanner() {
  const editing = useStore((s) => s.editingKitSprite);
  const userKits = useStore((s) => s.userKits);
  const save = useStore((s) => s.saveKitSpriteEdit);
  const cancel = useStore((s) => s.cancelKitEdit);
  const createUserKit = useStore((s) => s.createUserKit);
  const [target, setTarget] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the dropdown to the first user kit, or "new" if there are none.
  useEffect(() => {
    if (!editing) return;
    if (target && target !== NEW_KIT_VALUE && userKits.some((k) => k.id === target)) return;
    if (userKits.length > 0) setTarget(userKits[0].id);
    else setTarget(NEW_KIT_VALUE);
  }, [editing, userKits, target]);

  if (!editing) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    let kitId = target;
    if (kitId === NEW_KIT_VALUE) {
      const name = await promptDialog({
        title: "Create a new kit",
        message: "Name the kit you're saving this sprite into.",
        defaultValue: "My Kit",
        placeholder: "Kit name",
        okLabel: "Create & save",
      });
      if (!name || !name.trim()) {
        setSaving(false);
        return;
      }
      const kit = createUserKit(name.trim());
      kitId = kit.id;
      setTarget(kit.id);
    }
    const result = await save(kitId);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "Save failed");
    }
  };

  return (
    <div
      style={{
        background: "var(--accent)",
        color: "#fff",
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ fontWeight: 500 }}>
        Editing:{" "}
        <span style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}>
          {editing.spriteName}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
        <span style={{ opacity: 0.85 }}>Save to</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={saving}
          style={{
            background: "rgba(0,0,0,0.25)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: 11,
          }}
        >
          {userKits.map((k) => (
            <option key={k.id} value={k.id} style={{ background: "#222", color: "#fff" }}>
              {k.name}
            </option>
          ))}
          <option value={NEW_KIT_VALUE} style={{ background: "#222", color: "#fff" }}>
            + New kit…
          </option>
        </select>
      </label>

      {error && (
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4 }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          background: "#fff",
          color: "var(--accent)",
          borderRadius: 4,
          fontWeight: 600,
          fontSize: 11,
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        <Check size={12} /> {saving ? "Saving…" : "Save"}
      </button>

      <button
        onClick={cancel}
        disabled={saving}
        title="Stop editing — canvas changes stay, just won't be saved to a kit"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          background: "transparent",
          color: "#fff",
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.4)",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        <X size={12} /> Stop editing
      </button>
    </div>
  );
}
