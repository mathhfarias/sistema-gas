import { supabase } from '../lib/supabase'

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
      items,           // [{ product_id, product_name, quantity, unit_price, cost_price, empty_returned, empty_qty_returned }]
      delivery_fee = 0,
      discount = 0,
      notes,
      sold_at,
      created_by,
    } = payload

    // Calcular totais
    const subtotal = items.reduce((sum, i) => sum + (i.unit_price * i.quantity - (i.discount || 0)), 0)
    const total = subtotal + Number(delivery_fee) - Number(discount)

    // Inserir venda
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        company_id,
        customer_id: customer_id || null,
        customer_name,
        payment_method_id,
        card_machine_id: card_machine_id || null,
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

    // Inserir itens
    const saleItems = items.map(item => ({
      sale_id: sale.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price || 0,
      discount: item.discount || 0,
      total: item.unit_price * item.quantity - (item.discount || 0),
      empty_returned: item.empty_returned || false,
      empty_qty_returned: item.empty_qty_returned || 0,
    }))

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems)

    if (itemsError) return { error: itemsError }

    // Movimentar estoque para cada item
    for (const item of items) {
      const movement = {
        company_id,
        product_id: item.product_id,
        type: 'sale',
        full_qty_change: -item.quantity,  // vende cheio
        empty_qty_change: item.empty_qty_returned || 0, // retorna vazio
        reference_id: sale.id,
        reference_type: 'sale',
        performed_by: created_by,
      }

      const { error: stockError } = await supabase
        .from('stock_movements')
        .insert(movement)

      if (stockError) console.error('Erro ao movimentar estoque:', stockError)
    }

    return { data: sale, error: null }
  },

  /**
   * Busca vendas com filtros.
   */
  async getSales({ company_id, start, end, limit = 50, offset = 0 } = {}) {
    let query = supabase
      .from('sales')
      .select(`
        *,
        payment_methods(name, type),
        card_machines(name, color),
        sale_items(*, products(name, code)),
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
      .select('total, delivery_fee, subtotal, payment_methods(type, name)')
      .eq('company_id', company_id)
      .eq('status', 'completed')
      .gte('sold_at', today.toISOString())
      .lt('sold_at', tomorrow.toISOString())

    if (error) return { error }

    const totalRevenue = data.reduce((s, r) => s + Number(r.total), 0)
    const totalDeliveryFees = data.reduce((s, r) => s + Number(r.delivery_fee || 0), 0)
    const totalSales = data.length

    const byPayment = {}
    data.forEach(s => {
      const type = s.payment_methods?.type || 'other'
      const name = s.payment_methods?.name || 'Outro'
      if (!byPayment[type]) byPayment[type] = { name, total: 0, count: 0 }
      byPayment[type].total += Number(s.total)
      byPayment[type].count += 1
    })

    return {
      data: { totalRevenue, totalDeliveryFees, totalSales, byPayment },
      error: null,
    }
  },

  /**
   * Cancela uma venda e reverte o estoque.
   */
  async cancelSale(saleId, company_id, userId) {
    // Buscar itens da venda
    const { data: items } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)

    // Reverter estoque
    if (items) {
      for (const item of items) {
        await supabase.from('stock_movements').insert({
          company_id,
          product_id: item.product_id,
          type: 'adjustment',
          full_qty_change: item.quantity, // devolve cheio
          empty_qty_change: -(item.empty_qty_returned || 0),
          reference_id: saleId,
          reference_type: 'sale_cancel',
          reason: 'Cancelamento de venda',
          performed_by: userId,
        })
      }
    }

    return supabase
      .from('sales')
      .update({ status: 'cancelled' })
      .eq('id', saleId)
  },
}
