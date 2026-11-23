"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AVATAR_PICK_MAX_BYTES, AVATAR_PICK_TYPES } from "@/lib/avatar";
import { UserAvatar } from "../../_components/UserAvatar";
import { refreshShell } from "../../_components/NavCounts";
import { removeAvatarAction, uploadAvatarAction } from "./actions";

const VIEW = 280; // the square the person drags the photo inside, in pixels
const OUT = 512; // the square sent to the server (it makes the final 400x400 WebP)
const MAX_ZOOM = 4;

type Picked = { url: string; img: HTMLImageElement; w: number; h: number };

// Upload, change or remove a profile picture: pick a JPG/PNG/WebP (up to 2 MB), drag and zoom it inside a circle,
// see the result, then save. The server checks and shrinks it again. `userId` is for an admin changing someone else's.
export function AvatarUploader({
  userId,
  name,
  hasPhoto,
  size = "size-24 text-2xl",
}: {
  userId: string;
  name: string;
  hasPhoto?: boolean;
  size?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const base = picked ? VIEW / Math.min(picked.w, picked.h) : 1; // scale at which the photo just covers the square
  const scale = base * zoom;

  /** Keep the photo covering the whole square. */
  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      if (!picked) return { x: 0, y: 0 };
      const s = (VIEW / Math.min(picked.w, picked.h)) * z;
      const mx = Math.max((picked.w * s - VIEW) / 2, 0);
      const my = Math.max((picked.h * s - VIEW) / 2, 0);
      return { x: Math.min(Math.max(x, -mx), mx), y: Math.min(Math.max(y, -my), my) };
    },
    [picked]
  );

  function reset() {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!(AVATAR_PICK_TYPES as readonly string[]).includes(file.type)) return setError("Use a JPG, PNG or WebP photo.");
    if (file.size > AVATAR_PICK_MAX_BYTES) return setError("That photo is over 2 MB. Please choose a smaller one.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (picked) URL.revokeObjectURL(picked.url);
      setPicked({ url, img, w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That file couldn't be read as a photo.");
    };
    img.src = url;
  }

  /** Draw what is inside the square onto a canvas. */
  const render = useCallback(
    (px: number) => {
      if (!picked) return null;
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const s = (VIEW / Math.min(picked.w, picked.h)) * zoom;
      const sw = VIEW / s;
      ctx.drawImage(picked.img, picked.w / 2 - sw / 2 - pos.x / s, picked.h / 2 - sw / 2 - pos.y / s, sw, sw, 0, 0, px, px);
      return canvas;
    },
    [picked, zoom, pos]
  );

  // The live preview: a small round picture of exactly what will be saved.
  const preview = useMemo(() => render(128)?.toDataURL("image/jpeg", 0.85) ?? "", [render]);

  function save() {
    const canvas = render(OUT);
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError("Couldn't prepare the photo. Please try another one.");
        const form = new FormData();
        form.set("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        form.set("userId", userId);
        startTransition(async () => {
          const res = await uploadAvatarAction(form);
          if (!res.ok) return setError(res.error);
          setVersion(res.version);
          toast.success("Photo updated.");
          refreshShell(); // the rest of the page learns about the new picture
          close();
          router.refresh();
        });
      },
      "image/jpeg",
      0.9
    );
  }

  function remove() {
    startTransition(async () => {
      const res = await removeAvatarAction(userId);
      if (!res.ok) return setError(res.error);
      setVersion(res.version);
      toast.success("Photo removed.");
      refreshShell();
      close();
      router.refresh();
    });
  }

  const nudge = (dx: number, dy: number) => setPos((p) => clamp(p.x + dx, p.y + dy, zoom));

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="group relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label="Change profile photo">
          <UserAvatar userId={userId} name={name} version={version} className={size} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-5" aria-hidden="true" />
          </span>
        </button>
        <Button type="button" variant="outline" size="sm" className="max-md:min-h-11" onClick={() => setOpen(true)}>
          {hasPhoto ? "Change photo" : "Upload photo"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
            <DialogDescription>JPG, PNG or WebP, up to 2 MB. Drag to position and use the slider to zoom.</DialogDescription>
          </DialogHeader>

          <input ref={fileInput} type="file" accept={AVATAR_PICK_TYPES.join(",")} className="sr-only" aria-label="Choose a photo" onChange={(e) => choose(e.target.files?.[0])} />

          {!picked ? (
            <div className="grid justify-items-center gap-3 py-4">
              <UserAvatar userId={userId} name={name} version={version} className="size-28 text-3xl" />
              <Button type="button" onClick={() => fileInput.current?.click()}>
                <Camera aria-hidden="true" /> Choose a photo
              </Button>
            </div>
          ) : (
            <div className="grid justify-items-center gap-4">
              <div
                role="application"
                tabIndex={0}
                aria-label="Photo position. Drag, or use the arrow keys, to move the photo."
                className="relative touch-none overflow-hidden bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                style={{ width: VIEW, height: VIEW, cursor: "grab", maxWidth: "100%" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  setPos(clamp(drag.current.x + e.clientX - drag.current.px, drag.current.y + e.clientY - drag.current.py, zoom));
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={(e) => {
                  const step = 10;
                  if (e.key === "ArrowLeft") nudge(-step, 0);
                  else if (e.key === "ArrowRight") nudge(step, 0);
                  else if (e.key === "ArrowUp") nudge(0, -step);
                  else if (e.key === "ArrowDown") nudge(0, step);
                  else return;
                  e.preventDefault();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
                <img
                  src={picked.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{
                    width: picked.w * scale,
                    height: picked.h * scale,
                    left: VIEW / 2 + pos.x - (picked.w * scale) / 2,
                    top: VIEW / 2 + pos.y - (picked.h * scale) / 2,
                  }}
                />
                {/* The circle: everything outside it is dimmed, because only the inside is kept. */}
                <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(255,255,255,0.7)] ring-2 ring-foreground" />
              </div>

              <label className="flex w-full max-w-[280px] items-center gap-3 text-sm">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => {
                    const z = Number(e.target.value);
                    setZoom(z);
                    setPos((p) => clamp(p.x, p.y, z));
                  }}
                  className="min-w-0 flex-1 accent-foreground"
                />
              </label>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview of the cropped result */}
                {preview && <img src={preview} alt="Preview of your new photo" className="size-16 rounded-full border object-cover" />}
                Preview
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {hasPhoto && !picked ? (
              <Button type="button" variant="outline" disabled={pending} onClick={remove} className="text-destructive">
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Remove photo
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {picked && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
                  Different photo
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Cancel
              </Button>
              {picked && (
                <Button type="button" onClick={save} disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Save photo
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
