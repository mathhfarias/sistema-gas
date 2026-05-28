import { useState } from 'react'
import { Plus, Edit3, History, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { stockService } from '../services/stockService'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatDateTime } from '../utils/format'

export default function StockPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id

  const [adjustModal, setAdjustModal] = useState(null) // produto selecionado
  const [historyProduct, setHistoryProduct] = useState(null)

  const { data: balances, loading, refetch } = useSupabaseQuery(
    () => stockService.getBalances(companyId),
    [companyId]
  )

  const { data: movements, loading: movLoading } = useSupabaseQuery(
    () => historyProduct
      ? stockService.getMovements({ company_id: companyId, product_id: historyProduct.product_id })
      : stockService.getMovements({ company_id: companyId }),
    [companyId, historyProduct]
  )

  if (loading) return <PageLoader />

  const stockList = balances || []

  const MOVEMENT_TYPE_LABEL = {
    sale: 'Venda',
    purchase: 'Compra',
    return_empty: 'Retorno Vazio',
    return_full: 'Retorno Cheio',
    adjustment: 'Ajuste Manual',
    purchase_return: 'Devolução',
    loss: 'Perda',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        subtitle="Saldo atual de botijões"
        actions={
          <button className="btn-outline" onClick={() => setHistoryProduct(null)}>
            <History className="w-4 h-4" />
            Ver Movimentações
          </button>
        }
      />

      {/* Saldo por produto */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stockList.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              title="Nenhum produto no estoque"
              description="Cadastre produtos e registre chegadas de gás para ver o saldo."
            />
          </div>
        )}
        {stockList.map(item => {
          const isLow = item.full_qty <= (item.products?.min_stock || 5)
          return (
            <div key={item.id} className={`card ${isLow ? 'border-danger-200' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-slate-900">{item.products?.name}</h3>
                  <p className="text-xs text-slate-500 font-mono uppercase">{item.products?.code}</p>
                </div>
                {isLow && (
                  <span className="badge badge-red gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Baixo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-brand-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-display font-bold text-brand-700">{item.full_qty}</p>
                  <p className="text-xs text-brand-600 font-medium mt-0.5">Cheios</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-display font-bold text-slate-600">{item.empty_qty}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Vazios</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn-outline btn-sm flex-1"
                  onClick={() => setAdjustModal(item)}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Ajuste
                </button>
                <button
                  className="btn-secondary btn-sm flex-1"
                  onClick={() => setHistoryProduct(item)}
                >
                  <History className="w-3.5 h-3.5" />
                  Histórico
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Histórico de movimentações */}
      <div className="card">
        <h3 className="font-display text-sm font-semibold text-slate-700 mb-4">
          {historyProduct ? `Movimentações: ${historyProduct.products?.name}` : 'Últimas Movimentações'}
          {historyProduct && (
            <button className="ml-2 text-xs text-brand-600 hover:underline" onClick={() => setHistoryProduct(null)}>
              (ver todos)
            </button>
          )}
        </h3>

        {movLoading ? (
          <div className="py-6 text-center text-slate-400 text-sm">Carregando...</div>
        ) : !movements?.length ? (
          <div className="py-6 text-center text-slate-400 text-sm">Nenhuma movimentação encontrada</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th className="text-center">Cheio</th>
                  <th className="text-center">Vazio</th>
                  <th>Motivo / Usuário</th>
                </tr>
              </thead>
              <tbody>
                {(movements || []).map(m => (
                  <tr key={m.id}>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                    <td className="font-medium">{m.products?.name || '—'}</td>
                    <td>
                      <span className={`badge ${
                        m.type === 'sale' ? 'badge-blue' :
                        m.type === 'purchase' ? 'badge-green' :
                        'badge-gray'
                      }`}>
                        {MOVEMENT_TYPE_LABEL[m.type] || m.type}
                      </span>
                    </td>
                    <td className={`text-center font-mono font-semibold ${m.full_qty_change > 0 ? 'text-success-600' : m.full_qty_change < 0 ? 'text-danger-600' : 'text-slate-400'}`}>
                      {m.full_qty_change > 0 ? '+' : ''}{m.full_qty_change}
                    </td>
                    <td className={`text-center font-mono font-semibold ${m.empty_qty_change > 0 ? 'text-success-600' : m.empty_qty_change < 0 ? 'text-danger-600' : 'text-slate-400'}`}>
                      {m.empty_qty_change > 0 ? '+' : ''}{m.empty_qty_change}
                    </td>
                    <td className="text-xs text-slate-500">{m.reason || m.profiles?.full_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de ajuste */}
      <AdjustModal
        open={!!adjustModal}
        item={adjustModal}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setAdjustModal(null)}
        onSuccess={() => { setAdjustModal(null); refetch(); toast.success('Ajuste realizado!') }}
      />
    </div>
  )
}

function AdjustModal({ open, item, companyId, userId, onClose, onSuccess }) {
  const [fullChange, setFullChange] = useState(0)
  const [emptyChange, setEmptyChange] = useState(0)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) { toast.error('Informe o motivo do ajuste'); return }
    setSubmitting(true)
    const { error } = await stockService.manualAdjustment({
      company_id: companyId,
      product_id: item?.product_id,
      full_qty_change: Number(fullChange),
      empty_qty_change: Number(emptyChange),
      reason,
      performed_by: userId,
    })
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    setFullChange(0); setEmptyChange(0); setReason('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ajuste de Estoque — ${item?.products?.name || ''}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Cheios (+ adicionar / - remover)</label>
            <input type="number" className="input text-center" value={fullChange} onChange={e => setFullChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Vazios (+ adicionar / - remover)</label>
            <input type="number" className="input text-center" value={emptyChange} onChange={e => setEmptyChange(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="label">Motivo do ajuste *</label>
          <textarea
            className="input resize-none" rows={3}
            placeholder="Ex: Inventário corretivo, perda, quebra..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Confirmar Ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
