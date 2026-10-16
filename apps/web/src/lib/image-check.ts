import { checkImage, IMAGE_RULES, type ImageKind } from '@fb/shared-types';

/**
 * Check a chosen picture in the browser, before a single byte is uploaded.
 *
 * The server checks the same rules and is the one that counts — this exists for the shopkeeper's
 * sake. He adds stock from a phone on a village connection, and a 5 MB photo that is going to be
 * refused costs him a minute of uploading before it is refused. Reading the dimensions locally
 * costs milliseconds and no data at all.
 *
 * Returns the Hindi reason to show him, or null when the file is fine.
 */
export async function checkImageFile(kind: ImageKind, file: File): Promise<string | null> {
  const rule = IMAGE_RULES[kind];
  // Cheapest test first — no decoding needed to know a 12 MB file is out.
  if (file.size > rule.maxBytes) {
    return checkImage(kind, { bytes: file.size, width: rule.minWidth, height: rule.minHeight })?.hi ?? null;
  }
  const size = await readSize(file);
  // If the browser cannot decode it, say nothing and let the server decide. A picture the server
  // would have accepted must not be blocked by an old phone's missing codec.
  if (!size) return null;
  return checkImage(kind, { bytes: file.size, width: size.width, height: size.height })?.hi ?? null;
}

/** The picture's real pixel size, read from an object URL that is always revoked afterwards. */
function readSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (v: { width: number; height: number } | null): void => {
      URL.revokeObjectURL(url); // an object URL that is never revoked keeps the whole file in memory
      resolve(v);
    };
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done(null);
    img.src = url;
  });
}
