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
      .select('total, payment_methods(name, type), sale_payments(amount, payment_methods(name, type))')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const grouped = {}
    data.forEach(s => {
      const payments = s.sale_payments?.length
        ? s.sale_payments.map(p => ({ type: p.payment_methods?.type || 'other', name: p.payment_methods?.name || 'Outro', amount: Number(p.amount || 0) }))
        : [{ type: s.payment_methods?.type || 'other', name: s.payment_methods?.name || 'Outro', amount: Number(s.total || 0) }]

      payments.forEach(payment => {
        if (!grouped[payment.type]) grouped[payment.type] = { name: payment.name, total: 0, count: 0 }
        grouped[payment.type].total += payment.amount
        grouped[payment.type].count++
      })
    })

    return { data: Object.values(grouped), error: null }
  },

  /**
   * Receita agrupada por maquininha.
   */
  async getRevenueByMachine(company_id, start, end) {
    const { data, error } = await supabase
      .from('sales')
      .select('total, card_machines(name, color, fee_credit, fee_debit), payment_methods(type), sale_payments(amount, payment_methods(type), card_machines(name, color, fee_credit, fee_debit))')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const grouped = {}
    data.forEach(s => {
      const machinePayments = s.sale_payments?.length
        ? s.sale_payments
            .filter(p => p.card_machines)
            .map(p => ({
              machine: p.card_machines,
              type: p.payment_methods?.type || 'other',
              total: Number(p.amount || 0),
            }))
        : (s.card_machines ? [{ machine: s.card_machines, type: s.payment_methods?.type || 'other', total: Number(s.total || 0) }] : [])

      machinePayments.forEach(payment => {
        const id = payment.machine.name
        if (!grouped[id]) grouped[id] = {
          name: payment.machine.name,
          color: payment.machine.color,
          total: 0,
          count: 0,
          estimatedFee: 0,
        }
        grouped[id].total += payment.total
        grouped[id].count++
        const fee = payment.type === 'credit'
          ? payment.machine.fee_credit
          : payment.machine.fee_debit
        grouped[id].estimatedFee += payment.total * Number(fee || 0)
      })
    })

    return {
      data: Object.values(grouped).map(m => ({
        ...m,
        netEstimated: m.total - m.estimatedFee,
      })),
      error: null,
    }
  },

  /**
   * Resumo operacional por tipo de venda de botijão.
   * Usado para acompanhar venda normal com troca, venda de casco vazio
   * e venda de botijão cheio sem retorno de vazio.
   */
  async getSalesByKind(company_id, start, end) {
    const { data: sales, error } = await supabase
      .from('sales')
      .select('id, total, sale_items(quantity, total, sale_kind, product_name)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const { data: settings } = await supabase
      .from('settings')
      .select('extra')
      .eq('company_id', company_id)
      .maybeSingle()

    const labels = {
      exchange: 'Gás com troca',
      empty_cylinder: 'Vazio / casco',
      full_no_return: 'Cheio sem retorno',
    }

    const grouped = {
      exchange: { type: 'exchange', name: labels.exchange, quantity: 0, revenue: 0, salesCount: 0 },
      empty_cylinder: { type: 'empty_cylinder', name: labels.empty_cylinder, quantity: 0, revenue: 0, salesCount: 0 },
      full_no_return: { type: 'full_no_return', name: labels.full_no_return, quantity: 0, revenue: 0, salesCount: 0 },
    }

    sales.forEach(sale => {
      const seenTypes = new Set()
      ;(sale.sale_items || []).forEach(item => {
        const type = item.sale_kind || 'exchange'
        if (!grouped[type]) grouped[type] = { type, name: labels[type] || type, quantity: 0, revenue: 0, salesCount: 0 }
        grouped[type].quantity += Number(item.quantity || 0)
        grouped[type].revenue += Number(item.total || 0)
        seenTypes.add(type)
      })
      seenTypes.forEach(type => {
        if (grouped[type]) grouped[type].salesCount += 1
      })
    })

    const historicalFullNoReturnQty = Number(settings?.extra?.full_no_return_initial_qty || 0)

    return {
      data: {
        items: Object.values(grouped),
        historicalFullNoReturnQty,
        fullNoReturnTotalWithHistory: grouped.full_no_return.quantity + historicalFullNoReturnQty,
      },
      error: null,
    }
  },

}
