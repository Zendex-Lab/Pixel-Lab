import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { authService } from "../services/authService";
import { pixelService } from "../services/pixelService";
import { userService } from "../services/userService";
import AuthModal from "./AuthModal";
import type { Session } from "@supabase/supabase-js";
import { 
  Palette, 
  MousePointer2, 
  ZoomIn, 
  ZoomOut, 
  Move, 
  Zap, 
  Info, 
  Sun, 
  Moon, 
  ShoppingBag, 
  X, 
  PlusCircle, 
  BatteryCharging 
} from "lucide-react";

// ============================================================================
// CONFIG — performance-critical constants
// ============================================================================

const GRID_WIDTH = 200;
const GRID_HEIGHT = 200;
const INITIAL_MAX_CHARGES = 100;
const CHARGE_REGEN_MS = 5000; // +1 заряд каждые 5 сек
const MIN_SCALE = 1;
const MAX_SCALE = 40;
const GRID_LINES_VISIBLE_FROM_SCALE = 8;

// Палитра r/place
const PALETTE_HEX: string[] = [
  "#FFFFFF", "#D4D7D9", "#898D90", "#000000",
  "#FF4500", "#FFA800", "#FFD635", "#00A368",
  "#7EED56", "#2450A4", "#3690EA", "#51E9F4",
  "#811E9F", "#B44AC0", "#FF99AA", "#9C6926",
  "#6D001A", "#BE0039", "#FF3881", "#493AC1",
  "#94B3FF", "#00CC78", "#00756F", "#009EAA",
];

