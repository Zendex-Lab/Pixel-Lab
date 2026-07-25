import { useCallback, useRef, useState } from 'react'
import { quantizeImageToPalette, QuantizedTemplate } from './quantizeImage'

export interface TemplateOverlayState {
  enabled: boolean
  hasImage: boolean
  x: number
  y: number
  width: number
  height: number
  opacity: number
  lockAspect: boolean
}

const DEFAULT_STATE: TemplateOverlayState = {
  enabled: false,
  hasImage: false,
  x: 0,
  y: 0,
  width: 64,
  height: 64,
  opacity: 0.6,
  lockAspect: true,
}

// Защита от слишком тяжёлой квантизации на большом шаблоне.
const MAX_TEMPLATE_DIMENSION = 512

export function useTemplateOverlay(paletteHex: string[], markDirty: () => void) {
  const [state, setState] = useState<TemplateOverlayState>(DEFAULT_STATE)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const nativeAspectRef = useRef(1)
  const quantizedRef = useRef<QuantizedTemplate | null>(null)

  const requantize = useCallback(
    (w: number, h: number) => {
      const img = sourceImageRef.current
      if (!img) return
      const clampedW = Math.min(MAX_TEMPLATE_DIMENSION, Math.max(1, Math.round(w)))
      const clampedH = Math.min(MAX_TEMPLATE_DIMENSION, Math.max(1, Math.round(h)))
      quantizedRef.current = quantizeImageToPalette(img, clampedW, clampedH, paletteHex)
      markDirty()
    },
    [paletteHex, markDirty],
  )

  const loadImageFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        sourceImageRef.current = img
        nativeAspectRef.current = img.naturalWidth / img.naturalHeight

        setState(prev => {
          const width = Math.min(MAX_TEMPLATE_DIMENSION, prev.width || 64)
          const height = Math.max(1, Math.round(width / nativeAspectRef.current))
          requantize(width, height)
          return { ...prev, enabled: true, hasImage: true, width, height }
        })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => URL.revokeObjectURL(url)
      img.src = url
    },
    [requantize],
  )

  const setPosition = useCallback(
    (x: number, y: number) => {
      setState(prev => ({ ...prev, x: Math.round(x), y: Math.round(y) }))
      markDirty()
    },
    [markDirty],
  )

  const setSize = useCallback(
    (width: number, height: number) => {
      setState(prev => {
        const nextWidth = Math.max(1, Math.round(width))
        const nextHeight = prev.lockAspect
          ? Math.max(1, Math.round(nextWidth / nativeAspectRef.current))
          : Math.max(1, Math.round(height))
        requantize(nextWidth, nextHeight)
        return { ...prev, width: nextWidth, height: nextHeight }
      })
    },
    [requantize],
  )

  const setOpacity = useCallback(
    (opacity: number) => {
      setState(prev => ({ ...prev, opacity: Math.min(1, Math.max(0, opacity)) }))
      markDirty()
    },
    [markDirty],
  )

  const setLockAspect = useCallback((lockAspect: boolean) => {
    setState(prev => ({ ...prev, lockAspect }))
  }, [])

  const toggleEnabled = useCallback(() => {
    setState(prev => ({ ...prev, enabled: !prev.enabled }))
    markDirty()
  }, [markDirty])

  const clear = useCallback(() => {
    sourceImageRef.current = null
    quantizedRef.current = null
    setState(DEFAULT_STATE)
    markDirty()
  }, [markDirty])

  return {
    state,
    quantizedRef,
    loadImageFile,
    setPosition,
    setSize,
    setOpacity,
    setLockAspect,
    toggleEnabled,
    clear,
  }
}

export type UseTemplateOverlayReturn = ReturnType<typeof useTemplateOverlay>