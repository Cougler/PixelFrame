"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { hexToRgba } from "@/lib/color";
import {
  bresenhamLine,
  eraseByColor,
  fillEllipse,
  fillRect,
  floodFill,
  getLayerBuffer,
  getPixel,
  paintBrush,
  setPixel,
  strokeEllipse,
  strokeRect,
  cloneBuffer,
} from "@/lib/pixels";
import type { FloatingSelection, HandleId, RGBA, Tool, Transform } from "@/lib/types";
import { rgbaToHex } from "@/lib/color";
import {
  applyMoveDrag,
  applyRotateDrag,
  applyScaleDrag,
  getCorners,
  getHandlePositionsScreen,
  hitTestHandle,
  screenToWorld,
} from "@/lib/floating";
import { decodeSprite, findSprite, SPRITE_DRAG_TYPE } from "@/lib/kits";
import FloatingActions from "./FloatingActions";

type Pixel = { x: number; y: number };

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const layerRevs = useRef<Map<string, number>>(new Map());

  // stroke state
  const strokeBefore = useRef<Uint8ClampedArray | null>(null);
  const strokeStart = useRef<Pixel | null>(null);
  const lastPixel = useRef<Pixel | null>(null);
  const isDrawing = useRef(false);
  const strokeIsErase = useRef(false);
  // selection state
  const isSelecting = useRef(false);
  const selectStart = useRef<Pixel | null>(null);
  const selectEnd = useRef<Pixel | null>(null);
  const antsOffsetRef = useRef(0);

  // floating offscreen canvas (rebuilt when floating identity changes)
  const floatingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const floatingPixelsKey = useRef<Uint8ClampedArray | null>(null);

  // container size, kept up to date by the ResizeObserver. Used to compute
  // the centered pan offset on every render.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Latest render, accessed via ref from the ResizeObserver so its callback
  // doesn't paint through a stale closure.
  const renderRef = useRef<() => void>(() => {});

  // transform interaction state
  const transformActive = useRef<{
    handle: HandleId;
    startTransform: Transform;
    startWorld: { x: number; y: number };
  } | null>(null);

  const {
    width,
    height,
    layers,
    activeLayerId,
    activeColor,
    tool,
    shapeMode,
    zoom,
    showGrid,
    paletteLocked,
    palette,
    selection,
    floating,
    brushSize,
  } = useStore();

  // Pan is always derived: the artwork is centered in the container.
  const panX = Math.floor((containerSize.w - width * zoom) / 2);
  const panY = Math.floor((containerSize.h - height * zoom) / 2);

  // Resize display canvases to container, and track container size for
  // centered-pan computation.
  useEffect(() => {
    const container = containerRef.current;
    const main = canvasRef.current;
    const overlay = overlayRef.current;
    if (!container || !main || !overlay) return;
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      [main, overlay].forEach((c) => {
        c.width = Math.floor(r.width * dpr);
        c.height = Math.floor(r.height * dpr);
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
      });
      setContainerSize({ w: r.width, h: r.height });
      requestAnimationFrame(() => renderRef.current());
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Keep layer offscreens in sync with rev
  const syncLayerCanvas = useCallback(
    (layerId: string) => {
      const buf = getLayerBuffer(layerId);
      if (!buf) return;
      let c = layerCanvases.current.get(layerId);
      if (!c || c.width !== width || c.height !== height) {
        c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        layerCanvases.current.set(layerId, c);
      }
      const ctx = c.getContext("2d")!;
      const copy = new Uint8ClampedArray(buf);
      ctx.putImageData(new ImageData(copy, width, height), 0, 0);
    },
    [width, height],
  );

  const ensureFloatingCanvas = useCallback((f: FloatingSelection): HTMLCanvasElement => {
    let c = floatingCanvasRef.current;
    if (!c || floatingPixelsKey.current !== f.pixels) {
      c = document.createElement("canvas");
      c.width = f.w;
      c.height = f.h;
      const ctx = c.getContext("2d")!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels), f.w, f.h), 0, 0);
      floatingCanvasRef.current = c;
      floatingPixelsKey.current = f.pixels;
    }
    return c;
  }, []);

  const render = useCallback(() => {
    const main = canvasRef.current;
    if (!main) return;
    const ctx = main.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, main.width, main.height);
    ctx.imageSmoothingEnabled = false;

    ctx.scale(dpr, dpr);

    // checker bg behind artwork
    drawChecker(ctx, panX, panY, width * zoom, height * zoom);

    // draw layers
    for (const layer of layers) {
      if (!layer.visible) continue;
      const cached = layerCanvases.current.get(layer.id);
      const cachedRev = layerRevs.current.get(layer.id);
      if (!cached || cachedRev !== layer.rev) {
        syncLayerCanvas(layer.id);
        layerRevs.current.set(layer.id, layer.rev);
      }
      const c = layerCanvases.current.get(layer.id);
      if (!c) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(c, panX, panY, width * zoom, height * zoom);
    }
    ctx.globalAlpha = 1;

    // floating preview (above all layers)
    if (floating) {
      const fc = ensureFloatingCanvas(floating);
      const t = floating.transform;
      const screenW = floating.w * t.scaleX * zoom;
      const screenH = floating.h * t.scaleY * zoom;
      ctx.save();
      ctx.translate(panX + t.cx * zoom, panY + t.cy * zoom);
      ctx.rotate(t.rotation);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fc, -screenW / 2, -screenH / 2, screenW, screenH);
      ctx.restore();
    }

    // grid
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        const px = panX + x * zoom + 0.5;
        ctx.moveTo(px, panY);
        ctx.lineTo(px, panY + height * zoom);
      }
      for (let y = 0; y <= height; y++) {
        const py = panY + y * zoom + 0.5;
        ctx.moveTo(panX, py);
        ctx.lineTo(panX + width * zoom, py);
      }
      ctx.stroke();
    }

    // bounding rect
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      panX - 0.5,
      panY - 0.5,
      width * zoom + 1,
      height * zoom + 1,
    );
  }, [layers, width, height, zoom, panX, panY, showGrid, syncLayerCanvas, floating, ensureFloatingCanvas]);

  useEffect(() => {
    renderRef.current = render;
    requestAnimationFrame(render);
  }, [render]);

  // Convert pointer event to artwork pixel coordinates
  const eventToPixel = useCallback(
    (e: { clientX: number; clientY: number }): Pixel => {
      const main = canvasRef.current;
      if (!main) return { x: 0, y: 0 };
      const rect = main.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const x = Math.floor((cssX - panX) / zoom);
      const y = Math.floor((cssY - panY) / zoom);
      return { x, y };
    },
    [panX, panY, zoom],
  );

  const inBounds = useCallback(
    (p: Pixel) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height,
    [width, height],
  );

  const drawOverlay = useCallback(
    (preview?: { tool: Tool; from: Pixel; to: Pixel; erase?: boolean } | null) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = false;

      // cursor highlight
      const { cursorPixel, tool: currentTool, brushSize: currentBrush } = useStore.getState();
      if (cursorPixel && !preview) {
        const useBrush = currentTool === "pencil" || currentTool === "eraser";
        const sz = useBrush ? currentBrush : 1;
        const half = (sz - 1) / 2;
        const offMin = -Math.floor(half);
        const bx = cursorPixel.x + offMin;
        const by = cursorPixel.y + offMin;
        // cursorPixel may be out of bounds when the pointer is near or past an
        // edge — clip the brush box to the canvas grid so only the cells that
        // actually overlap the canvas are highlighted.
        ctx.save();
        ctx.beginPath();
        ctx.rect(panX, panY, width * zoom, height * zoom);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(panX + bx * zoom, panY + by * zoom, zoom * sz, zoom * sz);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.strokeRect(
          panX + bx * zoom + 0.5,
          panY + by * zoom + 0.5,
          zoom * sz - 1,
          zoom * sz - 1,
        );
        ctx.restore();
      }

      if (preview) {
        const rgba = hexToRgba(activeColor);
        const fillStyle = preview.erase
          ? "rgba(255, 80, 80, 0.55)"
          : `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`;
        const drawPreviewPixel = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= width || y >= height) return;
          ctx.fillStyle = fillStyle;
          ctx.fillRect(panX + x * zoom, panY + y * zoom, zoom, zoom);
        };
        if (preview.tool === "line") {
          bresenhamLine(preview.from.x, preview.from.y, preview.to.x, preview.to.y, drawPreviewPixel);
        } else if (preview.tool === "rectangle") {
          if (shapeMode === "fill") {
            fillRect(preview.from.x, preview.from.y, preview.to.x, preview.to.y, drawPreviewPixel);
          } else {
            strokeRect(preview.from.x, preview.from.y, preview.to.x, preview.to.y, drawPreviewPixel);
          }
        } else if (preview.tool === "ellipse") {
          if (shapeMode === "fill") {
            fillEllipse(preview.from.x, preview.from.y, preview.to.x, preview.to.y, drawPreviewPixel);
          } else {
            strokeEllipse(preview.from.x, preview.from.y, preview.to.x, preview.to.y, drawPreviewPixel);
          }
        }
      }

      // marquee: pending drag-selection
      if (isSelecting.current && selectStart.current && selectEnd.current) {
        const a = selectStart.current;
        const b = selectEnd.current;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x) + 1;
        const h = Math.abs(a.y - b.y) + 1;
        drawMarquee(ctx, panX + x * zoom, panY + y * zoom, w * zoom, h * zoom, antsOffsetRef.current);
      } else if (selection) {
        drawMarquee(
          ctx,
          panX + selection.x * zoom,
          panY + selection.y * zoom,
          selection.w * zoom,
          selection.h * zoom,
          antsOffsetRef.current,
        );
      }

      // floating marquee + handles (rotated bounding box)
      if (floating) {
        drawFloatingFrame(ctx, floating, panX, panY, zoom, antsOffsetRef.current);
      }
    },
    [panX, panY, zoom, activeColor, shapeMode, width, height, selection, floating],
  );

  // re-draw overlay on cursor change or pan/zoom
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // marching ants animation when a selection or floating exists
  useEffect(() => {
    if (!selection && !floating) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      antsOffsetRef.current = (antsOffsetRef.current + dt * 0.04) % 8;
      drawOverlay();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selection, floating, drawOverlay]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);

    // accept left (0) and right (2) clicks for drawing
    if (e.button !== 0 && e.button !== 2) return;
    const erase = e.button === 2;
    strokeIsErase.current = erase;

    const p = eventToPixel(e);

    // floating: when select tool active, hit-test handles + bounds.
    // when any other tool active, any click commits the floating and falls through.
    if (floating && e.button === 0) {
      const main = canvasRef.current;
      if (main) {
        const rect = main.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        if (tool === "select") {
          const handle = hitTestHandle(floating, panX, panY, zoom, sx, sy);
          if (handle) {
            const startWorld = screenToWorld(sx, sy, panX, panY, zoom);
            transformActive.current = {
              handle,
              startTransform: { ...floating.transform },
              startWorld,
            };
            return;
          }
          // click outside floating bounds → commit, then fall through to start new marquee
          useStore.getState().commitFloating();
        } else {
          // non-select tool: commit floating, then proceed with that tool's normal action
          useStore.getState().commitFloating();
        }
      }
    }

    if (tool === "select") {
      // any left-click starts a new selection drag; right-click clears
      if (e.button === 2) {
        useStore.getState().setSelection(null);
        drawOverlay();
        return;
      }
      const cx = Math.max(0, Math.min(width - 1, p.x));
      const cy = Math.max(0, Math.min(height - 1, p.y));
      isSelecting.current = true;
      selectStart.current = { x: cx, y: cy };
      selectEnd.current = { x: cx, y: cy };
      // clear current committed selection while dragging
      if (useStore.getState().selection) useStore.getState().setSelection(null);
      drawOverlay();
      return;
    }

    const layer = layers.find((l) => l.id === activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;

    const buf = getLayerBuffer(activeLayerId);
    if (!buf) return;

    if (tool === "eyedropper") {
      // right-click does nothing special on eyedropper
      // pick from composite (top-down through visible layers)
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (!l.visible) continue;
        const lb = getLayerBuffer(l.id);
        if (!lb) continue;
        const px = getPixel(lb, width, height, p.x, p.y);
        if (px && px[3] > 0) {
          useStore.getState().setActiveColor(rgbaToHex(px[0], px[1], px[2]));
          // restore previous tool
          const prev = useStore.getState().prevTool;
          if (prev !== "eyedropper") useStore.getState().setTool(prev);
          return;
        }
      }
      return;
    }

    if (tool === "bucket") {
      if (!inBounds(p)) return;
      const before = cloneBuffer(buf);
      const fill: RGBA = erase ? [0, 0, 0, 0] : hexToRgba(activeColor);
      floodFill(buf, width, height, p.x, p.y, fill);
      useStore.getState().commitStroke(activeLayerId, before);
      return;
    }

    if (tool === "colorErase") {
      // determine the target color
      let target: RGBA | null = null;
      if (erase) {
        // right-click: use active palette color (RGB) at full alpha
        const c = hexToRgba(activeColor);
        target = [c[0], c[1], c[2], 255];
      } else {
        if (!inBounds(p)) return;
        const px = getPixel(buf, width, height, p.x, p.y);
        if (!px || px[3] === 0) return; // ignore transparent
        target = px;
      }
      const shiftAll = e.shiftKey;
      if (shiftAll) {
        // wipe across all visible layers (one history entry per affected layer)
        for (const l of layers) {
          if (!l.visible || l.locked) continue;
          const b = getLayerBuffer(l.id);
          if (!b) continue;
          const before = cloneBuffer(b);
          if (eraseByColor(b, target)) {
            useStore.getState().commitStroke(l.id, before);
          }
        }
      } else {
        const before = cloneBuffer(buf);
        if (eraseByColor(buf, target)) {
          useStore.getState().commitStroke(activeLayerId, before);
        }
      }
      return;
    }

    if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
      strokeStart.current = p;
      isDrawing.current = true;
      strokeBefore.current = cloneBuffer(buf);
      drawOverlay({ tool, from: p, to: p, erase });
      return;
    }

    // pencil / eraser
    if (tool === "pencil" || tool === "eraser") {
      isDrawing.current = true;
      strokeBefore.current = cloneBuffer(buf);
      lastPixel.current = p;
      // erase if: tool is eraser, OR right-click on pencil
      const isEraseStroke = tool === "eraser" || erase;
      const rgba: RGBA = isEraseStroke ? [0, 0, 0, 0] : hexToRgba(activeColor);
      if (tool === "pencil" && !erase && paletteLocked && !palette.includes(activeColor.toUpperCase())) {
        // disallow drawing if locked palette and color isn't in it
        return;
      }
      paintBrush(buf, width, height, p.x, p.y, brushSize, rgba);
      useStore.getState().bumpLayerRev(activeLayerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Update cursor to reflect what's under (or being dragged by) the pointer.
    // Written directly to the DOM so hover updates don't trigger React renders.
    const overlayEl = overlayRef.current;
    if (overlayEl) {
      let cursor = "crosshair";
      if (transformActive.current) {
        cursor = HANDLE_CURSOR[transformActive.current.handle];
      } else if (floating && tool === "select") {
        const main = canvasRef.current;
        if (main) {
          const rect = main.getBoundingClientRect();
          const handle = hitTestHandle(
            floating,
            panX,
            panY,
            zoom,
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
          if (handle) cursor = HANDLE_CURSOR[handle];
        }
      }
      overlayEl.style.cursor = cursor;
    }

    // floating transform interaction
    if (transformActive.current) {
      const f = useStore.getState().floating;
      if (!f) {
        transformActive.current = null;
      } else {
        const main = canvasRef.current;
        if (!main) return;
        const rect = main.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const currWorld = screenToWorld(sx, sy, panX, panY, zoom);
        const { handle, startTransform, startWorld } = transformActive.current;

        let newT: Transform;
        if (handle === "move") {
          newT = applyMoveDrag(startTransform, startWorld, currWorld);
        } else if (handle === "rotate") {
          newT = applyRotateDrag(startTransform, startWorld, currWorld, e.shiftKey);
        } else {
          newT = applyScaleDrag(f, startTransform, currWorld, handle, e.shiftKey);
        }
        useStore.getState().updateFloatingTransform(newT);
        // Keep the cursor highlight tracking the pointer during transform drags
        // so the box doesn't appear frozen at the drag-start position.
        const p = eventToPixel(e);
        useStore.getState().setCursorPixel(inBounds(p) ? p : null);
        drawOverlay();
        return;
      }
    }

    const p = eventToPixel(e);
    // Store the unclamped position even when out of bounds so the brush box
    // stays visible near edges (the overlay clips it to the grid; paintBrush
    // bounds-checks per cell). onPointerLeave still clears it on real exit.
    useStore.getState().setCursorPixel(p);

    if (isSelecting.current && selectStart.current) {
      selectEnd.current = {
        x: Math.max(0, Math.min(width - 1, p.x)),
        y: Math.max(0, Math.min(height - 1, p.y)),
      };
      drawOverlay();
      return;
    }

    if (isDrawing.current) {
      if (tool === "pencil" || tool === "eraser") {
        const buf = getLayerBuffer(activeLayerId);
        if (!buf) return;
        const isEraseStroke = tool === "eraser" || strokeIsErase.current;
        const rgba: RGBA = isEraseStroke ? [0, 0, 0, 0] : hexToRgba(activeColor);
        const last = lastPixel.current ?? p;
        bresenhamLine(last.x, last.y, p.x, p.y, (x, y) => {
          paintBrush(buf, width, height, x, y, brushSize, rgba);
        });
        lastPixel.current = p;
        useStore.getState().bumpLayerRev(activeLayerId);
        drawOverlay();
      } else if (
        (tool === "line" || tool === "rectangle" || tool === "ellipse") &&
        strokeStart.current
      ) {
        drawOverlay({ tool, from: strokeStart.current, to: p, erase: strokeIsErase.current });
      }
    } else {
      drawOverlay();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}

    if (transformActive.current) {
      transformActive.current = null;
      return;
    }

    if (isSelecting.current && selectStart.current && selectEnd.current) {
      const a = selectStart.current;
      const b = selectEnd.current;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x) + 1;
      const h = Math.abs(a.y - b.y) + 1;
      isSelecting.current = false;
      selectStart.current = null;
      selectEnd.current = null;
      // auto-lift contents into a floating selection
      if (w > 0 && h > 0) {
        const layerId = useStore.getState().activeLayerId;
        useStore.getState().liftRect({ x, y, w, h }, layerId);
      }
      drawOverlay();
      return;
    }

    if (!isDrawing.current) return;

    const buf = getLayerBuffer(activeLayerId);
    const before = strokeBefore.current;
    if (!buf || !before) {
      isDrawing.current = false;
      return;
    }

    if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
      const start = strokeStart.current;
      const end = eventToPixel(e);
      if (start) {
        const rgba: RGBA = strokeIsErase.current ? [0, 0, 0, 0] : hexToRgba(activeColor);
        const setter = (x: number, y: number) => setPixel(buf, width, height, x, y, rgba);
        if (tool === "line") bresenhamLine(start.x, start.y, end.x, end.y, setter);
        else if (tool === "rectangle") {
          if (shapeMode === "fill") fillRect(start.x, start.y, end.x, end.y, setter);
          else strokeRect(start.x, start.y, end.x, end.y, setter);
        } else if (tool === "ellipse") {
          if (shapeMode === "fill") fillEllipse(start.x, start.y, end.x, end.y, setter);
          else strokeEllipse(start.x, start.y, end.x, end.y, setter);
        }
      }
    }

    useStore.getState().commitStroke(activeLayerId, before);
    isDrawing.current = false;
    strokeIsErase.current = false;
    strokeBefore.current = null;
    strokeStart.current = null;
    lastPixel.current = null;
    drawOverlay();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const newZoom = Math.max(1, Math.min(64, zoom * factor));
    useStore.setState({ zoom: newZoom });
  };

  return (
    <div
      ref={containerRef}
      className="checker no-select"
      style={{ position: "relative", flex: 1, overflow: "hidden" }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(SPRITE_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(SPRITE_DRAG_TYPE);
        if (!raw) return;
        e.preventDefault();
        try {
          const { kitId, spriteId } = JSON.parse(raw) as {
            kitId: string;
            spriteId: string;
          };
          const kits = useStore.getState().kits;
          if (!kits) return;
          const sprite = findSprite(kits, kitId, spriteId);
          if (!sprite) return;
          const pixels = decodeSprite(sprite);
          const p = eventToPixel(e);
          useStore
            .getState()
            .stampSprite(pixels, sprite.w, sprite.h, p.x, p.y);
        } catch (err) {
          console.error("Sprite drop failed:", err);
        }
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, imageRendering: "pixelated" }}
      />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          useStore.getState().setCursorPixel(null);
          drawOverlay();
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "crosshair",
          touchAction: "none",
        }}
      />
      <FloatingActions />
    </div>
  );
}

