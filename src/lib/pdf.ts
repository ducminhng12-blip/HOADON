import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - This is a Vite-specific import that works at runtime
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker locally using Vite's ?url suffix for reliable loading
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function pdfToImage(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1); 

  // We use scale 2.0 for clear OCR text
  const viewport = page.getViewport({ scale: 2.0 });
  
  // Create a full canvas first
  const fullCanvas = document.createElement('canvas');
  const context = fullCanvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not get canvas context');

  fullCanvas.height = viewport.height;
  fullCanvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport,
    // @ts-ignore - Some versions of pdfjs-dist types are inconsistent
    canvas: fullCanvas 
  }).promise;

  // Petrolimex invoices keep critical metadata (Ký hiệu, Số, Ngày) at the top.
  // We crop the top 35% to focus the AI and speed up processing.
  const cropHeight = Math.floor(viewport.height * 0.35);
  const cropCanvas = document.createElement('canvas');
  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) throw new Error('Could not get crop context');

  cropCanvas.width = viewport.width;
  cropCanvas.height = cropHeight;

  // Draw ONLY the top portion to the new canvas
  cropContext.drawImage(
    fullCanvas, 
    0, 0, viewport.width, cropHeight, // Source rect
    0, 0, viewport.width, cropHeight  // Dest rect
  );

  return cropCanvas.toDataURL('image/jpeg', 0.8);
}
