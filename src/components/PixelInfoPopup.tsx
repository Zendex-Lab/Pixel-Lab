import { X, User, Clock, Brush } from 'lucide-react';
import type { PixelInfo } from '../services/pixelService';

interface PixelInfoPopupProps {
  x: number;
  y: number;
  loading: boolean;
  info: PixelInfo | null;
  paletteHex: string[];
  onClose: () => void;
  onPaint: () => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
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
    <div className="glass-strong flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 pointer-events-auto rounded-2xl shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 w-max">
      
      {/* Координаты */}
      <div className="flex flex-col gap-1.5 border-r border-[var(--glass-border)] pr-3 sm:pr-5 shrink-0 min-w-[90px] sm:min-w-[110px]">
        <span className="flex items-center gap-1.5 text-[10px] sm:text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wider">
          Пиксель
        </span>
        <span className="font-retro8bit text-base sm:text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {x}, {y}
        </span>
      </div>

      {/* Информация (Цвет, Автор, Время) */}
      <div className="flex items-center gap-3 sm:gap-5 border-r border-[var(--glass-border)] pr-3 sm:pr-5 min-w-[180px] sm:min-w-[220px]">
        {loading ? (
          <span className="text-sm text-[var(--muted-foreground)] font-medium px-2">Загрузка...</span>
        ) : info ? (
          <>
            <div
              className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl border border-[var(--glass-border)] shadow-inner shrink-0"
              style={{ backgroundColor: paletteHex[info.color_idx] ?? '#000' }}
              title={`Цвет #${info.color_idx}`}
            />
            <div className="flex flex-col gap-0.5 justify-center">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--foreground)]">
                <User className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <span className="truncate max-w-[130px]">{info.username ?? 'Аноним'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <Clock className="h-3 w-3" />
                <span>{formatTime(info.updated_at)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center px-2 text-sm text-[var(--muted-foreground)] font-medium">
            Ещё не закрашен
          </div>
        )}
      </div>

      {/* Кнопки действий */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onPaint}
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]"
        >
          <Brush className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="text-xs sm:text-sm">Рисовать тут</span>
        </button>
        <button
          onClick={onClose}
          className="p-2 sm:p-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] transition-all active:scale-95 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          title="Закрыть"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>
    </div>
  );
}