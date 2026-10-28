/** Thrown when the browser can't re-encode a photo. The original is never
    sent: it would carry the phone's EXIF, including GPS. */
export class PhotoUnsupportedError extends Error {
  constructor() {
    super("This photo format isn't supported here. Take a screenshot of it, or use a JPEG.");
    this.name = "PhotoUnsupportedError";
  }
}

/** The photo, turned upright and shrunk in the browser. Re-encoding drops
    EXIF too, so the phone's GPS never leaves it. If the browser can't
    re-encode (HEIC in Chrome/Firefox, old browsers) this throws rather than
    send the original with its location data. */
export async function shrink(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    if (!blob) throw new PhotoUnsupportedError();
    return blob;
  } catch {
    throw new PhotoUnsupportedError();
  } finally {
    bitmap?.close();
  }
}

/** How often to re-read the photo list: every 5 s while a photo is being read,
    otherwise not at all. Sending a photo refetches the list, which restarts it. */
export function pollInterval(reads: { status: string }[] | undefined): number | false {
  return reads?.some((r) => r.status === "reading") ? 5_000 : false;
}
