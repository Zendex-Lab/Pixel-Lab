import { useRef } from 'react'
import { X, ImagePlus, Trash2, Eye, EyeOff, Link, Link2Off } from 'lucide-react'
import type { UseTemplateOverlayReturn } from './useTemplateOverlay'

interface TemplateOverlayModalProps {
  onClose: () => void
  overlay: UseTemplateOverlayReturn
  gridWidth: number
  gridHeight: number
}

export default function TemplateOverlayModal({
  onClose,
  overlay,
  gridWidth,
  gridHeight,
}: TemplateOverlayModalProps) {
  const {
    state,
    loadImageFile,
    setPosition,
    setSize,
    setOpacity,
    setLockAspect,
    toggleEnabled,
    clear,
  } = overlay
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-md p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <ImagePlus className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Шаблон-подсказка</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Наложите фото поверх канваса, чтобы рисовать по нему
            </p>
          </div>
        </div>

        {!state.hasImage ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border-2 border-dashed border-[var(--glass-border)] hover:border-[var(--primary)] hover:bg-[var(--glass-bg)] transition-colors text-[var(--muted-foreground)]"
          >
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-medium">Загрузить изображение</span>
          </button>
        ) : (
          <div className="space-y-5">
            {/* Видимость / удаление */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleEnabled}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] text-sm font-medium transition-colors"
              >
                {state.enabled ? (
                  <>
                    <Eye className="h-4 w-4" /> Показан
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" /> Скрыт
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  clear()
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="p-2.5 rounded-xl bg-[var(--glass-bg)] hover:bg-red-500/10 hover:text-red-500 transition-colors"
                title="Удалить шаблон"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Позиция */}
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block">
                Позиция на канвасе
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--glass-bg)]">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    X
                  </span>
                  <input
                    type="number"
                    value={state.x}
                    min={0}
                    max={gridWidth - 1}
                    onChange={(e) =>
                      setPosition(Number(e.target.value), state.y)
                    }
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--glass-bg)]">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Y
                  </span>
                  <input
                    type="number"
                    value={state.y}
                    min={0}
                    max={gridHeight - 1}
                    onChange={(e) =>
                      setPosition(state.x, Number(e.target.value))
                    }
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Размер */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--muted-foreground)]">
                  Размер (в клетках)
                </label>
                <button
                  onClick={() => setLockAspect(!state.lockAspect)}
                  className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  title={
                    state.lockAspect
                      ? 'Пропорции зафиксированы'
                      : 'Пропорции свободны'
                  }
                >
                  {state.lockAspect ? (
                    <Link className="h-3.5 w-3.5" />
                  ) : (
                    <Link2Off className="h-3.5 w-3.5" />
                  )}
                  {state.lockAspect ? 'Пропорции' : 'Свободно'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--glass-bg)]">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Ш
                  </span>
                  <input
                    type="number"
                    value={state.width}
                    min={1}
                    onChange={(e) =>
                      setSize(Number(e.target.value), state.height)
                    }
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--glass-bg)]">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    В
                  </span>
                  <input
                    type="number"
                    value={state.height}
                    min={1}
                    disabled={state.lockAspect}
                    onChange={(e) =>
                      setSize(state.width, Number(e.target.value))
                    }
                    className="w-full bg-transparent text-sm outline-none disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Прозрачность */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[var(--muted-foreground)]">
                  Прозрачность
                </label>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {Math.round(state.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={state.opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) loadImageFile(file)
          }}
        />
      </div>
    </div>
  )
}
