/**
 * Avatar image prep — browser-only helpers (canvas + FileReader). Kept in
 * lib/ so the wizard, Settings, and the store downscale photos identically.
 */

/** Downscale to ≤512px and re-encode as JPEG. Null when the image can't be read. */
export async function prepareAvatar(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 512;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    );
  } catch {
    return null;
  }
}

/** Blob → data URL (demo-mode photo storage). Null when FileReader fails. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
