import { X, Moon, Sun, Grid3X3, Monitor, Info, Sparkles, Heart } from 'lucide-react'

interface SettingsModalProps {
  onClose: () => void
  isDark: boolean
  setIsDark: (dark: boolean) => void
  showGrid: boolean
  setShowGrid: (show: boolean) => void
  enableBlinking?: boolean
  setEnableBlinking?: (enable: boolean) => void
}

export default function SettingsModal({
  onClose,
  isDark,
  setIsDark,
  showGrid,
  setShowGrid,
  enableBlinking = true,
  setEnableBlinking,
}: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
      <div className="bg-white/95 dark:bg-slate-900/95 w-full max-w-md p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xl relative backdrop-blur-xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Настройки</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Персонализация и параметры отображения
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Section: Персонализация */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
              Персонализация
            </div>
            <div className="space-y-2.5">
              {/* Тёмная тема */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800">
                    {isDark ? (
                      <Moon className="h-4 w-4 text-indigo-400" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Тёмная тема
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Переключение светлого/тёмного интерфейса
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDark(!isDark)}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    isDark ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                      isDark ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Сетка пикселей */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800">
                    <Grid3X3 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Сетка пикселей
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Видна при приближении холста
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                    showGrid ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                      showGrid ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Анимация мигания черновиков */}
              {setEnableBlinking && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Мигание черновиков
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Анимация закрашивания до подтверждения
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setEnableBlinking(!enableBlinking)}
                    className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                      enableBlinking ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                        enableBlinking ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section: О сайте */}
          <div className="pt-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
              О сайте
            </div>
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 dark:from-indigo-500/10 dark:via-purple-500/10 dark:to-pink-500/10">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                  <Info className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Pixel Lab
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold font-mono">
                      v0.7.5
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                    By Zendex Lab, ООО "БРОТИШКА БРО", Sonic Junction Team
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
