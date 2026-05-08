"use client";
import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { exportPng } from "@/lib/export";
import { importPngFile, readImageDimensions } from "@/lib/import";
import { Download, FilePlus, FileBox, Upload } from "lucide-react";

const SIZE_PRESETS = [16, 32, 48, 64, 96, 128, 256];

export default function TopBar() {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const layers = useStore((s) => s.layers);
  const newDocument = useStore((s) => s.newDocument);

  const [showNew, setShowNew] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [w, setW] = useState(32);
  const [h, setH] = useState(32);
  const [scale, setScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // import dialog state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDims, setPendingDims] = useState<{ w: number; h: number } | null>(null);
  const [targetW, setTargetW] = useState(32);
  const [targetH, setTargetH] = useState(32);
  const [lockAspect, setLockAspect] = useState(true);
  const [smoothing, setSmoothing] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dims = await readImageDimensions(file);
      setPendingFile(file);
      setPendingDims({ w: dims.width, h: dims.height });
      // default target = current canvas dims, scaled to fit image's aspect
      const aspect = dims.width / dims.height;
      const baseW = width;
      const baseH = Math.max(1, Math.round(width / aspect));
      setTargetW(baseW);
      setTargetH(baseH);
      // smarter default: if image is large and pixel-art like, smoothing off is right.
      // if image is photo-ish (much larger than target), smoothing helps. Default off for safety.
      setSmoothing(false);
      setLockAspect(true);
    } catch (err) {
      alert(`Could not read image: ${(err as Error).message}`);
    }
  };

  const cancelImport = () => {
    setPendingFile(null);
    setPendingDims(null);
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    try {
      const { capped, width: iw, height: ih } = await importPngFile(pendingFile, {
        targetWidth: targetW,
        targetHeight: targetH,
        smoothing,
      });
      if (capped) {
        alert(`Image was larger than 512px and was scaled to ${iw}×${ih}.`);
      }
      setPendingFile(null);
      setPendingDims(null);
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const updateTargetW = (n: number) => {
    setTargetW(n);
    if (lockAspect && pendingDims) {
      const aspect = pendingDims.w / pendingDims.h;
      setTargetH(Math.max(1, Math.round(n / aspect)));
    }
  };

  const updateTargetH = (n: number) => {
    setTargetH(n);
    if (lockAspect && pendingDims) {
      const aspect = pendingDims.w / pendingDims.h;
      setTargetW(Math.max(1, Math.round(n * aspect)));
    }
  };

  return (
    <div
      style={{
        height: 44,
        background: "var(--panel)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 12,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FileBox size={16} color="var(--accent)" />
        <span style={{ fontWeight: 600, fontSize: 13 }}>PixelFrame</span>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          {width}×{height}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setShowNew(true)}
        style={{
          padding: "6px 10px",
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <FilePlus size={14} /> New
      </button>

      <button
        onClick={handleImportClick}
        style={{
          padding: "6px 10px",
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Upload size={14} /> Import
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <button
        onClick={() => setShowExport(true)}
        style={{
          padding: "6px 10px",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <Download size={14} /> Export PNG
      </button>

      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New canvas</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <NumberInput label="Width" value={w} onChange={setW} />
            <NumberInput label="Height" value={h} onChange={setH} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {[16, 32, 48, 64, 96, 128].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setW(n);
                  setH(n);
                }}
                style={{
                  padding: "4px 8px",
                  background: "var(--panel-2)",
                  border: "1px solid var(--border-2)",
                  borderRadius: 3,
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                {n}×{n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowNew(false)}
              style={{ padding: "6px 12px", color: "var(--text-dim)", fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!confirm("Replace current document with a new blank canvas?")) {
                  setShowNew(false);
                  return;
                }
                newDocument(Math.max(1, Math.min(512, w)), Math.max(1, Math.min(512, h)));
                setShowNew(false);
              }}
              style={{
                padding: "6px 12px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Create
            </button>
          </div>
        </Modal>
      )}

      {showExport && (
        <Modal onClose={() => setShowExport(false)}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Export PNG</div>
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-dim)" }}>
            Output: {width * scale}×{height * scale}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 4, 8].map((n) => (
              <button
                key={n}
                onClick={() => setScale(n)}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: scale === n ? "var(--active)" : "var(--panel-2)",
                  border: scale === n ? "1px solid var(--accent)" : "1px solid var(--border-2)",
                  borderRadius: 4,
                  color: scale === n ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12,
                }}
              >
                {n}x
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowExport(false)}
              style={{ padding: "6px 12px", color: "var(--text-dim)", fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                exportPng(layers, width, height, scale);
                setShowExport(false);
              }}
              style={{
                padding: "6px 12px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Download
            </button>
          </div>
        </Modal>
      )}

      {pendingFile && pendingDims && (
        <Modal onClose={cancelImport}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Import image</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
            Source: {pendingDims.w}×{pendingDims.h}px ·{" "}
            <button
              onClick={() => {
                setTargetW(pendingDims.w);
                setTargetH(pendingDims.h);
              }}
              style={{
                color: "var(--accent-2)",
                fontSize: 11,
                textDecoration: "underline",
                background: "transparent",
              }}
            >
              use source size
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>TARGET GRID</div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <NumberInput label="W" value={targetW} onChange={updateTargetW} />
              <button
                onClick={() => setLockAspect((v) => !v)}
                title={lockAspect ? "Aspect locked" : "Aspect free"}
                style={{
                  height: 28,
                  marginBottom: 0,
                  padding: "0 8px",
                  fontSize: 10,
                  borderRadius: 4,
                  background: lockAspect ? "var(--active)" : "var(--panel-2)",
                  border: "1px solid var(--border-2)",
                  color: lockAspect ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {lockAspect ? "🔒" : "🔓"}
              </button>
              <NumberInput label="H" value={targetH} onChange={updateTargetH} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>PRESETS</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {SIZE_PRESETS.map((n) => {
                const aspect = pendingDims.w / pendingDims.h;
                const presetH = Math.max(1, Math.round(n / aspect));
                return (
                  <button
                    key={n}
                    onClick={() => {
                      setTargetW(n);
                      setTargetH(lockAspect ? presetH : n);
                    }}
                    style={{
                      padding: "4px 8px",
                      background: "var(--panel-2)",
                      border: "1px solid var(--border-2)",
                      borderRadius: 3,
                      fontSize: 11,
                      color: "var(--text-dim)",
                    }}
                  >
                    {n}
                    {lockAspect ? `×${presetH}` : `×${n}`}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>SAMPLING</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setSmoothing(false)}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  background: !smoothing ? "var(--active)" : "var(--panel-2)",
                  border: !smoothing ? "1px solid var(--accent)" : "1px solid var(--border-2)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: !smoothing ? "var(--accent)" : "var(--text-dim)",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 500 }}>Sharp</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  nearest neighbor
                </div>
              </button>
              <button
                onClick={() => setSmoothing(true)}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  background: smoothing ? "var(--active)" : "var(--panel-2)",
                  border: smoothing ? "1px solid var(--accent)" : "1px solid var(--border-2)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: smoothing ? "var(--accent)" : "var(--text-dim)",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 500 }}>Smooth</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  blends pixels
                </div>
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
              {smoothing
                ? "Best for converting photos or illustrations to pixel art."
                : "Best when the source is already pixel art."}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={cancelImport}
              disabled={importing}
              style={{ padding: "6px 12px", color: "var(--text-dim)", fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              onClick={confirmImport}
              disabled={importing}
              style={{
                padding: "6px 12px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <input
        type="number"
        value={value}
        min={1}
        max={512}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text)",
          padding: "6px 8px",
          fontSize: 12,
        }}
      />
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border-2)",
          borderRadius: 8,
          padding: 20,
          width: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
