"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui";
import { confirmDialog } from "@/components/confirm";
import type { ActionState } from "@/components/forms";
import { removeAvatar, uploadAvatar } from "./actions";

const PX = 256; // keep in step with AVATAR_PX in src/lib/avatars.ts
const MAX_PICK_BYTES = 15 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Center-crops to a square, scales to PX×PX and re-encodes (which also drops EXIF data such as location). */
async function toSquare(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, PX, PX);
  bmp.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
  // Browsers that can't write WebP fall back to PNG silently; use JPEG there instead to keep it small.
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

export function AvatarEditor({ name, initials, color, avatarKey }: { name: string; initials: string; color: string; avatarKey: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState | null>(null);

  const run = (fn: () => Promise<ActionState>) => start(async () => {
    try { setRes(await fn()); } catch { setRes({ error: "Something went wrong. Try again." }); }
  });

  const onPick = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return setRes({ error: "Use a JPG, PNG or WebP photo." });
    if (file.size > MAX_PICK_BYTES) return setRes({ error: "That photo is over 15 MB. Choose a smaller one." });
    run(async () => {
      let blob: Blob;
      try { blob = await toSquare(file); } catch { return { error: "Couldn’t read that photo. Try a different file." }; }
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
        <span className="hint">JPG, PNG or WebP. We crop it to a square from the center.</span>
        {res?.ok && <span className="sm tx-green" role="status">{res.ok}</span>}
        {res?.error && <span className="sm tx-red" role="alert">{res.error}</span>}
      </div>
    </div>
  );
}
