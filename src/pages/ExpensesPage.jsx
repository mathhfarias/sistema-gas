import { useState, useEffect, useMemo } from 'react'
import { Plus, CheckCircle, AlertTriangle, Clock, DollarSign, Trash2, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal, ExpenseBadge } from '../components/ui'
import { formatCurrency, parseCurrency, maskCurrency, EXPENSE_CATEGORIES, PAYMENT_TYPES } from '../utils/format'

const RECURRENCES = [
  { value: 'none', label: 'Sem recorrência' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal (15 em 15 dias)' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

const CATEGORY_OPTS = Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label }))

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Fev' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Abr' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Ago' },
  { value: 9, label: 'Set' },
  { value: 10, label: 'Out' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dez' },
]

const YEAR_OPTIONS = [2026, 2027, 2028, 2029, 2030]

function buildDefaultDateFilter() {
  const today = new Date()
  return {
    month: today.getMonth() + 1,
    year: YEAR_OPTIONS.includes(today.getFullYear()) ? today.getFullYear() : YEAR_OPTIONS[0],
  }
}

function getDateFilterLabel(filter, showAll) {
  if (showAll) return 'todos os períodos'
  const monthLabel = MONTH_OPTIONS.find(m => m.value === Number(filter.month))?.label || 'Mês'
  return `${monthLabel}/${filter.year}`
}

function matchesDateFilter(dateValue, filter) {
  if (!dateValue) return false
  const [year, month] = String(dateValue).slice(0, 10).split('-').map(Number)
  return year === Number(filter.year) && month === Number(filter.month)
}

function parseDateOnly(dateValue) {
  const [year, month, day] = String(dateValue || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatExpenseDay(dateValue) {
  const date = parseDateOnly(dateValue)
  if (!date) return 'Sem data'
  const label = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function groupExpensesByDate(expenses) {
  const grouped = expenses.reduce((acc, exp) => {
    const key = String(exp.due_date || 'sem-data').slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(exp)
    return acc
  }, {})

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }))
}

function recurrenceLabel(value) {
  if (!value || value === 'none') return null
  return RECURRENCES.find(r => r.value === value)?.label || value
}

