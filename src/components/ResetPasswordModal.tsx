import { useState } from 'react';
import { X, Lock, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/authService';

interface ResetPasswordModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Shown when Supabase redirects the user back to the app after they click the
 * "reset password" link in their email (fires the `PASSWORD_RECOVERY` auth
 * event). At that point the user already has a valid — but purpose-limited —
 * session, so we can call `updateUser` directly without asking for the old
 * password.
 */
export default function ResetPasswordModal({ onClose, onSuccess }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const { error } = await authService.updatePassword(password);
      if (error) throw error;

      // Clean the recovery token out of the URL so it can't be reused /
      // re-triggered on refresh and doesn't linger in browser history.
      window.history.replaceState(null, '', window.location.pathname);

      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить пароль. Ссылка могла устареть — запросите новую.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-sm p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        {done && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <h3 className="text-xl font-display font-bold mb-6">Новый пароль</h3>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-sm">
              <CheckCircle2 className="h-5 w-5 text-[var(--primary)] shrink-0 mt-0.5" />
              <span>Пароль успешно обновлён. Теперь вы можете продолжить работу.</span>
            </div>
            <button
              type="button"
              onClick={onSuccess}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all"
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)] -mt-2 mb-4">
              Придумайте новый пароль для вашего аккаунта.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-[var(--destructive)]/20 border border-[var(--destructive)]/50 text-[var(--destructive-foreground)] text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Новый пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'Сохранение...' : 'Сохранить пароль'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
