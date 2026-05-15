/**
 * Client-side image compression utility.
 * Uses Canvas API to resize and compress images before upload,
 * significantly reducing file sizes (especially for phone camera photos).
 */

interface CompressOptions {
  /** Maximum width or height in pixels (default: 512) */
  maxSize?: number;
  /** JPEG/WebP quality 0-1 (default: 0.8) */
  quality?: number;
  /** Output MIME type (default: "image/webp") */
  outputType?: "image/jpeg" | "image/webp" | "image/png";
}

/**
 * Compresses an image File using the Canvas API.
 * - Resizes to fit within maxSize (keeping aspect ratio)
 * - Re-encodes to the specified format and quality
 *
 * @returns A new compressed File ready for upload
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxSize = 512,
    quality = 0.8,
    outputType = "image/webp",
  } = options;

  // Skip compression for small files (< 100KB) and GIFs (to preserve animation)
  if (file.size < 100 * 1024 || file.type === "image/gif") {
    return file;
  }

  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      // Draw on canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Falha ao criar contexto Canvas."));
        return;
      }

      // Use high-quality downsampling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao comprimir imagem."));
            return;
          }

          // Determine file extension
          const ext = outputType === "image/webp" ? "webp" : outputType === "image/png" ? "png" : "jpg";
          const compressedFile = new File([blob], `avatar.${ext}`, {
            type: outputType,
            lastModified: Date.now(),
          });

          console.log(
            `[image-compress] ${file.name}: ${(file.size / 1024).toFixed(0)}KB -> ${(compressedFile.size / 1024).toFixed(0)}KB (${width}x${height}, ${outputType}, q=${quality})`
          );

          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao carregar imagem para compressao."));
    };

    img.src = url;
  });
}
