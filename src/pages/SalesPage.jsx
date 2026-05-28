// src/pages/SalesPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { salesService } from '../services/salesService'
import { PageHeader, PageLoader, EmptyState, ExpenseBadge } from '../components/ui'
import { formatCurrency, formatDateTime } from '../utils/format'
import toast from 'react-hot-toast'

export function SalesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const companyId = profile?.company_id
  const [search, setSearch] = useState('')

  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 30)

  const { data: sales, loading, refetch } = useSupabaseQuery(
    () => supabase
      .from('sales')
      .select('*, payment_methods(name), card_machines(name), sale_items(product_name, quantity)')
      .eq('company_id', companyId)
      .order('sold_at', { ascending: false })
      .limit(100),
    [companyId]
  )

  if (loading) return <PageLoader />

  const filtered = (sales || []).filter(s =>
    (s.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(s.sale_number).includes(search)
  )

  async function handleCancel(saleId) {
    if (!confirm('Cancelar esta venda? O estoque será revertido.')) return
    const { error } = await salesService.cancelSale(saleId, companyId, profile?.id)
    if (error) { toast.error('Erro ao cancelar'); return }
    toast.success('Venda cancelada e estoque revertido.')
    refetch()
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
        subtitle="Histórico de vendas"
        actions={
          <button className="btn-primary" onClick={() => navigate('/vendas/nova')}>
            <Plus className="w-4 h-4" /> Nova Venda
          </button>
        }
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por cliente ou nº venda..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
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
                  <td className="text-right font-semibold currency">{formatCurrency(s.total)}</td>
                  <td>{STATUS_BADGE[s.status] || s.status}</td>
                  <td>
                    {s.status === 'completed' && (
                      <button className="btn-sm btn-outline text-danger-600 hover:bg-danger-50" onClick={() => handleCancel(s.id)}>
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SalesPage
