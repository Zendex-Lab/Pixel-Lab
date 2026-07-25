import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authService } from '../services/authService'
import { pixelService } from '../services/pixelService'
import { userService } from '../services/userService'
import AuthModal from './AuthModal'
import SettingsModal from './SettingsModal'
import AdminModal from './AdminModal'
import type { Session } from '@supabase/supabase-js'
import {
  Palette,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Move,
  Zap,
  Info,
  ShoppingBag,
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
  const [isActiveDrawingMode, setIsActiveDrawingMode] = useState(false)

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

  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isShopOpen, setIsShopOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false)
  const [selectedColorIndex, setSelectedColorIndex] = useState(4)

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

  const handleDraftAction = useCallback(
    (gridX: number, gridY: number) => {
      if (!session) {
        setIsAuthModalOpen(true)
        return false
      }

      if (gridX < 0 || gridY < 0 || gridX >= width || gridY >= height)
        return false

      const key = `${gridX},${gridY}`

      if (isEraserMode) {
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

  const handleConfirmDrafts = useCallback(() => {
    if (!session || pendingPixelsRef.current.size === 0) return

    const drafts = Array.from(pendingPixelsRef.current.values())
    const count = drafts.length

    // Track last user painted pixel coordinate
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
    // Жесткое ограничение лимита при рисовании для обычных пользователей
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

    pixelService.placePixelsBatch(drafts, session.user.id)
    userService.updateCharges(session.user.id, newCharges, newMaxCharges)
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
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const touches = e.targetTouches
      const view = viewCanvasRef.current
      if (!view) return

      if (touches.length === 1) {
        // Single finger touch: start draw (if Active Drawing Mode) or start panning
        const touch = touches[0]
        touchLastPosRef.current = { x: touch.clientX, y: touch.clientY }
        touchLastPaintedTileRef.current = null

        if (isActiveDrawingMode) {
          const grid = screenToGrid(touch.clientX, touch.clientY)
          if (grid && grid.inBounds) {
            if (handleDraftAction(grid.gridX, grid.gridY)) {
              touchLastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY }
            }
          }
        }
      } else if (touches.length === 2) {
        // Two finger gesture: calculate initial distance, midpoint and save transform state
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
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const touches = e.targetTouches
      const view = viewCanvasRef.current
      if (!view) return

      if (touches.length === 1) {
        const touch = touches[0]
        const grid = screenToGrid(touch.clientX, touch.clientY)
        const coordsStr =
          grid && grid.inBounds ? `${grid.gridX}, ${grid.gridY}` : '—, —'

        // Update coordinate tracker on single-finger touch
        if (coordsLabelRef.current) {
          coordsLabelRef.current.textContent = coordsStr
        }
        if (mobileCoordsLabelRef.current) {
          mobileCoordsLabelRef.current.textContent = coordsStr
        }

        if (isActiveDrawingMode) {
          // Continuous drawing in active drawing mode
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
          // Single finger panning
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
        // Two finger zoom and pan
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

        // Pivot around the start midpoint (map interaction zoom + pan)
        const startMid = touchStartMidRef.current
        const startOffset = touchStartOffsetRef.current

        const worldX = (startMid.x - startOffset.x) / touchStartScaleRef.current
        const worldY = (startMid.y - startOffset.y) / touchStartScaleRef.current

        t.scale = newScale
        // Also apply midpoint displacement to translate viewport along with fingers (simultaneous pan & zoom)
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
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const touches = e.targetTouches

      if (touches.length === 0) {
        touchLastPosRef.current = null
        touchLastPaintedTileRef.current = null
        touchStartDistRef.current = null
        touchStartMidRef.current = null
      } else if (touches.length === 1) {
        // Transition from 2 to 1 finger
        const touch = touches[0]
        touchLastPosRef.current = { x: touch.clientX, y: touch.clientY }
        touchLastPaintedTileRef.current = null
        touchStartDistRef.current = null
        touchStartMidRef.current = null
      }
    },
    [],
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

  const handleBuyLimitUpgrade = useCallback(() => {
    if (isShopOnCooldown) return
    let newMaxCharges = maxChargesRef.current + LIMIT_UPGRADE_STEP

    // Блокировка попытки обойти лимит
    if (!profile?.is_admin && newMaxCharges > MAX_REGULAR_LIMIT) return

    maxChargesRef.current = newMaxCharges
    setMaxCharges(newMaxCharges)

    if (session?.user) {
      userService.recordShopPurchase(
        session.user.id,
        chargesRef.current,
        newMaxCharges,
      )
    }
    triggerShopCooldown()
  }, [isShopOnCooldown, session, triggerShopCooldown, profile])

  const handleBuyChargePack = useCallback(
    (amount: number) => {
      if (isShopOnCooldown) return

      // Блокировка попытки обойти лимит текущих зарядов
      if (
        !profile?.is_admin &&
        chargesRef.current + amount > maxChargesRef.current
      )
        return
      if (!profile?.is_admin && chargesRef.current + amount > MAX_REGULAR_LIMIT)
        return

      const newCharges = Math.min(
        maxChargesRef.current,
        chargesRef.current + amount,
      )
      chargesRef.current = newCharges
      setCharges(newCharges)

      if (session?.user) {
        userService.recordShopPurchase(
          session.user.id,
          newCharges,
          maxChargesRef.current,
        )
      }
      triggerShopCooldown()
    },
    [isShopOnCooldown, session, triggerShopCooldown, profile],
  )

  // ==========================================================================
  // Input Handling
  // ==========================================================================

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
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

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.button !== 1) return

      isPointerDownRef.current = true
      dragButtonRef.current = e.button
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

      if (wasPointerDown && button === 0 && !isShiftPressedRef.current) {
        const dx = Math.abs(e.clientX - lastPointerPosRef.current.x)
        const dy = Math.abs(e.clientY - lastPointerPosRef.current.y)
        if (dx < 3 && dy < 3) {
          const grid = screenToGrid(e.clientX, e.clientY)
          if (grid && grid.inBounds) handleDraftAction(grid.gridX, grid.gridY)
        }
      }
    },
    [screenToGrid, handleDraftAction],
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

  // Главный цикл рендера
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

      // --- Рендер черновиков ---
      if (pendingPixelsRef.current.size > 0) {
        const time = Date.now()
        const alpha = 0.5 + 0.3 * Math.sin(time / 150)
        ctx.globalAlpha = alpha

        pendingPixelsRef.current.forEach(({ x, y, color_idx }) => {
          ctx.fillStyle = PALETTE_HEX[color_idx]
          ctx.fillRect(x, y, 1, 1)
        })
        ctx.globalAlpha = 1.0
      }

      // --- Сетка ---
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
      view.width = rect.width * dpr
      view.height = rect.height * dpr
      view.style.width = `${rect.width}px`
      view.style.height = `${rect.height}px`
      dirtyRef.current = true
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
      setCharges(data.charges)
      setMaxCharges(data.max_charges)

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
    } = supabase.auth.onAuthStateChange((_event, sess) => {
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
    pixelService.loadAllPixels().then((dbPixels) => {
      const offCtx = offscreenCtxRef.current
      if (!offCtx) return
      dbPixels.forEach(({ x, y, color_idx }) => {
        const idx = y * width + x
        pixelDataRef.current[idx] = color_idx
        const single = offCtx.createImageData(1, 1)
        new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx]
        offCtx.putImageData(single, x, y)
      })
      dirtyRef.current = true
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

  // Ограничения для интерфейса Магазина
  const isLimitMaxed = !profile?.is_admin && maxCharges >= MAX_REGULAR_LIMIT
  const cannotUpgradeLimit =
    !profile?.is_admin && maxCharges + LIMIT_UPGRADE_STEP > MAX_REGULAR_LIMIT

  return (
    <div
      className={`relative flex h-full w-full flex-col font-sans touch-none ${className}`}
      style={{ background: 'var(--page-bg) fixed', color: 'var(--foreground)' }}
    >
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden touch-none"
      >
        <canvas
          ref={viewCanvasRef}
          className="h-full w-full touch-none cursor-crosshair"
          onWheel={handleWheel}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Desktop Coordinate & Zoom Badge */}
        <div className="pointer-events-none absolute top-4 left-4 glass flex items-center gap-3 px-3.5 py-2 text-xs font-mono text-[var(--foreground)] hidden md:flex">
          <span className="flex items-center gap-1.5 border-r border-[var(--glass-border)] pr-3">
            <MousePointer2 className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span ref={coordsLabelRef}>—, —</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ZoomIn className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span ref={scaleLabelRef}>
              {Math.round(transformRef.current.scale * 100)}%
            </span>
          </span>
        </div>

        {/* Mobile Coordinate Badge */}
        <div className="pointer-events-none absolute top-4 left-4 glass flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-[var(--foreground)] md:hidden">
          <span>📍</span>
          <span ref={mobileCoordsLabelRef}>—, —</span>
        </div>

        {/* Desktop Keyboard Hints */}
        <div className="pointer-events-none absolute top-4 right-4 glass flex items-center gap-2 px-3.5 py-2 text-xs text-[var(--muted-foreground)] hidden md:flex">
          <Move className="h-4 w-4" />
          <span>
            Колесо — зум · ЛКМ/СКМ перемещение ·{' '}
            <span className="text-[var(--primary)] font-medium">
              Shift+Drag — рисовать
            </span>
          </span>
        </div>

        {/* Mobile Top Bar Action Icons */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20 md:hidden">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-full glass hover:bg-[var(--glass-bg-strong)] text-[var(--muted-foreground)] active:scale-95 transition-all"
            title="Настройки"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsShopOpen(true)}
            className="p-2.5 rounded-full glass hover:bg-[var(--glass-bg-strong)] text-[var(--primary)] active:scale-95 transition-all relative"
            title="Магазин"
          >
            <ShoppingBag className="h-4 w-4" />
            {!isShopOnCooldown && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
            )}
          </button>
          <button
            onClick={() => setIsMobileProfileOpen(true)}
            className="p-2.5 rounded-full glass hover:bg-[var(--glass-bg-strong)] text-[var(--muted-foreground)] active:scale-95 transition-all"
            title="Профиль"
          >
            <User
              className={`h-4 w-4 ${session ? 'text-[var(--primary)]' : ''}`}
            />
          </button>
        </div>

        {/* HUD: Floating Vertical Toolbar */}
        <div className="absolute right-4 bottom-24 glass flex flex-col overflow-hidden rounded-xl border border-[var(--glass-border)] z-20 hidden md:flex">
          <button
            onClick={() => zoomBy(1.4)}
            className="p-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors"
            title="Приблизить"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <div className="h-px w-full bg-[var(--glass-border)]" />
          <button
            onClick={() => zoomBy(1 / 1.4)}
            className="p-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors"
            title="Отдалить"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <div className="h-px w-full bg-[var(--glass-border)]" />
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors"
            title="Настройки"
          >
            <Settings className="h-5 w-5" />
          </button>
          <div className="h-px w-full bg-[var(--glass-border)]" />
          <button
            onClick={() => setIsShopOpen(true)}
            className="p-3 text-[var(--primary)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors relative"
            title="Магазин"
          >
            <ShoppingBag className="h-5 w-5" />
            {!isShopOnCooldown && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--accent)] animate-ping" />
            )}
          </button>
          <div className="h-px w-full bg-[var(--glass-border)]" />
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="p-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors"
            title="Профиль"
          >
            <User
              className={`h-5 w-5 ${session ? 'text-[var(--primary)]' : ''}`}
            />
          </button>
        </div>

        {/* Profile Popover */}
        {isProfileOpen && (
          <div className="absolute right-[4.5rem] bottom-24 glass-strong p-4 rounded-2xl border border-[var(--glass-border)] shadow-2xl flex flex-col gap-3 min-w-[160px] animate-in fade-in slide-in-from-right-4 duration-200 z-20">
            {session ? (
              <>
                <div className="flex items-center gap-2 border-b border-[var(--glass-border)] pb-2 mb-1">
                  <User className="h-4 w-4 text-[var(--primary)]" />
                  <span className="font-bold text-sm truncate">
                    {profile?.username}
                  </span>
                </div>
                {profile?.is_admin && (
                  <button
                    onClick={() => {
                      setIsAdminOpen(true)
                      setIsProfileOpen(false)
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors text-left"
                  >
                    <Shield className="h-4 w-4" /> Админ-панель
                  </button>
                )}
                <button
                  onClick={() => {
                    authService.signOut()
                    setIsProfileOpen(false)
                  }}
                  className="px-3 py-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 rounded-lg transition-colors text-left font-medium"
                >
                  Выйти из аккаунта
                </button>
              </>
            ) : (
              <>
                <div className="text-sm font-medium mb-1">Вы не вошли</div>
                <button
                  onClick={() => {
                    setIsAuthModalOpen(true)
                    setIsProfileOpen(false)
                  }}
                  className="px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4 md:hidden"
            onClick={() => setIsMobileProfileOpen(false)}
          >
            <div
              className="glass-strong w-full max-w-sm p-6 rounded-t-3xl border-t border-[var(--glass-border)] shadow-2xl relative animate-in slide-in-from-bottom duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsMobileProfileOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)]"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Профиль</h3>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Информация о пользователе
                  </p>
                </div>
              </div>

              {session ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-[var(--primary)]" />
                      <span className="font-bold text-sm truncate">
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
                      className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-bold border border-red-500/20 hover:bg-red-500/20 transition-all active:scale-95"
                    >
                      <Shield className="h-4 w-4" /> Админ-панель
                    </button>
                  )}
                  <button
                    onClick={() => {
                      authService.signOut()
                      setIsMobileProfileOpen(false)
                    }}
                    className="w-full py-3 text-sm text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 border border-[var(--glass-border)] bg-[var(--glass-bg)] rounded-xl transition-all active:scale-95 font-medium"
                  >
                    Выйти из аккаунта
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-center text-[var(--muted-foreground)] py-2">
                    Вы не авторизованы
                  </div>
                  <button
                    onClick={() => {
                      setIsAuthModalOpen(true)
                      setIsMobileProfileOpen(false)
                    }}
                    className="w-full py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]"
                  >
                    Войти
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==================== MOBILE BOTTOM BAR LAYOUTS ==================== */}
      {/* State A (Default Viewing Mode) */}
      {!isActiveDrawingMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] z-10 pointer-events-auto flex flex-col items-center gap-2 md:hidden">
          {/* Thin energy/charge progress bar */}
          <div className="w-full glass-strong px-4 py-2 flex flex-col gap-1 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] font-semibold uppercase tracking-wider">
                <Zap className="h-3 w-3 text-[var(--accent)] animate-pulse" />
                Заряды
              </span>
              <span className="text-xs font-bold font-mono">
                {charges}{' '}
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  / {maxCharges}
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out ${charges >= maxCharges ? 'border-animated-rainbow' : 'bg-[var(--accent)]'}`}
                style={{
                  width: `${charges >= maxCharges ? 100 : regenProgressFactor * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Buttons Row */}
          <div className="w-full glass-strong flex items-center justify-between p-2.5 rounded-2xl shadow-xl gap-2">
            {/* Palette Button */}
            <button
              onClick={() => {
                setIsActiveDrawingMode(true)
                setIsPaletteOpen(true)
              }}
              className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] text-[var(--primary)] active:scale-90 transition-all shrink-0"
              title="Палитра"
            >
              <Palette className="h-5 w-5" />
            </button>

            {/* Main Draw Button with Brush Icon */}
            <button
              onClick={() => {
                setIsActiveDrawingMode(true)
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)] active:scale-95 transition-all text-sm shrink-0"
            >
              <Brush className="h-5 w-5" />
              <span>Рисовать</span>
            </button>

            {/* Focus My Position Icon */}
            <button
              onClick={handleFocusMyPosition}
              className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] text-[var(--muted-foreground)] active:scale-90 transition-all shrink-0"
              title="Моя позиция"
            >
              <Crosshair className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* State B (Active Drawing Mode - Slide-up Bottom Sheet) */}
      {isActiveDrawingMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-[var(--glass-border)] rounded-t-2xl shadow-2xl p-4 md:hidden flex flex-col gap-4 animate-in slide-in-from-bottom duration-300">
          {/* Drag indicator handle */}
          <div className="w-12 h-1 bg-[var(--glass-border)] rounded-full mx-auto mb-1" />

          {/* Horizontally scrollable color palette row */}
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-2">
            <span className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-[var(--primary)]" /> Палитра
              цвета
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              Скролльте горизонтально
            </span>
          </div>

          <div className="flex overflow-x-auto gap-3 pb-3 pt-1 scrollbar-none snap-x touch-pan-x">
            {PALETTE_HEX.map((hex, i) => (
              <button
                key={hex}
                onClick={() => {
                  setSelectedColorIndex(i)
                  setIsEraserMode(false)
                }}
                className={`h-[44px] w-[44px] min-w-[44px] min-h-[44px] shrink-0 rounded-xl border-2 transition-transform snap-center ${
                  selectedColorIndex === i && !isEraserMode
                    ? 'border-[var(--primary)] scale-105 ring-glow'
                    : 'border-[var(--glass-border)]'
                }`}
                style={{ backgroundColor: hex }}
                title={`Цвет ${hex}`}
              />
            ))}
          </div>

          {/* Eraser toggle button and remaining charge indicator */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setIsEraserMode(!isEraserMode)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all active:scale-95 ${
                isEraserMode
                  ? 'border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]'
                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] text-[var(--muted-foreground)]'
              }`}
            >
              <Eraser className="h-4 w-4" />
              <span className="text-xs font-semibold">Ластик</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
              <Zap className="h-4 w-4 text-[var(--accent)]" />
              <span>
                Заряды:{' '}
                <span className="text-[var(--foreground)] font-bold">
                  {pendingCount > 0 ? charges - pendingCount : charges} /{' '}
                  {maxCharges}
                </span>
              </span>
            </div>
          </div>

          {/* Full-width Confirm (X Pixels) action button and Cancel button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                clearDrafts()
                setIsActiveDrawingMode(false)
              }}
              className="px-4 py-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] active:scale-95 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={() => {
                handleConfirmDrafts()
                setIsActiveDrawingMode(false)
              }}
              disabled={pendingCount === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Check className="h-4 w-4 animate-in fade-in" />
              <span>Подтвердить ({pendingCount} пикс.)</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== DESKTOP BOTTOM FLOATING BAR ==================== */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-max max-w-[90vw] z-10 pointer-events-none hidden md:flex flex-col items-center gap-3">
        {isPaletteOpen && (
          <div className="pointer-events-auto w-full max-w-[320px] glass-strong p-4 rounded-2xl shadow-2xl border border-[var(--glass-border)] animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center justify-between mb-3 border-b border-[var(--glass-border)] pb-2">
              <span className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="h-4 w-4 text-[var(--primary)]" /> Выберите
                цвет
              </span>
              <button
                onClick={() => setIsPaletteOpen(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-lg hover:bg-[var(--glass-bg)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {PALETTE_HEX.map((hex, i) => (
                <button
                  key={hex}
                  onClick={() => {
                    setSelectedColorIndex(i)
                    setIsEraserMode(false)
                  }}
                  className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg border-2 transition-transform hover:scale-110 focus-ring ${
                    selectedColorIndex === i && !isEraserMode
                      ? 'border-[var(--primary)] scale-110 ring-glow'
                      : 'border-[var(--glass-border)]'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={`Цвет ${hex}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="glass-strong flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 pointer-events-auto rounded-2xl shadow-lg">
          <div className="flex flex-col gap-1.5 min-w-[120px] sm:min-w-[140px] border-r border-[var(--glass-border)] pr-3 sm:pr-5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] sm:text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider">
                <Zap
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${charges > 0 ? 'text-[var(--accent)]' : 'text-[var(--destructive)]'}`}
                />
                Заряды
              </span>
              <span
                className="font-retro8bit text-base sm:text-lg font-bold"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {pendingCount > 0 ? (
                  <span className="text-amber-400">
                    {charges - pendingCount}
                  </span>
                ) : charges === maxCharges ? (
                  'MAX'
                ) : (
                  charges
                )}
                <span className="text-[10px] sm:text-sm text-[var(--muted-foreground)] font-sans ml-1">
                  / {maxCharges}
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out ${charges >= maxCharges ? 'border-animated-rainbow' : 'bg-[var(--accent)]'}`}
                style={{
                  width: `${charges >= maxCharges ? 100 : regenProgressFactor * 100}%`,
                  transition: charges < maxCharges ? 'none' : 'width 0.3s',
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 border-r border-[var(--glass-border)] pr-3 sm:pr-5">
            <button
              onClick={() => setIsPaletteOpen(!isPaletteOpen)}
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] transition-all active:scale-95"
            >
              <Palette className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--primary)]" />
              <span className="text-sm font-medium hidden sm:inline">
                Палитра
              </span>
              <div
                className="h-4 w-4 sm:h-5 sm:w-5 rounded-md border border-white/40 shadow-inner"
                style={{ backgroundColor: PALETTE_HEX[selectedColorIndex] }}
              />
            </button>
            <button
              onClick={() => setIsEraserMode(!isEraserMode)}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all active:scale-95 ${
                isEraserMode
                  ? 'border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]'
                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] text-[var(--muted-foreground)]'
              }`}
              title="Ластик (стирает черновики)"
            >
              <Eraser className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 min-w-[130px] sm:min-w-[170px] justify-center">
            {pendingCount > 0 ? (
              <>
                <button
                  onClick={handleConfirmDrafts}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)] animate-in zoom-in-95"
                >
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-xs sm:text-sm">
                    Подтвердить ({pendingCount})
                  </span>
                </button>
                <button
                  onClick={clearDrafts}
                  className="p-2 sm:p-2.5 rounded-xl border border-[var(--destructive)]/50 bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20 transition-all active:scale-95 animate-in zoom-in-95"
                  title="Очистить черновик"
                >
                  <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </>
            ) : (
              <span className="text-[10px] sm:text-xs text-[var(--muted-foreground)] px-2 text-center hidden md:inline-block">
                Нарисуйте пиксели,
                <br />
                чтобы подтвердить
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ==================== MODALS ==================== */}
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
        />
      )}

      {isAdminOpen && profile?.is_admin && session && (
        <AdminModal
          onClose={() => setIsAdminOpen(false)}
          currentUserId={session.user.id}
          onSuccess={() => loadUserProfile(session.user.id)}
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

            {/* Баннер максимального лимита */}
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
