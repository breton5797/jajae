/**
 * lib/studio/export/download.ts
 * Client-only DOM helper: triggers a browser file download.
 * Works with Blob objects (glTF / OBJ / STL) and data-URLs (PNG snapshot).
 */

/**
 * Triggers a browser download for a Blob or a data-URL string.
 *
 * - Blob → URL.createObjectURL (revoked after click).
 * - string (data-URL) → used directly as the href.
 *
 * @param data     - A Blob or a data-URL string.
 * @param filename - Suggested file name (e.g. "studio-interior.glb").
 */
export function downloadBlob(data: Blob | string, filename: string): void {
  const isDataUrl = typeof data === "string";
  const href = isDataUrl ? data : URL.createObjectURL(data);

  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;

  // Append → click → remove in the same synchronous block.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke object URL to free memory (data-URLs don't need this).
  if (!isDataUrl) {
    URL.revokeObjectURL(href);
  }
}
