"use client";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  renderSpriteThumbnail,
  SPRITE_DRAG_TYPE,
  type Kit,
  type KitSprite,
} from "@/lib/kits";
import { promptDialog } from "@/lib/dialog";

type Props = { anchorTop: number };

export default function KitsPanel({ anchorTop }: Props) {
  const kits = useStore((s) => s.kits);
  const userKits = useStore((s) => s.userKits);
  const loadKits = useStore((s) => s.loadKits);
  const loadUserKits = useStore((s) => s.loadUserKits);
  const createUserKit = useStore((s) => s.createUserKit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kits) loadKits().catch((e) => setError(String(e)));
    loadUserKits().catch((e) => setError(String(e)));
  }, [kits, loadKits, loadUserKits]);

  const handleNewKit = async () => {
    const name = await promptDialog({
      title: "Create a new kit",
      message: "Give your kit a name. You can rename it later.",
      defaultValue: "My Kit",
      placeholder: "Kit name",
      okLabel: "Create",
    });
    if (!name || !name.trim()) return;
    createUserKit(name.trim());
  };

  const arrowTop = 14;

  return (
    <div
      style={{
        position: "absolute",
        left: 56 + 6,
        top: anchorTop,
        width: 260,
        maxHeight: 540,
        overflowY: "auto",
        background: "var(--panel)",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
        padding: 10,
        boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
        zIndex: 20,
      }}
    >
      <div style={{ position: "absolute", left: -6, top: arrowTop, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: "6px solid var(--border-2)" }} />
      <div style={{ position: "absolute", left: -5, top: arrowTop, width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderRight: "6px solid var(--panel)" }} />

      {error && (
        <div style={{ color: "tomato", fontSize: 11 }}>Failed to load kits: {error}</div>
      )}
      {!kits && !error && (
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading kits…</div>
      )}

      {/* Stock kits */}
      {kits && kits.length > 0 && (
        <SectionHeader>Stock</SectionHeader>
      )}
      {kits?.map((kit) => (
        <KitBlock key={kit.id} kit={kit} />
      ))}

      {/* User kits */}
      <SectionHeader>Your Kits</SectionHeader>
      {userKits.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6, padding: "4px 0" }}>
          No kits yet. Edit a stock sprite, save it here.
        </div>
      )}
      {userKits.map((kit) => (
        <KitBlock key={kit.id} kit={kit} />
      ))}

      <button
        onClick={handleNewKit}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          width: "100%",
          padding: "6px 8px",
          marginTop: 6,
          background: "transparent",
          border: "1px dashed var(--border-2)",
          borderRadius: 4,
          color: "var(--text-dim)",
          fontSize: 11,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Plus size={12} /> New kit
      </button>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        color: "var(--text-dim)",
        marginTop: 8,
        marginBottom: 4,
        paddingBottom: 2,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function KitBlock({ kit }: { kit: Kit }) {
  const entries = Object.entries(kit.categories);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
        {kit.name}
      </div>
      {entries.map(([cat, sprites]) => (
        <div key={cat} style={{ marginBottom: 6 }}>
          {entries.length > 1 && (
            <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2 }}>
              {cat}
            </div>
          )}
          {sprites.length === 0 ? (
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>empty</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {sprites.map((sprite) => (
                <SpriteThumb key={sprite.id} kitId={kit.id} sprite={sprite} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SpriteThumb({ kitId, sprite }: { kitId: string; sprite: KitSprite }) {
  const dataUrl = useMemo(() => renderSpriteThumbnail(sprite), [sprite]);
  const [hover, setHover] = useState(false);
  const openKitSpriteForEdit = useStore((s) => s.openKitSpriteForEdit);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    openKitSpriteForEdit(kitId, sprite.id);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SPRITE_DRAG_TYPE, JSON.stringify({ kitId, spriteId: sprite.id }));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${sprite.name} — drag onto canvas, or click pencil to edit`}
      style={{
        position: "relative",
        background: hover ? "var(--active)" : "var(--hover)",
        border: hover ? "1px solid var(--accent)" : "1px solid transparent",
        borderRadius: 4,
        padding: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        cursor: "grab",
        transition: "background 80ms",
      }}
    >
      {/* TODO(auth): hide for non-admin once user roles exist (only on stock kits) */}
      {hover && (
        <button
          onClick={handleEdit}
          onMouseDown={(e) => e.stopPropagation()}
          title={`Edit ${sprite.name}`}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 20,
            height: 20,
            borderRadius: 4,
            background: "var(--panel)",
            border: "1px solid var(--border-2)",
            color: "var(--text-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          <Pencil size={11} />
        </button>
      )}
      <img
        src={dataUrl}
        alt={sprite.name}
        draggable={false}
        style={{ width: 96, height: 96, imageRendering: "pixelated" }}
      />
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          textAlign: "center",
          lineHeight: 1.1,
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sprite.name}
      </div>
    </div>
  );
}
