export interface QuantizedTemplate {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ]
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  paletteRgb: [number, number, number][],
): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < paletteRgb.length; i++) {
    const [pr, pg, pb] = paletteRgb[i]
    const dr = r - pr
    const dg = g - pg
    const db = b - pb
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Даунскейлит изображение до gridWidth x gridHeight (1 пиксель canvas'а = 1
 * клетка сетки) и снаппит каждый пиксель к ближайшему цвету палитры.
 * Пиксели с низкой альфой (прозрачный фон загруженного фото) пропускаются,
 * чтобы шаблон не рисовал сплошной прямоугольник.
 */
export function quantizeImageToPalette(
  image: HTMLImageElement | ImageBitmap,
  gridWidth: number,
  gridHeight: number,
  paletteHex: string[],
  alphaThreshold = 32,
): QuantizedTemplate {
  const paletteRgb = paletteHex.map(hexToRgb)

  // 1. Даунскейл в маленький canvas того же размера, что и целевая область сетки.
  const down = document.createElement('canvas')
  down.width = gridWidth
  down.height = gridHeight
  const downCtx = down.getContext('2d', { willReadFrequently: true })
  if (!downCtx) throw new Error('Canvas 2D context недоступен')
  downCtx.imageSmoothingEnabled = true
  downCtx.imageSmoothingQuality = 'high'
  downCtx.drawImage(image, 0, 0, gridWidth, gridHeight)

  const { data } = downCtx.getImageData(0, 0, gridWidth, gridHeight)

  // 2. Снаппим каждый пиксель к ближайшему цвету палитры.
  const out = document.createElement('canvas')
  out.width = gridWidth
  out.height = gridHeight
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('Canvas 2D context недоступен')
  const outImage = outCtx.createImageData(gridWidth, gridHeight)

  for (let i = 0; i < gridWidth * gridHeight; i++) {
    const o = i * 4
    const a = data[o + 3]
    if (a < alphaThreshold) {
      outImage.data[o + 3] = 0
      continue
    }
    const idx = nearestPaletteIndex(data[o], data[o + 1], data[o + 2], paletteRgb)
    const [pr, pg, pb] = paletteRgb[idx]
    outImage.data[o] = pr
    outImage.data[o + 1] = pg
    outImage.data[o + 2] = pb
    outImage.data[o + 3] = 255
  }

  outCtx.putImageData(outImage, 0, 0)
  return { canvas: out, width: gridWidth, height: gridHeight }
}
