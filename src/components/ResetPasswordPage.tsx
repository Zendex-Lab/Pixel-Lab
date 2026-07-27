import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { authService } from '../services/authService'

const MIN_PASSWORD_LENGTH = 8

type Status = 'checking' | 'ready' | 'invalid' | 'done'

/**
 * Route: /auth/reset-password
 *
 * Reached only via the link in the reset-password email. Supabase attaches
 * a recovery token to the URL; supabase-js consumes it automatically and
 * fires a PASSWORD_RECOVERY auth event once the session is established.
 * We wait for that event before showing the "set new password" form —
 * this avoids ever calling updateUser() without a genuine recovery session.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // If the link was already used, expired, or tampered with, Supabase
    // redirects back with an error in the URL instead of a valid token.
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const searchParams = new URLSearchParams(window.location.search)
    if (hashParams.get('error') || searchParams.get('error')) {
      setStatus('invalid')
      return
    }

    let settled = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: any) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setStatus('ready')
      }
    })

    // Fallback in case the event fired a tick before this listener attached.
    supabase.auth.getSession().then(({ data }: any) => {
      if (!settled && data.session) {
        settled = true
        setStatus('ready')
      }
    })

    const timeout = setTimeout(() => {
      if (!settled) setStatus('invalid')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`,
      )
      return
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      const { error } = await authService.updatePassword(password)
      if (error) throw error

      // Strip the recovery token from the URL so it can't be replayed.
      window.history.replaceState(null, '', '/auth/reset-password')
      setStatus('done')
    } catch (err: any) {
      setError(
        err?.message ||
          'Не удалось обновить пароль. Ссылка могла устареть — запросите новую.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="glass-strong w-full max-w-sm p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl">
        <h1 className="text-xl font-display font-bold mb-6">Новый пароль</h1>

        {status === 'checking' && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Проверяем ссылку...
          </p>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--destructive)]/20 border border-[var(--destructive)]/50 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>
                Ссылка недействительна или истекла. Запросите новую в окне
                входа.
              </span>
            </div>
            <button
              onClick={() => navigate({ to: '/' })}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all"
            >
              На главную
            </button>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-sm">
              <CheckCircle2 className="h-5 w-5 text-[var(--primary)] shrink-0 mt-0.5" />
              <span>Пароль успешно обновлён.</span>
            </div>
            <button
              onClick={() => navigate({ to: '/' })}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all"
            >
              На главную
            </button>
          </div>
        )}

        {status === 'ready' && (
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
  )
}
