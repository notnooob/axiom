// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A Data & Statistics page's background image (doc ▸ Insert ▸ Image, then
 * Actions ▸ Select Image to move or size it), as the handheld shows a photo
 * behind a plot: data measured off a picture, say.
 *
 * Positions are fractions of the page, so the image keeps its place at any
 * screen size. The picture is shrunk before it's kept, since it lives in the
 * document (and the Scratchpad's few megabytes).
 */
import type { DataStatsPage } from "../state/document";

export type PageImage = NonNullable<DataStatsPage["image"]>;

/** The longest side an inserted picture is kept at, in pixels. */
const MAX_SIDE = 640;

/** A picture file as a data URL no bigger than MAX_SIDE on its long side, and its height over its width. */
export async function shrinkImage(file: File): Promise<{ src: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("that file isn't a picture the browser can read"));
      el.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("the browser couldn't draw it");
    g.drawImage(img, 0, 0, w, h);
    // PNG keeps transparency and sharp diagrams; a photo is far smaller as JPEG.
    const png = c.toDataURL("image/png");
    const jpeg = c.toDataURL("image/jpeg", 0.85);
    return { src: png.length <= jpeg.length * 1.5 ? png : jpeg, aspect: h / w };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A new picture's place: centred, half the page across (less when it's tall). */
export function placeImage(aspect: number, pageAspect: number): Omit<PageImage, "src"> {
  // pageAspect: the page's height over its width; keep the picture within 80% of the height.
  const w = Math.min(0.5, (0.8 * pageAspect) / aspect);
  const h = (w * aspect) / pageAspect;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, aspect };
}

const STEP = 0.02;
const GROW = 1.1;

/** Select Image's keys: the arrows move it, + and − size it, Del takes it off the page, Esc or Enter let it go. */
export function imageKey(p: DataStatsPage, key: { k: string; c?: string }): DataStatsPage | null {
  const im = p.image;
  if (!im) return { ...p, imageSel: undefined };
  const move = (dx: number, dy: number) => ({ ...p, image: { ...im, x: clamp(im.x + dx, -im.w + 0.05, 0.95), y: clamp(im.y + dy, -0.9, 0.95) } });
  // Sized from its top left corner, which stays put.
  const size = (k: number) => ({ ...p, image: { ...im, w: clamp(im.w * k, 0.05, 3) } });
  switch (key.k) {
    case "left":
      return move(-STEP, 0);
    case "right":
      return move(STEP, 0);
    case "up":
      return move(0, -STEP);
    case "down":
      return move(0, STEP);
    case "char":
      if (key.c === "+" || key.c === "=") return size(GROW);
      if (key.c === "-" || key.c === "−") return size(1 / GROW);
      return null;
    case "delete":
    case "backspace":
      return { ...p, image: undefined, imageSel: undefined };
    case "esc":
    case "enter":
      return { ...p, imageSel: undefined };
    default:
      return null;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
