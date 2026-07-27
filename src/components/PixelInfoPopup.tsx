import { X, User, Clock, Palette, Brush } from 'lucide-react';
import type { PixelInfo } from '../services/pixelService';
import { userService } from '../services/userService'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 p-4">
      <div className="glass-strong w-full max-w-xs p-5 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-base font-display font-bold mb-4">
          Пиксель ({x}, {y})
        </h3>

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Загрузка...</p>
        ) : info ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
              <span
                className="h-4 w-4 rounded border border-[var(--glass-border)] shrink-0"
                style={{ backgroundColor: paletteHex[info.color_idx] ?? '#000' }}
              />
              <span className="text-[var(--muted-foreground)]">Цвет #{info.color_idx}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
              <span>{info.username ?? 'неизвестный пользователь'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
              <span className="text-[var(--muted-foreground)]">
                {formatTime(info.updated_at)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            Этот пиксель ещё никто не закрашивал.
          </p>
        )}

        <button
          type="button"
          onClick={onPaint}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-[var(--primary)] text-[var(--primary-foreground)] py-2.5 rounded-xl font-bold text-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Brush className="h-4 w-4" />
          Рисовать
        </button>
      </div>
    </div>
  );
}
