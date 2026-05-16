import type { Area } from "react-easy-crop";

/**
 * Returns a cropped image blob (WebP when supported) from a source image URL and pixel crop.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  mimeType: "image/webp" | "image/jpeg" = "image/webp",
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Paint white before drawing: if the crop frame extends past the source
  // edge the uncovered region would otherwise be transparent, which shows
  // the page background through a hero/avatar. Tulala photos are on white
  // studio backdrops, so white-fill keeps any uncovered pixels seamless.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode image"));
      },
      mimeType,
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    if (src.startsWith("http")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}
