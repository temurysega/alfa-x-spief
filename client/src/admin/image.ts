// Картинки вопросов сжимаются прямо в браузере ведущего до ~150 КБ (ТЗ, п. 5),
// чтобы у участников на мобильном интернете они успевали загрузиться за отсчёт.

const MAX_BYTES = 150 * 1024;
const MAX_WIDTH = 960;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let width = Math.min(MAX_WIDTH, bitmap.width);
  let best: Blob | null = null;
  for (let round = 0; round < 4; round++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((bitmap.height * width) / bitmap.width);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      let blob = await toBlob(canvas, 'image/webp', quality);
      // Safari не умеет сохранять webp — тогда jpeg.
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
      if (!blob) continue;
      best = blob;
      if (blob.size <= MAX_BYTES) return readAsDataUrl(blob);
    }
    width = Math.round(width * 0.8);
  }
  if (!best) throw new Error('Не удалось обработать картинку');
  return readAsDataUrl(best);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
