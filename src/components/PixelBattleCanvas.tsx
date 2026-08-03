import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase'
import { authService } from '../services/authService'
import { pixelService } from '../services/pixelService'
import type { PixelInfo } from '../services/pixelService'
import AuthModal from './AuthModal'
import SettingsModal from './SettingsModal'
import AdminModal from './AdminModal'
import TemplateOverlayModal from './TemplateOverlayModal'
import PixelInfoPopup from './PixelInfoPopup'
import AllianceModal from './AllianceModal'
import { userService } from '../services/userService'
import { useTemplateOverlay } from './useTemplateOverlay'
import type { Session } from '@supabase/supabase-js'
import {
  Palette,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Zap,
  Info,
  ShoppingBag,
  ImagePlus,
  X,
  PlusCircle,
  BatteryCharging,
  Timer,
  TrendingUp,
  Eraser,
  Check,
  Trash2,
  User,
  Settings,
  Shield,
  Brush,
  Crosshair,
  Pipette,
  Loader2,
} from 'lucide-react'

// ============================================================================
// CONFIG
// ============================================================================

const GRID_WIDTH = 200
const GRID_HEIGHT = 200
const INITIAL_MAX_CHARGES = 100
const CHARGE_REGEN_MS = 5000
const MIN_SCALE = 1
const MAX_SCALE = 40
const GRID_LINES_VISIBLE_FROM_SCALE = 8

const MAX_CHARGES_GROWTH_PER_PIXEL = 1
const LIMIT_UPGRADE_STEP = 50
const CHARGE_PACKS = [50, 100, 200] as const
const SHOP_COOLDOWN_MS = 5 * 60 * 1000
const MAX_REGULAR_LIMIT = 2000 // Жесткий лимит зарядов для обычных пользователей

const PALETTE_HEX: string[] = [
  '#FFFFFF',
  '#D4D7D9',
  '#898D90',
  '#000000',
  '#FF4500',
  '#FFA800',
  '#FFD635',
  '#00A368',
  '#7EED56',
  '#2450A4',
  '#3690EA',
  '#51E9F4',
  '#811E9F',
  '#B44AC0',
  '#FF99AA',
  '#9C6926',
  '#6D001A',
  '#BE0039',
  '#FF3881',
  '#493AC1',
  '#94B3FF',
  '#00CC78',
  '#00756F',
  '#009EAA',
]

function buildPaletteRGBA(hexColors: string[]): Uint32Array {
  const packed = new Uint32Array(hexColors.length)
  for (let i = 0; i < hexColors.length; i++) {
    const hex = hexColors[i].replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    packed[i] = (255 << 24) | (b << 16) | (g << 8) | r
  }
  return packed
}

const PALETTE_RGBA = buildPaletteRGBA(PALETTE_HEX)

interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

interface PixelBattleCanvasProps {
  width?: number
  height?: number
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PixelBattleCanvas({
  width = GRID_WIDTH,
  height = GRID_HEIGHT,
  className = '',
}: PixelBattleCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewCanvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  // --- Core Binary Data ---
  const pixelDataRef = useRef<Uint8Array>(new Uint8Array(width * height))
  const transformRef = useRef<ViewTransform>({
    scale: 4,
    offsetX: 0,
    offsetY: 0,
  })
  const dirtyRef = useRef(true)
  const lastUserPaintedPixelRef = useRef<{ x: number; y: number } | null>(null)

  // --- Draft State ---
  const pendingPixelsRef = useRef<
    Map<string, { x: number; y: number; color_idx: number }>
  >(new Map())
  const [pendingCount, setPendingCount] = useState(0)
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [isEyedropperMode, setIsEyedropperMode] = useState(false)
  const [isLoadingCanvas, setIsLoadingCanvas] = useState(true)
  const [isActiveDrawingMode, setIsActiveDrawingMode] = useState(false)
  const [pixelInfoQuery, setPixelInfoQuery] = useState<{
    x: number
    y: number
    loading: boolean
    data: PixelInfo | null
  } | null>(null)
  const infoTapStartRef = useRef<{ x: number; y: number } | null>(null)

  // --- Touch & Gesture State Refs ---
  const touchStartDistRef = useRef<number | null>(null)
  const touchStartMidRef = useRef<{ x: number; y: number } | null>(null)
  const touchStartScaleRef = useRef<number>(1)
  const touchStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const touchLastPosRef = useRef<{ x: number; y: number } | null>(null)
  const touchLastPaintedTileRef = useRef<{ x: number; y: number } | null>(null)

  // --- Input & Drag State ---
  const isPointerDownRef = useRef(false)
  const dragButtonRef = useRef<number>(0)
  const pointerDownPosRef = useRef({ x: 0, y: 0 })
  const lastPointerPosRef = useRef({ x: 0, y: 0 })
  const isShiftPressedRef = useRef(false)
  const lastPaintedTileRef = useRef<{ x: number; y: number } | null>(null)

  // --- DOM Refs ---
  const coordsLabelRef = useRef<HTMLSpanElement>(null)
  const scaleLabelRef = useRef<HTMLSpanElement>(null)
  const mobileCoordsLabelRef = useRef<HTMLSpanElement>(null)

  // --- UI & Modal State ---
  const [isDark, setIsDark] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const showGridRef = useRef(showGrid)
  const [enableBlinking, setEnableBlinking] = useState(true)
  const enableBlinkingRef = useRef(enableBlinking)

  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isShopOpen, setIsShopOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false)
  const [selectedColorIndex, setSelectedColorIndex] = useState(4)
  const [isTemplateOpen, setIsTemplateOpen] = useState(false)
  const [isAllianceOpen, setIsAllianceOpen] = useState(false)
  const templateOverlay = useTemplateOverlay(PALETTE_HEX, () => {
    dirtyRef.current = true
  })
  const templateStateRef = useRef(templateOverlay.state)
  templateStateRef.current = templateOverlay.state

