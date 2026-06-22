// src/pages/SalesPage.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, XCircle, Pencil, CalendarDays, PlusCircle, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { salesService } from '../services/salesService'
import { PageHeader, PageLoader, EmptyState, Modal, StatCard } from '../components/ui'
import { formatCurrency, formatDateTime, parseCurrency, maskCurrency } from '../utils/format'
import toast from 'react-hot-toast'

const PERIOD_LABELS = {
  today: 'Hoje',
  week: 'Últimos 7 dias',
  month: 'Este mês',
  custom: 'Personalizado',
}

const CHANNEL_LABELS = {
  street: 'Rua',
  counter: 'Portaria',
  delivery: 'Entrega',
  other: 'Outro',
}

const SALE_KIND_LABELS = {
  exchange: 'Gás com troca',
  empty_cylinder: 'Vazio / casco',
  full_no_return: 'Cheio sem retorno',
}

const SALE_KIND_OPTIONS = [
  { value: 'exchange', label: SALE_KIND_LABELS.exchange },
  { value: 'empty_cylinder', label: SALE_KIND_LABELS.empty_cylinder },
  { value: 'full_no_return', label: SALE_KIND_LABELS.full_no_return },
]

function toInputDate(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function toDateTimeLocal(date) {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DEFAULT_GAS_POVO_SALE_PRICE = 100.23
const DEFAULT_STREET_SALE_PRICE = 125
const DEFAULT_EMPTY_CYLINDER_SALE_PRICE = 200
const DEFAULT_FULL_NO_RETURN_SALE_PRICE = 300

function moneyToInput(value) {
  return Number(value || 0).toFixed(2).replace('.', ',')
}

const DEFAULT_PAYMENT_SPLIT = {
  payment_method_id: '',
  card_machine_id: '',
  amount: '',
}

function formatSalePayments(sale) {
  if (sale?.sale_payments?.length) {
    return sale.sale_payments
      .map(payment => `${payment.payment_methods?.name || 'Pagamento'} ${formatCurrency(payment.amount || 0)}`)
      .join(' + ')
  }

  return sale?.payment_methods?.name || '—'
}

function getPeriodRange(period, startDate, endDate) {
  const now = new Date()

  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  if (period === 'week') {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  return { start: start.toISOString(), end: end.toISOString() }
}

export function SalesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const companyId = profile?.company_id

  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('today')
  const [startDate, setStartDate] = useState(toInputDate(new Date()))
  const [endDate, setEndDate] = useState(toInputDate(new Date()))
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [cardMachines, setCardMachines] = useState([])
  const [settings, setSettings] = useState({ gas_povo_delivery_fee: 20 })
  const [loading, setLoading] = useState(true)
  const [editingSale, setEditingSale] = useState(null)

  const range = useMemo(() => getPeriodRange(period, startDate, endDate), [period, startDate, endDate])

  useEffect(() => {
    if (companyId) loadBaseData()
  }, [companyId])

  useEffect(() => {
    if (companyId) loadSales()
  }, [companyId, range.start, range.end])

  async function loadBaseData() {
    const [productsRes, paymentRes, machinesRes, settingsRes] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('payment_methods').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('card_machines').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('settings').select('*').eq('company_id', companyId).maybeSingle(),
    ])

    setProducts(productsRes.data || [])
    setPaymentMethods(paymentRes.data || [])
    setCardMachines(machinesRes.data || [])
    if (settingsRes.data) setSettings(settingsRes.data)
  }

  async function loadSales() {
    setLoading(true)
    const { data, error } = await salesService.getSales({
      company_id: companyId,
      start: range.start,
      end: range.end,
      limit: 500,
    })

    if (error) {
      toast.error('Erro ao carregar vendas: ' + error.message)
      setSales([])
    } else {
      setSales(data || [])
    }
    setLoading(false)
  }

  const filtered = (sales || []).filter(s => {
    const term = search.toLowerCase()
    return (
      (s.customer_name || '').toLowerCase().includes(term) ||
      String(s.sale_number || '').includes(term) ||
      (s.payment_methods?.name || '').toLowerCase().includes(term) ||
      (s.sale_payments || []).some(payment => (payment.payment_methods?.name || '').toLowerCase().includes(term))
    )
  })

  const summary = filtered.reduce((acc, sale) => {
    if (sale.status !== 'completed') return acc
    acc.orders += 1
    acc.revenue += Number(sale.total || 0)
    acc.deliveryFees += Number(sale.delivery_fee || 0)
    acc.items += (sale.sale_items || []).reduce((s, item) => s + Number(item.quantity || 0), 0)
    return acc
  }, { orders: 0, items: 0, revenue: 0, deliveryFees: 0 })

  async function handleCancel(saleId) {
    if (!confirm('Cancelar esta venda? O estoque será revertido.')) return
    const { error } = await salesService.cancelSale(saleId, companyId, profile?.id)
    if (error) { toast.error(error.message || 'Erro ao cancelar'); return }
    toast.success('Venda cancelada e estoque revertido.')
    loadSales()
  }

  const STATUS_BADGE = {
    completed: <span className="badge badge-green">Concluída</span>,
    cancelled: <span className="badge badge-red">Cancelada</span>,
    pending: <span className="badge badge-yellow">Pendente</span>,
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vendas"
        subtitle={`Histórico de vendas — ${PERIOD_LABELS[period]}`}
        actions={
          <button className="btn-primary" onClick={() => navigate('/vendas/nova')}>
            <Plus className="w-4 h-4" /> Nova Venda
          </button>
        }
      />

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(PERIOD_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={period === key ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
              onClick={() => setPeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="form-group">
              <label className="label">Data inicial</label>
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Data final</label>
              <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={loadSales}>Aplicar</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Botijões vendidos" value={summary.items} subtitle={`${summary.orders} pedido(s)`} icon={CalendarDays} color="blue" />
        <StatCard title="Faturamento" value={formatCurrency(summary.revenue)} subtitle="vendas concluídas" icon={Plus} color="green" />
        <StatCard title="Taxas de entrega" value={formatCurrency(summary.deliveryFees)} subtitle="Gás do Povo / entregas" icon={CalendarDays} color="orange" />
        <StatCard title="Registros listados" value={filtered.length} subtitle="inclui canceladas" icon={Search} color="gray" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Buscar por cliente, nº venda ou pagamento..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? <PageLoader /> : filtered.length === 0 ? (
        <EmptyState title="Nenhuma venda encontrada" />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Pagamento</th>
                <th>Canal</th>
                <th className="text-right">Taxa</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="font-mono text-slate-500 text-xs">#{s.sale_number}</td>
                  <td className="text-xs whitespace-nowrap">{formatDateTime(s.sold_at)}</td>
                  <td className="font-medium">{s.customer_name || '—'}</td>
                  <td className="text-xs text-slate-500">
                    {(s.sale_items || []).map(i => `${i.quantity}x ${i.product_name}${i.sale_kind && i.sale_kind !== 'exchange' ? ` (${SALE_KIND_LABELS[i.sale_kind] || i.sale_kind})` : ''}`).join(', ')}
                  </td>
                  <td className="text-xs">{formatSalePayments(s)}</td>
                  <td className="text-xs">{CHANNEL_LABELS[s.channel] || '—'}</td>
                  <td className="text-right text-xs currency">{formatCurrency(s.delivery_fee || 0)}</td>
                  <td className="text-right font-semibold currency">{formatCurrency(s.total)}</td>
                  <td>{STATUS_BADGE[s.status] || s.status}</td>
                  <td>
                    {s.status === 'completed' && (
                      <div className="flex gap-1.5 justify-end">
                        <button className="btn-sm btn-outline" title="Alterar venda" aria-label="Alterar venda" onClick={() => setEditingSale(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button className="btn-sm btn-outline text-danger-600 hover:bg-danger-50" title="Cancelar venda" aria-label="Cancelar venda" onClick={() => handleCancel(s.id)}>
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditSaleModal
        open={!!editingSale}
        sale={editingSale}
        products={products}
        paymentMethods={paymentMethods}
        cardMachines={cardMachines}
        settings={settings}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setEditingSale(null)}
        onSuccess={() => {
          setEditingSale(null)
          loadSales()
        }}
      />
    </div>
  )
}

function EditSaleModal({ open, sale, products, paymentMethods, cardMachines, settings, companyId, userId, onClose, onSuccess }) {
  const [customerName, setCustomerName] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [cardMachineId, setCardMachineId] = useState('')
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [paymentSplits, setPaymentSplits] = useState([{ ...DEFAULT_PAYMENT_SPLIT }])
  const [channel, setChannel] = useState('street')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [soldAt, setSoldAt] = useState('')
  const [items, setItems] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!sale) return
    setCustomerName(sale.customer_name || 'Venda avulsa')
    const salePayments = sale.sale_payments || []
    setPaymentMethodId(sale.payment_method_id || '')
    setCardMachineId(sale.card_machine_id || '')
    setIsSplitPayment(salePayments.length > 1)
    setPaymentSplits(salePayments.length
      ? salePayments.map(payment => ({
          payment_method_id: payment.payment_method_id || '',
          card_machine_id: payment.card_machine_id || '',
          amount: moneyToInput(payment.amount || 0),
        }))
      : [{
          payment_method_id: sale.payment_method_id || '',
          card_machine_id: sale.card_machine_id || '',
          amount: moneyToInput(sale.total || 0),
        }]
    )
    setChannel(sale.channel || 'street')
    setDeliveryFee(moneyToInput(sale.delivery_fee || 0))
    setDiscount(moneyToInput(sale.discount || 0))
    setNotes(sale.notes || '')
    setSoldAt(toDateTimeLocal(sale.sold_at))
    setItems((sale.sale_items || []).map(item => ({
      product_id: item.product_id || '',
      product_name: item.product_name || '',
      quantity: Number(item.quantity || 1),
      unit_price: moneyToInput(item.unit_price || 0),
      cost_price: Number(item.cost_price || 0),
      sale_kind: item.sale_kind || 'exchange',
      empty_returned: !!item.empty_returned,
      empty_qty_returned: Number(item.empty_qty_returned || 0),
    })))
  }, [sale])

  const selectedPayment = paymentMethods.find(pm => pm.id === paymentMethodId)
  const isGasPovo = !isSplitPayment && selectedPayment?.type === 'gas_povo'
  const isValeHub = !isSplitPayment && selectedPayment?.type === 'vale_hub'
  const requiresMachine = !isSplitPayment && selectedPayment?.requires_machine && !isValeHub

  function getPaymentMethodById(id) {
    return paymentMethods.find(pm => pm.id === id)
  }

  function paymentMethodRequiresMachine(id) {
    const method = getPaymentMethodById(id)
    return !!method?.requires_machine && method?.type !== 'vale_hub'
  }

  function setSplitPayment(enabled) {
    setIsSplitPayment(enabled)
    setPaymentMethodId('')
    setCardMachineId('')
    setPaymentSplits([{ ...DEFAULT_PAYMENT_SPLIT }])
  }

  function setPaymentSplit(index, field, value) {
    setPaymentSplits(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'payment_method_id') {
        const method = paymentMethods.find(pm => pm.id === value)
        if (!method?.requires_machine || method?.type === 'vale_hub') updated[index].card_machine_id = ''
      }
      return updated
    })
  }

  function addPaymentSplit() {
    setPaymentSplits(prev => [...prev, { ...DEFAULT_PAYMENT_SPLIT }])
  }

  function removePaymentSplit(index) {
    setPaymentSplits(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  function fillSplitRemaining(index) {
    const othersTotal = paymentSplits.reduce((sum, split, i) => i === index ? sum : sum + parseCurrency(split.amount), 0)
    const remaining = Math.max(0, total - othersTotal)
    setPaymentSplit(index, 'amount', moneyToInput(remaining))
  }

  function getProductSalePrice(product, gasPovo = isGasPovo, saleChannel = channel, valeHub = isValeHub, saleKind = 'exchange') {
    if (!product) return 0
    if (saleKind === 'empty_cylinder') return Number(product.empty_cylinder_sale_price ?? DEFAULT_EMPTY_CYLINDER_SALE_PRICE)
    if (saleKind === 'full_no_return') return Number(product.full_no_return_sale_price ?? DEFAULT_FULL_NO_RETURN_SALE_PRICE)
    if (gasPovo) return Number(product.gas_povo_sale_price ?? DEFAULT_GAS_POVO_SALE_PRICE)
    if (!valeHub && saleChannel === 'street') return Number(product.street_sale_price || DEFAULT_STREET_SALE_PRICE)
    return Number(product.sale_price || 0)
  }

  useEffect(() => {
    if (!sale || !isGasPovo) return
    if (channel === 'street') {
      setDeliveryFee(moneyToInput(settings?.gas_povo_delivery_fee || 20))
    }
    if (channel === 'counter') {
      setDeliveryFee('0,00')
    }
  }, [channel, isGasPovo])

  function handleChannelChange(nextChannel) {
    setChannel(nextChannel)
    setItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.product_id)
      if (!product) return item
      return {
        ...item,
        unit_price: moneyToInput(getProductSalePrice(product, isGasPovo, nextChannel, isValeHub, item.sale_kind)),
      }
    }))
  }

  function setItem(index, field, value) {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      if (field === 'product_id') {
        const product = products.find(p => p.id === value)
        if (product) {
          updated[index].product_name = product.name
          updated[index].cost_price = Number(product.cost_price || 0)
          updated[index].unit_price = moneyToInput(getProductSalePrice(product, isGasPovo, channel, isValeHub, updated[index].sale_kind || 'exchange'))
        }
      }

      if (field === 'sale_kind') {
        const product = products.find(p => p.id === updated[index].product_id)
        updated[index].sale_kind = value
        updated[index].unit_price = product ? moneyToInput(getProductSalePrice(product, isGasPovo, channel, isValeHub, value)) : updated[index].unit_price
        if (value !== 'exchange') {
          updated[index].empty_returned = false
          updated[index].empty_qty_returned = 0
        } else {
          updated[index].empty_returned = true
          updated[index].empty_qty_returned = Number(updated[index].quantity || 1)
        }
      }

      if (field === 'quantity' && updated[index].empty_returned) {
        updated[index].empty_qty_returned = Number(value) || 0
      }
      if (field === 'quantity' && isValeHub) {
        updated[index].empty_returned = true
        updated[index].empty_qty_returned = Number(value) || 1
      }

      if (field === 'empty_returned') {
        updated[index].empty_qty_returned = value ? Number(updated[index].quantity || 1) : 0
      }
      if (updated[index].sale_kind !== 'exchange') {
        updated[index].empty_returned = false
        updated[index].empty_qty_returned = 0
      }

      return updated
    })
  }

  function addItem() {
    setItems(prev => [...prev, {
      product_id: '',
      product_name: '',
      quantity: 1,
      unit_price: '',
      cost_price: 0,
      sale_kind: 'exchange',
      empty_returned: true,
      empty_qty_returned: 1,
    }])
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function handlePaymentChange(id) {
    setPaymentMethodId(id)
    const selected = paymentMethods.find(pm => pm.id === id)
    if (!selected?.requires_machine || selected?.type === 'vale_hub') setCardMachineId('')

    const gasPovo = selected?.type === 'gas_povo'
    const valeHub = selected?.type === 'vale_hub'
    setItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.product_id)
      if (!product) return item
      return {
        ...item,
        sale_kind: gasPovo || valeHub ? 'exchange' : (item.sale_kind || 'exchange'),
        unit_price: moneyToInput(getProductSalePrice(product, gasPovo, channel, valeHub, gasPovo || valeHub ? 'exchange' : (item.sale_kind || 'exchange'))),
      }
    }))

    if (gasPovo && channel === 'street') setDeliveryFee(moneyToInput(settings?.gas_povo_delivery_fee || 20))
    if (gasPovo && channel === 'counter') setDeliveryFee('0,00')
    if (valeHub) {
      setDeliveryFee('0,00')
      setItems(prev => prev.map(item => ({
        ...item,
        sale_kind: 'exchange',
        empty_returned: true,
        empty_qty_returned: Number(item.quantity || 1),
      })))
    }
  }

  const subtotal = items.reduce((sum, item) => sum + parseCurrency(item.unit_price) * Number(item.quantity || 0), 0)
  const total = subtotal + parseCurrency(deliveryFee) - parseCurrency(discount)
  const splitPaidTotal = paymentSplits.reduce((sum, split) => sum + parseCurrency(split.amount), 0)
  const splitRemaining = total - splitPaidTotal

  async function handleSubmit(e) {
    e.preventDefault()

    if (!isSplitPayment && !paymentMethodId) { toast.error('Selecione a forma de pagamento.'); return }
    if (requiresMachine && !cardMachineId) { toast.error('Selecione a maquininha.'); return }
    if (isSplitPayment) {
      const validSplits = paymentSplits.filter(split => split.payment_method_id && parseCurrency(split.amount) > 0)
      if (validSplits.length < 2) { toast.error('Informe pelo menos duas formas de pagamento.'); return }
      if (Math.abs(splitPaidTotal - total) > 0.01) { toast.error('A soma dos pagamentos precisa ser igual ao total da venda.'); return }
      const missingMachine = validSplits.find(split => paymentMethodRequiresMachine(split.payment_method_id) && !split.card_machine_id)
      if (missingMachine) { toast.error('Selecione a maquininha para o pagamento com cartão.'); return }
      const hasSpecial = validSplits.some(split => ['gas_povo', 'vale_hub'].includes(getPaymentMethodById(split.payment_method_id)?.type))
      if (hasSpecial) { toast.error('Pagamento dividido não deve usar Gás do Povo ou Vale Hub.'); return }
    }
    if (!items.length || items.some(item => !item.product_id)) { toast.error('Selecione o produto em todos os itens.'); return }
    if (isValeHub && items.some(item => item.sale_kind !== 'exchange')) { toast.error('Vale Hub / Ultragaz só deve ser usado em venda com troca.'); return }
    if (isGasPovo) {
      const invalidGasPovo = items.find(item => {
        const product = products.find(p => p.id === item.product_id)
        return item.sale_kind !== 'exchange' || Number(product?.gas_povo_sale_price ?? 0) <= 0
      })
      if (invalidGasPovo) { toast.error('Gás do Povo só está disponível para produtos habilitados, como P13.'); return }
    }

    setSubmitting(true)
    const { error } = await salesService.updateSale(sale.id, {
      company_id: companyId,
      customer_id: sale.customer_id || null,
      customer_name: customerName || 'Venda avulsa',
      payment_method_id: isSplitPayment ? paymentSplits.find(split => split.payment_method_id)?.payment_method_id : paymentMethodId,
      card_machine_id: isSplitPayment ? (paymentSplits.find(split => split.payment_method_id)?.card_machine_id || null) : (cardMachineId || null),
      payment_splits: isSplitPayment
        ? paymentSplits
            .filter(split => split.payment_method_id && parseCurrency(split.amount) > 0)
            .map(split => ({
              payment_method_id: split.payment_method_id,
              card_machine_id: split.card_machine_id || null,
              amount: parseCurrency(split.amount),
            }))
        : [{ payment_method_id: paymentMethodId, card_machine_id: cardMachineId || null, amount: total }],
      channel,
      delivery_fee: parseCurrency(deliveryFee),
      discount: parseCurrency(discount),
      notes,
      sold_at: soldAt ? new Date(soldAt).toISOString() : sale.sold_at,
      updated_by: userId,
      items: items.map(item => ({
        ...item,
        quantity: Number(item.quantity || 0),
        unit_price: parseCurrency(item.unit_price),
        empty_qty_returned: item.empty_returned ? Number(item.empty_qty_returned || 0) : 0,
      })),
    })

    setSubmitting(false)
    if (error) { toast.error(error.message || 'Erro ao alterar venda.'); return }
    toast.success('Venda alterada e estoque ajustado.')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={sale ? `Alterar venda #${sale.sale_number}` : 'Alterar venda'} maxWidth="max-w-4xl">
      {!sale ? null : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Data/hora da venda</label>
              <input type="datetime-local" className="input" value={soldAt} onChange={e => setSoldAt(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Cliente / identificação</label>
              <input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-slate-700">Pagamento</h4>
              <button type="button" className={`btn-sm ${isSplitPayment ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSplitPayment(!isSplitPayment)}>
                {isSplitPayment ? 'Pagamento dividido ativo' : 'Dividir pagamento'}
              </button>
            </div>

            {!isSplitPayment ? (
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="form-group">
                  <label className="label">Forma de pagamento</label>
                  <select className="input" value={paymentMethodId} onChange={e => handlePaymentChange(e.target.value)} required>
                    <option value="">Selecionar...</option>
                    {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                  </select>
                </div>
                {requiresMachine && (
                  <div className="form-group">
                    <label className="label">Maquininha</label>
                    <select className="input" value={cardMachineId} onChange={e => setCardMachineId(e.target.value)} required>
                      <option value="">Selecionar...</option>
                      {cardMachines.map(cm => <option key={cm.id} value={cm.id}>{cm.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="label">Canal</label>
                  <select className="input" value={channel} onChange={e => handleChannelChange(e.target.value)}>
                    <option value="street">Rua / entrega</option>
                    <option value="counter">Portaria / retirada</option>
                    <option value="delivery">Entrega</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentSplits.map((split, idx) => {
                  const method = getPaymentMethodById(split.payment_method_id)
                  const splitRequiresMachine = method?.requires_machine && method?.type !== 'vale_hub'
                  return (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pagamento {idx + 1}</span>
                        {paymentSplits.length > 1 && (
                          <button type="button" className="text-danger-500 hover:text-danger-700" onClick={() => removePaymentSplit(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-[1fr_1fr_150px] gap-3">
                        <div className="form-group">
                          <label className="label">Forma</label>
                          <select className="input" value={split.payment_method_id} onChange={e => setPaymentSplit(idx, 'payment_method_id', e.target.value)} required>
                            <option value="">Selecionar...</option>
                            {paymentMethods
                              .filter(pm => !['gas_povo', 'vale_hub'].includes(pm.type))
                              .map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                          </select>
                        </div>
                        {splitRequiresMachine ? (
                          <div className="form-group">
                            <label className="label">Maquininha</label>
                            <select className="input" value={split.card_machine_id} onChange={e => setPaymentSplit(idx, 'card_machine_id', e.target.value)} required>
                              <option value="">Selecionar...</option>
                              {cardMachines.map(cm => <option key={cm.id} value={cm.id}>{cm.name}</option>)}
                            </select>
                          </div>
                        ) : <div className="form-group hidden sm:block" />}
                        <div className="form-group">
                          <label className="label">Valor</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                            <input className="input pl-8" value={split.amount} onChange={e => setPaymentSplit(idx, 'amount', maskCurrency(e.target.value.replace(/\D/g, '')))} required />
                          </div>
                          <button type="button" className="text-xs text-brand-700 font-semibold mt-1" onClick={() => fillSplitRemaining(idx)}>Usar restante</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <button type="button" className="btn-secondary btn-sm" onClick={addPaymentSplit}>
                  <PlusCircle className="w-3.5 h-3.5" /> Adicionar forma
                </button>
                <div className={`p-3 rounded-xl border text-sm ${Math.abs(splitRemaining) <= 0.01 ? 'bg-success-50 border-success-200 text-success-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  Pago: <strong>{formatCurrency(splitPaidTotal)}</strong> · Restante: <strong>{formatCurrency(splitRemaining)}</strong>
                </div>
              </div>
            )}

            {isSplitPayment && (
              <div className="form-group">
                <label className="label">Canal</label>
                <select className="input" value={channel} onChange={e => handleChannelChange(e.target.value)}>
                  <option value="street">Rua / entrega</option>
                  <option value="counter">Portaria / retirada</option>
                  <option value="delivery">Entrega</option>
                  <option value="other">Outro</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Itens</h4>
              <button type="button" className="btn-secondary btn-sm" onClick={addItem}>
                <PlusCircle className="w-3.5 h-3.5" /> Adicionar item
              </button>
            </div>

            {items.map((item, index) => {
              const product = products.find(p => p.id === item.product_id)
              const isCylinder = product?.is_cylinder !== false
              return (
                <div key={index} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="grid sm:grid-cols-[1fr_90px_150px_auto] gap-3 items-end">
                    <div className="form-group">
                      <label className="label">Produto</label>
                      <select className="input" value={item.product_id} onChange={e => setItem(index, 'product_id', e.target.value)} required>
                        <option value="">Selecionar...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="label">Qtd</label>
                      <input type="number" min="1" className="input text-center" value={item.quantity} onChange={e => setItem(index, 'quantity', e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label className="label">Valor unitário</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input className="input pl-8" value={item.unit_price} onChange={e => setItem(index, 'unit_price', maskCurrency(e.target.value.replace(/\D/g, '')))} required />
                      </div>
                    </div>
                    {items.length > 1 && (
                      <button type="button" className="btn-danger btn-sm mb-1" onClick={() => removeItem(index)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isCylinder && (
                    <div className="form-group">
                      <label className="label">Tipo da venda</label>
                      <select
                        className="input"
                        value={item.sale_kind || 'exchange'}
                        onChange={e => setItem(index, 'sale_kind', e.target.value)}
                        disabled={isValeHub || isGasPovo}
                      >
                        {SALE_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  )}

                  {isCylinder && (item.sale_kind || 'exchange') === 'exchange' && (
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={item.empty_returned} disabled={isValeHub} onChange={e => setItem(index, 'empty_returned', e.target.checked)} />
                      <span className="text-sm text-slate-600">{isValeHub ? 'Vazio vai para HUB a retornar' : 'Retornou vazio'}</span>
                      {item.empty_returned && (
                        <input type="number" min="0" max={item.quantity} className="input w-20 text-center" value={item.empty_qty_returned} disabled={isValeHub} onChange={e => setItem(index, 'empty_qty_returned', e.target.value)} />
                      )}
                      <span className="ml-auto text-sm font-semibold text-slate-700">Subtotal: {formatCurrency(parseCurrency(item.unit_price) * Number(item.quantity || 0))}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="form-group">
              <label className="label">Taxa de entrega</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input className="input pl-8" value={deliveryFee} onChange={e => setDeliveryFee(maskCurrency(e.target.value.replace(/\D/g, '')))} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Desconto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input className="input pl-8" value={discount} onChange={e => setDiscount(maskCurrency(e.target.value.replace(/\D/g, '')))} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Observações</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {isGasPovo && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
              Gás do Povo: em <strong>Rua</strong>, a taxa padrão é adicionada. Em <strong>Portaria</strong>, a taxa fica zerada.
            </div>
          )}

          {isValeHub && (
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-sm text-purple-700">
              Vale Hub / Ultragaz: não usa maquininha. O vazio retornado fica separado em <strong>HUB a retornar</strong>.
            </div>
          )}

          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Taxa</span><span>{formatCurrency(parseCurrency(deliveryFee))}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Desconto</span><span>-{formatCurrency(parseCurrency(discount))}</span></div>
            {isSplitPayment && <div className="flex justify-between text-sm text-emerald-300"><span>Pago no dividido</span><span>{formatCurrency(splitPaidTotal)}</span></div>}
            <div className="border-t border-slate-700 pt-2 flex justify-between text-lg font-bold"><span>Total</span><span className="text-orange-400">{formatCurrency(total)}</span></div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar alteração'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default SalesPage
