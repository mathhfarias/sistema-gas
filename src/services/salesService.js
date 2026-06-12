import { supabase } from '../lib/supabase'

function normalizeMoney(value) {
  return Number(value || 0)
}

function normalizeQuantity(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function aggregateSaleStock(items, multiplier = 1, paymentType = 'other') {
  const map = new Map()
  const isValeHub = paymentType === 'vale_hub'

  for (const item of items || []) {
    if (!item.product_id) continue
    const current = map.get(item.product_id) || {
      product_id: item.product_id,
      product_name: item.product_name,
      full_qty_change: 0,
      empty_qty_change: 0,
      hub_pending_qty_change: 0,
    }

    const quantity = normalizeQuantity(item.quantity)
    const emptyReturned = normalizeQuantity(item.empty_qty_returned)
    const saleKind = item.sale_kind || 'exchange'

    if (saleKind === 'empty_cylinder') {
      // Venda de casco/botijão vazio: sai do estoque de vazios.
      current.empty_qty_change += multiplier * -quantity
      map.set(item.product_id, current)
      continue
    }

    if (saleKind === 'full_no_return') {
      // Venda do botijão cheio sem retorno de vazio: sai cheio e não entra vazio.
      current.full_qty_change += multiplier * -quantity
      map.set(item.product_id, current)
      continue
    }

    // Venda normal/base de troca: sai cheio e, se houver retorno, entra vazio.
    current.full_qty_change += multiplier * -quantity

    if (isValeHub) {
      // Vale Hub / Ultragaz: o vazio retornado permanece no estoque de vazios
      // e também gera um controle paralelo em "HUB a retornar".
      // A baixa do HUB reduz apenas o card HUB, não reduz o estoque de vazios.
      const hubQty = emptyReturned || quantity
      current.empty_qty_change += multiplier * hubQty
      current.hub_pending_qty_change += multiplier * hubQty
    } else {
      current.empty_qty_change += multiplier * emptyReturned
    }

    map.set(item.product_id, current)
  }

  return Array.from(map.values())
}


function normalizePaymentSplits(payment_splits, total = 0, fallback = {}) {
  const cleaned = (payment_splits || [])
    .map(split => ({
      payment_method_id: split.payment_method_id || '',
      card_machine_id: split.card_machine_id || null,
      amount: normalizeMoney(split.amount),
    }))
    .filter(split => split.payment_method_id && split.amount > 0)

  if (cleaned.length) return cleaned

  if (fallback.payment_method_id) {
    return [{
      payment_method_id: fallback.payment_method_id,
      card_machine_id: fallback.card_machine_id || null,
      amount: normalizeMoney(total),
    }]
  }

  return []
}

async function enrichPaymentSplits(paymentSplits) {
  const methodIds = [...new Set(paymentSplits.map(split => split.payment_method_id).filter(Boolean))]

  if (!methodIds.length) return { data: [], error: null }

  const { data: methods, error } = await supabase
    .from('payment_methods')
    .select('id, type, name, requires_machine')
    .in('id', methodIds)

  if (error) return { error }

  const methodMap = new Map((methods || []).map(method => [method.id, method]))
  const enriched = paymentSplits.map(split => ({
    ...split,
    payment_method: methodMap.get(split.payment_method_id),
  }))

  return { data: enriched, error: null }
}

function validatePaymentSplits(paymentSplits, total, enrichedSplits = []) {
  if (!paymentSplits.length) {
    return { error: { message: 'Informe pelo menos uma forma de pagamento.' } }
  }

  const paidTotal = paymentSplits.reduce((sum, split) => sum + normalizeMoney(split.amount), 0)
  const diff = Math.abs(paidTotal - normalizeMoney(total))

  if (diff > 0.01) {
    return {
      error: {
        message: `O total pago (${paidTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) precisa ser igual ao total da venda (${normalizeMoney(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
      },
    }
  }

  for (const split of enrichedSplits) {
    if (split.payment_method?.requires_machine && !split.card_machine_id && split.payment_method?.type !== 'vale_hub') {
      return { error: { message: `Selecione a maquininha para ${split.payment_method?.name || 'pagamento com cartão'}.` } }
    }
  }

  const specialPayments = enrichedSplits.filter(split => ['gas_povo', 'vale_hub'].includes(split.payment_method?.type))
  if (paymentSplits.length > 1 && specialPayments.length) {
    return { error: { message: 'Pagamento dividido não deve usar Gás do Povo ou Vale Hub. Registre essas modalidades em venda separada.' } }
  }

  return { error: null }
}

function getPaymentTypeForStock(enrichedSplits, legacyPaymentType = 'other') {
  if (enrichedSplits.length === 1) return enrichedSplits[0].payment_method?.type || legacyPaymentType || 'other'
  return 'other'
}

function buildSalePayments(saleId, companyId, paymentSplits) {
  return paymentSplits.map(split => ({
    sale_id: saleId,
    company_id: companyId,
    payment_method_id: split.payment_method_id,
    card_machine_id: split.card_machine_id || null,
    amount: normalizeMoney(split.amount),
  }))
}

function combineStockMovements(...movementGroups) {
  const map = new Map()

  movementGroups.flat().forEach(movement => {
    if (!movement?.product_id) return
    const current = map.get(movement.product_id) || {
      product_id: movement.product_id,
      product_name: movement.product_name,
      full_qty_change: 0,
      empty_qty_change: 0,
      hub_pending_qty_change: 0,
    }
    current.full_qty_change += normalizeQuantity(movement.full_qty_change)
    current.empty_qty_change += normalizeQuantity(movement.empty_qty_change)
    current.hub_pending_qty_change += normalizeQuantity(movement.hub_pending_qty_change)
    map.set(movement.product_id, current)
  })

  return Array.from(map.values()).filter(m =>
    m.full_qty_change !== 0 || m.empty_qty_change !== 0 || m.hub_pending_qty_change !== 0
  )
}

async function validateStock(company_id, movements) {
  for (const movement of movements) {
    const { data: balance, error } = await supabase
      .from('stock_balances')
      .select('full_qty, empty_qty, exchange_qty, hub_pending_qty, products(name, code)')
      .eq('company_id', company_id)
      .eq('product_id', movement.product_id)
      .maybeSingle()

    if (error) return { error }

    const productLabel = balance?.products?.name || movement.product_name || 'Produto'
    const nextFull = normalizeQuantity(balance?.full_qty) + normalizeQuantity(movement.full_qty_change)
    const nextEmpty = normalizeQuantity(balance?.empty_qty) + normalizeQuantity(movement.empty_qty_change)
    const nextHubPending = normalizeQuantity(balance?.hub_pending_qty) + normalizeQuantity(movement.hub_pending_qty_change)

    if (nextFull < 0) {
      return {
        error: {
          message: `Estoque insuficiente para ${productLabel}. Cheios disponíveis: ${balance?.full_qty || 0}.`,
        },
      }
    }

    if (nextEmpty < 0) {
      return {
        error: {
          message: `Estoque de vazios insuficiente para ${productLabel}. Vazios disponíveis: ${balance?.empty_qty || 0}.`,
        },
      }
    }

    if (nextHubPending < 0) {
      return {
        error: {
          message: `HUB a retornar insuficiente para ${productLabel}. Saldo atual: ${balance?.hub_pending_qty || 0}.`,
        },
      }
    }
  }

  return { error: null }
}

function buildSaleItems(saleId, items) {
  return (items || []).map(item => ({
    sale_id: saleId,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: normalizeQuantity(item.quantity),
    unit_price: normalizeMoney(item.unit_price),
    cost_price: normalizeMoney(item.cost_price),
    discount: normalizeMoney(item.discount),
    total: normalizeMoney(item.unit_price) * normalizeQuantity(item.quantity) - normalizeMoney(item.discount),
    sale_kind: item.sale_kind || 'exchange',
    empty_returned: item.sale_kind === 'exchange' ? !!item.empty_returned : false,
    empty_qty_returned: item.sale_kind === 'exchange' && item.empty_returned ? normalizeQuantity(item.empty_qty_returned) : 0,
  }))
}

function calculateSaleTotals(items, delivery_fee = 0, discount = 0) {
  const subtotal = (items || []).reduce((sum, item) => {
    return sum + normalizeMoney(item.unit_price) * normalizeQuantity(item.quantity) - normalizeMoney(item.discount)
  }, 0)

  const total = subtotal + normalizeMoney(delivery_fee) - normalizeMoney(discount)

  return { subtotal, total }
}

export const salesService = {
  /**
   * Cria uma venda e movimenta o estoque automaticamente.
   */
  async createSale(payload) {
    const {
      company_id,
      customer_id,
      customer_name,
      payment_method_id,
      card_machine_id,
      payment_splits = [],
      channel = 'street',
      items,
      delivery_fee = 0,
      discount = 0,
      notes,
      sold_at,
      created_by,
    } = payload

    const normalizedItems = buildSaleItems(null, items)
    const { subtotal, total } = calculateSaleTotals(normalizedItems, delivery_fee, discount)

    const normalizedPayments = normalizePaymentSplits(payment_splits, total, { payment_method_id, card_machine_id })
    const paymentInfo = await enrichPaymentSplits(normalizedPayments)
    if (paymentInfo.error) return { error: paymentInfo.error }

    const paymentValidation = validatePaymentSplits(normalizedPayments, total, paymentInfo.data)
    if (paymentValidation.error) return paymentValidation

    const primaryPayment = normalizedPayments[0]
    const paymentType = getPaymentTypeForStock(paymentInfo.data, 'other')

    const stockMovements = aggregateSaleStock(normalizedItems, 1, paymentType)
    const stockValidation = await validateStock(company_id, stockMovements)
    if (stockValidation.error) return stockValidation

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        company_id,
        customer_id: customer_id || null,
        customer_name,
        payment_method_id: primaryPayment.payment_method_id,
        card_machine_id: paymentType === 'vale_hub' ? null : (primaryPayment.card_machine_id || null),
        channel,
        subtotal,
        delivery_fee,
        discount,
        total,
        notes,
        sold_at: sold_at || new Date().toISOString(),
        created_by,
      })
      .select()
      .single()

    if (saleError) return { error: saleError }

    const salePayments = buildSalePayments(sale.id, company_id, normalizedPayments)
    const { error: paymentsError } = await supabase
      .from('sale_payments')
      .insert(salePayments)

    if (paymentsError) return { error: paymentsError }

    const saleItems = buildSaleItems(sale.id, items)

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems)

    if (itemsError) return { error: itemsError }

    for (const movement of stockMovements) {
      const { error: stockError } = await supabase
        .from('stock_movements')
        .insert({
          company_id,
          product_id: movement.product_id,
          type: 'sale',
          full_qty_change: movement.full_qty_change,
          empty_qty_change: movement.empty_qty_change,
          exchange_qty_change: 0,
          hub_pending_qty_change: movement.hub_pending_qty_change || 0,
          reference_id: sale.id,
          reference_type: 'sale',
          performed_by: created_by,
        })

      if (stockError) return { error: stockError }
    }

    return { data: sale, error: null }
  },

  /**
   * Atualiza uma venda concluída e ajusta o estoque pela diferença.
   */
  async updateSale(saleId, payload) {
    const {
      company_id,
      customer_id,
      customer_name,
      payment_method_id,
      card_machine_id,
      payment_splits = [],
      channel = 'street',
      items,
      delivery_fee = 0,
      discount = 0,
      notes,
      sold_at,
      updated_by,
    } = payload

    const { data: oldSale, error: oldSaleError } = await supabase
      .from('sales')
      .select('id, sale_number, status, payment_methods(type), sale_payments(payment_method_id, card_machine_id, amount, payment_methods(type, name, requires_machine))')
      .eq('id', saleId)
      .eq('company_id', company_id)
      .single()

    if (oldSaleError) return { error: oldSaleError }
    if (oldSale?.status !== 'completed') {
      return { error: { message: 'Somente vendas concluídas podem ser alteradas.' } }
    }

    const { data: oldItems, error: oldItemsError } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)

    if (oldItemsError) return { error: oldItemsError }

    const normalizedNewItems = buildSaleItems(saleId, items)
    const { subtotal, total } = calculateSaleTotals(normalizedNewItems, delivery_fee, discount)

    const normalizedPayments = normalizePaymentSplits(payment_splits, total, { payment_method_id, card_machine_id })
    const paymentInfo = await enrichPaymentSplits(normalizedPayments)
    if (paymentInfo.error) return { error: paymentInfo.error }

    const paymentValidation = validatePaymentSplits(normalizedPayments, total, paymentInfo.data)
    if (paymentValidation.error) return paymentValidation

    const primaryPayment = normalizedPayments[0]
    const oldPaymentType = getPaymentTypeForStock(oldSale.sale_payments || [], oldSale.payment_methods?.type || 'other')
    const newPaymentType = getPaymentTypeForStock(paymentInfo.data, 'other')

    const reverseOld = aggregateSaleStock(oldItems || [], -1, oldPaymentType)
    const applyNew = aggregateSaleStock(normalizedNewItems, 1, newPaymentType)
    const stockDiff = combineStockMovements(reverseOld, applyNew)

    const stockValidation = await validateStock(company_id, stockDiff)
    if (stockValidation.error) return stockValidation

    const { error: updateError } = await supabase
      .from('sales')
      .update({
        customer_id: customer_id || null,
        customer_name,
        payment_method_id: primaryPayment.payment_method_id,
        card_machine_id: newPaymentType === 'vale_hub' ? null : (primaryPayment.card_machine_id || null),
        channel,
        subtotal,
        delivery_fee,
        discount,
        total,
        notes,
        sold_at: sold_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', saleId)
      .eq('company_id', company_id)

    if (updateError) return { error: updateError }

    const { error: deletePaymentsError } = await supabase
      .from('sale_payments')
      .delete()
      .eq('sale_id', saleId)

    if (deletePaymentsError) return { error: deletePaymentsError }

    const { error: insertPaymentsError } = await supabase
      .from('sale_payments')
      .insert(buildSalePayments(saleId, company_id, normalizedPayments))

    if (insertPaymentsError) return { error: insertPaymentsError }

    const { error: deleteItemsError } = await supabase
      .from('sale_items')
      .delete()
      .eq('sale_id', saleId)

    if (deleteItemsError) return { error: deleteItemsError }

    const { error: insertItemsError } = await supabase
      .from('sale_items')
      .insert(normalizedNewItems)

    if (insertItemsError) return { error: insertItemsError }

    for (const movement of stockDiff) {
      const { error: stockError } = await supabase
        .from('stock_movements')
        .insert({
          company_id,
          product_id: movement.product_id,
          type: 'adjustment',
          full_qty_change: movement.full_qty_change,
          empty_qty_change: movement.empty_qty_change,
          exchange_qty_change: 0,
          hub_pending_qty_change: movement.hub_pending_qty_change || 0,
          reference_id: saleId,
          reference_type: 'sale_edit',
          reason: `Correção da venda #${oldSale.sale_number}`,
          performed_by: updated_by,
        })

      if (stockError) return { error: stockError }
    }

    return { data: { id: saleId }, error: null }
  },

  /**
   * Busca vendas com filtros.
   */
  async getSales({ company_id, start, end, limit = 200, offset = 0 } = {}) {
    let query = supabase
      .from('sales')
      .select(`
        *,
        payment_methods(name, type, requires_machine),
        card_machines(name, color),
        sale_payments(amount, payment_method_id, card_machine_id, payment_methods(name, type, requires_machine), card_machines(name, color)),
        sale_items(*, products(name, code, sale_price, street_sale_price, gas_povo_sale_price, empty_cylinder_sale_price, full_no_return_sale_price, cost_price, is_cylinder)),
        profiles(full_name)
      `)
      .eq('company_id', company_id)
      .order('sold_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (start) query = query.gte('sold_at', start)
    if (end) query = query.lte('sold_at', end)

    return query
  },

  /**
   * Sumário das vendas do dia.
   */
  async getTodaySummary(company_id) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data, error } = await supabase
      .from('sales')
      .select('total, delivery_fee, subtotal, sale_items(quantity), payment_methods(type, name), sale_payments(amount, payment_methods(type, name))')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', today.toISOString())
      .lt('sold_at', tomorrow.toISOString())

    if (error) return { error }

    const totalRevenue = data.reduce((s, r) => s + Number(r.total), 0)
    const totalDeliveryFees = data.reduce((s, r) => s + Number(r.delivery_fee || 0), 0)
    const totalOrders = data.length
    const totalItems = data.reduce((s, sale) => {
      return s + (sale.sale_items || []).reduce((si, item) => si + Number(item.quantity || 0), 0)
    }, 0)

    const byPayment = {}
    data.forEach(s => {
      const payments = s.sale_payments?.length
        ? s.sale_payments.map(p => ({ type: p.payment_methods?.type || 'other', name: p.payment_methods?.name || 'Outro', amount: Number(p.amount || 0) }))
        : [{ type: s.payment_methods?.type || 'other', name: s.payment_methods?.name || 'Outro', amount: Number(s.total || 0) }]

      payments.forEach(payment => {
        if (!byPayment[payment.type]) byPayment[payment.type] = { name: payment.name, total: 0, count: 0 }
        byPayment[payment.type].total += payment.amount
        byPayment[payment.type].count += 1
      })
    })

    return {
      data: { totalRevenue, totalDeliveryFees, totalOrders, totalItems, byPayment },
      error: null,
    }
  },

  /**
   * Cancela uma venda e reverte o estoque.
   */
  async cancelSale(saleId, company_id, userId) {
    const { data: sale } = await supabase
      .from('sales')
      .select('sale_number, status, payment_methods(type), sale_payments(payment_methods(type, name, requires_machine))')
      .eq('id', saleId)
      .eq('company_id', company_id)
      .maybeSingle()

    if (sale?.status !== 'completed') {
      return { error: { message: 'Somente vendas concluídas podem ser canceladas.' } }
    }

    const { data: items, error: itemsError } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)

    if (itemsError) return { error: itemsError }

    const paymentType = getPaymentTypeForStock(sale?.sale_payments || [], sale?.payment_methods?.type || 'other')
    const reverseMovements = aggregateSaleStock(items || [], -1, paymentType)
    const stockValidation = await validateStock(company_id, reverseMovements)
    if (stockValidation.error) return stockValidation

    for (const movement of reverseMovements) {
      const { error: stockError } = await supabase.from('stock_movements').insert({
        company_id,
        product_id: movement.product_id,
        type: 'adjustment',
        full_qty_change: movement.full_qty_change,
        empty_qty_change: movement.empty_qty_change,
        exchange_qty_change: 0,
        hub_pending_qty_change: movement.hub_pending_qty_change || 0,
        reference_id: saleId,
        reference_type: 'sale_cancel',
        reason: `Cancelamento da venda #${sale?.sale_number || ''}`.trim(),
        performed_by: userId,
      })

      if (stockError) return { error: stockError }
    }

    return supabase
      .from('sales')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', saleId)
      .eq('company_id', company_id)
  },
}
