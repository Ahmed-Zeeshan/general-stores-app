"use client";

/** Makes a camera photo small enough to store (JPEG, longest side `max` px, under ~400 KB). */
export async function compressImage(file: File, max = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("This file is not a photo."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const g = canvas.getContext("2d")!;
    // White behind transparent pictures (JPEG has no transparency; it would turn black).
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.75, 0.6, 0.45, 0.3]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length < 420_000) return data;
    }
    throw new Error("The photo is too large. Take it again from a little further away.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
