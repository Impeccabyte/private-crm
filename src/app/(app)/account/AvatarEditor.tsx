"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Camera, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Avatar } from "@/components/ui";
import { confirmDialog } from "@/components/confirm";
import type { ActionState } from "@/components/forms";
import { removeAvatar, uploadAvatar } from "./actions";

const PX = 256; // output size; keep in step with AVATAR_PX in src/lib/avatars.ts
const VIEW = 280; // crop frame size on screen, in CSS pixels
const MAX_ZOOM = 4;
const MAX_PICK_BYTES = 15 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type View = { zoom: number; x: number; y: number }; // x/y: image top-left inside the frame, CSS px

/** Keeps the image covering the whole frame, so the crop never has empty edges. */
function clamp(v: View, w: number, h: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const s = (VIEW / Math.min(w, h)) * zoom;
  return { zoom, x: Math.min(0, Math.max(VIEW - w * s, v.x)), y: Math.min(0, Math.max(VIEW - h * s, v.y)) };
}

/** Draws the chosen square of the image at PX×PX (one scale for both axes, so nothing is stretched) and re-encodes it, which drops EXIF data such as location. */
async function exportCrop(bmp: ImageBitmap, v: View): Promise<Blob> {
  const s = (VIEW / Math.min(bmp.width, bmp.height)) * v.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, -v.x / s, -v.y / s, VIEW / s, VIEW / s, 0, 0, PX, PX);
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
  // Browsers that can't write WebP silently give PNG; use JPEG there instead to keep it small.
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

function CropDialog({ bmp, onCancel, onSave }: { bmp: ImageBitmap; onCancel: () => void; onSave: (v: View) => void }) {
  const { width: w, height: h } = bmp;
  const [v, setV] = useState<View>(() => { const s = VIEW / Math.min(w, h); return { zoom: 1, x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 }; });
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);

  // Zoom around a point in the frame (the center unless the wheel says otherwise), so what's under it stays put.
  const zoomTo = useCallback((zoom: number, cx = VIEW / 2, cy = VIEW / 2) => setV((cur) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom)), k = z / cur.zoom;
    return clamp({ zoom: z, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k }, w, h);
  }), [w, h]);

  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(VIEW * dpr);
    const s = (VIEW / Math.min(w, h)) * v.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(bmp, v.x, v.y, w * s, h * s);
  }, [bmp, v, w, h]);

  // Wheel zoom needs a non-passive listener so the page doesn't scroll underneath.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      setV((cur) => {
        const z = Math.min(MAX_ZOOM, Math.max(1, cur.zoom * Math.exp(-e.deltaY * 0.0015))), k = z / cur.zoom;
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        return clamp({ zoom: z, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k }, w, h);
      });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [w, h]);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    slider.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Tab") {
        const els = Array.from(dialog.current?.querySelectorAll<HTMLElement>("canvas, input, button:not([disabled])") ?? []);
        const i = els.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); returnTo?.focus?.(); };
  }, [onCancel]);

  const nudge = (dx: number, dy: number) => setV((cur) => clamp({ ...cur, x: cur.x + dx, y: cur.y + dy }, w, h));

  return (
    <div className="dlg-wrap">
      <div className="scrim" onClick={onCancel} aria-hidden="true" />
      <div ref={dialog} className="dlg crop-dlg" role="dialog" aria-modal="true" aria-labelledby="crop-t" aria-describedby="crop-m">
        <h2 id="crop-t">Crop your photo</h2>
        <p id="crop-m">Drag to move the photo, and zoom to fit your face in the circle.</p>
        <div className="crop-frame" style={{ width: VIEW, height: VIEW }}>
          <canvas ref={canvas} tabIndex={0} aria-label="Photo crop area. Use the arrow keys to move the photo, plus and minus to zoom." style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: v.x, y: v.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (d && d.id === e.pointerId) setV((cur) => clamp({ ...cur, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, w, h)); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 20 : 4;
              const k: Record<string, () => void> = {
                ArrowLeft: () => nudge(step, 0), ArrowRight: () => nudge(-step, 0), ArrowUp: () => nudge(0, step), ArrowDown: () => nudge(0, -step),
                "+": () => zoomTo(v.zoom * 1.1), "=": () => zoomTo(v.zoom * 1.1), "-": () => zoomTo(v.zoom / 1.1),
              };
              if (k[e.key]) { e.preventDefault(); k[e.key]!(); }
            }} />
          <span className="crop-ring" aria-hidden="true" />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost sm icon" onClick={() => zoomTo(v.zoom / 1.25)} disabled={v.zoom <= 1} aria-label="Zoom out"><ZoomOut size={14} aria-hidden="true" /></button>
          <input ref={slider} type="range" className="crop-zoom" min={1} max={MAX_ZOOM} step={0.01} value={v.zoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom" />
          <button type="button" className="btn ghost sm icon" onClick={() => zoomTo(v.zoom * 1.25)} disabled={v.zoom >= MAX_ZOOM} aria-label="Zoom in"><ZoomIn size={14} aria-hidden="true" /></button>
        </div>
        <div className="acts">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn pri" type="button" onClick={() => onSave(v)}>Save photo</button>
        </div>
      </div>
    </div>
  );
}

