import { createPortal } from 'react-dom'
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react'

// ─── StatCard ───────────────────────────────────────────────
export function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', trend, onClick }) {
  const colors = {
    blue:   'bg-brand-50 text-brand-600',
    orange: 'bg-orange-50 text-orange-600',
    green:  'bg-success-50 text-success-600',
    red:    'bg-danger-50 text-danger-600',
    yellow: 'bg-warning-50 text-warning-600',
    gray:   'bg-slate-100 text-slate-500',
  }

  return (
    <div
      className={`stat-card ${onClick ? 'card-hover' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{title}</p>
          <p className="mt-1 text-2xl font-display font-bold text-slate-900 truncate">{value ?? '—'}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          {trend && (
            <p className={`mt-1 text-xs font-medium ${trend > 0 ? 'text-success-600' : 'text-danger-600'}`}>
              {trend > 0 ? '+' : ''}{trend}% vs ontem
            </p>
          )}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LoadingSpinner ──────────────────────────────────────────
export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return (
    <div className={`${sizes[size]} border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin ${className}`} />
  )
}

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-slate-400">Carregando…</p>
    </div>
  )
}

// ─── EmptyState ──────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-slate-400" />
        </div>
      )}
      <h3 className="font-semibold text-slate-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}

// ─── Alert ───────────────────────────────────────────────────
export function Alert({ type = 'info', title, message }) {
  const styles = {
    info:    { cls: 'bg-brand-50 text-brand-800 border-brand-200', Icon: Info },
    warning: { cls: 'bg-warning-50 text-warning-800 border-warning-200', Icon: AlertTriangle },
    error:   { cls: 'bg-danger-50 text-danger-800 border-danger-200', Icon: AlertTriangle },
    success: { cls: 'bg-success-50 text-success-800 border-success-200', Icon: CheckCircle },
  }
  const { cls, Icon } = styles[type] || styles.info
  return (
    <div className={`flex gap-3 p-3 rounded-xl border ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold text-sm">{title}</p>}
        {message && <p className="text-sm opacity-90 mt-0.5">{message}</p>}
      </div>
    </div>
  )
}

// ─── Badge (status de despesa) ────────────────────────────────
export function ExpenseBadge({ status }) {
  const map = {
    pending:   'badge-yellow',
    paid:      'badge-green',
    overdue:   'badge-red',
    cancelled: 'badge-gray',
  }
  const labels = { pending: 'Pendente', paid: 'Pago', overdue: 'Atrasado', cancelled: 'Cancelado' }
  return <span className={map[status] || 'badge-gray'}>{labels[status] || status}</span>
}

// ─── PageHeader ───────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── CurrencyInput ────────────────────────────────────────────
export function CurrencyInput({ value, onChange, className = '', placeholder = '0,00', ...props }) {
  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) { onChange(''); return }
    const num = (parseInt(raw, 10) / 100).toFixed(2)
    const formatted = parseFloat(num).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    onChange(formatted)
  }
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
      <input
        type="text"
        inputMode="numeric"
        className="input pl-8"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        {...props}
      />
    </div>
  )
}

// ─── SelectInput ──────────────────────────────────────────────
export function SelectInput({ label, value, onChange, options = [], placeholder, required, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="label">{label}{required && <span className="text-danger-600 ml-0.5">*</span>}</label>}
      <select
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── FormField ────────────────────────────────────────────────
export function FormField({ label, required, error, children }) {
  return (
    <div className="form-group">
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-danger-600 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-danger-600 mt-0.5">{error}</p>}
    </div>
  )
}
