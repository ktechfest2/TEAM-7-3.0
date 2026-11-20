/**
 * Photos are handled as plain bytes from the moment they are taken. Safari/WebKit Blobs are
 * unreliable here: blobs from canvas.toBlob can fail to read back ("NotReadableError: The
 * I/O read operation failed"), fail to store in IndexedDB, or upload as 0-byte files. A data
 * URL keeps the JPEG in memory, so it can always be hashed, stored, previewed and uploaded.
 */
export type JpegPhoto = { bytes: ArrayBuffer; dataUrl: string };

/** Draws a frame (e.g. the live camera video) at most maxSide pixels on its longest side and encodes a JPEG. */
export function frameToJpeg(source: CanvasImageSource, width: number, height: number, maxSide = 1600, quality = 0.8): JpegPhoto {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const bytes = dataUrlToBytes(dataUrl);
  if (!dataUrl.startsWith("data:image/jpeg") || bytes.byteLength < 100) throw new Error("could not encode the photo as JPEG");
  return { bytes, dataUrl };
}

export function dataUrlToBytes(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function bytesToDataUrl(bytes: ArrayBuffer, type = "image/jpeg"): string {
  const u = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

/**
 * A photo from the phone's camera app (file input). Read with FileReader into a data URL
 * (not a Blob URL, which Safari mishandles), decoded, then scaled and encoded like a frame.
 * Browsers apply the photo's EXIF rotation when drawing it, and re-encoding drops the EXIF.
 */
export async function fileToJpeg(file: File): Promise<JpegPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return frameToJpeg(img, img.naturalWidth, img.naturalHeight);
}
