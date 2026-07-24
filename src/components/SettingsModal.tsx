import { X, Moon, Sun, Grid3X3, Monitor } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
}

export default function SettingsModal({ onClose, isDark, setIsDark, showGrid, setShowGrid }: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-sm p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Настройки</h3>
            <p className="text-xs text-[var(--muted-foreground)]">Внешний вид и интерфейс</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Тема оформления */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="h-5 w-5 text-indigo-400" /> : <Sun className="h-5 w-5 text-amber-400" />}
              <span className="text-sm font-semibold">Тёмная тема</span>
            </div>
            <button
              onClick={() => setIsDark(!isDark)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isDark ? 'bg-[var(--primary)]' : 'bg-gray-400'}`}
            >
              <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${isDark ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Отображение сетки */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
            <div className="flex items-center gap-3">
              <Grid3X3 className="h-5 w-5 text-[var(--muted-foreground)]" />
              <div>
                <div className="text-sm font-semibold">Сетка пикселей</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">Видна при приближении</div>
              </div>
            </div>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`relative h-6 w-11 rounded-full transition-colors ${showGrid ? 'bg-[var(--primary)]' : 'bg-[var(--glass-border)]'}`}
            >
              <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${showGrid ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}