function buildPaletteRGBA(hexColors: string[]): Uint32Array {
  const packed = new Uint32Array(hexColors.length);
  for (let i = 0; i < hexColors.length; i++) {
    const hex = hexColors[i].replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    packed[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return packed;
}

const PALETTE_RGBA = buildPaletteRGBA(PALETTE_HEX);

// ============================================================================
// TYPES
// ============================================================================

interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface PixelBattleCanvasProps {
  width?: number;
  height?: number;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PixelBattleCanvas({
  width = GRID_WIDTH,
  height = GRID_HEIGHT,
  className = "",
}: PixelBattleCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // --- Core Binary Data: NOT React State ---
  const pixelDataRef = useRef<Uint8Array>(new Uint8Array(width * height));
  const transformRef = useRef<ViewTransform>({ scale: 4, offsetX: 0, offsetY: 0 });
  const dirtyRef = useRef(true);

  // --- Input & Drag State ---
  const isPointerDownRef = useRef(false);
  const dragButtonRef = useRef<number>(0);
  const lastPointerPosRef = useRef({ x: 0, y: 0 });
  const isShiftPressedRef = useRef(false);
  
  // Ref to prevent re-painting same tile during Shift-drag paint
  const lastPaintedTileRef = useRef<{x: number, y: number} | null>(null);

  // --- DOM Refs for direct HUD updates ---
  const coordsLabelRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);

  // --- Theme State ---
  const [isDark, setIsDark] = useState(true);

  // --- UI Modals/Popovers State ---
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);

  // --- Charges System State ---
  const [maxCharges, setMaxCharges] = useState(INITIAL_MAX_CHARGES);
  const [charges, setCharges] = useState(INITIAL_MAX_CHARGES);
  const [msUntilNextCharge, setMsUntilNextCharge] = useState(0);

  const maxChargesRef = useRef(maxCharges);
  const chargesRef = useRef(charges);
  const lastChargeRegenTimeRef = useRef(Date.now());

  // --- Palette State ---
  const [selectedColorIndex, setSelectedColorIndex] = useState(4); // orange

  // --- Auth & User State ---
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [profile, setProfile] = useState<{username: string} | null>(null);

  // ==========================================================================
  // Helper Functions & Business Logic (Объявляем ДО их вызова в обработчиках!)
  // ==========================================================================

  const screenToGrid = useCallback((clientX: number, clientY: number) => {
    const view = viewCanvasRef.current;
    if (!view) return null;
    const rect = view.getBoundingClientRect();
    const t = transformRef.current;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const gridX = Math.floor((localX - t.offsetX) / t.scale);
    const gridY = Math.floor((localY - t.offsetY) / t.scale);

    return { gridX, gridY, inBounds: gridX >= 0 && gridY >= 0 && gridX < width && gridY < height };
  }, [width, height]);

  // Throttle сохранения зарядов
  const saveChargesTimeout = useRef<NodeJS.Timeout | null>(null);
  const triggerChargeSave = useCallback((currentCharges: number) => {
    if (!session?.user) return;
    if (saveChargesTimeout.current) clearTimeout(saveChargesTimeout.current);
    saveChargesTimeout.current = setTimeout(() => {
      userService.updateCharges(session.user.id, currentCharges, maxChargesRef.current);
    }, 2000);
  }, [session]);

  // Логика размещения пикселя
  const tryPlacePixel = useCallback((gridX: number, gridY: number) => {
    if (!session) {
      setIsAuthModalOpen(true);
      return false;
    }
    
    if (chargesRef.current <= 0) return false;
    if (gridX < 0 || gridY < 0 || gridX >= width || gridY >= height) return false;

    const idx = gridY * width + gridX;
    if (pixelDataRef.current[idx] === selectedColorIndex) return false;

    // Оптимистичное обновление UI
    pixelDataRef.current[idx] = selectedColorIndex;
    const offCtx = offscreenCtxRef.current;
    if (offCtx) {
      const single = offCtx.createImageData(1, 1);
      const data32 = new Uint32Array(single.data.buffer);
      data32[0] = PALETTE_RGBA[selectedColorIndex];
      offCtx.putImageData(single, gridX, gridY);
    }

    const newCharges = chargesRef.current - 1;
    setCharges(Math.max(0, newCharges));
    dirtyRef.current = true;

    // Асинхронно отправляем в БД
    pixelService.placePixel(gridX, gridY, selectedColorIndex, session.user.id);
    triggerChargeSave(newCharges);

    return true;
  }, [width, height, selectedColorIndex, session, triggerChargeSave]);

  // ==========================================================================
  // Input Handling (Используют tryPlacePixel, созданы ПОСЛЕ неё)
  // ==========================================================================

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const view = viewCanvasRef.current;
    if (!view) return;
    const rect = view.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const t = transformRef.current;
    const zoomFactor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * zoomFactor));

    const worldX = (cx - t.offsetX) / t.scale;
    const worldY = (cy - t.offsetY) / t.scale;
    t.offsetX = cx - worldX * newScale;
    t.offsetY = cy - worldY * newScale;
    t.scale = newScale;

    dirtyRef.current = true;
    if (scaleLabelRef.current) { scaleLabelRef.current.textContent = `${Math.round(newScale * 100)}%`; }
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    
    isPointerDownRef.current = true;
    dragButtonRef.current = e.button;
    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
    lastPaintedTileRef.current = null;

    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return;

    if (e.button === 0 && isShiftPressedRef.current) {
      if (grid.inBounds && tryPlacePixel(grid.gridX, grid.gridY)) {
        lastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY };
      }
    }
  }, [screenToGrid, tryPlacePixel]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const grid = screenToGrid(e.clientX, e.clientY);
    if (coordsLabelRef.current) {
      coordsLabelRef.current.textContent = grid && grid.inBounds ? `${grid.gridX}, ${grid.gridY}` : "—, —";
    }

    if (!isPointerDownRef.current) return;

    if (dragButtonRef.current === 0 && isShiftPressedRef.current) {
      if (grid && grid.inBounds) {
        const last = lastPaintedTileRef.current;
        if (!last || last.x !== grid.gridX || last.y !== grid.gridY) {
          if (tryPlacePixel(grid.gridX, grid.gridY)) {
            lastPaintedTileRef.current = { x: grid.gridX, y: grid.gridY };
          }
        }
      }
    } else {
      const t = transformRef.current;
      t.offsetX += e.clientX - lastPointerPosRef.current.x;
      t.offsetY += e.clientY - lastPointerPosRef.current.y;
      dirtyRef.current = true;
    }

    lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
  }, [screenToGrid, tryPlacePixel]);

  const handlePointerUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasPointerDown = isPointerDownRef.current;
    const button = dragButtonRef.current;
    
    isPointerDownRef.current = false;
    lastPaintedTileRef.current = null;

    if (wasPointerDown && button === 0 && !isShiftPressedRef.current) {
      const dx = Math.abs(e.clientX - lastPointerPosRef.current.x);
      const dy = Math.abs(e.clientY - lastPointerPosRef.current.y);
      if (dx < 3 && dy < 3) {
        const grid = screenToGrid(e.clientX, e.clientY);
        if (grid && grid.inBounds) {
          tryPlacePixel(grid.gridX, grid.gridY);
        }
      }
    }
  }, [screenToGrid, tryPlacePixel]);

  const zoomBy = useCallback((factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const t = transformRef.current;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));

    const worldX = (cx - t.offsetX) / t.scale;
    const worldY = (cy - t.offsetY) / t.scale;
    t.offsetX = cx - worldX * newScale;
    t.offsetY = cy - worldY * newScale;
    t.scale = newScale;

    dirtyRef.current = true;
    if (scaleLabelRef.current) { scaleLabelRef.current.textContent = `${Math.round(newScale * 100)}%`; }
  }, []);

  // ==========================================================================
  // Effects
  // ==========================================================================

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    chargesRef.current = charges;
    maxChargesRef.current = maxCharges;
  }, [charges, maxCharges]);

  useEffect(() => {
    let rafId: number;
    
    const updateCharges = () => {
      rafId = requestAnimationFrame(updateCharges);
      
      if (chargesRef.current >= maxChargesRef.current) {
        if (msUntilNextCharge !== 0) setMsUntilNextCharge(0);
        lastChargeRegenTimeRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const delta = now - lastChargeRegenTimeRef.current;
      
      if (delta >= CHARGE_REGEN_MS) {
        const gainedCharges = Math.floor(delta / CHARGE_REGEN_MS);
        const newCharges = Math.min(maxChargesRef.current, chargesRef.current + gainedCharges);
        
        setCharges(newCharges);
        lastChargeRegenTimeRef.current = now - (delta % CHARGE_REGEN_MS);
        setMsUntilNextCharge(CHARGE_REGEN_MS - (delta % CHARGE_REGEN_MS));
      } else {
        setMsUntilNextCharge(CHARGE_REGEN_MS - delta);
      }
    };

    rafId = requestAnimationFrame(updateCharges);
    return () => cancelAnimationFrame(rafId);
  }, [msUntilNextCharge]);

  useEffect(() => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: false });
    if (!offCtx) return;

    offscreenCanvasRef.current = offCanvas;
    offscreenCtxRef.current = offCtx;

    const imageData = offCtx.createImageData(width, height);
    const data32 = new Uint32Array(imageData.data.buffer);
    const bg = PALETTE_RGBA[0]; // white
    data32.fill(bg);
    pixelDataRef.current.fill(0);
    offCtx.putImageData(imageData, 0, 0);

    dirtyRef.current = true;
  }, [width, height]);

  useEffect(() => {
    let rafId: number;

    const render = () => {
      rafId = requestAnimationFrame(render);
      if (!dirtyRef.current) return;

      const view = viewCanvasRef.current;
      const off = offscreenCanvasRef.current;
      if (!view || !off) return;

      const ctx = view.getContext("2d");
      if (!ctx) return;

      const { scale, offsetX, offsetY } = transformRef.current;
      const dpr = window.devicePixelRatio || 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, view.width, view.height);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      
      ctx.drawImage(off, 0, 0);

      if (scale >= GRID_LINES_VISIBLE_FROM_SCALE) {
        ctx.strokeStyle = "oklch(from var(--border) l c h / 0.15)";
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        for (let gx = 0; gx <= width; gx++) { ctx.moveTo(gx, 0); ctx.lineTo(gx, height); }
        for (let gy = 0; gy <= height; gy++) { ctx.moveTo(0, gy); ctx.lineTo(width, gy); }
        ctx.stroke();
      }

      ctx.restore();
      dirtyRef.current = false;
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  useEffect(() => {
    const container = containerRef.current;
    const view = viewCanvasRef.current;
    if (!container || !view) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      view.width = rect.width * dpr;
      view.height = rect.height * dpr;
      view.style.width = `${rect.width}px`;
      view.style.height = `${rect.height}px`;
      dirtyRef.current = true;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftPressedRef.current = true; };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftPressedRef.current = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    authService.getSession().then((sess) => {
      setSession(sess);
      if (sess?.user) loadUserProfile(sess.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        loadUserProfile(sess.user.id);
        setIsAuthModalOpen(false);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string) => {
    const data = await userService.getProfile(userId);
    if (data) {
      setProfile({ username: data.username });
      setCharges(data.charges);
      setMaxCharges(data.max_charges);
    }
  };

  useEffect(() => {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: false });
    if (!offCtx) return;

    offscreenCanvasRef.current = offCanvas;
    offscreenCtxRef.current = offCtx;

    const imageData = offCtx.createImageData(width, height);
    const data32 = new Uint32Array(imageData.data.buffer);
    data32.fill(PALETTE_RGBA[0]); 
    pixelDataRef.current.fill(0);
    offCtx.putImageData(imageData, 0, 0);

    pixelService.loadAllPixels().then((dbPixels) => {
      dbPixels.forEach(({ x, y, color_idx }) => {
        const idx = y * width + x;
        pixelDataRef.current[idx] = color_idx;
        
        const single = offCtx.createImageData(1, 1);
        new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx];
        offCtx.putImageData(single, x, y);
      });
      dirtyRef.current = true;
    });

    const unsubscribe = pixelService.subscribeToPixels(({ x, y, color_idx }) => {
      const idx = y * width + x;
      pixelDataRef.current[idx] = color_idx;
      
      const single = offCtx.createImageData(1, 1);
      new Uint32Array(single.data.buffer)[0] = PALETTE_RGBA[color_idx];
      offCtx.putImageData(single, x, y);
      
      dirtyRef.current = true;
    });

    return () => unsubscribe();
  }, [width, height]);

  const regenProgressFactor = (CHARGE_REGEN_MS - msUntilNextCharge) / CHARGE_REGEN_MS;

  return (
    <div className={`relative flex h-full w-full flex-col font-sans ${className}`} style={{ background: 'var(--page-bg) fixed', color: 'var(--foreground)' }}>
      
      {/* ==================== CANVAS VIEW ==================== */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <canvas
          ref={viewCanvasRef}
          className="h-full w-full touch-none cursor-crosshair"
          onWheel={handleWheel}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* HUD: Left Info Pill */}
        <div className="pointer-events-none absolute top-4 left-4 glass flex items-center gap-3 px-3.5 py-2 text-xs font-mono text-[var(--foreground)]">
          <span className="flex items-center gap-1.5 border-r border-[var(--glass-border)] pr-3">
            <MousePointer2 className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span ref={coordsLabelRef}>—, —</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ZoomIn className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span ref={scaleLabelRef}>{Math.round(transformRef.current.scale * 100)}%</span>
          </span>
        </div>

        {/* HUD: Right Controls Info */}
        <div className="pointer-events-none absolute top-4 right-4 glass flex items-center gap-2 px-3.5 py-2 text-xs text-[var(--muted-foreground)]">
          <Move className="h-4 w-4" />
          <span>Колесо — зум · ЛКМ/СКМ перемещение · <span className="text-[var(--primary)] font-medium">Shift+Drag — рисовать</span></span>
        </div>

        {/* HUD: Floating Vertical Toolbar */}
        <div className="absolute right-4 bottom-24 glass flex flex-col overflow-hidden rounded-xl border border-[var(--glass-border)] z-20">
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

          {/* Theme Switcher Button */}
          <button 
            onClick={() => setIsDark(!isDark)} 
            className="p-3 text-[var(--accent)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors" 
            title={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
          >
            {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-600" />}
          </button>

          <div className="h-px w-full bg-[var(--glass-border)]" />

          {/* Shop Button */}
          <button 
            onClick={() => setIsShopOpen(true)} 
            className="p-3 text-[var(--primary)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg-strong)] transition-colors relative" 
            title="Магазин зарядов"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--accent)] animate-ping" />
          </button>
        </div>
      </div>

      {/* ==================== BOTTOM FLOATING BAR ==================== */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10 pointer-events-none">
        
        {/* Color Palette Popover Dropdown */}
        {isPaletteOpen && (
          <div className="pointer-events-auto mb-3 glass-strong p-4 rounded-2xl shadow-2xl border border-[var(--glass-border)] animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center justify-between mb-3 border-b border-[var(--glass-border)] pb-2">
              <span className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="h-4 w-4 text-[var(--primary)]" />
                Выберите цвет
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
                    setSelectedColorIndex(i);
                  }}
                  className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110 focus-ring ${
                    selectedColorIndex === i
                      ? "border-[var(--primary)] scale-110 ring-glow" 
                      : "border-[var(--glass-border)]"
                  }`}
                  style={{ backgroundColor: hex }}
                  title={`Цвет ${hex}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="glass-strong flex items-center justify-between gap-4 px-6 py-3.5 pointer-events-auto rounded-2xl">
          
          {/* Charges Indicator */}
          <div className="flex flex-col gap-1.5 min-w-[140px] border-r border-[var(--glass-border)] pr-5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider">
                <Zap className={`h-4 w-4 ${charges > 0 ? "text-[var(--accent)]" : "text-[var(--destructive)]"}`} />
                Заряды
              </span>
              <span className="font-retro8bit text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {charges === maxCharges ? "MAX" : `${charges}/${maxCharges}`}
              </span>
            </div>
            
            <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ease-out ${charges >= maxCharges ? "border-animated-rainbow" : "bg-[var(--accent)]"}`}
                style={{ 
                  width: `${charges >= maxCharges ? 100 : regenProgressFactor * 100}%`,
                  transition: charges < maxCharges ? 'none' : 'width 0.3s'
                }}
              />
            </div>
          </div>

          {/* Кнопка авторизации */}
          {session ? (
            <button 
              onClick={() => authService.signOut()} 
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--destructive)]/20 border border-[var(--glass-border)] transition-all"
            >
              <span className="text-sm font-medium">{profile?.username}</span>
              <span className="text-xs text-[var(--muted-foreground)]">(Выйти)</span>
            </button>
          ) : (
            <button 
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="text-sm font-bold">Войти / Регистрация</span>
            </button>
          )}

          {/* Palette Toggle Button */}
          <button
            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
            className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] transition-all active:scale-95"
          >
            <Palette className="h-5 w-5 text-[var(--primary)]" />
            <span className="text-sm font-medium">Палитра</span>
            <div 
              className="h-5 w-5 rounded-md border border-white/40 shadow-inner" 
              style={{ backgroundColor: PALETTE_HEX[selectedColorIndex] }} 
            />
          </button>

          {/* Info Badge */}
          <div className="pl-4 border-l border-[var(--glass-border)] text-center text-[var(--muted-foreground)]">
            <Info className="h-4 w-4 mx-auto mb-0.5 text-[var(--primary)]"/>
            <div className="text-[10px] leading-tight">wplace<br/>v0.3</div>
          </div>
        </div>
      </div>

      {/* ==================== AUTH MODAL ==================== */}
      {isAuthModalOpen && (
        <AuthModal 
          onClose={() => setIsAuthModalOpen(false)} 
          onSuccess={() => setIsAuthModalOpen(false)} 
        />
      )}

      {/* ==================== SHOP MODAL ==================== */}
      {isShopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
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
                <p className="text-xs text-[var(--muted-foreground)]">Прокачивайте свои возможности для рисования</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Item 1: Refill Charges */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--primary)]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <BatteryCharging className="h-6 w-6 text-[var(--accent)]" />
                  <div>
                    <div className="font-semibold text-sm">Полное восстановление</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Восполнить заряды до {maxCharges}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCharges(maxCharges);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  БЕСПЛАТНО
                </button>
              </div>

              {/* Item 2: Max Limit Upgrade */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--primary)]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <PlusCircle className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="font-semibold text-sm">+50 к Лимиту Зарядов</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Текущий максимум: {maxCharges}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMaxCharges(prev => prev + 50);
                    setCharges(prev => prev + 50);
                  }}
                  className="px-3 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  БЕСПЛАТНО
                </button>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
              На этапе бета-тестирования все улучшения бесплатны.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}