  // --- Charges System State ---
  const [maxCharges, setMaxCharges] = useState(INITIAL_MAX_CHARGES)
  const [charges, setCharges] = useState(INITIAL_MAX_CHARGES)
  const [msUntilNextCharge, setMsUntilNextCharge] = useState(0)

  const maxChargesRef = useRef(maxCharges)
  const chargesRef = useRef(charges)
  const lastChargeRegenTimeRef = useRef(Date.now())

  // --- Auth & User State ---
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [profile, setProfile] = useState<{
    username: string
    is_admin: boolean
  } | null>(null)

  // --- Shop Cooldown State ---
  const [shopCooldownEnd, setShopCooldownEnd] = useState<number>(0)
  const [nowTick, setNowTick] = useState(() => Date.now())

  // ==========================================================================
  // Helper Functions & Business Logic
  // ==========================================================================

  const screenToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const view = viewCanvasRef.current
      if (!view) return null
      const rect = view.getBoundingClientRect()
      const t = transformRef.current
      const localX = clientX - rect.left
      const localY = clientY - rect.top
      const gridX = Math.floor((localX - t.offsetX) / t.scale)
      const gridY = Math.floor((localY - t.offsetY) / t.scale)
      return {
        gridX,
        gridY,
        inBounds: gridX >= 0 && gridY >= 0 && gridX < width && gridY < height,
      }
    },
    [width, height],
  )

  const openPixelInfo = useCallback(async (gridX: number, gridY: number) => {
    setPixelInfoQuery({ x: gridX, y: gridY, loading: true, data: null })
    setIsPaletteOpen(false) // Закрываем палитру, если она была открыта
    try {
      const data = await pixelService.getPixelInfo(gridX, gridY)
      setPixelInfoQuery({ x: gridX, y: gridY, loading: false, data })
    } catch {
      setPixelInfoQuery(null)
    }
  }, [])

  const handleDraftAction = useCallback(
    (gridX: number, gridY: number) => {
      if (!session) {
        setIsAuthModalOpen(true)
        return false
      }

      if (gridX < 0 || gridY < 0 || gridX >= width || gridY >= height)
        return false

      const key = `${gridX},${gridY}`

      if (isEyedropperMode) {
        const idx = gridY * width + gridX
        const colorIdx = pixelDataRef.current[idx]
        if (
          colorIdx !== undefined &&
          colorIdx >= 0 &&
          colorIdx < PALETTE_HEX.length
        ) {
          setSelectedColorIndex(colorIdx)
        }
        setIsEyedropperMode(false)
        return true
      } else if (isEraserMode) {
        if (pendingPixelsRef.current.has(key)) {
          pendingPixelsRef.current.delete(key)
          setPendingCount(pendingPixelsRef.current.size)
          dirtyRef.current = true
          return true
        }
        return false
      } else {
        const idx = gridY * width + gridX
        const isAlreadyConfirmed =
          pixelDataRef.current[idx] === selectedColorIndex
        const existingDraft = pendingPixelsRef.current.get(key)

        if (existingDraft && existingDraft.color_idx === selectedColorIndex)
          return false
        if (!existingDraft && isAlreadyConfirmed) return false

        const isNew = !pendingPixelsRef.current.has(key)
        if (isNew && pendingPixelsRef.current.size >= chargesRef.current) {
          return false
        }

        pendingPixelsRef.current.set(key, {
          x: gridX,
          y: gridY,
          color_idx: selectedColorIndex,
        })
        if (isNew) setPendingCount(pendingPixelsRef.current.size)

        dirtyRef.current = true
        return true
      }
    },
    [isEraserMode, session, width, height, selectedColorIndex],
  )

  const handleConfirmDrafts = useCallback(async () => {
    if (!session || pendingPixelsRef.current.size === 0) return

    const drafts = Array.from(pendingPixelsRef.current.values())
    const count = drafts.length

    try {
      await pixelService.placePixelsBatch(drafts, session.user.id)

      if (drafts.length > 0) {
        const last = drafts[drafts.length - 1]
        lastUserPaintedPixelRef.current = { x: last.x, y: last.y }
      }

      const offCtx = offscreenCtxRef.current
      if (offCtx) {
        drafts.forEach(({ x, y, color_idx }) => {
          const idx = y * width + x
          pixelDataRef.current[idx] = color_idx
          const single = offCtx.createImageData(1, 1)
          new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx]
          offCtx.putImageData(single, x, y)
        })
      }

      let newMaxCharges =
        maxChargesRef.current + count * MAX_CHARGES_GROWTH_PER_PIXEL
      if (!profile?.is_admin) {
        newMaxCharges = Math.min(newMaxCharges, MAX_REGULAR_LIMIT)
      }

      const newCharges = Math.max(0, chargesRef.current - count)

      chargesRef.current = newCharges
      maxChargesRef.current = newMaxCharges
      setCharges(newCharges)
      setMaxCharges(newMaxCharges)

      pendingPixelsRef.current.clear()
      setPendingCount(0)
      dirtyRef.current = true
      setIsEraserMode(false)
      setIsEyedropperMode(false)
    } catch (error) {
      console.error('Сервер отклонил пиксели:', error)
      clearDrafts()
      loadUserProfile(session.user.id)
      alert(
        'Ошибка при установке пикселей. Возможно, не хватает зарядов или рассинхрон.',
      )
    }
  }, [session, width, profile])

  const clearDrafts = useCallback(() => {
    pendingPixelsRef.current.clear()
    setPendingCount(0)
    dirtyRef.current = true
  }, [])

  const focusOnCoordinates = useCallback((gridX: number, gridY: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const t = transformRef.current

    t.offsetX = rect.width / 2 - (gridX + 0.5) * t.scale
    t.offsetY = rect.height / 2 - (gridY + 0.5) * t.scale

    dirtyRef.current = true
  }, [])

  const handleFocusMyPosition = useCallback(() => {
    if (lastUserPaintedPixelRef.current) {
      focusOnCoordinates(
        lastUserPaintedPixelRef.current.x,
        lastUserPaintedPixelRef.current.y,
      )
    } else {
      focusOnCoordinates(width / 2, height / 2)
    }
  }, [focusOnCoordinates, width, height])

  // ==========================================================================
  // Touch & Gesture Support for Mobile
  // ==========================================================================

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault()
      const touches = e.targetTouches
      const view = viewCanvasRef.current
      if (!view) return

      if (touches.length === 1) {
        const touch = touches[0]
        touchLastPosRef.current = { x: touch.clientX, y: touch.clientY }
        touchLastPaintedTileRef.current = null
        infoTapStartRef.current = { x: touch.clientX, y: touch.clientY }

        if (isActiveDrawingMode) {
          const grid = screenToGrid(touch.clientX, touch.clientY)
          if (grid && grid.inBounds) {
            if (handleDraftAction(grid.gridX, grid.gridY)) {
              touchLastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY }
            }
          }
        }
      } else if (touches.length === 2) {
        infoTapStartRef.current = null
        const touch1 = touches[0]
        const touch2 = touches[1]
        const dx = touch1.clientX - touch2.clientX
        const dy = touch1.clientY - touch2.clientY
        touchStartDistRef.current = Math.hypot(dx, dy)

        const rect = view.getBoundingClientRect()
        const midX = (touch1.clientX + touch2.clientX) / 2 - rect.left
        const midY = (touch1.clientY + touch2.clientY) / 2 - rect.top
        touchStartMidRef.current = { x: midX, y: midY }

        const t = transformRef.current
        touchStartScaleRef.current = t.scale
        touchStartOffsetRef.current = { x: t.offsetX, y: t.offsetY }
      }
    },
    [isActiveDrawingMode, screenToGrid, handleDraftAction],
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault()
      const touches = e.targetTouches
      const view = viewCanvasRef.current
      if (!view) return

      if (touches.length === 1) {
        const touch = touches[0]
        const grid = screenToGrid(touch.clientX, touch.clientY)
        const coordsStr =
          grid && grid.inBounds ? `${grid.gridX}, ${grid.gridY}` : '—, —'

        if (coordsLabelRef.current) {
          coordsLabelRef.current.textContent = coordsStr
        }
        if (mobileCoordsLabelRef.current) {
          mobileCoordsLabelRef.current.textContent = coordsStr
        }

        if (isActiveDrawingMode) {
          if (grid && grid.inBounds) {
            const last = touchLastPaintedTileRef.current
            if (!last || last.x !== grid.gridX || last.y !== grid.gridY) {
              if (handleDraftAction(grid.gridX, grid.gridY)) {
                touchLastPaintedTileRef.current = {
                  x: grid.gridX,
                  y: grid.gridY,
                }
              }
            }
          }
        } else {
          if (touchLastPosRef.current) {
            const t = transformRef.current
            t.offsetX += touch.clientX - touchLastPosRef.current.x
            t.offsetY += touch.clientY - touchLastPosRef.current.y
            dirtyRef.current = true
            touchLastPosRef.current = { x: touch.clientX, y: touch.clientY }
          }
        }
      } else if (
        touches.length === 2 &&
        touchStartDistRef.current &&
        touchStartMidRef.current
      ) {
        const touch1 = touches[0]
        const touch2 = touches[1]
        const dx = touch1.clientX - touch2.clientX
        const dy = touch1.clientY - touch2.clientY
        const dist = Math.hypot(dx, dy)

        const rect = view.getBoundingClientRect()
        const currentMidX = (touch1.clientX + touch2.clientX) / 2 - rect.left
        const currentMidY = (touch1.clientY + touch2.clientY) / 2 - rect.top

        const scaleRatio = dist / touchStartDistRef.current
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, touchStartScaleRef.current * scaleRatio),
        )

        const t = transformRef.current

        const startMid = touchStartMidRef.current
        const startOffset = touchStartOffsetRef.current

        const worldX = (startMid.x - startOffset.x) / touchStartScaleRef.current
        const worldY = (startMid.y - startOffset.y) / touchStartScaleRef.current

        t.scale = newScale
        t.offsetX = currentMidX - worldX * newScale
        t.offsetY = currentMidY - worldY * newScale

        dirtyRef.current = true
        if (scaleLabelRef.current)
          scaleLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
      }
    },
    [isActiveDrawingMode, screenToGrid, handleDraftAction],
  )

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      e.preventDefault()
      const touches = e.targetTouches

      if (touches.length === 0) {
        if (
          !isActiveDrawingMode &&
          infoTapStartRef.current &&
          e.changedTouches.length === 1
        ) {
          const touch = e.changedTouches[0]
          const dx = Math.abs(touch.clientX - infoTapStartRef.current.x)
          const dy = Math.abs(touch.clientY - infoTapStartRef.current.y)
          if (dx < 6 && dy < 6) {
            const grid = screenToGrid(touch.clientX, touch.clientY)
            if (grid && grid.inBounds) openPixelInfo(grid.gridX, grid.gridY)
          }
        }
        infoTapStartRef.current = null
        touchLastPosRef.current = null
        touchLastPaintedTileRef.current = null
        touchStartDistRef.current = null
        touchStartMidRef.current = null
      } else if (touches.length === 1) {
        const touch = touches[0]
        touchLastPosRef.current = { x: touch.clientX, y: touch.clientY }
        touchLastPaintedTileRef.current = null
        touchStartDistRef.current = null
        touchStartMidRef.current = null
      }
    },
    [isActiveDrawingMode, screenToGrid, openPixelInfo],
  )

  // ==========================================================================
  // Shop Logic
  // ==========================================================================

  const triggerShopCooldown = useCallback(() => {
    setShopCooldownEnd(Date.now() + SHOP_COOLDOWN_MS)
  }, [])

  const isShopOnCooldown = shopCooldownEnd > nowTick
  const shopCooldownRemainingMs = Math.max(0, shopCooldownEnd - nowTick)

  const formatCooldown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleBuyLimitUpgrade = useCallback(async () => {
    if (isShopOnCooldown || !session?.user) return

    triggerShopCooldown()

    try {
      const result = await userService.buyLimitUpgrade()
      if (!result) return
      chargesRef.current = result.charges
      maxChargesRef.current = result.max_charges
      setCharges(result.charges)
      setMaxCharges(result.max_charges)
    } catch {
      loadUserProfile(session.user.id)
    }
  }, [isShopOnCooldown, session, triggerShopCooldown])

  const handleBuyChargePack = useCallback(
    async (amount: number) => {
      if (isShopOnCooldown || !session?.user) return

      triggerShopCooldown()

      try {
        const result = await userService.buyChargePack(amount)
        if (!result) return
        chargesRef.current = result.charges
        setCharges(result.charges)
      } catch {
        loadUserProfile(session.user.id)
      }
    },
    [isShopOnCooldown, session, triggerShopCooldown],
  )

  // ==========================================================================
  // Input Handling
  // ==========================================================================

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const view = viewCanvasRef.current
    if (!view) return
    const rect = view.getBoundingClientRect()
    const t = transformRef.current
    const zoomFactor = Math.exp(-e.deltaY * 0.0015)
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, t.scale * zoomFactor),
    )

    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const worldX = (cx - t.offsetX) / t.scale
    const worldY = (cy - t.offsetY) / t.scale

    t.offsetX = cx - worldX * newScale
    t.offsetY = cy - worldY * newScale
    t.scale = newScale

    dirtyRef.current = true
    if (scaleLabelRef.current)
      scaleLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
  }, [])

  // === hook для установки непассивных слушателей событий ===
  useEffect(() => {
    const canvas = viewCanvasRef.current
    if (!canvas) return

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd])

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.button !== 1) return

      isPointerDownRef.current = true
      dragButtonRef.current = e.button
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY }
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
      lastPaintedTileRef.current = null

      const grid = screenToGrid(e.clientX, e.clientY)
      if (!grid) return

      if (e.button === 0 && isShiftPressedRef.current) {
        if (grid.inBounds && handleDraftAction(grid.gridX, grid.gridY)) {
          lastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY }
        }
      }
    },
    [screenToGrid, handleDraftAction],
  )

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const grid = screenToGrid(e.clientX, e.clientY)
      const coordsStr =
        grid && grid.inBounds ? `${grid.gridX}, ${grid.gridY}` : '—, —'
      if (coordsLabelRef.current) {
        coordsLabelRef.current.textContent = coordsStr
      }
      if (mobileCoordsLabelRef.current) {
        mobileCoordsLabelRef.current.textContent = coordsStr
      }

      if (!isPointerDownRef.current) return

      if (dragButtonRef.current === 0 && isShiftPressedRef.current) {
        if (grid && grid.inBounds) {
          const last = lastPaintedTileRef.current
          if (!last || last.x !== grid.gridX || last.y !== grid.gridY) {
            if (handleDraftAction(grid.gridX, grid.gridY)) {
              lastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY }
            }
          }
        }
      } else {
        const t = transformRef.current
        t.offsetX += e.clientX - lastPointerPosRef.current.x
        t.offsetY += e.clientY - lastPointerPosRef.current.y
        dirtyRef.current = true
      }
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY }
    },
    [screenToGrid, handleDraftAction],
  )

  const handlePointerUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wasPointerDown = isPointerDownRef.current
      const button = dragButtonRef.current

      isPointerDownRef.current = false
      lastPaintedTileRef.current = null

      if (wasPointerDown && button === 0) {
        const dx = Math.abs(e.clientX - pointerDownPosRef.current.x)
        const dy = Math.abs(e.clientY - pointerDownPosRef.current.y)

        // Если это обычный клик, а не перетаскивание
        if (dx < 5 && dy < 5) {
          const grid = screenToGrid(e.clientX, e.clientY)
          if (grid && grid.inBounds) {
            // Если зажат Shift ИЛИ уже есть черновики -> мы в процессе рисования, ставим пиксель
            if (
              isShiftPressedRef.current ||
              pendingPixelsRef.current.size > 0
            ) {
              handleDraftAction(grid.gridX, grid.gridY)
            } else {
              // Если черновиков нет и Shift не зажат -> открываем инфо о пикселе
              openPixelInfo(grid.gridX, grid.gridY)
            }
          }
        }
      }
    },
    [screenToGrid, handleDraftAction, openPixelInfo],
  )

  const zoomBy = useCallback((factor: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const t = transformRef.current
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))

    const worldX = (cx - t.offsetX) / t.scale
    const worldY = (cy - t.offsetY) / t.scale
    t.offsetX = cx - worldX * newScale
    t.offsetY = cy - worldY * newScale
    t.scale = newScale

    dirtyRef.current = true
    if (scaleLabelRef.current)
      scaleLabelRef.current.textContent = `${Math.round(newScale * 100)}%`
  }, [])

  // ==========================================================================
  // Effects
  // ==========================================================================

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDark])

  useEffect(() => {
    showGridRef.current = showGrid
    dirtyRef.current = true
  }, [showGrid])

  useEffect(() => {
    enableBlinkingRef.current = enableBlinking
    dirtyRef.current = true
  }, [enableBlinking])

  useEffect(() => {
    chargesRef.current = charges
    maxChargesRef.current = maxCharges
  }, [charges, maxCharges])

  useEffect(() => {
    if (shopCooldownEnd <= Date.now()) return
    const interval = setInterval(() => {
      const now = Date.now()
      setNowTick(now)
      if (now >= shopCooldownEnd) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [shopCooldownEnd])

  useEffect(() => {
    let rafId: number
    const updateCharges = () => {
      rafId = requestAnimationFrame(updateCharges)
      if (chargesRef.current >= maxChargesRef.current) {
        if (msUntilNextCharge !== 0) setMsUntilNextCharge(0)
        lastChargeRegenTimeRef.current = Date.now()
        return
      }
      const now = Date.now()
      const delta = now - lastChargeRegenTimeRef.current

      if (delta >= CHARGE_REGEN_MS) {
        const gainedCharges = Math.floor(delta / CHARGE_REGEN_MS)
        const newCharges = Math.min(
          maxChargesRef.current,
          chargesRef.current + gainedCharges,
        )
        setCharges(newCharges)
        lastChargeRegenTimeRef.current = now - (delta % CHARGE_REGEN_MS)
        setMsUntilNextCharge(CHARGE_REGEN_MS - (delta % CHARGE_REGEN_MS))
      } else {
        setMsUntilNextCharge(CHARGE_REGEN_MS - delta)
      }
    }
    rafId = requestAnimationFrame(updateCharges)
    return () => cancelAnimationFrame(rafId)
  }, [msUntilNextCharge])

  const persistCharges = useCallback(() => {
    if (!session?.user) return
    userService.syncCharges().then((result) => {
      if (!result) return
      chargesRef.current = result.charges
      setCharges(result.charges)
      lastChargeRegenTimeRef.current = new Date(
        result.last_regen_time,
      ).getTime()
    })
  }, [session])

  const persistChargesKeepalive = useCallback(() => {
    if (!session?.user || !supabaseUrl || !supabaseAnonKey) return
    try {
      fetch(`${supabaseUrl}/rest/v1/rpc/sync_charges`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: '{}',
      })
    } catch {
      // keepalive запрос best effort, страница всё равно уже закрывается
    }
  }, [session])

  useEffect(() => {
    if (!session?.user) return
    const interval = setInterval(persistCharges, 10000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistChargesKeepalive()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', persistChargesKeepalive)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', persistChargesKeepalive)
      persistCharges()
    }
  }, [session, persistCharges, persistChargesKeepalive])

  useEffect(() => {
    const offCanvas = document.createElement('canvas')
    offCanvas.width = width
    offCanvas.height = height
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: false })
    if (!offCtx) return

    offscreenCanvasRef.current = offCanvas
    offscreenCtxRef.current = offCtx

    const imageData = offCtx.createImageData(width, height)
    const data32 = new Uint32Array(imageData.data.buffer)
    data32.fill(PALETTE_RGBA[0])
    pixelDataRef.current.fill(0)
    offCtx.putImageData(imageData, 0, 0)

    dirtyRef.current = true
  }, [width, height])

  useEffect(() => {
    let rafId: number
    const render = () => {
      rafId = requestAnimationFrame(render)

      let isDirty = dirtyRef.current
      if (pendingPixelsRef.current.size > 0) isDirty = true

      if (!isDirty) return

      const view = viewCanvasRef.current
      const off = offscreenCanvasRef.current
      if (!view || !off) return

      const ctx = view.getContext('2d')
      if (!ctx) return

      const { scale, offsetX, offsetY } = transformRef.current
      const dpr = window.devicePixelRatio || 1

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, view.width, view.height)

      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)

      ctx.drawImage(off, 0, 0)

      const template = templateOverlay.quantizedRef.current
      const tState = templateStateRef.current
      if (tState.enabled && template) {
        ctx.save()
        ctx.globalAlpha = tState.opacity
        ctx.drawImage(
          template.canvas,
          tState.x,
          tState.y,
          tState.width,
          tState.height,
        )
        ctx.restore()
      }

      if (pendingPixelsRef.current.size > 0) {
        if (enableBlinkingRef.current) {
          const time = Date.now()
          const alpha = 0.5 + 0.3 * Math.sin(time / 150)
          ctx.globalAlpha = alpha
        } else {
          ctx.globalAlpha = 0.85
        }

        pendingPixelsRef.current.forEach(({ x, y, color_idx }) => {
          ctx.fillStyle = PALETTE_HEX[color_idx]
          ctx.fillRect(x, y, 1, 1)
        })
        ctx.globalAlpha = 1.0
      }

      if (showGridRef.current && scale >= GRID_LINES_VISIBLE_FROM_SCALE) {
        ctx.strokeStyle = 'oklch(from var(--border) l c h / 0.15)'
        ctx.lineWidth = 1 / scale
        ctx.beginPath()
        for (let gx = 0; gx <= width; gx++) {
          ctx.moveTo(gx, 0)
          ctx.lineTo(gx, height)
        }
        for (let gy = 0; gy <= height; gy++) {
          ctx.moveTo(0, gy)
          ctx.lineTo(width, gy)
        }
        ctx.stroke()
      }

      ctx.restore()
      dirtyRef.current = false
    }
    rafId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafId)
  }, [width, height])

  useEffect(() => {
    const container = containerRef.current
    const view = viewCanvasRef.current
    if (!container || !view) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const targetWidth = Math.floor(rect.width * dpr)
      const targetHeight = Math.floor(rect.height * dpr)
      if (view.width !== targetWidth || view.height !== targetHeight) {
        view.width = targetWidth
        view.height = targetHeight
        view.style.width = `${rect.width}px`
        view.style.height = `${rect.height}px`
        dirtyRef.current = true
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftPressedRef.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftPressedRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const loadUserProfile = async (userId: string) => {
    const data = await userService.getProfile(userId)
    if (data) {
      setProfile({ username: data.username, is_admin: data.is_admin })
      setMaxCharges(data.max_charges)

      const serverRegenTime = data.last_regen_time
        ? new Date(data.last_regen_time).getTime()
        : Date.now()
      const elapsed = Math.max(0, Date.now() - serverRegenTime)
      const gainedOffline = Math.floor(elapsed / CHARGE_REGEN_MS)
      const catchUpCharges = Math.min(
        data.max_charges,
        data.charges + gainedOffline,
      )
      const remainder = elapsed % CHARGE_REGEN_MS

      lastChargeRegenTimeRef.current =
        catchUpCharges >= data.max_charges ? Date.now() : Date.now() - remainder

      chargesRef.current = catchUpCharges
      setCharges(catchUpCharges)

      if (data.last_shop_purchase_at) {
        const lastPurchase = new Date(data.last_shop_purchase_at).getTime()
        const end = lastPurchase + SHOP_COOLDOWN_MS
        if (end > Date.now()) {
          setShopCooldownEnd(end)
        } else {
          setShopCooldownEnd(0)
        }
      } else {
        setShopCooldownEnd(0)
      }
    }
  }

  useEffect(() => {
    authService.getSession().then((sess) => {
      setSession(sess)
      if (sess?.user) loadUserProfile(sess.user.id)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, sess: any) => {
      setSession(sess)
      if (sess?.user) {
        loadUserProfile(sess.user.id)
        setIsAuthModalOpen(false)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    pixelService
      .loadAllPixels()
      .then((dbPixels) => {
        const offCtx = offscreenCtxRef.current
        if (offCtx) {
          dbPixels.forEach(({ x, y, color_idx }: any) => {
            const idx = y * width + x
            pixelDataRef.current[idx] = color_idx
            const single = offCtx.createImageData(1, 1)
            new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx]
            offCtx.putImageData(single, x, y)
          })
          dirtyRef.current = true
        }
      })
      .finally(() => {
        setIsLoadingCanvas(false)
      })

    const unsubscribe = pixelService.subscribeToPixels(
      ({ x, y, color_idx }) => {
        const idx = y * width + x
        pixelDataRef.current[idx] = color_idx

        const offCtx = offscreenCtxRef.current
        if (offCtx) {
          const single = offCtx.createImageData(1, 1)
          new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx]
          offCtx.putImageData(single, x, y)
        }
        dirtyRef.current = true
      },
    )

    return () => unsubscribe()
  }, [width, height])

  const regenProgressFactor =
    (CHARGE_REGEN_MS - msUntilNextCharge) / CHARGE_REGEN_MS

  const isLimitMaxed = !profile?.is_admin && maxCharges >= MAX_REGULAR_LIMIT
  const cannotUpgradeLimit =
    !profile?.is_admin && maxCharges + LIMIT_UPGRADE_STEP > MAX_REGULAR_LIMIT

  return (
    <div
      className={`relative h-full w-full overflow-hidden font-sans touch-none ${className}`}
      style={{ background: 'var(--page-bg) fixed', color: 'var(--foreground)' }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden touch-none"
      >
        <canvas
          ref={viewCanvasRef}
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair z-0"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* ==================== INITIAL CANVAS LOADING OVERLAY ==================== */}
        {isLoadingCanvas && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300 pointer-events-auto">
            <div className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md">
              <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Загрузка Канваса
              </span>
            </div>
          </div>
        )}

        {/* ==================== TOP HEADER BAR ==================== */}
        <div className="absolute top-4 inset-x-0 z-20 pointer-events-none flex justify-between w-full px-4 items-center">
          {/* Top Left Floating Pill: Coords & Zoom */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="inline-flex h-11 items-center gap-3 rounded-full border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 px-4 shadow-lg backdrop-blur-md transition-all duration-300">
              <span className="hidden md:flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 pr-3">
                <MousePointer2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span ref={coordsLabelRef}>—, —</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">
                <ZoomIn className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <span ref={scaleLabelRef}>
                  {Math.round(transformRef.current.scale * 100)}%
                </span>
              </span>
            </div>
          </div>

          {/* Top Right Floating Bar: Profile, Actions */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="inline-flex h-11 items-center gap-1 rounded-full border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 px-1.5 shadow-lg backdrop-blur-md transition-all duration-300">
            {/* Template Overlay Button */}
            <button
              onClick={() => setIsTemplateOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              title="Шаблон"
            >
              <ImagePlus className="h-4 w-4" />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />

            {/* Shop Button */}
            <button
              onClick={() => setIsShopOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors relative"
              title="Магазин зарядов"
            >
              <ShoppingBag className="h-4 w-4" />
              {!isShopOnCooldown && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </button>

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />

            {/* Alliance Button */}
            <button
              onClick={() => {
                if (session) setIsAllianceOpen(true)
                else setIsAuthModalOpen(true)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              title="Альянсы"
            >
              <Shield className="h-4 w-4" />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              title="Настройки"
            >
              <Settings className="h-4 w-4" />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800" />

            {/* Profile Button */}
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors relative"
              title="Профиль"
            >
              <User
                className={`h-4 w-4 ${session ? 'text-indigo-500 dark:text-indigo-400' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

        {/* Profile Popover */}
        {isProfileOpen && (
          <div className="absolute right-4 top-16 glass-strong p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-2xl flex flex-col gap-3 min-w-[180px] animate-in fade-in slide-in-from-top-4 duration-200 z-30 pointer-events-auto">
            {session ? (
              <>
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 mb-1">
                  <User className="h-4 w-4 text-indigo-500" />
                  <span className="font-bold text-sm truncate text-slate-800 dark:text-slate-100">
                    {profile?.username}
                  </span>
                </div>
                {profile?.is_admin && (
                  <button
                    onClick={() => {
                      setIsAdminOpen(true)
                      setIsProfileOpen(false)
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-colors text-left"
                  >
                    <Shield className="h-4 w-4" /> Админ-панель
                  </button>
                )}
                <button
                  onClick={() => {
                    authService.signOut()
                    setIsProfileOpen(false)
                  }}
                  className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors text-left font-medium"
                >
                  Выйти из аккаунта
                </button>
              </>
            ) : (
              <>
                <div className="text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Вы не вошли
                </div>
                <button
                  onClick={() => {
                    setIsAuthModalOpen(true)
                    setIsProfileOpen(false)
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  Войти
                </button>
              </>
            )}
          </div>
        )}

        {/* Mobile Profile Bottom Sheet */}
        {isMobileProfileOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4 md:hidden pointer-events-auto"
            onClick={() => setIsMobileProfileOpen(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl relative animate-in slide-in-from-bottom duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsMobileProfileOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Профиль
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Информация о пользователе
                  </p>
                </div>
              </div>

              {session ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-indigo-500" />
                      <span className="font-bold text-sm truncate text-slate-900 dark:text-slate-100">
                        {profile?.username}
                      </span>
                    </div>
                  </div>
                  {profile?.is_admin && (
                    <button
                      onClick={() => {
                        setIsAdminOpen(true)
                        setIsMobileProfileOpen(false)
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl text-sm font-bold border border-red-500/20 hover:bg-red-500/20 transition-all active:scale-95"
                    >
                      <Shield className="h-4 w-4" /> Админ-панель
                    </button>
                  )}
                  <button
                    onClick={() => {
                      authService.signOut()
                      setIsMobileProfileOpen(false)
                    }}
                    className="w-full py-3 text-sm text-slate-600 dark:text-slate-400 hover:text-rose-500 border border-slate-200 dark:border-slate-800 rounded-xl transition-all active:scale-95 font-medium"
                  >
                    Выйти из аккаунта
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-center text-slate-500 dark:text-slate-400 py-2">
                    Вы не авторизованы
                  </div>
                  <button
                    onClick={() => {
                      setIsAuthModalOpen(true)
                      setIsMobileProfileOpen(false)
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold active:scale-95 transition-all shadow-lg"
                  >
                    Войти
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==================== EXPANDABLE BOTTOM CONTROL BAR (BETTER PLACE UX) ==================== */}
      {!pixelInfoQuery && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 ease-in-out">
          {!isPaletteOpen && !isActiveDrawingMode && pendingCount === 0 ? (
            /* --- CLOSED STATE (Floating Pill Button & Charges) --- */
            <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              {/* Charge Counter Floating Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-md backdrop-blur-md">
                <Zap
                  className={`h-3.5 w-3.5 ${charges > 0 ? 'text-amber-500' : 'text-slate-400'}`}
                />
                <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                  {charges === maxCharges ? (
                    <span className="text-emerald-500 dark:text-emerald-400 font-extrabold">
                      MAX
                    </span>
                  ) : (
                    charges
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1">
                    / {maxCharges}
                  </span>
                </span>
                {/* Thin energy regen bar indicator */}
                <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden ml-1">
                  <div
                    className={`h-full transition-all duration-300 ${
                      charges >= maxCharges
                        ? 'bg-emerald-500'
                        : 'bg-amber-500 animate-pulse'
                    }`}
                    style={{
                      width: `${charges >= maxCharges ? 100 : regenProgressFactor * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Action Bar: Center Pin, Main "Paint" Pill, Zoom Controls */}
              <div className="flex items-center gap-3 p-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl">
                {/* Left Action: Center / Focus My Position */}
                <button
                  onClick={handleFocusMyPosition}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all shadow-sm"
                  title="Моя позиция"
                >
                  <Crosshair className="h-5 w-5" />
                </button>

                {/* Primary Action Pill: "Paint" */}
                <button
                  onClick={() => {
                    setIsActiveDrawingMode(true)
                    setIsPaletteOpen(true)
                  }}
                  className="flex items-center gap-2.5 px-6 h-11 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white font-bold text-sm shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] hover:scale-105 active:scale-95 transition-all duration-200"
                >
                  <Brush className="h-4 w-4 animate-bounce" />
                  <span>Рисовать</span>
                </button>

                {/* Right Action: Zoom In / Zoom Out Toggle Group */}
                <div className="flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 p-0.5 shadow-sm">
                  <button
                    onClick={() => zoomBy(1.3)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all"
                    title="Приблизить"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => zoomBy(1 / 1.3)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all"
                    title="Отдалить"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* --- OPEN / EXPANDED STATE (Better Place Color Palette Overlay) --- */
            <div className="w-[92vw] max-w-[480px] p-4 rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-6 fade-in duration-300">
              {/* TOP ROW: Color Palette Grid */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-indigo-500" /> Выбор
                    цвета
                  </span>
                  <span className="text-[11px] font-mono font-medium text-slate-400">
                    Заряды:{' '}
                    <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {pendingCount > 0 ? charges - pendingCount : charges} /{' '}
                      {maxCharges}
                    </strong>
                  </span>
                </div>

                {/* Scrollable Palette Grid of Circles */}
                <div className="grid grid-cols-8 gap-2 max-h-[140px] overflow-y-auto p-1 scrollbar-thin">
                  {PALETTE_HEX.map((hex, i) => (
                    <button
                      key={hex}
                      onClick={() => {
                        setSelectedColorIndex(i)
                        setIsEraserMode(false)
                        setIsEyedropperMode(false)
                      }}
                      className={`h-9 w-9 rounded-full border-2 transition-all duration-200 hover:scale-110 active:scale-95 ${
                        selectedColorIndex === i && !isEraserMode
                          ? 'border-indigo-600 dark:border-indigo-400 scale-110 ring-4 ring-indigo-500/20 dark:ring-indigo-400/30 shadow-md'
                          : 'border-white dark:border-slate-800 shadow-sm'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={`Цвет ${hex}`}
                    />
                  ))}
                </div>
              </div>

              {/* BOTTOM BAR: Tools, Active Color Preview, Actions */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                {/* Left Side: Close & Tools */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      clearDrafts()
                      setIsPaletteOpen(false)
                      setIsActiveDrawingMode(false)
                      setIsEyedropperMode(false)
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/40 dark:hover:bg-red-500/30 active:scale-90 transition-all"
                    title="Отмена"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <button
                    onClick={() => {
                      setIsEraserMode(!isEraserMode)
                      setIsEyedropperMode(false)
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90 ${
                      isEraserMode
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="Ластик"
                  >
                    <Eraser className="h-5 w-5" />
                  </button>

                  <button
                    onClick={() => {
                      setIsEyedropperMode(!isEyedropperMode)
                      setIsEraserMode(false)
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90 ${
                      isEyedropperMode
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="Пипетка (выбор цвета)"
                  >
                    <Pipette className="h-5 w-5" />
                  </button>

                  {pendingCount > 0 && (
                    <button
                      onClick={clearDrafts}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 active:scale-90 transition-all"
                      title="Очистить все черновики"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Center: Selected Color Preview Pill */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div
                    className="h-4 w-4 rounded-full border border-white dark:border-slate-900 shadow-sm shrink-0"
                    style={{
                      backgroundColor: isEraserMode
                        ? '#F43F5E'
                        : PALETTE_HEX[selectedColorIndex],
                    }}
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {isEyedropperMode
                      ? 'Пипетка'
                      : isEraserMode
                        ? 'Ластик'
                        : PALETTE_HEX[selectedColorIndex]}
                  </span>
                </div>

                {/* Right Side: Primary "Confirm / Apply" Button */}
                <button
                  onClick={() => {
                    handleConfirmDrafts()
                    setIsPaletteOpen(false)
                    setIsActiveDrawingMode(false)
                  }}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-2 px-5 h-10 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-95 transition-all"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    Применить {pendingCount > 0 ? `(${pendingCount})` : ''}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODALS ====================  */}
      {pixelInfoQuery && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none hidden md:block">
          <div className="pointer-events-auto">
            <PixelInfoPopup
              x={pixelInfoQuery.x}
              y={pixelInfoQuery.y}
              loading={pixelInfoQuery.loading}
              info={pixelInfoQuery.data}
              paletteHex={PALETTE_HEX}
              onClose={() => setPixelInfoQuery(null)}
              onPaint={() => {
                setIsActiveDrawingMode(true)
                setIsPaletteOpen(true)
                handleDraftAction(pixelInfoQuery.x, pixelInfoQuery.y)
                setPixelInfoQuery(null)
              }}
            />
          </div>
        </div>
      )}

      {isAuthModalOpen && (
        <AuthModal
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => setIsAuthModalOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          isDark={isDark}
          setIsDark={setIsDark}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          enableBlinking={enableBlinking}
          setEnableBlinking={setEnableBlinking}
        />
      )}

      {isTemplateOpen && (
        <TemplateOverlayModal
          onClose={() => setIsTemplateOpen(false)}
          overlay={templateOverlay}
          gridWidth={width}
          gridHeight={height}
        />
      )}

      {isAllianceOpen && session && (
        <AllianceModal
          onClose={() => setIsAllianceOpen(false)}
          currentUserId={session.user.id}
        />
      )}

      {isAdminOpen && profile?.is_admin && session && (
        <AdminModal
          onClose={() => setIsAdminOpen(false)}
          currentUserId={session.user.id}
          onSuccess={() => loadUserProfile(session.user.id)}
          gridWidth={width}
          gridHeight={height}
          paletteHex={PALETTE_HEX}
        />
      )}

      {isShopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="glass-strong w-full max-w-md p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
            <button
              onClick={() => setIsShopOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                <ShoppingBag className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Магазин Зарядов</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Прокачивайте свои возможности для рисования
                </p>
              </div>
            </div>

            {isLimitMaxed && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-medium">
                <Info className="h-4 w-4 shrink-0" />
                Достигнут максимальный лимит зарядов ({MAX_REGULAR_LIMIT})
              </div>
            )}

            {isShopOnCooldown && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive-foreground)] text-xs font-medium">
                <Timer className="h-4 w-4 shrink-0" />
                Магазин перезаряжается. Следующая покупка доступна через{' '}
                {formatCooldown(shopCooldownRemainingMs)}
              </div>
            )}

            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />{' '}
                Улучшение лимита
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--primary)]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <PlusCircle className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="font-semibold text-sm">
                      +{LIMIT_UPGRADE_STEP} к макс. лимиту
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Сейчас: {maxCharges} → {maxCharges + LIMIT_UPGRADE_STEP}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleBuyLimitUpgrade}
                  disabled={isShopOnCooldown || cannotUpgradeLimit || !session}
                  className="px-3 py-2 min-w-[92px] rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {isShopOnCooldown ? (
                    <span className="flex items-center justify-center gap-1">
                      <Timer className="h-3.5 w-3.5" />
                      {formatCooldown(shopCooldownRemainingMs)}
                    </span>
                  ) : cannotUpgradeLimit ? (
                    'МАКСИМУМ'
                  ) : (
                    'БЕСПЛАТНО'
                  )}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider">
                <BatteryCharging className="h-3.5 w-3.5 text-[var(--accent)]" />{' '}
                Покупка пикселей
              </div>
              <div className="space-y-3">
                {CHARGE_PACKS.map((amount) => {
                  const wouldExceedMax = charges + amount > maxCharges
                  const willExceedAbsolute =
                    !profile?.is_admin && charges + amount > MAX_REGULAR_LIMIT
                  const isPackBlocked =
                    isShopOnCooldown ||
                    wouldExceedMax ||
                    willExceedAbsolute ||
                    !session

                  return (
                    <div
                      key={amount}
                      className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--primary)]/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Zap className="h-6 w-6 text-[var(--accent)]" />
                        <div>
                          <div className="font-semibold text-sm">
                            +{amount} зарядов
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {wouldExceedMax || willExceedAbsolute
                              ? 'Превысит лимит'
                              : `Пополнит до ${charges + amount}/${maxCharges}`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyChargePack(amount)}
                        disabled={isPackBlocked}
                        className="px-3 py-2 min-w-[92px] rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        {isShopOnCooldown ? (
                          <span className="flex items-center justify-center gap-1">
                            <Timer className="h-3.5 w-3.5" />
                            {formatCooldown(shopCooldownRemainingMs)}
                          </span>
                        ) : wouldExceedMax || willExceedAbsolute ? (
                          'МАКСИМУМ'
                        ) : (
                          'БЕСПЛАТНО'
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
              {!session
                ? 'Авторизуйтесь, чтобы совершать покупки'
                : 'После покупки магазин перезаряжается 5 минут.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
