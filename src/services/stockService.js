import { supabase } from '../lib/supabase'

export const stockService = {
  /**
   * Retorna saldo atual do estoque por produto.
   */
  async getBalances(company_id) {
    return supabase
      .from('stock_balances')
      .select('*, products(id, name, code, min_stock, is_cylinder)')
      .eq('company_id', company_id)
      .order('products(name)')
  },

  /**
   * Registra chegada de gás (compra).
   */
  async registerPurchase(payload) {
    const {
      company_id,
      supplier_id,
      supplier_name,
      items, // [{ product_id, product_name, quantity, unit_cost, empty_returned }]
      notes,
      purchased_at,
      created_by,
    } = payload

    const total_cost = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        company_id,
        supplier_id,
        supplier_name,
        total_cost,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        created_by,
      })
      .select()
      .single()

    if (purchaseError) return { error: purchaseError }

    // Itens da compra
    const purchaseItems = items.map(i => ({
      purchase_id: purchase.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      total_cost: i.quantity * i.unit_cost,
      empty_returned: i.empty_returned || 0,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) return { error: itemsError }

    // Movimentar estoque
    for (const item of items) {
      await supabase.from('stock_movements').insert({
        company_id,
        product_id: item.product_id,
        type: 'purchase',
        full_qty_change: item.quantity,        // recebe cheios
        empty_qty_change: -(item.empty_returned || 0), // entrega vazios
        reference_id: purchase.id,
        reference_type: 'purchase',
        performed_by: created_by,
      })
    }

    return { data: purchase, error: null }
  },

  /**
   * Ajuste manual de estoque.
   */
  async manualAdjustment({ company_id, product_id, full_qty_change, empty_qty_change, reason, performed_by }) {
    if (!reason?.trim()) {
      return { error: { message: 'O motivo do ajuste é obrigatório.' } }
    }

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'adjustment',
      full_qty_change: full_qty_change || 0,
      empty_qty_change: empty_qty_change || 0,
      reason,
      performed_by,
    })
  },

  /**
   * Histórico de movimentações.
   */
  async getMovements({ company_id, product_id, limit = 50, offset = 0 } = {}) {
    let query = supabase
      .from('stock_movements')
      .select('*, products(name, code), profiles(full_name)')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (product_id) query = query.eq('product_id', product_id)

    return query
  },
}
