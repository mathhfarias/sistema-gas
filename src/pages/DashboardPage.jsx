import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, TrendingUp, Package, AlertTriangle,
  Receipt, CheckCircle, Clock, Flame, PlusCircle,
  ArrowRight, Cylinder, Boxes,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { StatCard, PageLoader, Alert } from '../components/ui'
import { formatCurrency, formatDate, EXPENSE_STATUS } from '../utils/format'

const COLORS = ['#2563eb', '#f97316', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const companyId = profile?.company_id
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (companyId) loadDashboard()
  }, [companyId])

  async function loadDashboard() {
    setLoading(true)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const in7Days = new Date()
    in7Days.setDate(in7Days.getDate() + 7)

    const [salesRes, stockRes, expensesRes, overdueRes, upcomingRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total, delivery_fee, sale_items(quantity, cost_price, product_id), payment_methods(name, type)')
        .eq('company_id', companyId)
        .eq('status', 'completed')
        .gte('sold_at', today.toISOString())
        .lt('sold_at', tomorrow.toISOString()),
      supabase
        .from('stock_balances')
        .select('full_qty, empty_qty, exchange_qty, products(name, code, min_stock)')
        .eq('company_id', companyId),
      supabase
        .from('expenses')
        .select('name, amount, due_date, status')
        .eq('company_id', companyId)
        .in('status', ['pending', 'overdue'])
        .order('due_date'),
      supabase
        .from('expenses')
        .select('name, amount, due_date')
        .eq('company_id', companyId)
        .eq('status', 'overdue'),
      supabase
        .from('expenses')
        .select('name, amount, due_date')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .lte('due_date', in7Days.toISOString().split('T')[0])
        .gte('due_date', today.toISOString().split('T')[0]),
    ])

    const sales = salesRes.data || []
    const stock = stockRes.data || []
    const expenses = expensesRes.data || []

    // Resumo de vendas
    const totalRevenue = sales.reduce((s, r) => s + Number(r.total), 0)
    const totalSales = sales.length
    const cogs = sales.reduce((s, sale) => {
      return s + (sale.sale_items || []).reduce((si, item) => si + Number(item.cost_price) * Number(item.quantity), 0)
    }, 0)
    const grossProfit = totalRevenue - cogs

    // Por forma de pagamento
    const byPayment = {}
    sales.forEach(s => {
      const name = s.payment_methods?.name || 'Outro'
      if (!byPayment[name]) byPayment[name] = 0
      byPayment[name] += Number(s.total)
    })
    const paymentChart = Object.entries(byPayment).map(([name, value]) => ({ name, value }))

    // Estoque
    const lowStock = stock.filter(s => s.products && s.full_qty <= s.products.min_stock)

    setData({
      totalRevenue, totalSales, grossProfit, cogs,
      stock, lowStock,
      expenses,
      overdue: overdueRes.data || [],
      upcoming: upcomingRes.data || [],
      paymentChart,
    })
    setLoading(false)
  }

  if (loading) return <PageLoader />

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // Mapear produto no estoque
  const p13 = data.stock.find(s => s.products?.code === 'P13')
  const p45 = data.stock.find(s => s.products?.code === 'P45')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-500" />
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{today}</p>
        </div>
        <button
          className="btn-primary btn-lg"
          onClick={() => navigate('/vendas/nova')}
        >
          <PlusCircle className="w-5 h-5" />
          Nova Venda
        </button>
      </div>

      {/* Alertas */}
      {data.overdue.length > 0 && (
        <Alert
          type="error"
          title={`${data.overdue.length} conta(s) em atraso!`}
          message={`Total: ${formatCurrency(data.overdue.reduce((s, e) => s + Number(e.amount), 0))} — Acesse Despesas para regularizar.`}
        />
      )}
      {data.upcoming.length > 0 && (
        <Alert
          type="warning"
          title={`${data.upcoming.length} conta(s) vencem nos próximos 7 dias`}
          message={`Total: ${formatCurrency(data.upcoming.reduce((s, e) => s + Number(e.amount), 0))}`}
        />
      )}
      {data.lowStock.length > 0 && (
        <Alert
          type="warning"
          title="Estoque baixo"
          message={`Produto(s) com estoque abaixo do mínimo: ${data.lowStock.map(s => s.products.name).join(', ')}`}
        />
      )}

      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Vendas Hoje"
          value={data.totalSales}
          subtitle="pedidos concluídos"
          icon={ShoppingCart}
          color="blue"
        />
        <StatCard
          title="Faturamento"
          value={formatCurrency(data.totalRevenue)}
          subtitle="receita bruta hoje"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Lucro Bruto"
          value={formatCurrency(data.grossProfit)}
          subtitle={`margem ${data.totalRevenue > 0 ? ((data.grossProfit / data.totalRevenue) * 100).toFixed(0) : 0}%`}
          icon={Flame}
          color={data.grossProfit >= 0 ? 'green' : 'red'}
        />
        <StatCard
          title="Contas a Pagar"
          value={data.expenses.length}
          subtitle={`${data.overdue.length} em atraso`}
          icon={Receipt}
          color={data.overdue.length > 0 ? 'red' : 'yellow'}
          onClick={() => navigate('/despesas')}
        />
      </div>

      {/* Estoque de botijões */}
      <div>
        <h2 className="font-display text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Estoque de Botijões
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            title="P13 — Cheios"
            value={p13?.full_qty ?? 0}
            subtitle="disponíveis"
            icon={Boxes}
            color={p13 && p13.full_qty <= (p13.products?.min_stock || 5) ? 'red' : 'blue'}
          />
          <StatCard
            title="P13 — Vazios"
            value={p13?.empty_qty ?? 0}
            subtitle="no estoque"
            icon={Package}
            color="gray"
          />
          <StatCard
            title="P13 — Troca"
            value={p13?.exchange_qty ?? 0}
            subtitle="em troca"
            icon={Package}
            color="orange"
          />
          <StatCard
            title="P45 — Cheios"
            value={p45?.full_qty ?? 0}
            subtitle="disponíveis"
            icon={Boxes}
            color={p45 && p45.full_qty <= (p45.products?.min_stock || 3) ? 'red' : 'orange'}
          />
          <StatCard
            title="P45 — Vazios"
            value={p45?.empty_qty ?? 0}
            subtitle="no estoque"
            icon={Package}
            color="gray"
          />
          <StatCard
            title="P45 — Troca"
            value={p45?.exchange_qty ?? 0}
            subtitle="em troca"
            icon={Package}
            color="orange"
          />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Por forma de pagamento */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-slate-700 mb-4">
            Vendas por Forma de Pagamento — Hoje
          </h3>
          {data.paymentChart.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
              Nenhuma venda registrada hoje
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.paymentChart} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => `R$${v.toFixed(0)}`} />
                <Tooltip
                  formatter={(v) => [formatCurrency(v), 'Total']}
                  contentStyle={{ fontSize: 12, fontFamily: 'DM Sans' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {data.paymentChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Contas a pagar */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-slate-700">
              Próximas Contas a Pagar
            </h3>
            <button
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
              onClick={() => navigate('/despesas')}
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {data.expenses.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2 text-slate-400">
              <CheckCircle className="w-8 h-8 text-success-400" />
              <p className="text-sm">Nenhuma conta pendente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.expenses.slice(0, 5).map((exp, i) => {
                const isOverdue = exp.status === 'overdue'
                const isDueSoon = !isOverdue && new Date(exp.due_date) <= new Date(Date.now() + 7 * 86400000)
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isOverdue ? 'bg-danger-50 border-danger-200' :
                      isDueSoon ? 'bg-warning-50 border-warning-200' :
                      'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isOverdue
                        ? <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0" />
                        : <Clock className="w-4 h-4 text-warning-500 shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{exp.name}</p>
                        <p className={`text-xs ${isOverdue ? 'text-danger-600' : 'text-slate-500'}`}>
                          Vence: {formatDate(exp.due_date)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ml-2 ${isOverdue ? 'text-danger-700' : 'text-slate-700'}`}>
                      {formatCurrency(exp.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
