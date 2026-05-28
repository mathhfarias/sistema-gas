import { supabase } from '../lib/supabase'

export const financialService = {
  /**
   * Relatório financeiro consolidado por período.
   */
  async getProfitLoss(company_id, start, end) {
    // Vendas no período
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('total, subtotal, delivery_fee, discount, sale_items(quantity, unit_price, cost_price)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (salesError) return { error: salesError }

    // Despesas pagas no período
    const { data: paidExpenses, error: expError } = await supabase
      .from('expenses')
      .select('paid_amount, amount, name, category')
      .eq('company_id', company_id)
      .eq('status', 'paid')
      .gte('paid_at', start)
      .lte('paid_at', end)

    if (expError) return { error: expError }

    // Despesas pendentes (obrigações futuras)
    const { data: pendingExpenses } = await supabase
      .from('expenses')
      .select('amount, name, category')
      .eq('company_id', company_id)
      .in('status', ['pending', 'overdue'])

    // Calcular métricas
    const grossRevenue = sales.reduce((s, r) => s + Number(r.total), 0)
    const deliveryFeeRevenue = sales.reduce((s, r) => s + Number(r.delivery_fee || 0), 0)
    const discountsTotal = sales.reduce((s, r) => s + Number(r.discount || 0), 0)

    // Custo dos produtos vendidos
    const cogs = sales.reduce((s, sale) => {
      return s + (sale.sale_items || []).reduce((si, item) => {
        return si + (Number(item.cost_price) * Number(item.quantity))
      }, 0)
    }, 0)

    const grossProfit = grossRevenue - cogs
    const totalPaidExpenses = paidExpenses.reduce((s, e) => s + Number(e.paid_amount || e.amount), 0)
    const netProfit = grossProfit - totalPaidExpenses
    const totalPendingExpenses = (pendingExpenses || []).reduce((s, e) => s + Number(e.amount), 0)

    return {
      data: {
        grossRevenue,
        deliveryFeeRevenue,
        discountsTotal,
        cogs,
        grossProfit,
        grossMargin: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
        totalPaidExpenses,
        netProfit,
        netMargin: grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0,
        totalPendingExpenses,
        salesCount: sales.length,
        paidExpenses,
        pendingExpenses: pendingExpenses || [],
      },
      error: null,
    }
  },

  /**
   * Receita agrupada por forma de pagamento.
   */
  async getRevenueByPayment(company_id, start, end) {
    const { data, error } = await supabase
      .from('sales')
      .select('total, payment_methods(name, type)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const grouped = {}
    data.forEach(s => {
      const type = s.payment_methods?.type || 'other'
      const name = s.payment_methods?.name || 'Outro'
      if (!grouped[type]) grouped[type] = { name, total: 0, count: 0 }
      grouped[type].total += Number(s.total)
      grouped[type].count++
    })

    return { data: Object.values(grouped), error: null }
  },

  /**
   * Receita agrupada por maquininha.
   */
  async getRevenueByMachine(company_id, start, end) {
    const { data, error } = await supabase
      .from('sales')
      .select('total, card_machines(name, color, fee_credit, fee_debit), payment_methods(type)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .not('card_machine_id', 'is', null)
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const grouped = {}
    data.forEach(s => {
      if (!s.card_machines) return
      const id = s.card_machines.name
      if (!grouped[id]) grouped[id] = {
        name: s.card_machines.name,
        color: s.card_machines.color,
        total: 0,
        count: 0,
        estimatedFee: 0,
      }
      const total = Number(s.total)
      grouped[id].total += total
      grouped[id].count++
      // Taxa estimada
      const fee = s.payment_methods?.type === 'credit'
        ? s.card_machines.fee_credit
        : s.card_machines.fee_debit
      grouped[id].estimatedFee += total * Number(fee || 0)
    })

    return {
      data: Object.values(grouped).map(m => ({
        ...m,
        netEstimated: m.total - m.estimatedFee,
      })),
      error: null,
    }
  },
}
