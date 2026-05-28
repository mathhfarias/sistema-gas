import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Flame, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { user, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('E-mail ou senha incorretos. Tente novamente.')
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Lado esquerdo - decorativo */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-700 via-brand-600 to-orange-500 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Círculos decorativos */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-32 -right-16 w-[500px] h-[500px] bg-white/5 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/3 rounded-full" />

        <div className="relative z-10 text-center">
          <div className="w-20 h-20 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Flame className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-4xl font-bold text-white mb-3">GásMaster</h1>
          <p className="text-brand-100 text-lg font-medium mb-8">Gestão completa para distribuidoras de GLP</p>
          <div className="grid grid-cols-2 gap-4 text-left max-w-sm mx-auto">
            {[
              'Controle de estoque em tempo real',
              'Gestão financeira completa',
              'Relatórios por forma de pagamento',
              'Controle de maquininhas',
            ].map(f => (
              <div key={f} className="flex items-start gap-2 bg-white/10 rounded-lg px-3 py-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-300 mt-1.5 shrink-0" />
                <p className="text-white/90 text-sm leading-snug">{f}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-orange-500 rounded-xl flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold text-slate-900">GásMaster</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-slate-900 mb-1">Entrar no sistema</h2>
          <p className="text-slate-500 text-sm mb-8">Acesse sua conta para continuar</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                placeholder="seu@email.com.br"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="label">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 text-danger-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full btn-lg mt-2"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando…
                </>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            GásMaster v1.0 · Gestão de Distribuidoras de GLP
          </p>
        </div>
      </div>
    </div>
  )
}
