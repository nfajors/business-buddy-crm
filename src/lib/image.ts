// Client-side image resize + JPEG compression for profile avatars.
// Stores small base64 strings in profiles.avatar_url; no external storage.
// See issue #25.

const MAX_DIM = 256;
const JPEG_QUALITY = 0.85;
// Soft ceiling for the base64-encoded result. Above this, refuse the upload
// rather than slowly poisoning the profiles row.
export const MAX_AVATAR_BYTES = 200 * 1024;

export async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pick an image file (JPG, PNG, WebP, etc.).");
  }
  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIM);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser does not support canvas 2D context.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > MAX_AVATAR_BYTES) {
    throw new Error(
      `Photo is too large after compression (${Math.round(dataUrl.length / 1024)} KB). ` +
        `Try a smaller image.`,
    );
  }
  return dataUrl;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Safari fallback
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
