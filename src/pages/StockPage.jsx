import { useState } from 'react'
import { Edit3, History, AlertTriangle, ArrowLeftRight, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { stockService } from '../services/stockService'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatDateTime } from '../utils/format'

const MOVEMENT_TYPE_LABEL = {
  sale: 'Venda',
  purchase: 'Compra',
  return_empty: 'Retorno Vazio',
  return_full: 'Retorno Cheio',
  adjustment: 'Ajuste Manual',
  purchase_return: 'Devolução',
  loss: 'Perda',
  exchange_out: 'Enviado p/ Troca',
  exchange_in: 'Recebido da Troca',
}

export default function StockPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id

  const [adjustModal, setAdjustModal] = useState(null)
  const [exchangeModal, setExchangeModal] = useState(null)
  const [historyProduct, setHistoryProduct] = useState(null)

  const { data: balances, loading, refetch } = useSupabaseQuery(
    () => stockService.getBalances(companyId),
    [companyId]
  )

  const { data: movements, loading: movLoading, refetch: refetchMovements } = useSupabaseQuery(
    () => historyProduct
      ? stockService.getMovements({ company_id: companyId, product_id: historyProduct.product_id })
      : stockService.getMovements({ company_id: companyId }),
    [companyId, historyProduct]
  )

  if (loading) return <PageLoader />

  const stockList = balances || []

  function handleSuccess(message) {
    setAdjustModal(null)
    setExchangeModal(null)
    refetch()
    refetchMovements()
    toast.success(message)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        subtitle="Saldo atual de botijões cheios, vazios e em troca"
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
          const fullQty = Number(item.full_qty || 0)
          const emptyQty = Number(item.empty_qty || 0)
          const exchangeQty = Number(item.exchange_qty || 0)
          const minStock = Number(item.products?.min_stock || 5)
          const isLow = fullQty <= minStock

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

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-brand-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-display font-bold text-brand-700">{fullQty}</p>
                  <p className="text-xs text-brand-600 font-medium mt-0.5">Cheios</p>
                </div>
                <div className="bg-slate-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-display font-bold text-slate-600">{emptyQty}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Vazios</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-display font-bold text-orange-600">{exchangeQty}</p>
                  <p className="text-xs text-orange-600 font-medium mt-0.5">Em troca</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setAdjustModal(item)}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Ajuste
                </button>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setExchangeModal({ action: 'send', item })}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Enviar Troca
                </button>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setExchangeModal({ action: 'receive', item })}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Receber
                </button>
                <button
                  className="btn-secondary btn-sm"
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
                  <th className="text-center">Troca</th>
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
                        m.type === 'exchange_out' || m.type === 'exchange_in' ? 'badge-yellow' :
                        'badge-gray'
                      }`}>
                        {MOVEMENT_TYPE_LABEL[m.type] || m.type}
                      </span>
                    </td>
                    <StockChange value={m.full_qty_change} />
                    <StockChange value={m.empty_qty_change} />
                    <StockChange value={m.exchange_qty_change} />
                    <td className="text-xs text-slate-500">{m.reason || m.profiles?.full_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdjustModal
        open={!!adjustModal}
        item={adjustModal}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setAdjustModal(null)}
        onSuccess={() => handleSuccess('Ajuste realizado!')}
      />

      <ExchangeModal
        open={!!exchangeModal}
        action={exchangeModal?.action}
        item={exchangeModal?.item}
        companyId={companyId}
        userId={profile?.id}
        onClose={() => setExchangeModal(null)}
        onSuccess={(message) => handleSuccess(message)}
      />
    </div>
  )
}

function StockChange({ value }) {
  const qty = Number(value || 0)
  return (
    <td className={`text-center font-mono font-semibold ${qty > 0 ? 'text-success-600' : qty < 0 ? 'text-danger-600' : 'text-slate-400'}`}>
      {qty > 0 ? '+' : ''}{qty}
    </td>
  )
}

function AdjustModal({ open, item, companyId, userId, onClose, onSuccess }) {
  const [fullChange, setFullChange] = useState(0)
  const [emptyChange, setEmptyChange] = useState(0)
  const [exchangeChange, setExchangeChange] = useState(0)
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
      exchange_qty_change: Number(exchangeChange),
      reason,
      performed_by: userId,
    })
    setSubmitting(false)

    if (error) { toast.error(error.message); return }
    setFullChange(0)
    setEmptyChange(0)
    setExchangeChange(0)
    setReason('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ajuste de Estoque — ${item?.products?.name || ''}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="form-group">
            <label className="label">Cheios</label>
            <input type="number" className="input text-center" value={fullChange} onChange={e => setFullChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Vazios</label>
            <input type="number" className="input text-center" value={emptyChange} onChange={e => setEmptyChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Em troca</label>
            <input type="number" className="input text-center" value={exchangeChange} onChange={e => setExchangeChange(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Use números positivos para adicionar e negativos para remover. Exemplo: -2 remove duas unidades.
        </p>

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

function ExchangeModal({ open, action, item, companyId, userId, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isSend = action === 'send'
  const title = isSend
    ? `Enviar para troca — ${item?.products?.name || ''}`
    : `Receber da troca — ${item?.products?.name || ''}`

  async function handleSubmit(e) {
    e.preventDefault()
    const qty = Number(quantity)
    if (!qty || qty <= 0) { toast.error('Informe uma quantidade maior que zero'); return }

    setSubmitting(true)
    const result = isSend
      ? await stockService.sendToExchange({
          company_id: companyId,
          product_id: item?.product_id,
          quantity: qty,
          reason,
          performed_by: userId,
        })
      : await stockService.receiveFromExchange({
          company_id: companyId,
          product_id: item?.product_id,
          quantity: qty,
          reason,
          performed_by: userId,
        })

    setSubmitting(false)

    if (result.error) { toast.error(result.error.message); return }
    setQuantity(1)
    setReason('')
    onSuccess(isSend ? 'Botijões enviados para troca!' : 'Botijões recebidos da troca!')
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
          {isSend ? (
            <p>
              Esta ação diminui o saldo de <strong>vazios</strong> e aumenta o saldo <strong>em troca</strong>.
            </p>
          ) : (
            <p>
              Esta ação diminui o saldo <strong>em troca</strong> e aumenta o saldo de <strong>cheios</strong>.
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="label">Quantidade *</label>
          <input
            type="number"
            min="1"
            className="input"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="label">Observação</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder={isSend ? 'Ex: Enviado para troca com fornecedor' : 'Ex: Recebido retorno da troca'}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : isSend ? 'Enviar para troca' : 'Receber da troca'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
