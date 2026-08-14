/**
 * Renders page 1 of a PDF to an offscreen canvas using pdf.js.
 * Returns a promise that resolves with the canvas element.
 */
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

/**
 * Render a single-page PDF to an offscreen canvas.
 * @param url  URL of the PDF (e.g. '/resume.pdf')
 * @param scale  Render scale multiplier (default 3 for crisp output)
 */
export async function renderPdfToCanvas(
  url: string,
  scale = 3,
): Promise<HTMLCanvasElement> {
  const doc = await pdfjs.getDocument(url).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext('2d')!,
    viewport,
  }).promise;

  return canvas;
}
