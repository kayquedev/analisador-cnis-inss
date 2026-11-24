import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
type PositionedText = { str: string; x: number; y: number }

const pageToLines = async (page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>['getPage']>>) => {
  const content = await page.getTextContent()
  const nativeLines: string[] = []
  let nativeLine: string[] = []
  for (const item of content.items) {
    if (!('str' in item)) continue
    if (item.str.trim()) nativeLine.push(item.str)
    if ('hasEOL' in item && item.hasEOL) {
      if (nativeLine.length) nativeLines.push(nativeLine.join(' ').replace(/\s+/g, ' ').trim())
      nativeLine = []
    }
  }
  if (nativeLine.length) nativeLines.push(nativeLine.join(' ').replace(/\s+/g, ' ').trim())
  if (nativeLines.length >= 5) return nativeLines.join('\n')

  const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => 'str' in item && 'transform' in item).map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] } satisfies PositionedText)).filter(item => item.str.trim()).sort((a, b) => Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x)
  const lines: PositionedText[][] = []
  for (const item of items) { const line = lines.find(candidate => Math.abs(candidate[0].y - item.y) <= 2.5); if (line) line.push(item); else lines.push([item]) }
  return lines.sort((a, b) => b[0].y - a[0].y).map(line => line.sort((a, b) => a.x - b.x).map(item => item.str).join(' ').replace(/\s+/g, ' ').trim()).join('\n')
}

export const extractPdfText = async (file: File, onProgress?: (progress: number) => void) => {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecione um arquivo PDF.')
  if (file.size > 25 * 1024 * 1024) throw new Error('O arquivo excede o limite local de 25 MB.')
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer() }); const pdf = await task.promise; const pages: string[] = []
  for (let index = 1; index <= pdf.numPages; index++) { pages.push(await pageToLines(await pdf.getPage(index))); onProgress?.(Math.round((index / pdf.numPages) * 100)) }
  return { text: pages.join('\n=== PÁGINA ===\n'), pages: pdf.numPages }
}
