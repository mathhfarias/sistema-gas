import { useEffect, useMemo, useState } from 'react'
import { PlusCircle, Trash2, ShoppingCart, CheckCircle, Store, Truck, Clock, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { salesService } from '../services/salesService'
import { formatCurrency, parseCurrency, maskCurrency, formatDate } from '../utils/format'
import { Modal, Alert } from './ui'

const DEFAULT_ITEM = {
  product_id: '', product_name: '', quantity: 1,
  unit_price: '', cost_price: 0, sale_kind: 'exchange',
  empty_returned: true, empty_qty_returned: 1,
}

const DEFAULT_PAYMENT_SPLIT = {
  payment_method_id: '',
  card_machine_id: '',
  amount: '',
}

const DEFAULT_GAS_POVO_SALE_PRICE = 100.23
const DEFAULT_STREET_SALE_PRICE = 125
const DEFAULT_EMPTY_CYLINDER_SALE_PRICE = 200
const DEFAULT_FULL_NO_RETURN_SALE_PRICE = 300

const SALE_CHANNELS = [
  { value: 'street', label: 'Rua', icon: Truck, color: 'bg-orange-500', light: 'bg-orange-50 border-orange-300 text-orange-700' },
  { value: 'counter', label: 'Portaria', icon: Store, color: 'bg-brand-600', light: 'bg-brand-50 border-brand-300 text-brand-700' },
]

const SALE_KIND_OPTIONS = [
  { value: 'exchange', label: 'Gás com troca', hint: 'Sai cheio e entra vazio retornado.' },
  { value: 'empty_cylinder', label: 'Vazio / casco', hint: 'Venda de botijão vazio por R$ 200,00. Baixa dos vazios.' },
  { value: 'full_no_return', label: 'Cheio sem retorno', hint: 'Venda do botijão cheio sem casco retornado por R$ 300,00.' },
]

function moneyToInput(value) {
  return Number(value || 0).toFixed(2).replace('.', ',')
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function currentTimeInput() {
  const now = new Date()
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

function selectedDateWithTimeToISO(dateStr, timeStr) {
  const safeDate = dateStr || new Date().toISOString().slice(0, 10)
  const safeTime = timeStr || currentTimeInput()
  return new Date(`${safeDate}T${safeTime}:00`).toISOString()
}

function isToday(dateStr) {
  const now = new Date()
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  return dateStr === today
}

export default function SaleEntryModal({ open, onClose, selectedDate, companyId, profile, onSaved }) {
  const [products, setProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [cardMachines, setCardMachines] = useState([])
  const [customers, setCustomers] = useState([])
  const [settings, setSettings] = useState({ gas_povo_delivery_fee: 20 })
  const [loading, setLoading] = useState(false)

  const [saleDate, setSaleDate] = useState(selectedDate)
  const [saleTime, setSaleTime] = useState(currentTimeInput())
  const [channel, setChannel] = useState('street')
  const [items, setItems] = useState([{ ...DEFAULT_ITEM }])
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [cardMachineId, setCardMachineId] = useState('')
  const [isSplitPayment, setIsSplitPayment] = useState(false)
  const [paymentSplits, setPaymentSplits] = useState([{ ...DEFAULT_PAYMENT_SPLIT }])
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setSaleDate(selectedDate)
    setSaleTime(isToday(selectedDate) ? currentTimeInput() : '19:20')
    resetForm(false)
    if (companyId) loadData()
  }, [open, selectedDate, companyId])

  async function loadData() {
    setLoading(true)
    try {
      const [prodRes, pmRes, cmRes, custRes, settRes] = await Promise.all([
        supabase.from('products').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('payment_methods').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('card_machines').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('customers').select('id, name, type, code, default_payment_method_id, default_product').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('settings').select('*').eq('company_id', companyId).single(),
      ])
      if (prodRes.error) throw prodRes.error
      if (pmRes.error) throw pmRes.error
      if (cmRes.error) throw cmRes.error
      if (custRes.error) throw custRes.error
      setProducts(prodRes.data || [])
      setPaymentMethods(pmRes.data || [])
      setCardMachines(cmRes.data || [])
      setCustomers(custRes.data || [])
      if (settRes.data) setSettings(settRes.data)
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao carregar dados da venda')
    } finally {
      setLoading(false)
    }
  }

  function resetForm(clearSuccess = true) {
    setChannel('street')
    setItems([{ ...DEFAULT_ITEM }])
    setPaymentMethodId('')
    setCardMachineId('')
    setIsSplitPayment(false)
    setPaymentSplits([{ ...DEFAULT_PAYMENT_SPLIT }])
    setCustomerId('')
    setCustomerName('')
    setDiscount('')
    setNotes('')
    if (clearSuccess) setSuccess(false)
  }

  const selectedPM = paymentMethods.find(p => p.id === paymentMethodId)
  const isGasPovo = !isSplitPayment && selectedPM?.type === 'gas_povo'
  const isValeHub = !isSplitPayment && selectedPM?.type === 'vale_hub'
  const requiresMachine = !isSplitPayment && selectedPM?.requires_machine && !isValeHub
  const deliveryFee = isGasPovo && channel === 'street' ? Number(settings.gas_povo_delivery_fee || 0) : 0

  const subtotal = items.reduce((s, i) => s + parseCurrency(i.unit_price) * (Number(i.quantity) || 1), 0)
  const discountVal = parseCurrency(discount)
  const total = subtotal + deliveryFee - discountVal
  const splitPaidTotal = paymentSplits.reduce((sum, split) => sum + parseCurrency(split.amount), 0)
  const splitRemaining = total - splitPaidTotal

  const selectedChannel = useMemo(() => SALE_CHANNELS.find(c => c.value === channel) || SALE_CHANNELS[0], [channel])

  function getProductSalePrice(prod, gasPovo = isGasPovo, saleChannel = channel, valeHub = isValeHub, saleKind = 'exchange') {
    if (!prod) return 0
    if (saleKind === 'empty_cylinder') return Number(prod.empty_cylinder_sale_price ?? DEFAULT_EMPTY_CYLINDER_SALE_PRICE)
    if (saleKind === 'full_no_return') return Number(prod.full_no_return_sale_price ?? DEFAULT_FULL_NO_RETURN_SALE_PRICE)
    if (gasPovo) return Number(prod.gas_povo_sale_price ?? DEFAULT_GAS_POVO_SALE_PRICE)
    if (!valeHub && saleChannel === 'street') return Number(prod.street_sale_price || DEFAULT_STREET_SALE_PRICE)
    return Number(prod.sale_price || 0)
  }

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

    setItems(prev => prev.map(item => {
      const prod = products.find(p => p.id === item.product_id)
      if (!prod) return item
      return {
        ...item,
        sale_kind: item.sale_kind || 'exchange',
        unit_price: moneyToInput(getProductSalePrice(prod, false, channel, false, item.sale_kind || 'exchange')),
      }
    }))
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
    setPaymentSplit(index, 'amount', moneyToInput(Math.max(0, total - othersTotal)))
  }

  function handlePaymentMethodChange(id) {
    setPaymentMethodId(id)
    const selected = paymentMethods.find(p => p.id === id)
    if (!selected?.requires_machine || selected?.type === 'vale_hub') setCardMachineId('')

    if (selected?.type === 'vale_hub') {
      setItems(prev => prev.map(item => {
        const prod = products.find(p => p.id === item.product_id)
        return {
          ...item,
          sale_kind: 'exchange',
          unit_price: prod ? moneyToInput(getProductSalePrice(prod, false, channel, true, 'exchange')) : item.unit_price,
          empty_returned: true,
          empty_qty_returned: Number(item.quantity || 1),
        }
      }))
    }

    if (selected?.type === 'gas_povo') {
      setItems(prev => prev.map(item => {
        const prod = products.find(p => p.id === item.product_id)
        if (!prod) return item
        return {
          ...item,
          sale_kind: 'exchange',
          unit_price: moneyToInput(getProductSalePrice(prod, true, channel, false, 'exchange')),
        }
      }))
    }
  }

  function handleChannelChange(nextChannel) {
    setChannel(nextChannel)
    setItems(prev => prev.map(item => {
      const prod = products.find(p => p.id === item.product_id)
      if (!prod) return item
      return {
        ...item,
        unit_price: moneyToInput(getProductSalePrice(prod, isGasPovo, nextChannel, isValeHub, item.sale_kind)),
      }
    }))
  }

  function setItem(index, field, value) {
    setItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        if (prod) {
          updated[index].product_name = prod.name
          updated[index].unit_price = moneyToInput(getProductSalePrice(prod, isGasPovo, channel, isValeHub, updated[index].sale_kind || 'exchange'))
          updated[index].cost_price = prod.cost_price
          if (!prod.is_cylinder) {
            updated[index].sale_kind = 'exchange'
            updated[index].empty_returned = false
            updated[index].empty_qty_returned = 0
          }
        }
      }
      if (field === 'sale_kind') {
        const prod = products.find(p => p.id === updated[index].product_id)
        updated[index].sale_kind = value
        updated[index].unit_price = prod ? moneyToInput(getProductSalePrice(prod, isGasPovo, channel, isValeHub, value)) : updated[index].unit_price
        if (value !== 'exchange') {
          updated[index].empty_returned = false
          updated[index].empty_qty_returned = 0
        } else {
          updated[index].empty_returned = true
          updated[index].empty_qty_returned = Number(updated[index].quantity || 1)
        }
      }
      if (field === 'quantity' && updated[index].empty_returned) updated[index].empty_qty_returned = Number(value) || 1
      if (field === 'quantity' && isValeHub) {
        updated[index].empty_returned = true
        updated[index].empty_qty_returned = Number(value) || 1
      }
      if (field === 'empty_returned') updated[index].empty_qty_returned = value ? (updated[index].quantity || 1) : 0
      if (updated[index].sale_kind !== 'exchange') {
        updated[index].empty_returned = false
        updated[index].empty_qty_returned = 0
      }
      return updated
    })
  }

  function handleCustomerChange(id) {
    setCustomerId(id)
    const cust = customers.find(c => c.id === id)
    if (cust) {
      setCustomerName(cust.name)
      if (cust.default_payment_method_id) handlePaymentMethodChange(cust.default_payment_method_id)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!saleDate || !saleTime) { toast.error('Informe data e horário da venda'); return }
    if (!isSplitPayment && !paymentMethodId) { toast.error('Selecione a forma de pagamento'); return }
    if (items.some(i => !i.product_id)) { toast.error('Selecione o produto em todos os itens'); return }
    if (requiresMachine && !cardMachineId) { toast.error('Selecione a maquininha'); return }
    if (isSplitPayment) {
      const validSplits = paymentSplits.filter(split => split.payment_method_id && parseCurrency(split.amount) > 0)
      if (validSplits.length < 2) { toast.error('Informe pelo menos duas formas de pagamento no pagamento dividido.'); return }
      if (Math.abs(splitPaidTotal - total) > 0.01) { toast.error('A soma dos pagamentos precisa ser igual ao total da venda.'); return }
      const missingMachine = validSplits.find(split => paymentMethodRequiresMachine(split.payment_method_id) && !split.card_machine_id)
      if (missingMachine) { toast.error('Selecione a maquininha para o pagamento com cartão.'); return }
      const hasSpecial = validSplits.some(split => ['gas_povo', 'vale_hub'].includes(getPaymentMethodById(split.payment_method_id)?.type))
      if (hasSpecial) { toast.error('Pagamento dividido não deve usar Gás do Povo ou Vale Hub.'); return }
    }
    if (isValeHub && items.some(i => i.sale_kind !== 'exchange')) { toast.error('Vale Hub / Ultragaz só deve ser usado em venda com troca.'); return }
    if (isGasPovo) {
      const invalidGasPovo = items.find(i => {
        const prod = products.find(p => p.id === i.product_id)
        return i.sale_kind !== 'exchange' || Number(prod?.gas_povo_sale_price ?? 0) <= 0
      })
      if (invalidGasPovo) { toast.error('Gás do Povo só está disponível para produtos habilitados, como P13.'); return }
    }

    setSubmitting(true)
    const soldAt = selectedDateWithTimeToISO(saleDate, saleTime)
    const baseNotes = `Venda adicionada pela Conferência do Dia referente a ${formatDate(saleDate)}.`
    const finalNotes = notes?.trim() ? `${baseNotes} ${notes.trim()}` : baseNotes

    const { error } = await salesService.createSale({
      company_id: companyId,
      customer_id: customerId || null,
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
      items: items.map(i => ({
        ...i,
        unit_price: parseCurrency(i.unit_price),
        quantity: Number(i.quantity),
        empty_qty_returned: i.empty_returned ? Number(i.empty_qty_returned) : 0,
      })),
      delivery_fee: deliveryFee,
      discount: discountVal,
      notes: finalNotes,
      sold_at: soldAt,
      created_by: profile?.id,
    })

    setSubmitting(false)
    if (error) { toast.error('Erro: ' + error.message); return }

    setSuccess(true)
    toast.success('Venda adicionada na conferência!')
    await onSaved?.()
    setTimeout(() => {
      setSuccess(false)
      resetForm()
      onClose?.()
    }, 600)
  }

  const modalTitle = `Adicionar venda esquecida — ${formatDate(selectedDate)}`
  const timeDescription = saleDate === selectedDate
    ? 'A venda será lançada na data selecionada na Conferência do Dia.'
    : 'Atenção: a data da venda foi alterada manualmente.'

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} maxWidth="max-w-5xl">
      <div className="space-y-4">
        {success && (
          <div className="flex items-center gap-2 p-4 bg-success-50 border border-success-200 rounded-xl text-success-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Venda registrada na conferência.</span>
          </div>
        )}

        <Alert
          type="info"
          title="Lançamento pela conferência"
          message="Esta tela não usa o relógio em tempo real da Nova Venda. Ela usa a data da conferência selecionada, com horário informado manualmente."
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card bg-slate-50">
            <div className="grid sm:grid-cols-[1fr_180px_160px] gap-3 items-end">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data base da conferência</p>
                  <p className="text-lg font-display font-bold text-slate-900">{formatDate(selectedDate)}</p>
                  <p className="text-xs text-slate-500">{timeDescription}</p>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Data da venda</label>
                <input type="date" className="input" value={saleDate} onChange={e => setSaleDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="label">Horário</label>
                <input type="time" className="input" value={saleTime} onChange={e => setSaleTime(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Canal de venda</p>
            <div className="grid grid-cols-2 gap-3">
              {SALE_CHANNELS.map(ch => {
                const Icon = ch.icon
                const active = channel === ch.value
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => handleChannelChange(ch.value)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all font-semibold text-sm ${active ? `${ch.light} border-current shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? ch.color : 'bg-slate-100'}`}>
                      <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    {ch.label}
                    {active && <span className="ml-auto text-xs font-bold">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-5">
            <div className="space-y-5">
              <div className="card">
                <h3 className="font-semibold text-sm text-slate-600 mb-3">Cliente (opcional)</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="label">Cliente cadastrado</label>
                    <select className="input" value={customerId} onChange={e => handleCustomerChange(e.target.value)} disabled={loading}>
                      <option value="">— Selecionar cliente —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ''}{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Nome / identificação</label>
                    <input className="input" placeholder="Ex: João, Creche Alegria..." value={customerName} onChange={e => setCustomerName(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-slate-600">Produtos</h3>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setItems(p => [...p, { ...DEFAULT_ITEM }])}>
                    <PlusCircle className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>

                <div className="space-y-4">
                  {items.map((item, idx) => {
                    const prod = products.find(p => p.id === item.product_id)
                    const isCylinder = prod?.is_cylinder !== false
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Item {idx + 1}</span>
                          {items.length > 1 && (
                            <button type="button" className="ml-auto text-danger-500 hover:text-danger-700" aria-label="Remover item" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 form-group">
                            <label className="label">Produto *</label>
                            <select className="input" value={item.product_id} onChange={e => setItem(idx, 'product_id', e.target.value)} required disabled={loading}>
                              <option value="">Selecionar...</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="label">Qtd *</label>
                            <input type="number" min="1" className="input text-center" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} required />
                          </div>
                        </div>

                        {isCylinder && (
                          <div className="form-group">
                            <label className="label">Tipo da venda</label>
                            <select className="input" value={item.sale_kind || 'exchange'} onChange={e => setItem(idx, 'sale_kind', e.target.value)} disabled={isValeHub || isGasPovo}>
                              {SALE_KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">{SALE_KIND_OPTIONS.find(option => option.value === (item.sale_kind || 'exchange'))?.hint}</p>
                          </div>
                        )}

                        <div className="form-group">
                          <label className="label">Valor unitário *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                            <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', maskCurrency(e.target.value.replace(/\D/g, '')))} required />
                          </div>
                        </div>

                        {isCylinder && (item.sale_kind || 'exchange') === 'exchange' && (
                          <div className="flex items-center gap-3 pt-1">
                            <input type="checkbox" id={`review-empty-${idx}`} className="w-4 h-4 rounded accent-brand-600" checked={item.empty_returned} disabled={isValeHub} onChange={e => setItem(idx, 'empty_returned', e.target.checked)} />
                            <label htmlFor={`review-empty-${idx}`} className="text-sm text-slate-600">{isValeHub ? 'Vazio vai para HUB a retornar' : 'Retornou botijão vazio'}</label>
                            {item.empty_returned && (
                              <input type="number" min="0" max={item.quantity} className="input w-16 text-center ml-auto" value={item.empty_qty_returned} disabled={isValeHub} onChange={e => setItem(idx, 'empty_qty_returned', e.target.value)} />
                            )}
                          </div>
                        )}

                        <div className="text-right text-sm font-semibold text-slate-700">
                          Subtotal: {formatCurrency(parseCurrency(item.unit_price) * (Number(item.quantity) || 1))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-sm text-slate-600">Pagamento</h3>
                  <button type="button" className={`btn-sm ${isSplitPayment ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSplitPayment(!isSplitPayment)}>
                    {isSplitPayment ? 'Pagamento dividido ativo' : 'Dividir pagamento'}
                  </button>
                </div>

                {!isSplitPayment ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="form-group">
                      <label className="label">Forma de pagamento *</label>
                      <select className="input" value={paymentMethodId} onChange={e => handlePaymentMethodChange(e.target.value)} required disabled={loading}>
                        <option value="">Selecionar...</option>
                        {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                      </select>
                    </div>
                    {requiresMachine && (
                      <div className="form-group">
                        <label className="label">Maquininha *</label>
                        <select className="input" value={cardMachineId} onChange={e => setCardMachineId(e.target.value)} required disabled={loading}>
                          <option value="">Selecionar...</option>
                          {cardMachines.map(cm => <option key={cm.id} value={cm.id}>{cm.name} ({cm.brand})</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                      Use quando o cliente pagar em mais de uma forma. Exemplo: R$ 100,00 no Pix e R$ 25,00 no dinheiro.
                    </div>
                    {paymentSplits.map((split, idx) => {
                      const method = getPaymentMethodById(split.payment_method_id)
                      const splitRequiresMachine = method?.requires_machine && method?.type !== 'vale_hub'
                      return (
                        <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pagamento {idx + 1}</span>
                            {paymentSplits.length > 1 && <button type="button" aria-label="Remover pagamento" className="text-danger-500 hover:text-danger-700" onClick={() => removePaymentSplit(idx)}><Trash2 className="w-4 h-4" /></button>}
                          </div>
                          <div className="grid sm:grid-cols-[1fr_1fr_150px] gap-3">
                            <div className="form-group">
                              <label className="label">Forma *</label>
                              <select className="input" value={split.payment_method_id} onChange={e => setPaymentSplit(idx, 'payment_method_id', e.target.value)} required disabled={loading}>
                                <option value="">Selecionar...</option>
                                {paymentMethods.filter(pm => !['gas_povo', 'vale_hub'].includes(pm.type)).map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                              </select>
                            </div>
                            {splitRequiresMachine ? (
                              <div className="form-group">
                                <label className="label">Maquininha *</label>
                                <select className="input" value={split.card_machine_id} onChange={e => setPaymentSplit(idx, 'card_machine_id', e.target.value)} required disabled={loading}>
                                  <option value="">Selecionar...</option>
                                  {cardMachines.map(cm => <option key={cm.id} value={cm.id}>{cm.name} ({cm.brand})</option>)}
                                </select>
                              </div>
                            ) : <div className="form-group hidden sm:block" />}
                            <div className="form-group">
                              <label className="label">Valor *</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                                <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00" value={split.amount} onChange={e => setPaymentSplit(idx, 'amount', maskCurrency(e.target.value.replace(/\D/g, '')))} required />
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

                {isGasPovo && <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-700"><strong>Gás do Povo:</strong> preço unitário ajustado para o produto e taxa de entrega aplicada quando for Rua.</div>}
                {isValeHub && <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200 text-sm text-purple-700"><strong>Vale Hub / Ultragaz:</strong> não usa maquininha e soma HUB a retornar.</div>}

                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <div className="form-group">
                    <label className="label">Desconto (R$)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00" value={discount} onChange={e => setDiscount(maskCurrency(e.target.value.replace(/\D/g, '')))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">Observações</label>
                    <input className="input" placeholder="Opcional..." value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-4 self-start">
              <div className="card bg-slate-900 text-white border-0">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-700">
                  {(() => { const Icon = selectedChannel.icon; return <Icon className="w-4 h-4 text-slate-400" /> })()}
                  <span className="text-sm text-slate-400">Canal: <strong className="text-white">{selectedChannel.label}</strong></span>
                </div>
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-700">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Data/hora: <strong className="text-white">{formatDate(saleDate)} às {saleTime}</strong></span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  {deliveryFee > 0 && <div className="flex justify-between"><span className="text-slate-400">Taxa de entrega</span><span>{formatCurrency(deliveryFee)}</span></div>}
                  {discountVal > 0 && <div className="flex justify-between text-success-400"><span>Desconto</span><span>-{formatCurrency(discountVal)}</span></div>}
                  {isSplitPayment && <div className="flex justify-between text-emerald-300"><span>Pago no dividido</span><span>{formatCurrency(splitPaidTotal)}</span></div>}
                  <div className="border-t border-slate-700 pt-2 flex justify-between text-lg font-bold"><span>Total</span><span className="text-orange-400">{formatCurrency(total)}</span></div>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full btn-lg text-lg" disabled={submitting || loading}>
                {submitting ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Registrando…</> : <><ShoppingCart className="w-5 h-5" /> Registrar venda — {formatCurrency(total)}</>}
              </button>
              <button type="button" className="btn-outline w-full" onClick={onClose} disabled={submitting}>Fechar sem salvar</button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  )
}