export function AvatarEditor({ name, initials, color, avatarKey }: { name: string; initials: string; color: string; avatarKey: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);
  const [crop, setCrop] = useState<ImageBitmap | null>(null);

  const run = (fn: () => Promise<ActionState>) => start(async () => {
    try { setRes(await fn()); } catch { setRes({ error: "Something went wrong. Try again." }); }
  });

  const onPick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return setRes({ error: "Use a JPG, PNG or WebP photo." });
    if (file.size > MAX_PICK_BYTES) return setRes({ error: "That photo is over 15 MB. Choose a smaller one." });
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bmp.width < 2 || bmp.height < 2) { bmp.close(); return setRes({ error: "That photo is too small." }); }
      setRes(null);
      setCrop(bmp);
    } catch { setRes({ error: "Couldn’t read that photo. Try a different file." }); }
  };

  const closeCrop = useCallback(() => setCrop((b) => { b?.close(); return null; }), []);

  const save = (v: View) => {
    const bmp = crop;
    if (!bmp) return;
    run(async () => {
      let blob: Blob;
      try { blob = await exportCrop(bmp, v); } catch { return { error: "Couldn’t crop that photo. Try a different file." }; }
      finally { closeCrop(); }
      const f = new FormData();
      f.set("photo", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
      return uploadAvatar(f);
    });
  };

  return (
    <div className="row w" style={{ gap: 16, alignItems: "center" }}>
      <Avatar initials={initials} color={color} avatarKey={avatarKey} size="xxl" title={name} />
      <div className="stack" style={{ gap: 8 }}>
        <div className="row w" style={{ gap: 8 }}>
          <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={(e) => onPick(e.target.files?.[0])} aria-label="Choose a profile photo" />
          <button type="button" className="btn" disabled={pending} onClick={() => input.current?.click()}>
            <Camera size={14} aria-hidden="true" />{pending ? "Saving…" : avatarKey ? "Change photo" : "Upload photo"}
          </button>
          {avatarKey && (
            <button type="button" className="btn danger" disabled={pending} onClick={async () => {
              if (await confirmDialog("Remove your photo? Your initials will show instead.", { title: "Remove photo", confirmLabel: "Remove" })) run(removeAvatar);
            }}><Trash2 size={14} aria-hidden="true" />Remove</button>
          )}
        </div>
        <span className="hint">JPG, PNG or WebP. You can crop it to a square before saving.</span>
        {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
        {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
      </div>
      {crop && <CropDialog bmp={crop} onCancel={closeCrop} onSave={save} />}
    </div>
  );
}
