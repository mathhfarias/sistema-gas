import { useState } from 'react'
import { Plus, Package, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatCurrency, parseCurrency, maskCurrency } from '../utils/format'

export default function ProductsPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const { data: products, loading, refetch } = useSupabaseQuery(
    () => supabase.from('products').select('*').eq('company_id', companyId).order('name'),
    [companyId]
  )

  if (loading) return <PageLoader />

  async function deleteProduct(p) {
    if (!confirm(`Excluir produto "${p.name}"?`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Produto excluído!')
    refetch()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo de produtos"
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        }
      />
      {!(products || []).length ? (
        <EmptyState icon={Package} title="Nenhum produto cadastrado"
          action={<button className="btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus className="w-3.5 h-3.5" />Cadastrar</button>}
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th className="text-right">Preço Venda</th>
                <th className="text-right">Custo</th>
                <th className="text-right">Margem</th>
                <th>Estoque mín.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(products || []).map(p => {
                const margin = p.sale_price > 0 ? ((p.sale_price - p.cost_price) / p.sale_price * 100) : 0
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-xs text-slate-500">{p.code || '—'}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-right currency">{formatCurrency(p.sale_price)}</td>
                    <td className="text-right currency">{formatCurrency(p.cost_price)}</td>
                    <td className="text-right">
                      <span className={`font-semibold ${margin >= 20 ? 'text-success-600' : margin >= 10 ? 'text-warning-600' : 'text-danger-600'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-center">{p.min_stock}</td>
                    <td>
                      <span className={p.is_active ? 'badge badge-green' : 'badge badge-gray'}>
                        {p.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="btn-outline btn-sm" onClick={() => { setEditing(p); setShowModal(true) }}>Editar</button>
                        <button className="btn-danger btn-sm" onClick={() => deleteProduct(p)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ProductModal
        key={editing?.id || 'new'}
        open={showModal}
        editing={editing}
        companyId={companyId}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSuccess={() => { setShowModal(false); setEditing(null); refetch(); toast.success('Produto salvo!') }}
      />
    </div>
  )
}

function ProductModal({ open, editing, companyId, onClose, onSuccess }) {
  const [name, setName] = useState(editing?.name || '')
  const [code, setCode] = useState(editing?.code || '')
  const [salePrice, setSalePrice] = useState(editing ? editing.sale_price.toFixed(2).replace('.', ',') : '')
  const [costPrice, setCostPrice] = useState(editing ? editing.cost_price.toFixed(2).replace('.', ',') : '')
  const [minStock, setMinStock] = useState(editing?.min_stock || 5)
  const [isCylinder, setIsCylinder] = useState(editing?.is_cylinder !== false)
  const [isActive, setIsActive] = useState(editing?.is_active !== false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      company_id: companyId, name, code,
      sale_price: parseCurrency(salePrice),
      cost_price: parseCurrency(costPrice),
      min_stock: Number(minStock),
      is_cylinder: isCylinder,
      is_active: isActive,
    }
    let error = null

    if (editing) {
      const result = await supabase.from('products').update(payload).eq('id', editing.id)
      error = result.error
    } else {
      const result = await supabase.from('products').insert(payload).select('id').single()
      error = result.error

      if (!error && result.data?.id) {
        const stockResult = await supabase.from('stock_balances').insert({
          company_id: companyId,
          product_id: result.data.id,
          full_qty: 0,
          empty_qty: 0,
          exchange_qty: 0,
        })
        error = stockResult.error
      }
    }

    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Produto' : 'Novo Produto'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="label">Código</label>
            <input className="input" placeholder="Ex: P13" value={code} onChange={e => setCode(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Estoque mínimo</label>
            <input type="number" min="0" className="input" value={minStock} onChange={e => setMinStock(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Preço de venda *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00"
                value={salePrice} onChange={e => setSalePrice(maskCurrency(e.target.value.replace(/\D/g,'')))} required />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Custo (compra)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input type="text" inputMode="numeric" className="input pl-8" placeholder="0,00"
                value={costPrice} onChange={e => setCostPrice(maskCurrency(e.target.value.replace(/\D/g,'')))} />
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={isCylinder} onChange={e => setIsCylinder(e.target.checked)} />
            É botijão/cilindro
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Produto ativo
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
