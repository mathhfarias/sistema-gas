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

function moneyToInput(value) {
  return Number(value || 0).toFixed(2).replace('.', ',')
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
      (s.payment_methods?.name || '').toLowerCase().includes(term)
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
                    {(s.sale_items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ')}
                  </td>
                  <td className="text-xs">{s.payment_methods?.name || '—'}</td>
                  <td className="text-xs">{CHANNEL_LABELS[s.channel] || '—'}</td>
                  <td className="text-right text-xs currency">{formatCurrency(s.delivery_fee || 0)}</td>
                  <td className="text-right font-semibold currency">{formatCurrency(s.total)}</td>
                  <td>{STATUS_BADGE[s.status] || s.status}</td>
                  <td>
                    {s.status === 'completed' && (
                      <div className="flex gap-1.5 justify-end">
                        <button className="btn-sm btn-outline" title="Alterar venda" onClick={() => setEditingSale(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button className="btn-sm btn-outline text-danger-600 hover:bg-danger-50" title="Cancelar venda" onClick={() => handleCancel(s.id)}>
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
    setPaymentMethodId(sale.payment_method_id || '')
    setCardMachineId(sale.card_machine_id || '')
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
      empty_returned: !!item.empty_returned,
      empty_qty_returned: Number(item.empty_qty_returned || 0),
    })))
  }, [sale])

  const selectedPayment = paymentMethods.find(pm => pm.id === paymentMethodId)
  const isGasPovo = selectedPayment?.type === 'gas_povo'
  const requiresMachine = selectedPayment?.requires_machine

  useEffect(() => {
    if (!sale || !isGasPovo) return
    if (channel === 'street') {
      setDeliveryFee(moneyToInput(settings?.gas_povo_delivery_fee || 20))
    }
    if (channel === 'counter') {
      setDeliveryFee('0,00')
    }
  }, [channel, isGasPovo])

  function setItem(index, field, value) {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      if (field === 'product_id') {
        const product = products.find(p => p.id === value)
        if (product) {
          updated[index].product_name = product.name
          updated[index].cost_price = Number(product.cost_price || 0)
          updated[index].unit_price = moneyToInput(isGasPovo ? (product.gas_povo_sale_price || 100.23) : product.sale_price)
        }
      }

      if (field === 'quantity' && updated[index].empty_returned) {
        updated[index].empty_qty_returned = Number(value) || 0
      }

      if (field === 'empty_returned') {
        updated[index].empty_qty_returned = value ? Number(updated[index].quantity || 1) : 0
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
    if (!selected?.requires_machine) setCardMachineId('')

    const gasPovo = selected?.type === 'gas_povo'
    setItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.product_id)
      if (!product) return item
      return {
        ...item,
        unit_price: moneyToInput(gasPovo ? (product.gas_povo_sale_price || 100.23) : product.sale_price),
      }
    }))

    if (gasPovo && channel === 'street') setDeliveryFee(moneyToInput(settings?.gas_povo_delivery_fee || 20))
    if (gasPovo && channel === 'counter') setDeliveryFee('0,00')
  }

  const subtotal = items.reduce((sum, item) => sum + parseCurrency(item.unit_price) * Number(item.quantity || 0), 0)
  const total = subtotal + parseCurrency(deliveryFee) - parseCurrency(discount)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!paymentMethodId) { toast.error('Selecione a forma de pagamento.'); return }
    if (requiresMachine && !cardMachineId) { toast.error('Selecione a maquininha.'); return }
    if (!items.length || items.some(item => !item.product_id)) { toast.error('Selecione o produto em todos os itens.'); return }

    setSubmitting(true)
    const { error } = await salesService.updateSale(sale.id, {
      company_id: companyId,
      customer_id: sale.customer_id || null,
      customer_name: customerName || 'Venda avulsa',
      payment_method_id: paymentMethodId,
      card_machine_id: cardMachineId || null,
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
              <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="street">Rua / entrega</option>
                <option value="counter">Portaria / retirada</option>
                <option value="delivery">Entrega</option>
                <option value="other">Outro</option>
              </select>
            </div>
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
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={item.empty_returned} onChange={e => setItem(index, 'empty_returned', e.target.checked)} />
                      <span className="text-sm text-slate-600">Retornou vazio</span>
                      {item.empty_returned && (
                        <input type="number" min="0" max={item.quantity} className="input w-20 text-center" value={item.empty_qty_returned} onChange={e => setItem(index, 'empty_qty_returned', e.target.value)} />
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

          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-slate-400">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Taxa</span><span>{formatCurrency(parseCurrency(deliveryFee))}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-400">Desconto</span><span>-{formatCurrency(parseCurrency(discount))}</span></div>
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