const HANDLE_CURSOR: Record<HandleId, string> = {
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
  t: "ns-resize",
  b: "ns-resize",
  l: "ew-resize",
  r: "ew-resize",
  rotate: "grab",
  move: "move",
};

function drawFloatingFrame(
  ctx: CanvasRenderingContext2D,
  f: FloatingSelection,
  panX: number,
  panY: number,
  zoom: number,
  antsOffset: number,
) {
  const c = getCorners(f);
  const toScreen = (p: { x: number; y: number }) => ({
    x: panX + p.x * zoom,
    y: panY + p.y * zoom,
  });
  const tl = toScreen(c.tl);
  const tr = toScreen(c.tr);
  const br = toScreen(c.br);
  const bl = toScreen(c.bl);

  ctx.save();
  // outer white stroke
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.stroke();
  // dashed black ants
  ctx.strokeStyle = "rgba(0,0,0,0.95)";
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -antsOffset;
  ctx.stroke();
  ctx.setLineDash([]);

  // handles
  const handles = getHandlePositionsScreen(f, panX, panY, zoom);
  // line from top-edge midpoint to rotation handle
  const tMid = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(tMid.x, tMid.y);
  ctx.lineTo(handles.rotate.x, handles.rotate.y);
  ctx.stroke();

  // box handles
  const drawSquareHandle = (x: number, y: number) => {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeRect(x - 4 + 0.5, y - 4 + 0.5, 7, 7);
  };
  drawSquareHandle(handles.tl.x, handles.tl.y);
  drawSquareHandle(handles.tr.x, handles.tr.y);
  drawSquareHandle(handles.br.x, handles.br.y);
  drawSquareHandle(handles.bl.x, handles.bl.y);
  drawSquareHandle(handles.t.x, handles.t.y);
  drawSquareHandle(handles.r.x, handles.r.y);
  drawSquareHandle(handles.b.x, handles.b.y);
  drawSquareHandle(handles.l.x, handles.l.y);

  // rotation handle (round)
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(handles.rotate.x, handles.rotate.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  offset: number,
) {
  ctx.save();
  ctx.lineWidth = 1;
  // white base
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // black dashed marching ants on top
  ctx.strokeStyle = "rgba(0,0,0,0.95)";
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -offset;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

function drawChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = "#1c1c25";
  ctx.fillRect(x, y, w, h);
  const size = 8;
  ctx.fillStyle = "#252531";
  for (let yy = 0; yy < h; yy += size) {
    for (let xx = 0; xx < w; xx += size) {
      if (((xx / size) ^ (yy / size)) & 1) {
        ctx.fillRect(x + xx, y + yy, Math.min(size, w - xx), Math.min(size, h - yy));
      }
    }
  }
  ctx.restore();
}
