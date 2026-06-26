import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck, AlertTriangle, CheckCircle2, Clock, PlusCircle,
  Search, XCircle, MessageSquareWarning, ShieldCheck, CalendarDays,
  CreditCard, Banknote, PackageCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { salesService } from '../services/salesService'
import { PageHeader, PageLoader, StatCard, Alert, Modal, EmptyState } from '../components/ui'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'
import { can } from '../utils/permissions'
import SaleEntryModal from '../components/SaleEntryModal'

const STATUS_LABELS = {
  pending: 'Pendente',
  reviewed: 'Conferido',
  has_issue: 'Com divergência',
}

const STATUS_BADGES = {
  pending: 'badge-yellow',
  reviewed: 'badge-green',
  has_issue: 'badge-red',
}

const ISSUE_TYPES = [
  { value: 'wrong_sale', label: 'Venda errada' },
  { value: 'duplicate_sale', label: 'Venda duplicada / venda a mais' },
  { value: 'missing_sale', label: 'Venda faltante' },
  { value: 'wrong_payment', label: 'Pagamento incorreto' },
  { value: 'stock_difference', label: 'Estoque divergente' },
  { value: 'other', label: 'Outro' },
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function todayLocalDate() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function dateRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`)
  const end = new Date(`${dateStr}T23:59:59`)
  return { start: start.toISOString(), end: end.toISOString() }
}

function salePaymentsLabel(sale) {
  if (sale?.sale_payments?.length) {
    return sale.sale_payments
      .map(payment => `${payment.payment_methods?.name || 'Pagamento'} ${formatCurrency(payment.amount || 0)}`)
      .join(' + ')
  }
  return sale?.payment_methods?.name || '—'
}

function machineLabel(sale) {
  if (sale?.sale_payments?.length) {
    const machines = sale.sale_payments
      .map(payment => payment.card_machines?.name)
      .filter(Boolean)
    return machines.length ? [...new Set(machines)].join(', ') : '—'
  }
  return sale?.card_machines?.name || '—'
}

function saleItemsCount(sale) {
  return (sale.sale_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function paymentSummaryFromSales(sales) {
  const map = new Map()
  const machines = new Map()
  let splitPayments = 0
  let gasPovoCount = 0
  let valeHubCount = 0
  let deliveryFees = 0

  for (const sale of sales || []) {
    deliveryFees += Number(sale.delivery_fee || 0)
    const payments = sale.sale_payments?.length
      ? sale.sale_payments
      : [{ amount: sale.total, payment_methods: sale.payment_methods, card_machines: sale.card_machines }]

    if (payments.length > 1) splitPayments += 1

    for (const payment of payments) {
      const methodName = payment.payment_methods?.name || 'Outro'
      const methodType = payment.payment_methods?.type || 'other'
      const current = map.get(methodName) || { name: methodName, type: methodType, total: 0, count: 0 }
      current.total += Number(payment.amount || 0)
      current.count += 1
      map.set(methodName, current)

      if (methodType === 'gas_povo') gasPovoCount += 1
      if (methodType === 'vale_hub') valeHubCount += 1

      const machineName = payment.card_machines?.name
      if (machineName) {
        const m = machines.get(machineName) || { name: machineName, total: 0, count: 0 }
        m.total += Number(payment.amount || 0)
        m.count += 1
        machines.set(machineName, m)
      }
    }
  }

  return {
    byPayment: Array.from(map.values()).sort((a, b) => b.total - a.total),
    byMachine: Array.from(machines.values()).sort((a, b) => b.total - a.total),
    splitPayments,
    gasPovoCount,
    valeHubCount,
    deliveryFees,
  }
}

function buildFlags(sales, summary) {
  const flags = []
  if (summary.splitPayments > 0) flags.push(`${summary.splitPayments} venda(s) com pagamento dividido`)
  if (summary.gasPovoCount > 0) flags.push(`${summary.gasPovoCount} lançamento(s) Gás do Povo`)
  if (summary.valeHubCount > 0) flags.push(`${summary.valeHubCount} lançamento(s) Vale Hub`)
  if (summary.deliveryFees > 0) flags.push(`${formatCurrency(summary.deliveryFees)} em taxas de entrega`)

  const completedSales = (sales || []).filter(s => s.status === 'completed')
  const latestSale = completedSales
    .slice()
    .sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at))[0]

  if (latestSale) {
    const hour = new Date(latestSale.sold_at).getHours()
    if (hour < 17) flags.push('Última venda lançada antes das 17h. Confira se houve vendas depois disso.')
  }

  return flags
}

export default function DailyReviewPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const companyId = profile?.company_id
  const role = profile?.role || 'operator'
  const canCancel = can(role, 'cancelSaleReview')

  const [selectedDate, setSelectedDate] = useState(todayLocalDate())
  const [sales, setSales] = useState([])
  const [reviews, setReviews] = useState([])
  const [issues, setIssues] = useState([])
  const [users, setUsers] = useState([])
  const [currentReview, setCurrentReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')

  const [issueModal, setIssueModal] = useState({ open: false, sale: null })
  const [issueType, setIssueType] = useState('wrong_sale')
  const [issueDescription, setIssueDescription] = useState('')

  const [cancelModal, setCancelModal] = useState({ open: false, sale: null })
  const [cancelReason, setCancelReason] = useState('')
  const [saleEntryModalOpen, setSaleEntryModalOpen] = useState(false)

  useEffect(() => {
    if (companyId) loadPage()
  }, [companyId, selectedDate])

  async function loadPage() {
    setLoading(true)
    const range = dateRange(selectedDate)

    try {
      const [salesRes, reviewsRes, issuesRes, usersRes] = await Promise.all([
        salesService.getSales({ company_id: companyId, start: range.start, end: range.end, limit: 500 }),
        supabase
          .from('daily_sales_reviews')
          .select('*')
          .eq('company_id', companyId)
          .order('review_date', { ascending: false })
          .limit(31),
        supabase
          .from('daily_sales_review_issues')
          .select('*, sales(sale_number, total, sold_at, status)')
          .eq('company_id', companyId)
          .eq('review_date', selectedDate)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('company_id', companyId),
      ])

      if (salesRes.error) throw salesRes.error
      if (reviewsRes.error) throw reviewsRes.error
      if (issuesRes.error) throw issuesRes.error
      if (usersRes.error) throw usersRes.error

      const loadedSales = salesRes.data || []
      const loadedReviews = reviewsRes.data || []
      setSales(loadedSales)
      setReviews(loadedReviews)
      setIssues(issuesRes.data || [])
      setUsers(usersRes.data || [])

      const review = loadedReviews.find(item => item.review_date === selectedDate) || null
      setCurrentReview(review)
      setNotes(review?.notes || '')
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao carregar conferência do dia')
    } finally {
      setLoading(false)
    }
  }

  const completedSales = useMemo(() => (sales || []).filter(s => s.status === 'completed'), [sales])
  const filteredSales = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return sales
    return (sales || []).filter(s => (
      String(s.sale_number || '').includes(term) ||
      (s.customer_name || '').toLowerCase().includes(term) ||
      salePaymentsLabel(s).toLowerCase().includes(term)
    ))
  }, [sales, search])

  const summary = useMemo(() => {
    const totalAmount = completedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
    const cylinders = completedSales.reduce((sum, sale) => sum + saleItemsCount(sale), 0)
    const payments = paymentSummaryFromSales(completedSales)
    const flags = buildFlags(completedSales, payments)

    return {
      salesCount: completedSales.length,
      cylinders,
      totalAmount,
      ...payments,
      flags,
    }
  }, [completedSales])

  const usersById = useMemo(() => {
    return Object.fromEntries((users || []).map(user => [user.id, user]))
  }, [users])

  async function saveReview(status) {
    if (!companyId || !profile?.id) return
    setSaving(true)

    const payload = {
      company_id: companyId,
      review_date: selectedDate,
      status,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      notes: notes || null,
      sales_count: summary.salesCount,
      cylinders_count: summary.cylinders,
      total_amount: summary.totalAmount,
      payment_summary: summary.byPayment,
      machine_summary: summary.byMachine,
      flags: summary.flags,
      updated_at: new Date().toISOString(),
    }

    try {
      const { error } = await supabase
        .from('daily_sales_reviews')
        .upsert(payload, { onConflict: 'company_id,review_date' })

      if (error) throw error

      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: profile.id,
        action: status === 'reviewed' ? 'daily_review.reviewed' : 'daily_review.issue',
        table_name: 'daily_sales_reviews',
        new_data: payload,
      })

      toast.success(status === 'reviewed' ? 'Dia marcado como conferido' : 'Dia marcado com divergência')
      await loadPage()
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao salvar conferência')
    } finally {
      setSaving(false)
    }
  }

  async function createIssue({ sale, type, description, status = 'open' }) {
    if (!companyId || !profile?.id) return { error: { message: 'Usuário não encontrado' } }

    const { data, error } = await supabase
      .from('daily_sales_review_issues')
      .insert({
        company_id: companyId,
        review_date: selectedDate,
        sale_id: sale?.id || null,
        type,
        status,
        description,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error }

    await supabase.from('audit_logs').insert({
      company_id: companyId,
      user_id: profile.id,
      action: 'daily_review.issue_created',
      table_name: 'daily_sales_review_issues',
      record_id: data?.id,
      new_data: { sale_id: sale?.id, type, status, description },
    })

    return { data, error: null }
  }

  async function handleCreateIssue(e) {
    e.preventDefault()
    if (!issueDescription.trim()) {
      toast.error('Informe uma observação para a pendência')
      return
    }

    const { error } = await createIssue({
      sale: issueModal.sale,
      type: issueType,
      description: issueDescription.trim(),
      status: 'open',
    })

    if (error) {
      toast.error(error.message || 'Erro ao sinalizar pendência')
      return
    }

    toast.success('Pendência registrada para revisão')
    setIssueModal({ open: false, sale: null })
    setIssueType('wrong_sale')
    setIssueDescription('')
    await loadPage()
  }

  async function handleCancelSale(e) {
    e.preventDefault()
    const sale = cancelModal.sale
    if (!sale?.id) return
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento')
      return
    }

    setSaving(true)
    try {
      const { error } = await salesService.cancelSale(sale.id, companyId, profile?.id)
      if (error) throw error

      await createIssue({
        sale,
        type: 'duplicate_sale',
        description: `Venda cancelada pela conferência do dia. Motivo: ${cancelReason.trim()}`,
        status: 'resolved',
      })

      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: profile?.id,
        action: 'daily_review.sale_cancelled',
        table_name: 'sales',
        record_id: sale.id,
        new_data: { reason: cancelReason.trim(), sale_number: sale.sale_number, total: sale.total },
      })

      toast.success('Venda cancelada e registrada na conferência')
      setCancelModal({ open: false, sale: null })
      setCancelReason('')
      await loadPage()
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao cancelar venda')
    } finally {
      setSaving(false)
    }
  }

  function quickDate(offset) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  if (loading) return <PageLoader />

  const reviewStatus = currentReview?.status || 'pending'
  const reviewer = currentReview?.reviewed_by ? usersById[currentReview.reviewed_by] : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conferência do Dia"
        subtitle="Revisão rápida das vendas lançadas, sem cara de fechamento de caixa"
        actions={
          <button className="btn-primary" onClick={() => setSaleEntryModalOpen(true)}>
            <PlusCircle className="w-4 h-4" /> Adicionar venda esquecida
          </button>
        }
      />

      <section className="card space-y-4">
        <div className="grid md:grid-cols-[220px_1fr] gap-4 items-end">
          <div className="form-group">
            <label className="label">Data da conferência</label>
            <input type="date" className="input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => setSelectedDate(quickDate(0))}>Hoje</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setSelectedDate(quickDate(-1))}>Ontem</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => navigate('/vendas')}>Ir para Vendas</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setSaleEntryModalOpen(true)}>Adicionar venda</button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between rounded-xl bg-slate-50 border border-slate-100 p-3">
          <div>
            <p className="text-xs uppercase font-semibold text-slate-500 tracking-wide">Status da data</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={STATUS_BADGES[reviewStatus] || 'badge-gray'}>{STATUS_LABELS[reviewStatus] || reviewStatus}</span>
              {currentReview?.reviewed_at && (
                <span className="text-xs text-slate-500">
                  por {reviewer?.full_name || reviewer?.email || 'usuário'} em {formatDateTime(currentReview.reviewed_at)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" disabled={saving} onClick={() => saveReview('has_issue')}>
              <AlertTriangle className="w-4 h-4" /> Marcar divergência
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => saveReview('reviewed')}>
              <CheckCircle2 className="w-4 h-4" /> Marcar como conferido
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Vendas lançadas" value={summary.salesCount} subtitle="concluídas no dia" icon={ClipboardCheck} color="blue" />
        <StatCard title="Botijões" value={summary.cylinders} subtitle="quantidade vendida" icon={PackageCheck} color="orange" />
        <StatCard title="Faturamento" value={formatCurrency(summary.totalAmount)} subtitle="receita lançada" icon={Banknote} color="green" />
        <StatCard title="Pagamentos divididos" value={summary.splitPayments} subtitle="conferir se bate" icon={CreditCard} color={summary.splitPayments > 0 ? 'purple' : 'gray'} />
        <StatCard title="Pendências" value={issues.filter(i => i.status !== 'resolved').length} subtitle="sinalizadas no dia" icon={AlertTriangle} color={issues.some(i => i.status !== 'resolved') ? 'red' : 'gray'} />
      </div>

      {summary.flags.length > 0 && (
        <Alert
          type="warning"
          title="Pontos de atenção da conferência"
          message={summary.flags.join(' • ')}
        />
      )}

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800">Resumo por pagamento</h3>
          </div>
          <div className="space-y-2">
            {summary.byPayment.map(item => (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div>
                  <p className="font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.count} lançamento(s)</p>
                </div>
                <p className="font-display font-semibold text-slate-900">{formatCurrency(item.total)}</p>
              </div>
            ))}
            {!summary.byPayment.length && <p className="text-sm text-slate-500">Nenhum pagamento lançado no dia.</p>}
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800">Resumo por maquininha</h3>
          </div>
          <div className="space-y-2">
            {summary.byMachine.map(item => (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div>
                  <p className="font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.count} pagamento(s)</p>
                </div>
                <p className="font-display font-semibold text-slate-900">{formatCurrency(item.total)}</p>
              </div>
            ))}
            {!summary.byMachine.length && <p className="text-sm text-slate-500">Nenhum pagamento com maquininha no dia.</p>}
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div>
            <h3 className="font-display font-semibold text-slate-800">Vendas do dia</h3>
            <p className="text-sm text-slate-500">Use esta lista para conferir vendas faltantes, erradas ou lançadas a mais.</p>
          </div>
          <div className="relative md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar venda, cliente ou pagamento" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-3">Venda</th>
                <th className="text-left px-3 py-3">Horário</th>
                <th className="text-left px-3 py-3">Pagamento</th>
                <th className="text-left px-3 py-3">Maquininha</th>
                <th className="text-right px-3 py-3">Total</th>
                <th className="text-right px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map(sale => (
                <tr key={sale.id} className={sale.status === 'cancelled' ? 'opacity-60 bg-slate-50' : ''}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-800">#{sale.sale_number || '—'} {sale.status === 'cancelled' && <span className="badge-red ml-1">Cancelada</span>}</p>
                    <p className="text-xs text-slate-500">{sale.customer_name || 'Venda avulsa'} • {saleItemsCount(sale)} botijão(ões)</p>
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(sale.sold_at)}</td>
                  <td className="px-3 py-3 text-slate-600 min-w-[220px]">{salePaymentsLabel(sale)}</td>
                  <td className="px-3 py-3 text-slate-500">{machineLabel(sale)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrency(sale.total || 0)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => {
                          setIssueModal({ open: true, sale })
                          setIssueType('wrong_sale')
                          setIssueDescription('')
                        }}
                      >
                        <MessageSquareWarning className="w-3.5 h-3.5" /> Sinalizar
                      </button>
                      {canCancel && sale.status === 'completed' && (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => {
                            setCancelModal({ open: true, sale })
                            setCancelReason('')
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredSales.length && (
                <tr>
                  <td colSpan="6">
                    <EmptyState
                      icon={ClipboardCheck}
                      title="Nenhuma venda encontrada"
                      description="Não há vendas lançadas para essa data ou filtro."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning-600" />
            <h3 className="font-display font-semibold text-slate-800">Pendências sinalizadas</h3>
          </div>
          <div className="space-y-2">
            {issues.map(issue => (
              <div key={issue.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{ISSUE_TYPES.find(t => t.value === issue.type)?.label || issue.type}</p>
                  <span className={issue.status === 'resolved' ? 'badge-green' : 'badge-yellow'}>{issue.status === 'resolved' ? 'Resolvida' : 'Aberta'}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{issue.description}</p>
                <p className="text-xs text-slate-400 mt-2">{formatDateTime(issue.created_at)} {issue.sales?.sale_number ? `• Venda #${issue.sales.sale_number}` : ''}</p>
              </div>
            ))}
            {!issues.length && <p className="text-sm text-slate-500">Nenhuma pendência sinalizada nesta data.</p>}
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800">Histórico de conferências</h3>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {reviews.map(review => {
              const user = review.reviewed_by ? usersById[review.reviewed_by] : null
              return (
                <button
                  key={review.id}
                  type="button"
                  className="w-full text-left rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                  onClick={() => setSelectedDate(review.review_date)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{formatDate(review.review_date)}</p>
                    <span className={STATUS_BADGES[review.status] || 'badge-gray'}>{STATUS_LABELS[review.status] || review.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {review.reviewed_at ? `por ${user?.full_name || user?.email || 'usuário'} em ${formatDateTime(review.reviewed_at)}` : 'Ainda não conferido'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{review.cylinders_count || 0} botijão(ões) • {formatCurrency(review.total_amount || 0)}</p>
                </button>
              )
            })}
            {!reviews.length && <p className="text-sm text-slate-500">Nenhuma conferência registrada ainda.</p>}
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="font-display font-semibold text-slate-800">Observação da conferência</h3>
        <textarea
          className="input min-h-[90px]"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ex.: Funcionário conferiu o caderno e informou que está tudo correto."
        />
        <p className="text-xs text-slate-500">A observação será salva ao marcar como conferido ou com divergência.</p>
      </section>


      <SaleEntryModal
        open={saleEntryModalOpen}
        onClose={() => setSaleEntryModalOpen(false)}
        selectedDate={selectedDate}
        companyId={companyId}
        profile={profile}
        onSaved={loadPage}
      />

      <Modal open={issueModal.open} onClose={() => setIssueModal({ open: false, sale: null })} title="Sinalizar venda errada ou pendência">
        <form onSubmit={handleCreateIssue} className="space-y-4">
          <Alert
            type="info"
            title={`Venda #${issueModal.sale?.sale_number || '—'}`}
            message={`${salePaymentsLabel(issueModal.sale)} • ${formatCurrency(issueModal.sale?.total || 0)}`}
          />
          <div className="form-group">
            <label className="label">Tipo de pendência</label>
            <select className="input" value={issueType} onChange={e => setIssueType(e.target.value)}>
              {ISSUE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Observação</label>
            <textarea className="input min-h-[100px]" value={issueDescription} onChange={e => setIssueDescription(e.target.value)} placeholder="Explique o que precisa ser conferido." />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setIssueModal({ open: false, sale: null })}>Cancelar</button>
            <button type="submit" className="btn-primary">Registrar pendência</button>
          </div>
        </form>
      </Modal>

      <Modal open={cancelModal.open} onClose={() => setCancelModal({ open: false, sale: null })} title="Cancelar venda lançada a mais">
        <form onSubmit={handleCancelSale} className="space-y-4">
          <Alert
            type="warning"
            title={`Cancelar venda #${cancelModal.sale?.sale_number || '—'}`}
            message="O estoque será revertido e a venda ficará como cancelada no histórico."
          />
          <div className="form-group">
            <label className="label">Motivo obrigatório</label>
            <textarea className="input min-h-[100px]" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Ex.: venda lançada em duplicidade na conferência do dia." />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setCancelModal({ open: false, sale: null })}>Voltar</button>
            <button type="submit" className="btn-danger" disabled={saving}>Cancelar venda</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
