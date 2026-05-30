import { useState, useEffect } from 'react'
import { Plus, CheckCircle, AlertTriangle, Clock, DollarSign, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal, ExpenseBadge } from '../components/ui'
import { formatCurrency, formatDate, parseCurrency, maskCurrency, EXPENSE_CATEGORIES, PAYMENT_TYPES } from '../utils/format'

const RECURRENCES = [
  { value: 'none', label: 'Sem recorrência' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal (15 em 15 dias)' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

const CATEGORY_OPTS = Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => ({ value, label }))

export default function ExpensesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')

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

  const filtered = filter === 'all' ? list : list.filter(e => e.status === filter)

  const totalPending = list.filter(e => ['pending','overdue'].includes(e.status)).reduce((s, e) => s + Number(e.amount), 0)
  const totalPaid = list.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.paid_amount || e.amount), 0)
  const overdue = list.filter(e => e.status === 'overdue')

  async function markAsPaid(exp) {
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: exp.amount })
      .eq('id', exp.id)
    if (error) { toast.error('Erro ao marcar como pago'); return }

    // Cria próxima parcela automaticamente se for recorrente
    if (exp.recurrence && exp.recurrence !== 'none') {
      const due = new Date(exp.due_date)
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
        subtitle="Controle de contas a pagar"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Despesa
          </button>
        }
      />

      {/* Resumo */}
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

      {/* Filtros */}
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

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="Nenhuma despesa encontrada"
          action={<button className="btn-primary btn-sm" onClick={openNew}><Plus className="w-3.5 h-3.5" /> Nova Despesa</button>}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(exp => {
            const isOverdue = exp.status === 'overdue'
            const isPending = exp.status === 'pending'
            const today = new Date()
            const due = new Date(exp.due_date)
            const daysUntil = Math.ceil((due - today) / 86400000)

            return (
              <div
                key={exp.id}
                className={`card flex flex-col sm:flex-row sm:items-center gap-3 ${
                  isOverdue ? 'border-danger-200 bg-danger-50/30' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isOverdue ? 'bg-danger-100 text-danger-600' :
                    isPending ? 'bg-warning-100 text-warning-600' :
                    'bg-success-100 text-success-600'
                  }`}>
                    {isOverdue ? <AlertTriangle className="w-4 h-4" /> :
                     isPending ? <Clock className="w-4 h-4" /> :
                     <CheckCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{exp.name}</p>
                    <p className="text-xs text-slate-500">
                      {EXPENSE_CATEGORIES[exp.category] || exp.category} · Vence: {formatDate(exp.due_date)}{exp.payment_methods?.name ? ` · ${exp.payment_methods.name}` : ''}
                      {exp.recurrence && exp.recurrence !== 'none' && (
                        <span className="ml-1 text-brand-600 font-medium">
                          · {RECURRENCES.find(r => r.value === exp.recurrence)?.label}
                        </span>
                      )}
                      {isPending && daysUntil >= 0 && daysUntil <= 7 && (
                        <span className="ml-1 text-warning-600 font-medium">({daysUntil === 0 ? 'hoje!' : `em ${daysUntil} dias`})</span>
                      )}
                      {isOverdue && <span className="ml-1 text-danger-600 font-medium">(atrasado!)</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 justify-between sm:justify-end">
                  <div className="text-right">
                    <p className={`font-bold ${isOverdue ? 'text-danger-700' : 'text-slate-800'}`}>
                      {formatCurrency(exp.amount)}
                    </p>
                    <ExpenseBadge status={exp.status} />
                  </div>
                  <div className="flex gap-1.5">
                    <button className="btn-outline btn-sm" onClick={() => openEdit(exp)}>Editar</button>
                    {(isPending || isOverdue) && (
                      <button className="btn-success btn-sm" onClick={() => markAsPaid(exp)}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Pagar
                      </button>
                    )}
                    <button className="btn-danger btn-sm" onClick={() => deleteExpense(exp)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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
    }
  }, [editing])

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
