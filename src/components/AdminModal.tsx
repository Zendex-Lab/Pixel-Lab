import { useMemo, useState } from 'react'
import {
  X,
  Shield,
  RefreshCcw,
  Save,
  Paintbrush,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { userService } from '../services/userService'
import { pixelService } from '../services/pixelService'

interface AdminModalProps {
  onClose: () => void
  currentUserId: string
  onSuccess: () => void
  gridWidth: number
  gridHeight: number
  paletteHex: string[]
}

type Tab = 'stats' | 'moderation'

// Порог, начиная с которого перед заливкой требуется повторное подтверждение.
const CONFIRM_THRESHOLD_CELLS = 2000

export default function AdminModal({
  onClose,
  currentUserId,
  onSuccess,
  gridWidth,
  gridHeight,
  paletteHex,
}: AdminModalProps) {
  const [tab, setTab] = useState<Tab>('stats')

  // --- Накрутка статов ---
  const [targetId, setTargetId] = useState(currentUserId)
  const [charges, setCharges] = useState(100)
  const [maxCharges, setMaxCharges] = useState(100)
  const [status, setStatus] = useState<{
    msg: string
    type: 'success' | 'error'
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleUpdateStats = async () => {
    setIsLoading(true)
    setStatus(null)
    const success = await userService.updateAdminUserStats(
      targetId,
      charges,
      maxCharges,
    )
    if (success) {
      setStatus({ msg: 'Баланс успешно обновлен!', type: 'success' })
      if (targetId === currentUserId) onSuccess()
    } else {
      setStatus({ msg: 'Ошибка обновления баланса', type: 'error' })
    }
    setIsLoading(false)
  }

  const handleResetCooldown = async () => {
    setIsLoading(true)
    setStatus(null)
    const success = await userService.resetShopCooldown(targetId)
    if (success) {
      setStatus({ msg: 'Таймер магазина сброшен!', type: 'success' })
      if (targetId === currentUserId) onSuccess()
    } else {
      setStatus({ msg: 'Ошибка сброса таймера', type: 'error' })
    }
    setIsLoading(false)
  }

  // --- Модерация холста: заливка прямоугольной области ---
  const [minX, setMinX] = useState(0)
  const [minY, setMinY] = useState(0)
  const [maxX, setMaxX] = useState(Math.min(9, gridWidth - 1))
  const [maxY, setMaxY] = useState(Math.min(9, gridHeight - 1))
  const [fillColorIdx, setFillColorIdx] = useState(0)
  const [isFilling, setIsFilling] = useState(false)
  const [fillStatus, setFillStatus] = useState<{
    msg: string
    type: 'success' | 'error'
  } | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi)

  const boundsValid = minX <= maxX && minY <= maxY
  const cellCount = useMemo(() => {
    if (!boundsValid) return 0
    return (maxX - minX + 1) * (maxY - minY + 1)
  }, [minX, minY, maxX, maxY, boundsValid])

  const resetConfirm = () => setNeedsConfirm(false)

  const handleSelectAll = () => {
    setMinX(0)
    setMinY(0)
    setMaxX(gridWidth - 1)
    setMaxY(gridHeight - 1)
    resetConfirm()
  }

  const runFill = async () => {
    setIsFilling(true)
    setFillStatus(null)
    try {
      const affected = await pixelService.adminFillArea(
        minX,
        minY,
        maxX,
        maxY,
        fillColorIdx,
      )
      setFillStatus({ msg: `Залито ячеек: ${affected}`, type: 'success' })
    } catch (err) {
      setFillStatus({ msg: 'Ошибка заливки области', type: 'error' })
    } finally {
      setIsFilling(false)
      setNeedsConfirm(false)
    }
  }

  const handleFillClick = () => {
    if (!boundsValid || cellCount === 0) return

    if (cellCount > CONFIRM_THRESHOLD_CELLS && !needsConfirm) {
      setNeedsConfirm(true)
      return
    }

    void runFill()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-md p-6 rounded-3xl border border-red-500/30 shadow-[0_0_40px_rgba(220,38,38,0.15)] relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-white hover:bg-red-500/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-red-500/10 text-red-500">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-400">Админ-панель</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Прямое управление базой данных
            </p>
          </div>
        </div>

        {/* --- Табы --- */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
          <button
            onClick={() => setTab('stats')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'stats'
                ? 'bg-red-500/15 text-red-400'
                : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Save className="h-3.5 w-3.5" /> Накрутка
          </button>
          <button
            onClick={() => setTab('moderation')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'moderation'
                ? 'bg-red-500/15 text-red-400'
                : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Paintbrush className="h-3.5 w-3.5" /> Модерация
          </button>
        </div>

        {tab === 'stats' && (
          <div className="space-y-4">
            {status && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
              >
                {status.msg}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-[var(--muted-foreground)] font-medium">
                ID Пользователя (Target UID)
              </label>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  Новые Заряды
                </label>
                <input
                  type="number"
                  value={charges}
                  onChange={(e) => setCharges(Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  Новый Макс. Лимит
                </label>
                <input
                  type="number"
                  value={maxCharges}
                  onChange={(e) => setMaxCharges(Number(e.target.value))}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
            </div>

            <button
              onClick={handleUpdateStats}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 font-bold border border-red-500/30 hover:bg-red-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Сохранить статы
            </button>

            <div className="h-px w-full bg-[var(--glass-border)] my-2" />

            <button
              onClick={handleResetCooldown}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--glass-bg)] text-[var(--foreground)] font-semibold border border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCcw className="h-4 w-4" /> Сбросить таймер магазина
            </button>
          </div>
        )}

        {tab === 'moderation' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              Заливка прямоугольной области холста. Без учёта зарядов и
              кулдауна. Координаты: X от 0 до {gridWidth - 1}, Y от 0 до{' '}
              {gridHeight - 1}.
            </p>

            {fillStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${fillStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
              >
                {fillStatus.msg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  X от
                </label>
                <input
                  type="number"
                  value={minX}
                  onChange={(e) => {
                    setMinX(clamp(Number(e.target.value), 0, gridWidth - 1))
                    resetConfirm()
                  }}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  X до
                </label>
                <input
                  type="number"
                  value={maxX}
                  onChange={(e) => {
                    setMaxX(clamp(Number(e.target.value), 0, gridWidth - 1))
                    resetConfirm()
                  }}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  Y от
                </label>
                <input
                  type="number"
                  value={minY}
                  onChange={(e) => {
                    setMinY(clamp(Number(e.target.value), 0, gridHeight - 1))
                    resetConfirm()
                  }}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--muted-foreground)] font-medium">
                  Y до
                </label>
                <input
                  type="number"
                  value={maxY}
                  onChange={(e) => {
                    setMaxY(clamp(Number(e.target.value), 0, gridHeight - 1))
                    resetConfirm()
                  }}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
                />
              </div>
            </div>

            <button
              onClick={handleSelectAll}
              className="w-full py-2 rounded-xl bg-[var(--glass-bg)] text-xs font-semibold text-[var(--muted-foreground)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] transition-all"
            >
              Выбрать весь холст
            </button>

            {!boundsValid && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> "От" не может
                быть больше "До"
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-[var(--muted-foreground)] font-medium">
                Цвет заливки
              </label>
              <div className="grid grid-cols-8 gap-2">
                {paletteHex.map((hex, idx) => (
                  <button
                    key={hex + idx}
                    onClick={() => {
                      setFillColorIdx(idx)
                      resetConfirm()
                    }}
                    title={hex}
                    className={`aspect-square rounded-lg border-2 transition-all ${
                      fillColorIdx === idx
                        ? 'border-red-400 scale-110'
                        : 'border-[var(--glass-border)] hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] px-1">
              <span>Ячеек к заливке:</span>
              <span className="font-semibold text-[var(--foreground)]">
                {boundsValid ? cellCount : '—'}
              </span>
            </div>

            <button
              onClick={handleFillClick}
              disabled={isFilling || !boundsValid || cellCount === 0}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold border transition-all active:scale-95 disabled:opacity-50 ${
                needsConfirm
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25'
                  : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
              }`}
            >
              {isFilling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Заливка...
                </>
              ) : needsConfirm ? (
                <>
                  <AlertTriangle className="h-4 w-4" /> Точно? Нажмите ещё раз (
                  {cellCount} ячеек)
                </>
              ) : (
                <>
                  <Paintbrush className="h-4 w-4" /> Залить область
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
