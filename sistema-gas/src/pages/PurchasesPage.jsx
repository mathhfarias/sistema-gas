import { useState, useEffect } from 'react'
import { Plus, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { stockService } from '../services/stockService'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatCurrency, formatDateTime, parseCurrency, maskCurrency } from '../utils/format'

export default function PurchasesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)

  const { data: purchases, loading, refetch } = useSupabaseQuery(
    () => supabase
      .from('purchases')
      .select('*, purchase_items(product_name, quantity, unit_cost, total_cost)')
      .eq('company_id', companyId)
      .order('purchased_at', { ascending: false })
      .limit(50),
    [companyId]
  )

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chegada de Gás"
        subtitle="Registro de compras e entrada de botijões"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /> Registrar Chegada
          </button>
        }
      />

      {!(purchases || []).length ? (
        <EmptyState icon={Truck} title="Nenhuma chegada registrada"
          action={<button className="btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus className="w-3.5 h-3.5" />Registrar</button>}
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
                <th className="text-right">Total</th>
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
                  <td className="text-right font-semibold currency">{formatCurrency(p.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PurchaseModal
        open={showModal}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); refetch(); toast.success('Chegada registrada! Estoque atualizado.') }}
      />
    </div>
  )
}

function PurchaseModal({ open, companyId, userId, onClose, onSuccess }) {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState([{ product_id: '', product_name: '', quantity: 1, unit_cost: '', empty_returned: 0 }])
  const [notes, setNotes] = useState('')
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 16))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && companyId) {
      supabase.from('suppliers').select('id, name').eq('company_id', companyId).then(r => setSuppliers(r.data || []))
      supabase.from('products').select('id, name, code, cost_price').eq('company_id', companyId).eq('is_active', true).then(r => setProducts(r.data || []))
    }
  }, [open, companyId])

  function setItem(idx, field, val) {
    setItems(prev => {
      const u = [...prev]
      u[idx] = { ...u[idx], [field]: val }
      if (field === 'product_id') {
        const prod = products.find(p => p.id === val)
        if (prod) {
          u[idx].product_name = prod.name
          u[idx].unit_cost = prod.cost_price.toFixed(2).replace('.', ',')
        }
      }
      return u
    })
  }

  const total = items.reduce((s, i) => s + (parseCurrency(i.unit_cost) * Number(i.quantity || 0)), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecione o fornecedor'); return }
    setSubmitting(true)
    const { error } = await stockService.registerPurchase({
      company_id: companyId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      items: items.map(i => ({
        ...i,
        unit_cost: parseCurrency(i.unit_cost),
        quantity: Number(i.quantity),
        empty_returned: Number(i.empty_returned || 0),
      })),
      notes,
      purchased_at: new Date(purchasedAt).toISOString(),
      created_by: userId,
    })
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar Chegada de Gás" maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Fornecedor *</label>
            <select className="input" value={supplierId}
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
            <input type="datetime-local" className="input" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Produtos recebidos</label>
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => setItems(p => [...p, { product_id: '', product_name: '', quantity: 1, unit_cost: '', empty_returned: 0 }])}>
              <Plus className="w-3.5 h-3.5" /> Item
            </button>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="form-group col-span-2">
                  <label className="label">Produto *</label>
                  <select className="input" value={item.product_id} onChange={e => setItem(idx, 'product_id', e.target.value)} required>
                    <option value="">Selecionar...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Qtd recebida</label>
                  <input type="number" min="1" className="input" value={item.quantity}
                    onChange={e => setItem(idx, 'quantity', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="label">Custo unitário</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                    <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00"
                      value={item.unit_cost}
                      onChange={e => setItem(idx, 'unit_cost', maskCurrency(e.target.value.replace(/\D/g,'')))}
                      required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Vazios devolvidos</label>
                  <input type="number" min="0" className="input" value={item.empty_returned}
                    onChange={e => setItem(idx, 'empty_returned', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label className="label">Observações</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="bg-slate-100 rounded-xl p-3 flex justify-between items-center">
          <span className="text-sm text-slate-600 font-medium">Total da compra</span>
          <span className="font-bold text-lg text-slate-800">{formatCurrency(total)}</span>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Registrar Chegada'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
