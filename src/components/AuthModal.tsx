import { useState } from 'react';
import { X, Mail, Lock, User, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/authService';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = 'login' | 'signup' | 'forgot';

const RESET_COOLDOWN_SECONDS = 30;

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // --- "Forgot password" view state ---
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const isLogin = mode === 'login';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const { error } = await authService.signIn(email, password);
        if (error) throw error;
      } else {
        const { error } = await authService.signUp(email, password, username);
        if (error) throw error;
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetCooldown > 0) return;

    setLoading(true);
    setError('');

    try {
      // Supabase does not reveal whether the address is registered — the
      // response is intentionally generic to avoid leaking account existence.
      await authService.resetPasswordForEmail(email.trim());
      setResetSent(true);
      setResetCooldown(RESET_COOLDOWN_SECONDS);
      const timer = setInterval(() => {
        setResetCooldown((s) => {
          if (s <= 1) {
            clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err: any) {
      // Even on a real error we keep the message generic — no hints about
      // whether the account exists, just that something went wrong.
      setError('Не удалось отправить письмо. Попробуйте ещё раз позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-sm p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => {
              switchMode('login');
              setResetSent(false);
            }}
            className="mb-4 flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Назад ко входу
          </button>
        )}

        <h3 className="text-xl font-display font-bold mb-6">
          {mode === 'login' && 'Вход в Pixel Lab'}
          {mode === 'signup' && 'Регистрация'}
          {mode === 'forgot' && 'Восстановление пароля'}
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--destructive)]/20 border border-[var(--destructive)]/50 text-[var(--destructive-foreground)] text-sm">
            {error}
          </div>
        )}

        {mode === 'forgot' ? (
          resetSent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-sm">
                <CheckCircle2 className="h-5 w-5 text-[var(--primary)] shrink-0 mt-0.5" />
                <span>
                  Если аккаунт с адресом <b>{email}</b> существует, на него отправлено письмо
                  со ссылкой для сброса пароля. Проверьте папку «Спам», если письма нет
                  несколько минут.
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetRequest}
                disabled={resetCooldown > 0 || loading}
                className="w-full text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
              >
                {resetCooldown > 0
                  ? `Отправить снова через ${resetCooldown} сек`
                  : 'Отправить письмо повторно'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <p className="text-sm text-[var(--muted-foreground)] -mt-2 mb-2">
                Введите email, указанный при регистрации — мы пришлём ссылку для сброса пароля.
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading || resetCooldown > 0}
                className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'Отправка...' : 'Отправить ссылку'}
              </button>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="Никнейм"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                <input
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--glass-border)] rounded-xl py-2.5 pl-10 pr-4 focus-ring text-sm"
                />
              </div>

              {isLogin && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="block text-xs text-[var(--primary)] hover:underline -mt-2"
                >
                  Забыли пароль?
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'Загрузка...' : isLogin ? 'Войти' : 'Создать аккаунт'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
              {isLogin ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
              <button
                type="button"
                onClick={() => switchMode(isLogin ? 'signup' : 'login')}
                className="text-[var(--primary)] hover:underline font-medium"
              >
                {isLogin ? 'Зарегистрироваться' : 'Войти'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}