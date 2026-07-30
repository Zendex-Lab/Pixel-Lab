import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Status = 'checking' | 'ok' | 'error'

/**
 * Route: /auth/confirm
 *
 * Reached via the "confirm your email" link. Supabase verifies the token
 * and establishes a session before redirecting here — we just wait for
 * that session to appear, show a short confirmation, then send the user
 * back to the app.
 */
export default function AuthConfirmPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const searchParams = new URLSearchParams(window.location.search)
    if (hashParams.get('error') || searchParams.get('error')) {
      setStatus('error')
      return
    }

    let settled = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        settled = true
        setStatus('ok')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true
        setStatus('ok')
      }
    })

    const timeout = setTimeout(() => {
      if (!settled) setStatus('error')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (status === 'ok') {
      window.history.replaceState(null, '', '/auth/confirm')
      const t = setTimeout(() => navigate({ to: '/' }), 1500)
      return () => clearTimeout(t)
    }
  }, [status, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="glass-strong w-full max-w-sm p-6 rounded-3xl border border-[var(--glass-border)] shadow-2xl text-center">
        {status === 'checking' && (
          <p className="text-sm text-[var(--muted-foreground)]">
            Подтверждаем почту...
          </p>
        )}
        {status === 'ok' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-[var(--primary)]" />
            <p className="font-bold">Почта подтверждена!</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Переходим на сайт...
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--destructive)]/20 border border-[var(--destructive)]/50 text-sm text-left">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>Ссылка недействительна или истекла.</span>
            </div>
            <button
              onClick={() => navigate({ to: '/' })}
              className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-3 rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all"
            >
              На главную
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
