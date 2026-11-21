import { supabase } from '../lib/supabase'

function normalizeQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? Math.trunc(quantity) : 0
}

function validatePositiveQuantity(quantity, label = 'quantidade') {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: { message: `Informe uma ${label} maior que zero.` } }
  }
  return null
}


function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function allocatePurchaseCosts(items, freightCost = 0, discountCredit = 0) {
  const normalizedItems = (items || []).map(item => {
    const quantity = normalizeQuantity(item.quantity)
    const rawTotal = Number(
      item.total_cost ??
      item.product_total ??
      (Number(item.unit_cost || 0) * quantity)
    )

    const explicitDiscount = Number(
      item.discount_amount ??
      item.discount_allocated ??
      0
    )

    return {
      ...item,
      quantity,
      total_cost: roundMoney(rawTotal),
      explicit_discount: roundMoney(explicitDiscount),
    }
  })

  const productsTotal = roundMoney(
    normalizedItems.reduce(
      (sum, item) => sum + Number(item.total_cost || 0),
      0
    )
  )

  const freight = roundMoney(freightCost)

  const hasExplicitItemDiscount = normalizedItems.some(item =>
    Object.prototype.hasOwnProperty.call(item, 'discount_amount')
    || Object.prototype.hasOwnProperty.call(item, 'discount_allocated')
  )

  const requestedGlobalDiscount = roundMoney(discountCredit)

  let freightAllocated = 0
  let legacyDiscountAllocated = 0

  const calculatedItems = normalizedItems.map((item, index) => {
    const isLast = index === normalizedItems.length - 1
    const ratio = productsTotal > 0 ? item.total_cost / productsTotal : 0

    const freightShare = isLast
      ? roundMoney(freight - freightAllocated)
      : roundMoney(freight * ratio)

    freightAllocated = roundMoney(freightAllocated + freightShare)

    let discountShare = 0

    if (hasExplicitItemDiscount) {
      discountShare = roundMoney(item.explicit_discount)
    } else {
      discountShare = isLast
        ? roundMoney(requestedGlobalDiscount - legacyDiscountAllocated)
        : roundMoney(requestedGlobalDiscount * ratio)

      legacyDiscountAllocated = roundMoney(
        legacyDiscountAllocated + discountShare
      )
    }

    const finalTotal = roundMoney(
      item.total_cost + freightShare - discountShare
    )

    const grossUnit =
      item.quantity > 0 ? item.total_cost / item.quantity : 0

    const finalUnit =
      item.quantity > 0 ? finalTotal / item.quantity : 0

    return {
      ...item,
      unit_cost: roundMoney(grossUnit),
      freight_allocated: freightShare,
      discount_allocated: discountShare,
      final_total_cost: finalTotal,
      final_unit_cost: Number(finalUnit.toFixed(4)),
      empty_returned: item.empty_returned ?? item.received_quantity ?? item.quantity,
    }
  })

  const itemDiscountTotal = roundMoney(
    calculatedItems.reduce(
      (sum, item) => sum + Number(item.discount_allocated || 0),
      0
    )
  )

  const discount = hasExplicitItemDiscount
    ? roundMoney(itemDiscountTotal + requestedGlobalDiscount)
    : requestedGlobalDiscount

  return {
    items: calculatedItems,
    productsTotal,
    freight,
    discount,
    totalCost: roundMoney(productsTotal + freight - discount),
  }
}

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
   * Registra uma compra/pedido de gás.
   *
   * IMPORTANTE:
   * - salvar a compra NÃO movimenta estoque;
   * - o estoque muda somente em receivePurchase();
   * - delivery_status nasce como "ordered".
   */
  async registerPurchase(payload) {
    const {
      company_id,
      supplier_id,
      supplier_name,
      items,
      notes,
      purchased_at,
      expected_delivery_date = null,
      freight_cost = 0,
      discount_credit = 0,
      created_by,
    } = payload

    const costs = allocatePurchaseCosts(items, freight_cost, discount_credit)

    if (!costs.items.length || costs.items.some(item => !item.product_id || item.quantity <= 0)) {
      return { error: { message: 'Informe produto e quantidade maior que zero em todos os itens.' } }
    }

    if (costs.items.some(item => item.total_cost <= 0)) {
      return { error: { message: 'Informe o valor total dos produtos em todos os itens.' } }
    }

    if (costs.discount < 0 || costs.totalCost < 0) {
      return { error: { message: 'Descontos/créditos não podem deixar o custo líquido da compra negativo.' } }
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        company_id,
        supplier_id,
        supplier_name,
        total_cost: costs.totalCost,
        freight_cost: costs.freight,
        discount_credit: costs.discount,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        expected_delivery_date,
        delivery_status: 'ordered',
        received_at: null,
        created_by,
      })
      .select()
      .single()

    if (purchaseError) return { error: purchaseError }

    const purchaseItems = costs.items.map(item => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      received_quantity: 0,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
      freight_allocated: item.freight_allocated,
      discount_allocated: item.discount_allocated,
      final_total_cost: item.final_total_cost,
      final_unit_cost: item.final_unit_cost,
      empty_returned: 0,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) return { error: itemsError }

    return { data: purchase, error: null }
  },

  /**
   * Altera os dados financeiros/operacionais da compra.
   *
   * Enquanto nada foi recebido, produto/quantidade podem mudar.
   * Depois do primeiro recebimento, produto/quantidade ficam imutáveis
   * para não invalidar o histórico físico do estoque.
   */
  async updatePurchase(payload) {
    const {
      purchase_id,
      company_id,
      supplier_id,
      supplier_name,
      items,
      notes,
      purchased_at,
      expected_delivery_date = null,
      freight_cost = 0,
      discount_credit = 0,
    } = payload

    if (!purchase_id) {
      return { error: { message: 'Compra não informada.' } }
    }

    const costs = allocatePurchaseCosts(items, freight_cost, discount_credit)
    const normalizedItems = costs.items

    if (!normalizedItems.length || normalizedItems.some(item => !item.product_id || item.quantity <= 0)) {
      return { error: { message: 'Informe produto e quantidade maior que zero em todos os itens.' } }
    }

    if (normalizedItems.some(item => item.total_cost <= 0)) {
      return { error: { message: 'Informe o valor total dos produtos em todos os itens.' } }
    }

    if (costs.discount < 0 || costs.totalCost < 0) {
      return { error: { message: 'Descontos/créditos não podem deixar o custo líquido da compra negativo.' } }
    }

    const { data: oldItems, error: oldItemsError } = await supabase
      .from('purchase_items')
      .select('id, product_id, quantity, received_quantity')
      .eq('purchase_id', purchase_id)

    if (oldItemsError) return { error: oldItemsError }

    const hasReceipt = (oldItems || []).some(
      item => normalizeQuantity(item.received_quantity) > 0
    )

    if (hasReceipt) {
      if (normalizedItems.length !== (oldItems || []).length) {
        return {
          error: {
            message: 'Depois do primeiro recebimento não é possível adicionar ou remover produtos da compra.',
          },
        }
      }

      const oldById = new Map((oldItems || []).map(item => [item.id, item]))

      for (const item of normalizedItems) {
        const old = oldById.get(item.id)

        if (
          !old
          || old.product_id !== item.product_id
          || normalizeQuantity(old.quantity) !== normalizeQuantity(item.quantity)
        ) {
          return {
            error: {
              message: 'Depois do primeiro recebimento não é possível alterar produto ou quantidade pedida.',
            },
          }
        }
      }
    }

    const { error: purchaseError } = await supabase
      .from('purchases')
      .update({
        supplier_id,
        supplier_name,
        total_cost: costs.totalCost,
        freight_cost: costs.freight,
        discount_credit: costs.discount,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        expected_delivery_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase_id)
      .eq('company_id', company_id)

    if (purchaseError) return { error: purchaseError }

    if (hasReceipt) {
      for (const item of normalizedItems) {
        const { error } = await supabase
          .from('purchase_items')
          .update({
            product_name: item.product_name,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            freight_allocated: item.freight_allocated,
            discount_allocated: item.discount_allocated,
            final_total_cost: item.final_total_cost,
            final_unit_cost: item.final_unit_cost,
          })
          .eq('id', item.id)
          .eq('purchase_id', purchase_id)

        if (error) return { error }
      }
    } else {
      const { error: deleteItemsError } = await supabase
        .from('purchase_items')
        .delete()
        .eq('purchase_id', purchase_id)

      if (deleteItemsError) return { error: deleteItemsError }

      const purchaseItems = normalizedItems.map(item => ({
        purchase_id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        received_quantity: 0,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        freight_allocated: item.freight_allocated,
        discount_allocated: item.discount_allocated,
        final_total_cost: item.final_total_cost,
        final_unit_cost: item.final_unit_cost,
        empty_returned: 0,
      }))

      const { error: itemsError } = await supabase
        .from('purchase_items')
        .insert(purchaseItems)

      if (itemsError) return { error: itemsError }
    }

    return { data: { id: purchase_id }, error: null }
  },

  /**
   * Confirma um recebimento físico (total ou parcial).
   * A função SQL executa histórico + estoque + status atomicamente.
   */
  async receivePurchase({
    purchase_id,
    company_id,
    received_at,
    items,
    received_by,
    notes,
  }) {
    const { data, error } = await supabase.rpc(
      'receive_purchase_delivery',
      {
        p_purchase_id: purchase_id,
        p_company_id: company_id,
        p_received_at: received_at || new Date().toISOString(),
        p_items: items || [],
        p_received_by: received_by,
        p_notes: notes || null,
      }
    )

    return { data, error }
  },

  /**
   * Exclui uma chegada de gás de forma segura.
   *
   * A exclusão é lógica: a chegada fica marcada como excluída e deixa de aparecer na tela.
   * O estoque é revertido com base nos itens da chegada:
   * - remove os cheios que tinham entrado;
   * - devolve os vazios que tinham sido baixados.
   */
  async deletePurchase({ purchase_id, company_id, performed_by, reason }) {
    if (!purchase_id) {
      return { error: { message: 'Chegada não informada.' } }
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, purchase_number, is_deleted')
      .eq('id', purchase_id)
      .eq('company_id', company_id)
      .single()

    if (purchaseError) return { error: purchaseError }

    if (purchase?.is_deleted) {
      return { error: { message: 'Essa chegada já está excluída.' } }
    }

    const { data: oldItems, error: itemsError } = await supabase
      .from('purchase_items')
      .select('product_id, received_quantity')
      .eq('purchase_id', purchase_id)

    if (itemsError) return { error: itemsError }

    const byProduct = new Map()
    for (const item of oldItems || []) {
      if (!item.product_id) continue
      const quantity = normalizeQuantity(item.received_quantity)
      if (quantity <= 0) continue
      byProduct.set(item.product_id, (byProduct.get(item.product_id) || 0) + quantity)
    }

    const now = new Date().toISOString()
    const finalReason = reason?.trim() || `Exclusão da chegada #${purchase?.purchase_number || ''}`

    const movements = [...byProduct.entries()].map(([product_id, quantity]) => ({
      company_id,
      product_id,
      type: 'adjustment',
      full_qty_change: -quantity,
      empty_qty_change: quantity,
      exchange_qty_change: 0,
      hub_pending_qty_change: 0,
      reference_id: purchase_id,
      reference_type: 'purchase_delete',
      reason: `${finalReason}. Reversão de estoque da chegada excluída.`,
      performed_by,
      created_at: now,
    }))

    if (movements.length) {
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert(movements)

      if (movementError) return { error: movementError }
    }

    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        is_deleted: true,
        deleted_at: now,
        deleted_by: performed_by,
        updated_at: now,
      })
      .eq('id', purchase_id)
      .eq('company_id', company_id)

    if (updateError) return { error: updateError }

    return { data: { id: purchase_id }, error: null }
  },

  /**
   * Ajuste manual de estoque.
   */
  async manualAdjustment({
    company_id,
    product_id,
    full_qty_change,
    empty_qty_change,
    exchange_qty_change,
    hub_pending_qty_change,
    reason,
    performed_by,
  }) {
    if (!reason?.trim()) {
      return { error: { message: 'O motivo do ajuste é obrigatório.' } }
    }

    const normalizedExchangeChange = normalizeQuantity(exchange_qty_change)
    const normalizedFullChange = normalizeQuantity(full_qty_change)

    // Regra operacional: sempre que um botijão entrar em troca, ele sai do saldo de cheios.
    // Isso evita ficar com 1 cheio a mais quando um botijão cheio é separado por vazamento/defeito.
    const finalFullChange = normalizedExchangeChange > 0 && normalizedFullChange === 0
      ? -normalizedExchangeChange
      : normalizedFullChange

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'adjustment',
      full_qty_change: finalFullChange,
      empty_qty_change: normalizeQuantity(empty_qty_change),
      exchange_qty_change: normalizedExchangeChange,
      hub_pending_qty_change: normalizeQuantity(hub_pending_qty_change),
      reason,
      performed_by,
    })
  },

  /**
   * Envia botijões cheios para troca com fornecedor.
   * Fluxo: cheios diminui, em troca aumenta.
   */
  async sendToExchange({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'exchange_out',
      full_qty_change: -qty,
      empty_qty_change: 0,
      exchange_qty_change: qty,
      hub_pending_qty_change: 0,
      reason: reason?.trim() || 'Envio de botijão cheio para troca',
      performed_by,
    })
  },

  /**
   * Recebe botijões cheios vindos da troca.
   * Fluxo: em troca diminui, cheios aumenta.
   */
  async receiveFromExchange({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'exchange_in',
      full_qty_change: qty,
      empty_qty_change: 0,
      exchange_qty_change: -qty,
      hub_pending_qty_change: 0,
      reason: reason?.trim() || 'Recebimento de cheios da troca',
      performed_by,
    })
  },



  /**
   * Baixa botijões pendentes do Vale Hub / Ultragaz após retorno no portal.
   * Fluxo: HUB a retornar diminui. O saldo de vazios NÃO é alterado.
   */
  async returnHub({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'hub_return',
      full_qty_change: 0,
      empty_qty_change: 0,
      exchange_qty_change: 0,
      hub_pending_qty_change: -qty,
      reason: reason?.trim() || 'Retorno realizado no portal HUB / Ultragaz',
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
