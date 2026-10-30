import { useState, useEffect } from 'react'
import { Plus, Truck, Pencil, Trash2 } from 'lucide-react'
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

export default function PurchasesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState(null)

  const { data: purchases, loading, refetch } = useSupabaseQuery(
    () => supabase
      .from('purchases')
      .select('*, purchase_items(id, product_id, product_name, quantity, unit_cost, total_cost, empty_returned, freight_allocated, discount_allocated, final_total_cost, final_unit_cost)')
      .eq('company_id', companyId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('purchased_at', { ascending: false })
      .limit(50),
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
    const confirmed = window.confirm(
      `Excluir a chegada #${purchase.purchase_number || ''}?\n\nEssa ação vai ocultar a chegada da tela e reverter o estoque: diminui os cheios recebidos e devolve os vazios baixados.`
    )

    if (!confirmed) return

    const { error } = await stockService.deletePurchase({
      purchase_id: purchase.id,
      company_id: companyId,
      performed_by: profile?.id,
      reason: `Exclusão da chegada #${purchase.purchase_number || ''}`,
    })

    if (error) {
      toast.error(error.message || 'Erro ao excluir chegada')
      return
    }

    toast.success('Chegada excluída e estoque revertido!')
    refetch()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chegada de Gás"
        subtitle="Registro de compras e entrada de botijões"
        actions={
          <button className="btn-primary" onClick={openCreateModal}>
            <Plus className="w-4 h-4" /> Registrar Chegada
          </button>
        }
      />

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Regra da chegada:</strong> toda chegada de gás aumenta os cheios e subtrai a mesma quantidade de vazios automaticamente.
        Exemplo: chegou 10 P13 → +10 cheios e -10 vazios.
      </div>

      {!(purchases || []).length ? (
        <EmptyState icon={Truck} title="Nenhuma chegada registrada"
          action={<button className="btn-primary btn-sm" onClick={openCreateModal}><Plus className="w-3.5 h-3.5" />Registrar</button>}
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Itens</th>
                <th className="text-right">Frete</th>
                <th className="text-right">Créditos</th>
                <th className="text-right">Custo final/un.</th>
                <th className="text-right">Total líquido</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(purchases || []).map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs text-slate-500">#{p.purchase_number}</td>
                  <td className="text-xs whitespace-nowrap">{formatDateTime(p.purchased_at)}</td>
                  <td className="font-medium">{p.supplier_name || '—'}</td>
                  <td className="text-xs text-slate-500">
                    {(p.purchase_items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ')}
                  </td>
                  <td className="text-right text-xs currency text-slate-500">{formatCurrency(p.freight_cost || 0)}</td>
                  <td className="text-right text-xs currency text-emerald-700">{formatCurrency(p.discount_credit || 0)}</td>
                  <td className="text-right text-xs text-slate-700 font-medium max-w-[280px]">{getFinalUnitCostsLabel(p)}</td>
                  <td className="text-right font-semibold currency">{formatCurrency(p.total_cost)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => openEditModal(p)}>
                        <Pencil className="w-3.5 h-3.5" /> Alterar
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => handleDeletePurchase(p)}>
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
          closeModal()
          refetch()
          toast.success(editingPurchase ? 'Chegada alterada!' : 'Chegada registrada! Estoque atualizado.')
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
  const [items, setItems] = useState([{ product_id: '', product_name: '', quantity: 1, product_total: '', empty_returned: 1 }])
  const [notes, setNotes] = useState('')
  const [freightCost, setFreightCost] = useState('0,00')
  const [discountCredit, setDiscountCredit] = useState('0,00')
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 16))
  const [submitting, setSubmitting] = useState(false)
  const isEditing = Boolean(purchase?.id)

  useEffect(() => {
    if (open && companyId) {
      supabase.from('suppliers').select('id, name').eq('company_id', companyId).then(r => setSuppliers(r.data || []))
      supabase.from('products').select('id, name, code').eq('company_id', companyId).eq('is_active', true).then(r => setProducts(r.data || []))
    }
  }, [open, companyId])

  useEffect(() => {
    if (!open) return

    if (purchase) {
      setSupplierId(purchase.supplier_id || '')
      setSupplierName(purchase.supplier_name || '')
      setNotes(purchase.notes || '')
      setFreightCost(maskCurrency(String(Math.round(Number(purchase.freight_cost || 0) * 100))))
      setDiscountCredit(maskCurrency(String(Math.round(Number(purchase.discount_credit || 0) * 100))))
      setPurchasedAt(formatDateTimeInput(purchase.purchased_at))
      setItems((purchase.purchase_items || []).map(item => ({
        product_id: item.product_id || '',
        product_name: item.product_name || '',
        quantity: Number(item.quantity || 1),
        product_total: maskCurrency(String(Math.round(Number(item.total_cost || 0) * 100))),
        empty_returned: Number(item.quantity || 0),
      })))
    } else {
      setSupplierId('')
      setSupplierName('')
      setItems([{ product_id: '', product_name: '', quantity: 1, product_total: '', empty_returned: 1 }])
      setNotes('')
      setFreightCost('0,00')
      setDiscountCredit('0,00')
      setPurchasedAt(new Date().toISOString().slice(0, 16))
    }
  }, [open, purchase])

  function setItem(idx, field, val) {
    setItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: val }

      if (field === 'product_id') {
        const product = products.find(p => p.id === val)
        if (product) updated[idx].product_name = product.name
      }

      if (field === 'quantity') {
        const quantity = Math.max(0, Number(val || 0))
        updated[idx].empty_returned = quantity
      }

      return updated
    })
  }

  function removeItem(idx) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))
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
      empty_returned: quantity,
    }
  })

  const itemsTotal = normalizedItems.reduce((sum, item) => sum + item.product_total, 0)
  const totalQuantity = normalizedItems.reduce((sum, item) => sum + item.quantity, 0)
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

    const finalTotalCost = item.product_total + freightAllocated - discountAllocated
    const finalUnitCost = item.quantity > 0 ? finalTotalCost / item.quantity : 0

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
      toast.error('Descontos/créditos não podem deixar o custo líquido da chegada negativo')
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
      created_by: userId,
    }

    const { error } = isEditing
      ? await stockService.updatePurchase({ purchase_id: purchase.id, ...payload })
      : await stockService.registerPurchase(payload)

    setSubmitting(false)

    if (error) {
      toast.error(error.message)
      return
    }

    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? `Alterar Chegada #${purchase?.purchase_number || ''}` : 'Registrar Chegada de Gás'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Fornecedor *</label>
            <select
              className="input"
              value={supplierId}
              onChange={e => {
                setSupplierId(e.target.value)
                setSupplierName(suppliers.find(s => s.id === e.target.value)?.name || '')
              }}
              required
            >
              <option value="">Selecionar...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="label">Data/Hora</label>
            <input
              type="datetime-local"
              className="input"
              value={purchasedAt}
              onChange={e => setPurchasedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Produtos recebidos</label>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setItems(prev => [...prev, {
                product_id: '',
                product_name: '',
                quantity: 1,
                product_total: '',
                empty_returned: 1,
              }])}
            >
              <Plus className="w-3.5 h-3.5" /> Item
            </button>
          </div>

          {items.map((item, idx) => {
            const automaticEmpty = Number(item.quantity || 0)
            const calculated = calculatedItems[idx]
            const productUnitCost = calculated?.quantity > 0
              ? calculated.product_total / calculated.quantity
              : 0

            return (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-group col-span-2">
                    <label className="label">Produto *</label>
                    <select
                      className="input"
                      value={item.product_id}
                      onChange={e => setItem(idx, 'product_id', e.target.value)}
                      required
                    >
                      <option value="">Selecionar...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label">Qtd recebida</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={item.quantity}
                      onChange={e => setItem(idx, 'quantity', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Valor total dos produtos</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input pl-8"
                        placeholder="0,00"
                        value={item.product_total}
                        onChange={e => setItem(idx, 'product_total', maskCurrency(e.target.value.replace(/\D/g, '')))}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group col-span-2">
                    <label className="label">Vazios usados na chegada</label>
                    <input
                      type="number"
                      className="input bg-slate-100 text-slate-500"
                      value={automaticEmpty}
                      disabled
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Automático: sempre subtrai a mesma quantidade recebida.
                    </p>
                  </div>

                  {calculated?.product_total > 0 && (
                    <div className="col-span-2 grid sm:grid-cols-4 gap-2 rounded-lg bg-white border border-slate-200 p-2 text-xs">
                      <div>
                        <p className="text-slate-500">Produto/un.</p>
                        <p className="font-semibold text-slate-800">{formatCurrency(productUnitCost)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Frete rateado</p>
                        <p className="font-semibold text-slate-800">{formatCurrency(calculated.freight_allocated)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Crédito rateado</p>
                        <p className="font-semibold text-emerald-700">- {formatCurrency(calculated.discount_allocated)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Custo final/un.</p>
                        <p className="font-bold text-slate-800">{formatCurrency(calculated.final_unit_cost)}</p>
                      </div>
                    </div>
                  )}

                  {items.length > 1 && (
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
            <label className="label">Frete da chegada</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input
                type="text"
                inputMode="numeric"
                className="input pl-8"
                placeholder="0,00"
                value={freightCost}
                onChange={e => setFreightCost(maskCurrency(e.target.value.replace(/\D/g, '')))}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rateado entre os produtos proporcionalmente ao valor informado.
            </p>
          </div>

          <div className="form-group">
            <label className="label">Descontos / créditos</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input
                type="text"
                inputMode="numeric"
                className="input pl-8"
                placeholder="0,00"
                value={discountCredit}
                onChange={e => setDiscountCredit(maskCurrency(e.target.value.replace(/\D/g, '')))}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ex.: crédito de reposição, desconto comercial ou ajuste da NF.
            </p>
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
            <span className="currency text-emerald-700">- {formatCurrency(discountTotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Vazios que serão baixados</span>
            <span>{totalQuantity}</span>
          </div>

          <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
            <span className="text-sm text-slate-600 font-medium">Total líquido da compra</span>
            <span className="font-bold text-lg text-slate-800">{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? (isEditing ? 'Salvando...' : 'Registrando...')
              : (isEditing ? 'Salvar alterações' : 'Registrar Chegada')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