export default function ExpensesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState(buildDefaultDateFilter())
  const [showAllMonths, setShowAllMonths] = useState(false)

  const { data: expenses, loading, refetch } = useSupabaseQuery(
    () => supabase
      .from('expenses')
      .select('*, payment_methods(name, type)')
      .eq('company_id', companyId)
      .order('due_date'),
    [companyId]
  )

  const { data: paymentMethods } = useSupabaseQuery(
    () => supabase
      .from('payment_methods')
      .select('id, name, type, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name'),
    [companyId]
  )

  if (loading) return <PageLoader />

  const list = expenses || []
  const periodList = list.filter(e => matchesDateFilter(e.due_date, dateFilter))
  const overdueOutsidePeriod = list.filter(e =>
    e.status === 'overdue' && !matchesDateFilter(e.due_date, dateFilter)
  )
  const overdueOutsideIds = new Set(overdueOutsidePeriod.map(e => e.id))
  const dateFilteredList = showAllMonths
    ? list
    : [...periodList, ...overdueOutsidePeriod].filter((item, index, arr) =>
        arr.findIndex(exp => exp.id === item.id) === index
      )

  const filtered = filter === 'all' ? dateFilteredList : dateFilteredList.filter(e => e.status === filter)
  const groupedExpenses = groupExpensesByDate(filtered)

  const totalPending = dateFilteredList.filter(e => ['pending','overdue'].includes(e.status)).reduce((s, e) => s + Number(e.amount), 0)
  const totalPaid = periodList.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.paid_amount || e.amount), 0)
  const overdue = dateFilteredList.filter(e => e.status === 'overdue')
  const overdueOutsideTotal = overdueOutsidePeriod.reduce((s, e) => s + Number(e.amount), 0)

  async function markAsPaid(exp) {
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: exp.amount })
      .eq('id', exp.id)
    if (error) { toast.error('Erro ao marcar como pago'); return }

    if (exp.recurrence && exp.recurrence !== 'none') {
      const due = parseDateOnly(exp.due_date) || new Date(exp.due_date)
      if (exp.recurrence === 'weekly')    due.setDate(due.getDate() + 7)
      if (exp.recurrence === 'biweekly')  due.setDate(due.getDate() + 15)
      if (exp.recurrence === 'monthly')   due.setMonth(due.getMonth() + 1)
      if (exp.recurrence === 'yearly')    due.setFullYear(due.getFullYear() + 1)

      await supabase.from('expenses').insert({
        company_id: exp.company_id,
        name: exp.name,
        category: exp.category,
        amount: exp.amount,
        due_date: due.toISOString().split('T')[0],
        recurrence: exp.recurrence,
        notes: exp.notes,
        payment_method_id: exp.payment_method_id || null,
        status: 'pending',
        created_by: exp.created_by,
      })
      toast.success('Pago! Próxima parcela criada automaticamente.')
    } else {
      toast.success('Marcado como pago!')
    }
    refetch()
  }

  async function deleteExpense(exp) {
    if (!confirm(`Excluir "${exp.name}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', exp.id)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Despesa excluída!')
    refetch()
  }

  function openEdit(exp) { setEditing(exp); setShowModal(true) }
  function openNew() { setEditing(null); setShowModal(true) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despesas"
        subtitle={`Controle de contas a pagar — ${getDateFilterLabel(dateFilter, showAllMonths)}`}
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Despesa
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card border-l-4 border-l-warning-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">A Pagar</p>
          <p className="text-2xl font-display font-bold text-warning-700 mt-1">{formatCurrency(totalPending)}</p>
        </div>
        <div className="card border-l-4 border-l-success-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pago (mês)</p>
          <p className="text-2xl font-display font-bold text-success-700 mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="card border-l-4 border-l-danger-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Em Atraso</p>
          <p className="text-2xl font-display font-bold text-danger-700 mt-1">{overdue.length}</p>
        </div>
      </div>

      {!showAllMonths && overdueOutsidePeriod.length > 0 && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-semibold text-danger-800">
                Existem {overdueOutsidePeriod.length} despesa(s) atrasada(s) fora de {getDateFilterLabel(dateFilter, false)}
              </p>
              <p className="text-sm text-danger-700 mt-0.5">
                Total em atraso de meses anteriores: {formatCurrency(overdueOutsideTotal)}. Elas foram incluídas automaticamente nesta tela para não passarem despercebidas.
              </p>
            </div>
          </div>
          <button
            className="btn-danger btn-sm shrink-0"
            onClick={() => setFilter('overdue')}
          >
            Ver atrasadas
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="form-group">
              <label className="label">Mês</label>
              <select
                className="input"
                value={dateFilter.month}
                onChange={e => { setDateFilter(prev => ({ ...prev, month: Number(e.target.value) })); setShowAllMonths(false) }}
              >
                {MONTH_OPTIONS.map(month => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Ano</label>
              <select
                className="input"
                value={dateFilter.year}
                onChange={e => { setDateFilter(prev => ({ ...prev, year: Number(e.target.value) })); setShowAllMonths(false) }}
              >
                {YEAR_OPTIONS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={!showAllMonths ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setShowAllMonths(false)}>
              Ver período
            </button>
            <button className={showAllMonths ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setShowAllMonths(true)}>
              Ver todos
            </button>
            <button className="btn-outline btn-sm" onClick={() => { setDateFilter(buildDefaultDateFilter()); setShowAllMonths(false) }}>
              Mês atual
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'pending', label: 'Pendentes' },
          { key: 'overdue', label: 'Atrasadas' },
          { key: 'paid', label: 'Pagas' },
        ].map(f => (
          <button
            key={f.key}
            className={filter === f.key ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title={showAllMonths ? 'Nenhuma despesa encontrada' : `Nenhuma despesa em ${getDateFilterLabel(dateFilter, false)}`}
          action={<button className="btn-primary btn-sm" onClick={openNew}><Plus className="w-3.5 h-3.5" /> Nova Despesa</button>}
        />
      ) : (
        <div className="card space-y-7">
          {groupedExpenses.map(({ date, items }) => (
            <div key={date} className="border-b border-slate-100 last:border-b-0 pb-6 last:pb-0">
              <h3 className="font-display font-bold text-lg text-slate-900 mb-4">
                {formatExpenseDay(date)}
              </h3>
              <div className="space-y-2.5">
                {items.map(exp => (
                  <ExpenseTimelineCard
                    key={exp.id}
                    exp={exp}
                    isOutsidePeriod={overdueOutsideIds.has(exp.id) && !showAllMonths}
                    onEdit={() => openEdit(exp)}
                    onPaid={() => markAsPaid(exp)}
                    onDelete={() => deleteExpense(exp)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExpenseModal
        key={editing?.id || 'new'}
        open={showModal}
        editing={editing}
        companyId={companyId}
        userId={profile?.id}
        paymentMethods={paymentMethods || []}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSuccess={() => { setShowModal(false); setEditing(null); refetch() }}
      />
    </div>
  )
}

function ExpenseTimelineCard({ exp, isOutsidePeriod = false, onEdit, onPaid, onDelete }) {
  const isOverdue = exp.status === 'overdue'
  const isPending = exp.status === 'pending'
  const isPaid = exp.status === 'paid'
  const recurrence = recurrenceLabel(exp.recurrence)
  const categoryLabel = EXPENSE_CATEGORIES[exp.category] || exp.category || 'Despesa'

  return (
    <div className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center gap-3 ${
      isOverdue ? 'bg-danger-50/60 border-danger-100' :
      isPaid ? 'bg-success-50/50 border-success-100' :
      'bg-warning-50/70 border-warning-100'
    }`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
        isOverdue ? 'bg-danger-100 text-danger-600' :
        isPaid ? 'bg-success-100 text-success-600' :
        'bg-white text-orange-600'
      }`}>
        {isPaid ? <CheckCircle className="w-5 h-5" /> : isOverdue ? <AlertTriangle className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display font-semibold text-slate-900 truncate">{exp.name}</p>
          <ExpenseBadge status={exp.status} />
          <span className="text-xs font-medium text-orange-700">{categoryLabel}</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Vencimento: {formatExpenseDay(exp.due_date)}
          {isOutsidePeriod ? ' · Atrasada de mês anterior' : ''}
          {exp.payment_methods?.name ? ` · ${exp.payment_methods.name}` : ''}
          {recurrence ? ` · ${recurrence}` : ''}
          {exp.notes ? ` · ${exp.notes}` : ''}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:justify-end">
        <p className="font-display font-bold text-slate-900 text-lg md:min-w-[120px] md:text-right">
          {formatCurrency(exp.amount)}
        </p>
        <div className="flex gap-1.5 justify-end">
          <button className="btn-outline btn-sm" onClick={onEdit}>Editar</button>
          {isPending || isOverdue ? (
            <button className="btn-success btn-sm" onClick={onPaid}>
              <CheckCircle className="w-3.5 h-3.5" /> Pagar
            </button>
          ) : null}
          <button className="btn-danger btn-sm" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ExpenseModal({ open, editing, companyId, userId, paymentMethods = [], onClose, onSuccess }) {
  const [name, setName] = useState(editing?.name || '')
  const [category, setCategory] = useState(editing?.category || 'other')
  const [amount, setAmount] = useState(editing ? editing.amount.toFixed(2).replace('.', ',') : '')
  const [dueDate, setDueDate] = useState(editing?.due_date || '')
  const [recurrence, setRecurrence] = useState(editing?.recurrence || 'none')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [paymentMethodId, setPaymentMethodId] = useState(editing?.payment_method_id || '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (editing) {
      setName(editing.name || '')
      setCategory(editing.category || 'other')
      setAmount(editing.amount?.toFixed(2).replace('.', ',') || '')
      setDueDate(editing.due_date || '')
      setRecurrence(editing.recurrence || 'none')
      setPaymentMethodId(editing.payment_method_id || '')
      setNotes(editing.notes || '')
    } else {
      setName('')
      setCategory('other')
      setAmount('')
      setDueDate('')
      setRecurrence('none')
      setPaymentMethodId('')
      setNotes('')
    }
  }, [editing, open])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      company_id: companyId,
      name, category,
      amount: parseCurrency(amount),
      due_date: dueDate,
      recurrence, notes,
      payment_method_id: paymentMethodId || null,
      created_by: userId,
    }

    const { error } = editing
      ? await supabase.from('expenses').update(payload).eq('id', editing.id)
      : await supabase.from('expenses').insert(payload)

    setSubmitting(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(editing ? 'Despesa atualizada!' : 'Despesa cadastrada!')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Despesa' : 'Nova Despesa'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-group">
          <label className="label">Nome da despesa *</label>
          <input className="input" placeholder="Ex: Aluguel, Salário..." value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Categoria</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Recorrência</label>
            <select className="input" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
              {RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Valor *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input
                type="text" inputMode="numeric" className="input pl-8" placeholder="0,00"
                value={amount}
                onChange={e => setAmount(maskCurrency(e.target.value.replace(/\D/g, '')))}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Vencimento *</label>
            <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Forma de pagamento</label>
          <select className="input" value={paymentMethodId} onChange={e => setPaymentMethodId(e.target.value)}>
            <option value="">Não informado</option>
            {paymentMethods.map(pm => (
              <option key={pm.id} value={pm.id}>{pm.name}{PAYMENT_TYPES[pm.type] ? ` (${PAYMENT_TYPES[pm.type]})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Observações</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
