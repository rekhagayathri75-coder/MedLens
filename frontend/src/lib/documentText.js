import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { createWorker } from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

async function renderPage(page) {
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

async function extractPdfText(file) {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  let extractedCharacters = 0

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const text = await page.getTextContent()
    const pageText = text.items.map((item) => item.str).join(' ').trim()
    extractedCharacters += pageText.length
    pages.push({ pageNumber, text: pageText, page })
  }

  if (extractedCharacters > 40) {
    return pages.map(({ pageNumber, text }) => `--- Page ${pageNumber} ---\n${text}`).join('\n\n')
  }

  const worker = await createWorker('eng')
  try {
    const ocrPages = []
    for (const { pageNumber, page } of pages) {
      const canvas = await renderPage(page)
      const result = await worker.recognize(canvas)
      ocrPages.push(`--- Page ${pageNumber} (OCR) ---\n${result.data.text.trim()}`)
    }
    return ocrPages.join('\n\n')
  } finally {
    await worker.terminate()
  }
}

export async function extractDocumentText(file) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file)
  }

  const worker = await createWorker('eng')
  try {
    const result = await worker.recognize(file)
    return result.data.text.trim()
  } finally {
    await worker.terminate()
  }
}
