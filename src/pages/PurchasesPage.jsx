import { useState, useEffect } from 'react'
import { Plus, Truck, Pencil, Trash2, PackageCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { stockService } from '../services/stockService'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatCurrency, formatDateTime, parseCurrency, maskCurrency } from '../utils/format'

function formatDateTimeInput(value) {
  if (!value) return new Date().toISOString().slice(0, 16)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function getPurchaseQuantity(purchase) {
  return (purchase?.purchase_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function getItemFinalUnitCost(item) {
  const finalCost = Number(item?.final_unit_cost || 0)
  if (finalCost > 0) return finalCost
  return Number(item?.unit_cost || 0)
}

function getFinalUnitCostsLabel(purchase) {
  const items = purchase?.purchase_items || []
  if (!items.length) return '—'
  return items
    .map(item => `${item.product_name}: ${formatCurrency(getItemFinalUnitCost(item))}`)
    .join(' • ')
}

function formatDateOnlyBR(value) {
  const raw = String(value || '').slice(0, 10)
  const [year, month, day] = raw.split('-')
  if (!year || !month || !day) return '—'
  return `${day}/${month}/${year}`
}

function todayDateKey() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function getDeliveryProgress(purchase) {
  const items = purchase?.purchase_items || []
  const ordered = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const received = items.reduce((sum, item) => sum + Number(item.received_quantity || 0), 0)
  return {
    ordered,
    received,
    remaining: Math.max(0, ordered - received),
  }
}

function getDeliveryStatusMeta(purchase) {
  const status = purchase?.delivery_status || 'received'
  const expected = String(purchase?.expected_delivery_date || '').slice(0, 10)
  const today = todayDateKey()
  const overdue = expected && expected < today && status !== 'received'

  if (status === 'received') {
    return {
      label: 'Recebido',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    }
  }

  if (status === 'partial') {
    return {
      label: overdue ? 'Parcial • atrasado' : 'Recebimento parcial',
      className: overdue
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-amber-100 text-amber-800 border-amber-200',
    }
  }

  if (overdue) {
    return {
      label: 'Atrasado',
      className: 'bg-red-100 text-red-700 border-red-200',
    }
  }

  if (expected === today) {
    return {
      label: 'Entrega prevista hoje',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
    }
  }

  return {
    label: 'Aguardando entrega',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  }
}

export default function PurchasesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id

  const [showModal, setShowModal] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [receivingPurchase, setReceivingPurchase] = useState(null)

  const { data: purchases, loading, refetch } = useSupabaseQuery(
    () => supabase
      .from('purchases')
      .select(`
        *,
        purchase_items(
          id,
          product_id,
          product_name,
          quantity,
          received_quantity,
          unit_cost,
          total_cost,
          empty_returned,
          freight_allocated,
          discount_allocated,
          final_total_cost,
          final_unit_cost
        )
      `)
      .eq('company_id', companyId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('purchased_at', { ascending: false })
      .limit(100),
    [companyId]
  )

  function openCreateModal() {
    setEditingPurchase(null)
    setShowModal(true)
  }

  function openEditModal(purchase) {
    setEditingPurchase(purchase)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingPurchase(null)
  }

  async function handleDeletePurchase(purchase) {
    const progress = getDeliveryProgress(purchase)
    const stockMessage = progress.received > 0
      ? `\n\nJá foram recebidos ${progress.received} botijões. O estoque recebido será revertido.`
      : '\n\nComo nada foi recebido ainda, o estoque não será alterado.'

    const confirmed = window.confirm(
      `Excluir a compra #${purchase.purchase_number || ''}?${stockMessage}`
    )

    if (!confirmed) return

    const { error } = await stockService.deletePurchase({
      purchase_id: purchase.id,
      company_id: companyId,
      performed_by: profile?.id,
      reason: `Exclusão da compra #${purchase.purchase_number || ''}`,
    })

    if (error) {
      toast.error(error.message || 'Erro ao excluir compra')
      return
    }

    toast.success('Compra excluída!')
    refetch()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras de Gás"
        subtitle="Pedidos, previsão de entrega e recebimento físico"
        actions={
          <button className="btn-primary" onClick={openCreateModal}>
            <Plus className="w-4 h-4" /> Nova Compra
          </button>
        }
      />

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Novo fluxo:</strong> cadastrar uma compra não altera o estoque.
        Os cheios entram e os vazios são baixados somente quando você clicar em
        <strong> Confirmar chegada</strong>. Se chegar menos que o pedido, o sistema mantém o restante pendente.
      </div>

      {!(purchases || []).length ? (
        <EmptyState
          icon={Truck}
          title="Nenhuma compra registrada"
          action={
            <button className="btn-primary btn-sm" onClick={openCreateModal}>
              <Plus className="w-3.5 h-3.5" /> Nova Compra
            </button>
          }
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Compra</th>
                <th>Previsão</th>
                <th>Fornecedor</th>
                <th>Pedido / recebido</th>
                <th>Status</th>
                <th className="text-right">Total líquido</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>

            <tbody>
              {(purchases || []).map(purchase => {
                const status = getDeliveryStatusMeta(purchase)
                const progress = getDeliveryProgress(purchase)

                return (
                  <tr key={purchase.id}>
                    <td className="font-mono text-xs text-slate-500">
                      #{purchase.purchase_number}
                    </td>

                    <td className="text-xs whitespace-nowrap">
                      {formatDateTime(purchase.purchased_at)}
                    </td>

                    <td className="text-xs whitespace-nowrap">
                      {purchase.expected_delivery_date
                        ? formatDateOnlyBR(purchase.expected_delivery_date)
                        : '—'}
                    </td>

                    <td className="font-medium">{purchase.supplier_name || '—'}</td>

                    <td className="text-xs min-w-[220px]">
                      <div className="space-y-1">
                        {(purchase.purchase_items || []).map(item => {
                          const ordered = Number(item.quantity || 0)
                          const received = Number(item.received_quantity || 0)
                          const remaining = Math.max(0, ordered - received)

                          return (
                            <div key={item.id}>
                              <span className="font-medium text-slate-700">
                                {item.product_name}:
                              </span>{' '}
                              {ordered} pedido(s) • {received} recebido(s)
                              {remaining > 0 && (
                                <span className="text-amber-700 font-medium">
                                  {' '}• faltam {remaining}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>

                    <td>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>

                    <td className="text-right font-semibold currency">
                      {formatCurrency(purchase.total_cost)}
                    </td>

                    <td className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {purchase.delivery_status !== 'received' && (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => setReceivingPurchase(purchase)}
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            {purchase.delivery_status === 'partial'
                              ? 'Receber restante'
                              : 'Confirmar chegada'}
                          </button>
                        )}

                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEditModal(purchase)}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Alterar
                        </button>

                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDeletePurchase(purchase)}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PurchaseModal
        open={showModal}
        purchase={editingPurchase}
        companyId={companyId}
        userId={profile?.id}
        onClose={closeModal}
        onSuccess={() => {
          const wasEditing = Boolean(editingPurchase)
          closeModal()
          refetch()
          toast.success(
            wasEditing
              ? 'Compra alterada!'
              : 'Compra registrada! Aguardando entrega.'
          )
        }}
      />

      <ReceiptModal
        open={Boolean(receivingPurchase)}
        purchase={receivingPurchase}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setReceivingPurchase(null)}
        onSuccess={result => {
          setReceivingPurchase(null)
          refetch()

          if (result?.status === 'received') {
            toast.success('Chegada confirmada! Compra recebida integralmente.')
          } else {
            toast.success(
              `Recebimento parcial registrado. Ainda faltam ${result?.remaining_quantity || 0} botijões.`
            )
          }
        }}
      />
    </div>
  )
}

function PurchaseModal({ open, purchase, companyId, userId, onClose, onSuccess }) {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState([
    {
      id: null,
      product_id: '',
      product_name: '',
      quantity: 1,
      received_quantity: 0,
      product_total: '',
    },
  ])
  const [notes, setNotes] = useState('')
  const [freightCost, setFreightCost] = useState('0,00')
  const [discountCredit, setDiscountCredit] = useState('0,00')
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 16))
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEditing = Boolean(purchase?.id)
  const structuralLocked = isEditing && (purchase?.purchase_items || [])
    .some(item => Number(item.received_quantity || 0) > 0)

  useEffect(() => {
    if (open && companyId) {
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('company_id', companyId)
        .then(r => setSuppliers(r.data || []))

      supabase
        .from('products')
        .select('id, name, code')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .then(r => setProducts(r.data || []))
    }
  }, [open, companyId])

  useEffect(() => {
    if (!open) return

    if (purchase) {
      setSupplierId(purchase.supplier_id || '')
      setSupplierName(purchase.supplier_name || '')
      setNotes(purchase.notes || '')
      setFreightCost(
        maskCurrency(String(Math.round(Number(purchase.freight_cost || 0) * 100)))
      )
      setDiscountCredit(
        maskCurrency(String(Math.round(Number(purchase.discount_credit || 0) * 100)))
      )
      setPurchasedAt(formatDateTimeInput(purchase.purchased_at))
      setExpectedDeliveryDate(
        String(purchase.expected_delivery_date || '').slice(0, 10)
      )
      setItems(
        (purchase.purchase_items || []).map(item => ({
          id: item.id,
          product_id: item.product_id || '',
          product_name: item.product_name || '',
          quantity: Number(item.quantity || 1),
          received_quantity: Number(item.received_quantity || 0),
          product_total: maskCurrency(
            String(Math.round(Number(item.total_cost || 0) * 100))
          ),
        }))
      )
    } else {
      setSupplierId('')
      setSupplierName('')
      setItems([
        {
          id: null,
          product_id: '',
          product_name: '',
          quantity: 1,
          received_quantity: 0,
          product_total: '',
        },
      ])
      setNotes('')
      setFreightCost('0,00')
      setDiscountCredit('0,00')
      setPurchasedAt(new Date().toISOString().slice(0, 16))
      setExpectedDeliveryDate('')
    }
  }, [open, purchase])

  function setItem(idx, field, value) {
    setItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }

      if (field === 'product_id') {
        const product = products.find(p => p.id === value)
        if (product) updated[idx].product_name = product.name
      }

      return updated
    })
  }

  function removeItem(idx) {
    if (structuralLocked) return
    setItems(prev => (
      prev.length === 1
        ? prev
        : prev.filter((_, index) => index !== idx)
    ))
  }

  const normalizedItems = items.map(item => {
    const quantity = Number(item.quantity || 0)
    const productTotal = parseCurrency(item.product_total)

    return {
      ...item,
      quantity,
      product_total: productTotal,
      total_cost: productTotal,
      unit_cost: quantity > 0 ? productTotal / quantity : 0,
    }
  })

  const itemsTotal = normalizedItems.reduce(
    (sum, item) => sum + item.product_total,
    0
  )
  const freightTotal = parseCurrency(freightCost)
  const discountTotal = parseCurrency(discountCredit)
  const total = itemsTotal + freightTotal - discountTotal

  let freightAllocatedSoFar = 0
  let discountAllocatedSoFar = 0

  const calculatedItems = normalizedItems.map((item, idx) => {
    const isLast = idx === normalizedItems.length - 1
    const ratio = itemsTotal > 0 ? item.product_total / itemsTotal : 0

    const freightAllocated = isLast
      ? Number((freightTotal - freightAllocatedSoFar).toFixed(2))
      : Number((freightTotal * ratio).toFixed(2))

    const discountAllocated = isLast
      ? Number((discountTotal - discountAllocatedSoFar).toFixed(2))
      : Number((discountTotal * ratio).toFixed(2))

    freightAllocatedSoFar += freightAllocated
    discountAllocatedSoFar += discountAllocated

    const finalTotalCost =
      item.product_total + freightAllocated - discountAllocated

    const finalUnitCost =
      item.quantity > 0 ? finalTotalCost / item.quantity : 0

    return {
      ...item,
      freight_allocated: freightAllocated,
      discount_allocated: discountAllocated,
      final_total_cost: finalTotalCost,
      final_unit_cost: finalUnitCost,
    }
  })

  async function handleSubmit(e) {
    e.preventDefault()

    if (!supplierId) {
      toast.error('Selecione o fornecedor')
      return
    }

    if (normalizedItems.some(item => !item.product_id || item.quantity <= 0)) {
      toast.error('Informe produto e quantidade maior que zero em todos os itens')
      return
    }

    if (normalizedItems.some(item => item.product_total <= 0)) {
      toast.error('Informe o valor total dos produtos em todos os itens')
      return
    }

    if (discountTotal < 0 || total < 0) {
      toast.error(
        'Descontos/créditos não podem deixar o custo líquido da compra negativo'
      )
      return
    }

    setSubmitting(true)

    const payload = {
      company_id: companyId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      items: calculatedItems,
      notes,
      freight_cost: freightTotal,
      discount_credit: discountTotal,
      purchased_at: new Date(purchasedAt).toISOString(),
      expected_delivery_date: expectedDeliveryDate || null,
      created_by: userId,
    }

    const { error } = isEditing
      ? await stockService.updatePurchase({
          purchase_id: purchase.id,
          ...payload,
        })
      : await stockService.registerPurchase(payload)

    setSubmitting(false)

    if (error) {
      toast.error(error.message)
      return
    }

    onSuccess()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEditing
          ? `Alterar Compra #${purchase?.purchase_number || ''}`
          : 'Nova Compra de Gás'
      }
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {structuralLocked && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Esta compra já possui recebimento. Produto e quantidade pedida ficam bloqueados,
            mas você ainda pode corrigir valores, fornecedor, previsão e observações.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Fornecedor *</label>
            <select
              className="input"
              value={supplierId}
              onChange={e => {
                setSupplierId(e.target.value)
                setSupplierName(
                  suppliers.find(s => s.id === e.target.value)?.name || ''
                )
              }}
              required
            >
              <option value="">Selecionar...</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="label">Data/Hora da compra</label>
            <input
              type="datetime-local"
              className="input"
              value={purchasedAt}
              onChange={e => setPurchasedAt(e.target.value)}
            />
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Previsão de entrega</label>
            <input
              type="date"
              className="input"
              value={expectedDeliveryDate}
              onChange={e => setExpectedDeliveryDate(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Opcional. Enquanto a compra não for recebida, o sistema usa essa data para indicar atraso.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Produtos do pedido</label>

            {!structuralLocked && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setItems(prev => [
                  ...prev,
                  {
                    id: null,
                    product_id: '',
                    product_name: '',
                    quantity: 1,
                    received_quantity: 0,
                    product_total: '',
                  },
                ])}
              >
                <Plus className="w-3.5 h-3.5" /> Item
              </button>
            )}
          </div>

          {items.map((item, idx) => {
            const calculated = calculatedItems[idx]
            const productUnitCost =
              calculated?.quantity > 0
                ? calculated.product_total / calculated.quantity
                : 0

            return (
              <div
                key={item.id || idx}
                className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-group col-span-2">
                    <label className="label">Produto *</label>
                    <select
                      className="input"
                      value={item.product_id}
                      disabled={structuralLocked}
                      onChange={e => setItem(idx, 'product_id', e.target.value)}
                      required
                    >
                      <option value="">Selecionar...</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label">Qtd pedida</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={item.quantity}
                      disabled={structuralLocked}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Valor total dos produtos</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input pl-8"
                        placeholder="0,00"
                        value={item.product_total}
                        onChange={e => setItem(
                          idx,
                          'product_total',
                          maskCurrency(e.target.value.replace(/\D/g, ''))
                        )}
                        required
                      />
                    </div>
                  </div>

                  {Number(item.received_quantity || 0) > 0 && (
                    <div className="col-span-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
                      Já recebido: <strong>{item.received_quantity}</strong> de{' '}
                      <strong>{item.quantity}</strong>.
                    </div>
                  )}

                  {calculated?.product_total > 0 && (
                    <div className="col-span-2 grid sm:grid-cols-4 gap-2 rounded-lg bg-white border border-slate-200 p-2 text-xs">
                      <div>
                        <p className="text-slate-500">Produto/un.</p>
                        <p className="font-semibold text-slate-800">
                          {formatCurrency(productUnitCost)}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Frete rateado</p>
                        <p className="font-semibold text-slate-800">
                          {formatCurrency(calculated.freight_allocated)}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Crédito rateado</p>
                        <p className="font-semibold text-emerald-700">
                          - {formatCurrency(calculated.discount_allocated)}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Custo final/un.</p>
                        <p className="font-bold text-slate-800">
                          {formatCurrency(calculated.final_unit_cost)}
                        </p>
                      </div>
                    </div>
                  )}

                  {!structuralLocked && items.length > 1 && (
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => removeItem(idx)}
                      >
                        Remover item
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Frete da compra</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                R$
              </span>
              <input
                type="text"
                inputMode="numeric"
                className="input pl-8"
                placeholder="0,00"
                value={freightCost}
                onChange={e => setFreightCost(
                  maskCurrency(e.target.value.replace(/\D/g, ''))
                )}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Descontos / créditos</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                R$
              </span>
              <input
                type="text"
                inputMode="numeric"
                className="input pl-8"
                placeholder="0,00"
                value={discountCredit}
                onChange={e => setDiscountCredit(
                  maskCurrency(e.target.value.replace(/\D/g, ''))
                )}
              />
            </div>
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Observações</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-slate-100 rounded-xl p-3 space-y-1">
          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Produtos</span>
            <span className="currency">{formatCurrency(itemsTotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Frete</span>
            <span className="currency">{formatCurrency(freightTotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Descontos / créditos</span>
            <span className="currency text-emerald-700">
              - {formatCurrency(discountTotal)}
            </span>
          </div>

          <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
            <span className="text-sm text-slate-600 font-medium">
              Total líquido da compra
            </span>
            <span className="font-bold text-lg text-slate-800">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {!isEditing && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
            Ao salvar, a compra ficará em <strong>Aguardando entrega</strong>.
            Nenhum estoque será alterado neste momento.
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? 'Salvando...'
              : isEditing
                ? 'Salvar alterações'
                : 'Registrar Compra'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReceiptModal({
  open,
  purchase,
  companyId,
  userId,
  onClose,
  onSuccess,
}) {
  const [rows, setRows] = useState([])
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 16)
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !purchase) return

    setReceivedAt(formatDateTimeInput(new Date()))
    setNotes('')

    setRows(
      (purchase.purchase_items || []).map(item => {
        const ordered = Number(item.quantity || 0)
        const alreadyReceived = Number(item.received_quantity || 0)
        const remaining = Math.max(0, ordered - alreadyReceived)

        return {
          purchase_item_id: item.id,
          product_name: item.product_name,
          ordered,
          already_received: alreadyReceived,
          remaining,
          receive_quantity: remaining,
        }
      })
    )
  }, [open, purchase])

  const receivingNow = rows.reduce(
    (sum, row) => sum + Number(row.receive_quantity || 0),
    0
  )

  const remainingAfter = rows.reduce(
    (sum, row) => (
      sum + Math.max(
        0,
        Number(row.remaining || 0) - Number(row.receive_quantity || 0)
      )
    ),
    0
  )

  function setQuantity(index, value) {
    setRows(prev => {
      const updated = [...prev]
      const row = updated[index]
      const quantity = Math.max(
        0,
        Math.min(
          Number(row.remaining || 0),
          Number(value || 0)
        )
      )

      updated[index] = {
        ...row,
        receive_quantity: quantity,
      }

      return updated
    })
  }

  async function handleConfirm() {
    if (receivingNow <= 0) {
      toast.error('Informe ao menos uma quantidade recebida.')
      return
    }

    const invalid = rows.some(row => (
      Number(row.receive_quantity || 0) < 0
      || Number(row.receive_quantity || 0) > Number(row.remaining || 0)
    ))

    if (invalid) {
      toast.error('Há uma quantidade recebida maior que o restante do pedido.')
      return
    }

    setSubmitting(true)

    const { data, error } = await stockService.receivePurchase({
      purchase_id: purchase.id,
      company_id: companyId,
      received_at: new Date(receivedAt).toISOString(),
      received_by: userId,
      notes,
      items: rows
        .filter(row => Number(row.receive_quantity || 0) > 0)
        .map(row => ({
          purchase_item_id: row.purchase_item_id,
          quantity: Number(row.receive_quantity || 0),
        })),
    })

    setSubmitting(false)

    if (error) {
      toast.error(error.message || 'Erro ao confirmar chegada.')
      return
    }

    onSuccess(data)
  }

  const isPartial = remainingAfter > 0

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={
        purchase?.delivery_status === 'partial'
          ? `Receber restante — Compra #${purchase?.purchase_number || ''}`
          : `Confirmar chegada — Compra #${purchase?.purchase_number || ''}`
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-900">
            {purchase?.supplier_name || 'Fornecedor'}
          </p>

          {purchase?.expected_delivery_date && (
            <p className="text-xs text-slate-500 mt-1">
              Previsão: {formatDateOnlyBR(purchase.expected_delivery_date)}
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="label">Data/Hora do recebimento</label>
          <input
            type="datetime-local"
            className="input"
            value={receivedAt}
            onChange={e => setReceivedAt(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.purchase_item_id}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {row.product_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Pedido: {row.ordered} • Já recebido: {row.already_received} • Restante: {row.remaining}
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Recebido agora</label>
                <input
                  type="number"
                  min="0"
                  max={row.remaining}
                  className="input"
                  value={row.receive_quantity}
                  disabled={row.remaining === 0}
                  onChange={e => setQuantity(index, e.target.value)}
                />

                {Number(row.receive_quantity || 0) < Number(row.remaining || 0) && (
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    Após este recebimento ainda faltarão{' '}
                    {Number(row.remaining || 0) - Number(row.receive_quantity || 0)}.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {isPartial ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Recebimento parcial.</strong> Depois desta confirmação ainda
                faltarão <strong>{remainingAfter}</strong> botijões.
                A compra continuará aberta e aparecerá o botão <strong>Receber restante</strong>.
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Todo o restante do pedido será recebido e a compra será marcada como
            <strong> Recebida</strong>.
          </div>
        )}

        <div className="form-group">
          <label className="label">Observações do recebimento</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ex.: fornecedor ficou devendo 2 P13..."
          />
        </div>

        <div className="rounded-xl bg-slate-100 p-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            Botijões recebidos agora
          </span>
          <span className="font-bold text-lg text-slate-900">
            {receivingNow}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting || receivingNow <= 0}
          >
            <PackageCheck className="w-4 h-4" />
            {submitting
              ? 'Confirmando...'
              : purchase?.delivery_status === 'partial'
                ? 'Receber restante'
                : 'Confirmar chegada'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
