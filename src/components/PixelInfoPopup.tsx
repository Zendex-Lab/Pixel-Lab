import { X, User, Clock, Brush } from 'lucide-react'
import type { PixelInfo } from '../services/pixelService'

interface PixelInfoPopupProps {
  x: number
  y: number
  loading: boolean
  info: PixelInfo | null
  paletteHex: string[]
  onClose: () => void
  onPaint: () => void
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function PixelInfoPopup({
  x,
  y,
  loading,
  info,
  paletteHex,
  onClose,
  onPaint,
}: PixelInfoPopupProps) {
  return (
    <div className="pointer-events-auto flex flex-col sm:flex-row items-center gap-3 sm:gap-4 p-4 rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 w-[92vw] max-w-[480px] sm:w-auto">
      {/* Top/Left Section: Coords & Color swatch */}
      <div className="flex items-center gap-3 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 pb-3 sm:pb-0 sm:pr-4 shrink-0 justify-between sm:justify-start">
        <div className="flex items-center gap-2.5">
          <div
            className="h-9 w-9 rounded-2xl border-2 border-white dark:border-slate-800 shadow-md shrink-0 transition-transform hover:scale-105"
            style={{
              backgroundColor: info
                ? paletteHex[info.color_idx] ?? '#000'
                : '#E2E8F0',
            }}
            title={info ? `Цвет #${info.color_idx}` : 'Без цвета'}
          />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              Пиксель
            </span>
            <span className="font-mono text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
              {x}, {y}
            </span>
          </div>
        </div>

        {/* Close button for mobile inside top header */}
        <button
          onClick={onClose}
          className="flex sm:hidden h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Center Section: Info (User, Time, Alliance) */}
      <div className="flex flex-col justify-center gap-1 min-w-[140px] sm:min-w-[180px] w-full sm:w-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 animate-pulse">
            Загрузка информации...
          </div>
        ) : info ? (
          <>
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate max-w-[120px] sm:max-w-[140px]">
                {info.username ?? 'Аноним'}
              </span>
              {info.alliance_name && info.alliance_emoji && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/50 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 shrink-0">
                  <span>{info.alliance_emoji}</span>
                  <span className="truncate max-w-[70px]">
                    {info.alliance_name}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatTime(info.updated_at)}</span>
            </div>
          </>
        ) : (
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 italic">
            Еще не закрашен
          </span>
        )}
      </div>

      {/* Right Section: Action Buttons */}
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800">
        <button
          onClick={onPaint}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 h-10 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
        >
          <Brush className="h-4 w-4" />
          <span>Рисовать</span>
        </button>
        <button
          onClick={onClose}
          className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all shrink-0"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
