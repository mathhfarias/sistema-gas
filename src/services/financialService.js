import { supabase } from '../lib/supabase'

function monthCountInRange(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1
  const first = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  let count = 0
  const cursor = new Date(first)
  while (cursor <= last) {
    count += 1
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return Math.max(1, count)
}

function normalizeDateLabel(value) {
  if (!value) return 'Sem data'
  return String(value).slice(0, 10).split('-').reverse().join('/')
}

function expenseCategoryLabel(category) {
  const labels = {
    rent: 'Aluguel', salary: 'Salários', utilities: 'Contas de consumo', fuel: 'Combustível',
    maintenance: 'Manutenção', tax: 'Impostos / Documentos', marketing: 'Marketing', supplies: 'Insumos', other: 'Outras despesas',
  }
  return labels[category] || category || 'Outras despesas'
}

function channelLabel(channel) {
  const labels = { street: 'Rua', delivery: 'Rua', counter: 'Portaria', pickup: 'Portaria' }
  return labels[channel] || channel || 'Não informado'
}

export const financialService = {
  /** Relatório financeiro consolidado por período. */
  async getProfitLoss(company_id, start, end) {
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('total, subtotal, delivery_fee, discount, sale_items(quantity, unit_price, cost_price)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (salesError) return { error: salesError }

    const { data: paidExpenses, error: expError } = await supabase
      .from('expenses')
      .select('id, paid_amount, amount, name, category, due_date, paid_at, payment_methods(name, type)')
      .eq('company_id', company_id)
      .eq('status', 'paid')
      .gte('paid_at', start)
      .lte('paid_at', end)
      .order('paid_at', { ascending: false })

    if (expError) return { error: expError }

    const { data: pendingExpenses } = await supabase
      .from('expenses')
      .select('amount, name, category, due_date, status')
      .eq('company_id', company_id)
      .in('status', ['pending', 'overdue'])

    const { data: machines } = await supabase
      .from('card_machines')
      .select('id, name, provider, is_active, monthly_fee')
      .eq('company_id', company_id)
      .eq('is_active', true)

    const grossRevenue = (sales || []).reduce((s, r) => s + Number(r.total), 0)
    const deliveryFeeRevenue = (sales || []).reduce((s, r) => s + Number(r.delivery_fee || 0), 0)
    const discountsTotal = (sales || []).reduce((s, r) => s + Number(r.discount || 0), 0)

    const cogs = (sales || []).reduce((s, sale) => {
      return s + (sale.sale_items || []).reduce((si, item) => {
        return si + (Number(item.cost_price) * Number(item.quantity))
      }, 0)
    }, 0)

    const monthsInRange = monthCountInRange(start, end)
    const machineMonthlyFees = (machines || []).reduce((sum, machine) => sum + Number(machine.monthly_fee || 0), 0) * monthsInRange
    const machineFeeDetails = (machines || [])
      .filter(machine => Number(machine.monthly_fee || 0) > 0)
      .map(machine => ({
        id: `machine-${machine.id}`,
        name: `Mensalidade maquininha — ${machine.name}`,
        category: 'machine_fee',
        categoryLabel: 'Taxas fixas de maquininhas',
        amount: Number(machine.monthly_fee || 0) * monthsInRange,
        paid_at: null,
        due_date: null,
        paymentMethod: 'Configuração mensal',
      }))

    const grossProfit = grossRevenue - cogs
    const totalPaidExpenses = (paidExpenses || []).reduce((s, e) => s + Number(e.paid_amount || e.amount), 0)
    const totalOperatingExpenses = totalPaidExpenses + machineMonthlyFees
    const netProfit = grossProfit - totalOperatingExpenses
    const totalPendingExpenses = (pendingExpenses || []).reduce((s, e) => s + Number(e.amount), 0)

    const expenseBreakdownMap = {}
    ;(paidExpenses || []).forEach(exp => {
      const key = exp.category || 'other'
      if (!expenseBreakdownMap[key]) {
        expenseBreakdownMap[key] = { category: key, name: expenseCategoryLabel(key), total: 0, count: 0 }
      }
      expenseBreakdownMap[key].total += Number(exp.paid_amount || exp.amount || 0)
      expenseBreakdownMap[key].count += 1
    })
    if (machineMonthlyFees > 0) {
      expenseBreakdownMap.machine_fee = {
        category: 'machine_fee',
        name: 'Taxas fixas de maquininhas',
        total: machineMonthlyFees,
        count: machineFeeDetails.length,
      }
    }

    const expenseDetails = [
      ...(paidExpenses || []).map(exp => ({
        id: exp.id,
        name: exp.name,
        category: exp.category || 'other',
        categoryLabel: expenseCategoryLabel(exp.category || 'other'),
        amount: Number(exp.paid_amount || exp.amount || 0),
        paid_at: exp.paid_at,
        due_date: exp.due_date,
        paymentMethod: exp.payment_methods?.name || '—',
      })),
      ...machineFeeDetails,
    ].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))

    return {
      data: {
        grossRevenue,
        deliveryFeeRevenue,
        discountsTotal,
        cogs,
        grossProfit,
        grossMargin: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
        totalPaidExpenses,
        machineMonthlyFees,
        totalOperatingExpenses,
        netProfit,
        netMargin: grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0,
        totalPendingExpenses,
        salesCount: (sales || []).length,
        paidExpenses: paidExpenses || [],
        pendingExpenses: pendingExpenses || [],
        expenseBreakdown: Object.values(expenseBreakdownMap).sort((a, b) => b.total - a.total),
        expenseDetails,
      },
      error: null,
    }
  },

  /** Receita agrupada por forma de pagamento. */
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
    ;(data || []).forEach(s => {
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

  /** Receita agrupada por maquininha. */
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
    ;(data || []).forEach(s => {
      const machinePayments = s.sale_payments?.length
        ? s.sale_payments
            .filter(p => p.card_machines)
            .map(p => ({ machine: p.card_machines, type: p.payment_methods?.type || 'other', total: Number(p.amount || 0) }))
        : (s.card_machines ? [{ machine: s.card_machines, type: s.payment_methods?.type || 'other', total: Number(s.total || 0) }] : [])

      machinePayments.forEach(payment => {
        const id = payment.machine.name
        if (!grouped[id]) grouped[id] = { name: payment.machine.name, color: payment.machine.color, total: 0, count: 0, estimatedFee: 0 }
        grouped[id].total += payment.total
        grouped[id].count++
        const fee = payment.type === 'credit' ? payment.machine.fee_credit : payment.machine.fee_debit
        grouped[id].estimatedFee += payment.total * Number(fee || 0)
      })
    })

    return { data: Object.values(grouped).map(m => ({ ...m, netEstimated: m.total - m.estimatedFee })), error: null }
  },

  async getSalesByChannel(company_id, start, end) {
    const { data, error } = await supabase
      .from('sales')
      .select('id, channel, total, sale_items(quantity)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', start)
      .lte('sold_at', end)

    if (error) return { error }

    const grouped = {}
    ;(data || []).forEach(sale => {
      const name = channelLabel(sale.channel)
      if (!grouped[name]) grouped[name] = { name, total: 0, count: 0, quantity: 0 }
      grouped[name].total += Number(sale.total || 0)
      grouped[name].count += 1
      grouped[name].quantity += (sale.sale_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    })

    return { data: Object.values(grouped), error: null }
  },

  async getPurchasesQuantityByProduct(company_id, start, end) {
    const { data, error } = await supabase
      .from('purchases')
      .select('id, purchased_at, is_deleted, purchase_items(quantity, product_name, products(name, code))')
      .eq('company_id', company_id)
      .gte('purchased_at', start)
      .lte('purchased_at', end)
      .or('is_deleted.is.null,is_deleted.eq.false')

    if (error) return { error }

    const grouped = {}
    ;(data || []).forEach(purchase => {
      ;(purchase.purchase_items || []).forEach(item => {
        const name = item.products?.code || item.products?.name || item.product_name || 'Produto'
        if (!grouped[name]) grouped[name] = { name, quantity: 0, arrivals: 0 }
        grouped[name].quantity += Number(item.quantity || 0)
        grouped[name].arrivals += 1
      })
    })

    return { data: Object.values(grouped).sort((a, b) => b.quantity - a.quantity), error: null }
  },

  /** Resumo operacional por tipo de venda de botijão. */
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

    const labels = { exchange: 'Gás com troca', empty_cylinder: 'Vazio / casco', full_no_return: 'Cheio sem retorno' }
    const grouped = {
      exchange: { type: 'exchange', name: labels.exchange, quantity: 0, revenue: 0, salesCount: 0 },
      empty_cylinder: { type: 'empty_cylinder', name: labels.empty_cylinder, quantity: 0, revenue: 0, salesCount: 0 },
      full_no_return: { type: 'full_no_return', name: labels.full_no_return, quantity: 0, revenue: 0, salesCount: 0 },
    }

    ;(sales || []).forEach(sale => {
      const seenTypes = new Set()
      ;(sale.sale_items || []).forEach(item => {
        const type = item.sale_kind || 'exchange'
        if (!grouped[type]) grouped[type] = { type, name: labels[type] || type, quantity: 0, revenue: 0, salesCount: 0 }
        grouped[type].quantity += Number(item.quantity || 0)
        grouped[type].revenue += Number(item.total || 0)
        seenTypes.add(type)
      })
      seenTypes.forEach(type => { if (grouped[type]) grouped[type].salesCount += 1 })
    })

    const historicalFullNoReturnQty = Number(settings?.extra?.full_no_return_initial_qty || 0)
    return { data: { items: Object.values(grouped), historicalFullNoReturnQty, fullNoReturnTotalWithHistory: grouped.full_no_return.quantity + historicalFullNoReturnQty }, error: null }
  },
}
