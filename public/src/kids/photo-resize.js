// public/src/kids/photo-resize.js
//
// Client-side image resize. Takes a File (from <input type="file">) and
// produces two JPEG Blobs:
//   - main:      max 800x800, quality 0.85
//   - thumbnail: max 200x200, quality 0.80
//
// Done in the browser via <canvas> — no Cloud Function needed.
// Aspect ratio is preserved; the longer side is scaled to the cap.
//
// Public API:
//   resizePhoto(file) -> Promise<{ main: Blob, thumb: Blob }>
//
// Throws on: not an image, decode failure, resize failure.

const MAIN_MAX_DIM   = 800;
const MAIN_QUALITY   = 0.85;
const THUMB_MAX_DIM  = 200;
const THUMB_QUALITY  = 0.80;
const OUTPUT_MIME    = "image/jpeg";

/**
 * Resize a user-supplied image File into main + thumb JPEG Blobs.
 * @param {File} file
 * @returns {Promise<{ main: Blob, thumb: Blob }>}
 */
export async function resizePhoto(file) {
  if (!file || !(file instanceof Blob)) {
    throw new Error("resizePhoto: no file provided");
  }
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("resizePhoto: file is not an image (" + file.type + ")");
  }

  const bitmap = await loadBitmap(file);
  try {
    const main  = await renderToBlob(bitmap, MAIN_MAX_DIM,  MAIN_QUALITY);
    const thumb = await renderToBlob(bitmap, THUMB_MAX_DIM, THUMB_QUALITY);
    return { main, thumb };
  } finally {
    // Free the decoded bitmap promptly. Some browsers hold large buffers.
    if (typeof bitmap.close === "function") {
      try { bitmap.close(); } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode the file into an ImageBitmap (preferred) or HTMLImageElement (fallback).
 * ImageBitmap is faster and handles EXIF orientation natively in modern browsers.
 */
async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation: "from-image" tells the browser to honor EXIF rotation,
      // which matters for photos taken on phones held sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (err) {
      // Some browsers don't support the options arg; retry without it.
      try {
        return await createImageBitmap(file);
      } catch (err2) {
        // Fall through to HTMLImageElement path.
      }
    }
  }
  return await loadHtmlImage(file);
}

/**
 * Fallback decoder using a temporary <img> element + object URL.
 */
function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Wrap the img so the caller has a uniform interface.
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        _img: img,
        close() { /* nothing to free for HTMLImageElement */ }
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("resizePhoto: image decode failed"));
    };
    img.src = url;
  });
}

/**
 * Render the bitmap onto a canvas scaled to maxDim, return a JPEG Blob.
 */
function renderToBlob(bitmap, maxDim, quality) {
  const { width, height } = computeFitDimensions(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("resizePhoto: 2D canvas context unavailable");

  // Source can be either an ImageBitmap or our wrapped HTMLImageElement.
  const source = bitmap._img || bitmap;
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("resizePhoto: canvas.toBlob returned null"));
        else      resolve(blob);
      },
      OUTPUT_MIME,
      quality
    );
  });
}

/**
 * Scale (srcW, srcH) so the longer side fits within maxDim. Preserves aspect.
 * Never upscales — small images stay their original size.
 */
function computeFitDimensions(srcW, srcH, maxDim) {
  if (srcW <= maxDim && srcH <= maxDim) {
    return { width: srcW, height: srcH };
  }
  const ratio = srcW / srcH;
  if (srcW >= srcH) {
    return { width: maxDim, height: Math.round(maxDim / ratio) };
  } else {
    return { width: Math.round(maxDim * ratio), height: maxDim };
  }
}