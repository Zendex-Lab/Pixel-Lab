import { useState } from "react";
import { X, Shield, RefreshCcw, Save, Zap } from "lucide-react";
import { userService } from "../services/userService";

interface AdminModalProps {
  onClose: () => void;
  currentUserId: string;
  onSuccess: () => void; // Вызывается после успешного действия, чтобы обновить стейт
}

export default function AdminModal({ onClose, currentUserId, onSuccess }: AdminModalProps) {
  const [targetId, setTargetId] = useState(currentUserId);
  const [charges, setCharges] = useState(100);
  const [maxCharges, setMaxCharges] = useState(100);
  const [status, setStatus] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateStats = async () => {
    setIsLoading(true);
    setStatus(null);
    const success = await userService.updateAdminUserStats(targetId, charges, maxCharges);
    if (success) {
      setStatus({ msg: "Баланс успешно обновлен!", type: 'success' });
      if (targetId === currentUserId) onSuccess();
    } else {
      setStatus({ msg: "Ошибка обновления баланса", type: 'error' });
    }
    setIsLoading(false);
  };

  const handleResetCooldown = async () => {
    setIsLoading(true);
    setStatus(null);
    const success = await userService.resetShopCooldown(targetId);
    if (success) {
      setStatus({ msg: "Таймер магазина сброшен!", type: 'success' });
      if (targetId === currentUserId) onSuccess();
    } else {
      setStatus({ msg: "Ошибка сброса таймера", type: 'error' });
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-md p-6 rounded-3xl border border-red-500/30 shadow-[0_0_40px_rgba(220,38,38,0.15)] relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-white hover:bg-red-500/20 transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-red-500/10 text-red-500">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-400">Админ-панель</h3>
            <p className="text-xs text-[var(--muted-foreground)]">Прямое управление базой данных</p>
          </div>
        </div>

        {status && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-semibold ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {status.msg}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--muted-foreground)] font-medium">ID Пользователя (Target UID)</label>
            <input 
              type="text" 
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--muted-foreground)] font-medium">Новые Заряды</label>
              <input 
                type="number" 
                value={charges}
                onChange={(e) => setCharges(Number(e.target.value))}
                className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-red-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--muted-foreground)] font-medium">Новый Макс. Лимит</label>
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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 font-bold border border-red-500/30 hover:bg-red-500/20 transition-all active:scale-95"
          >
            <Save className="h-4 w-4" /> Сохранить статы
          </button>

          <div className="h-px w-full bg-[var(--glass-border)] my-2" />

          <button 
            onClick={handleResetCooldown}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--glass-bg)] text-[var(--foreground)] font-semibold border border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] transition-all active:scale-95"
          >
            <RefreshCcw className="h-4 w-4" /> Сбросить таймер магазина
          </button>
        </div>
      </div>
    </div>
  );
}