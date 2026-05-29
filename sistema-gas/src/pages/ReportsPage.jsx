import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { financialService } from '../services/financialService'
import { PageHeader, PageLoader, StatCard } from '../components/ui'
import { formatCurrency, currentMonthRange } from '../utils/format'

const COLORS = ['#2563eb', '#f97316', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

export default function ReportsPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [byPayment, setByPayment] = useState([])
  const [byMachine, setByMachine] = useState([])

  const [period, setPeriod] = useState('month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (companyId) loadReport()
  }, [companyId, period])

  function getRange() {
    if (period === 'today') {
      const s = new Date(); s.setHours(0,0,0,0)
      const e = new Date(); e.setHours(23,59,59,999)
      return { start: s.toISOString(), end: e.toISOString() }
    }
    if (period === 'week') {
      const e = new Date()
      const s = new Date()
      s.setDate(s.getDate() - 7)
      return { start: s.toISOString(), end: e.toISOString() }
    }
    if (period === 'month') return currentMonthRange()
    if (period === 'custom') return {
      start: startDate ? new Date(startDate).toISOString() : currentMonthRange().start,
      end: endDate ? new Date(endDate + 'T23:59:59').toISOString() : currentMonthRange().end,
    }
    return currentMonthRange()
  }

  async function loadReport() {
    setLoading(true)
    const { start, end } = getRange()
    const [plRes, payRes, machRes] = await Promise.all([
      financialService.getProfitLoss(companyId, start, end),
      financialService.getRevenueByPayment(companyId, start, end),
      financialService.getRevenueByMachine(companyId, start, end),
    ])
    if (plRes.data) setData(plRes.data)
    if (payRes.data) setByPayment(payRes.data)
    if (machRes.data) setByMachine(machRes.data)
    setLoading(false)
  }

  const periodLabels = { today: 'Hoje', week: 'Últimos 7 dias', month: 'Este mês', custom: 'Personalizado' }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle="Análise financeira e operacional"
      />

      {/* Filtro de período */}
      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(periodLabels).map(([k, v]) => (
            <button
              key={k}
              className={period === k ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
              onClick={() => setPeriod(k)}
            >
              {v}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap gap-3 items-end mt-2">
            <div className="form-group">
              <label className="label">Data inicial</label>
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Data final</label>
              <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={loadReport}>Aplicar</button>
          </div>
        )}
      </div>

      {loading ? <PageLoader /> : !data ? (
        <div className="text-center py-12 text-slate-400">Nenhum dado encontrado para o período.</div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Receita Bruta" value={formatCurrency(data.grossRevenue)} icon={DollarSign} color="blue" />
            <StatCard title="Custo de Produtos" value={formatCurrency(data.cogs)} icon={ShoppingCart} color="orange" />
            <StatCard title="Despesas Pagas" value={formatCurrency(data.totalPaidExpenses)} icon={Receipt} color="yellow" />
            <StatCard
              title="Lucro Líquido"
              value={formatCurrency(data.netProfit)}
              subtitle={`margem ${data.netMargin?.toFixed(1)}%`}
              icon={data.netProfit >= 0 ? TrendingUp : TrendingDown}
              color={data.netProfit >= 0 ? 'green' : 'red'}
            />
          </div>

          {/* DRE simplificado */}
          <div className="card">
            <h3 className="font-display text-sm font-semibold text-slate-700 mb-4">
              Demonstrativo de Resultado — {periodLabels[period]}
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Receita Bruta', value: data.grossRevenue, type: 'revenue' },
                { label: '  Taxa de entrega (Gás do Povo)', value: data.deliveryFeeRevenue, type: 'sub' },
                { label: '(-) Custo dos produtos vendidos', value: -data.cogs, type: 'cost' },
                { label: '= Lucro Bruto', value: data.grossProfit, type: 'total', margin: data.grossMargin },
                { label: '(-) Despesas pagas', value: -data.totalPaidExpenses, type: 'cost' },
                { label: '= Lucro Líquido', value: data.netProfit, type: 'result', margin: data.netMargin },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center py-2 px-3 rounded-lg ${
                    row.type === 'result' ? 'bg-slate-900 text-white font-bold text-base' :
                    row.type === 'total' ? 'bg-slate-100 font-semibold' :
                    row.type === 'sub' ? 'pl-6 text-slate-500 text-sm' :
                    ''
                  }`}
                >
                  <span>{row.label}</span>
                  <span className={`font-mono ${
                    row.type === 'result' ? (row.value >= 0 ? 'text-green-400' : 'text-red-400') :
                    row.value < 0 ? 'text-danger-600' : ''
                  }`}>
                    {formatCurrency(Math.abs(row.value))}
                    {row.margin !== undefined && (
                      <span className="ml-2 text-xs opacity-60">{row.margin.toFixed(1)}%</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {data.totalPendingExpenses > 0 && (
              <div className="mt-4 p-3 rounded-lg border border-warning-200 bg-warning-50 text-sm text-warning-800">
                <strong>Atenção:</strong> Existem {formatCurrency(data.totalPendingExpenses)} em despesas pendentes/atrasadas que ainda não foram pagas e não estão no cálculo acima.
              </div>
            )}
          </div>

          {/* Gráficos lado a lado */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Por forma de pagamento */}
            <div className="card">
              <h3 className="font-display text-sm font-semibold text-slate-700 mb-4">Receita por Forma de Pagamento</h3>
              {byPayment.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={byPayment} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                      {byPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Por maquininha */}
            <div className="card">
              <h3 className="font-display text-sm font-semibold text-slate-700 mb-4">Receita por Maquininha</h3>
              {byMachine.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Nenhuma venda por maquininha no período</div>
              ) : (
                <div className="space-y-3">
                  {byMachine.map((m, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            m.color === 'black' ? 'bg-slate-800' :
                            m.color === 'orange' ? 'bg-orange-500' :
                            m.color === 'blue' ? 'bg-blue-500' : 'bg-slate-400'
                          }`} />
                          <span className="font-semibold text-sm text-slate-700">{m.name}</span>
                        </div>
                        <span className="font-bold text-slate-800">{formatCurrency(m.total)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                        <span>{m.count} vendas</span>
                        <span>Taxa est.: {formatCurrency(m.estimatedFee)}</span>
                        <span className="text-success-600 font-medium">Líq.: {formatCurrency(m.netEstimated)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
