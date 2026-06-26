import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  Building2, ShieldCheck, Users, Package, CreditCard, History,
  Save, SlidersHorizontal, AlertTriangle, CheckCircle2, ClipboardCheck, Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PageHeader, PageLoader, Alert } from '../components/ui'
import { parseCurrency, maskCurrency, maskCpfCnpj, formatDateTime } from '../utils/format'
import { ROLE_OPTIONS, ROLE_DESCRIPTIONS } from '../utils/permissions'

const DEFAULT_EXTRA = {
  full_no_return_initial_qty: 69,
  require_cancel_sale_reason: true,
  require_stock_adjustment_reason: true,
  require_purchase_delete_reason: true,
  block_sale_edit_after_days: 3,
  retroactive_sales_admin_only: false,
  arrival_subtracts_empty: true,
  exchange_out_subtracts_full: true,
  allow_negative_stock: false,
  daily_sales_review: {
    enabled: true,
    time: '19:20',
    repeat_enabled: true,
    repeat_interval_minutes: 15,
    days: [1, 2, 3, 4, 5, 6],
    roles: ['admin', 'manager', 'operator'],
    message: 'Antes de encerrar, confira se todas as vendas de hoje foram lançadas corretamente.',
  },
}

function roleBadgeClass(role) {
  const map = {
    admin: 'badge-red',
    manager: 'badge-purple',
    operator: 'badge-blue',
    viewer: 'badge-gray',
  }
  return map[role] || 'badge-gray'
}

function boolFromExtra(value, fallback = true) {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

const REVIEW_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gerente' },
  { value: 'operator', label: 'Operador' },
]

export default function SettingsPage() {
  const { user, profile } = useAuth()
  const companyId = profile?.company_id
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingUserId, setSavingUserId] = useState(null)

  const [companyName, setCompanyName] = useState('')
  const [companyCnpj, setCompanyCnpj] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')

  const [settingsId, setSettingsId] = useState(null)
  const [gasPovoFee, setGasPovoFee] = useState('20,00')
  const [lowStockQty, setLowStockQty] = useState(35)
  const [fullNoReturnInitialQty, setFullNoReturnInitialQty] = useState(69)
  const [settingsExtra, setSettingsExtra] = useState(DEFAULT_EXTRA)

  const [users, setUsers] = useState([])
  const [products, setProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [cardMachines, setCardMachines] = useState([])
  const [auditLogs, setAuditLogs] = useState([])

  useEffect(() => {
    if (companyId) loadSettings()
  }, [companyId])

  function updateExtra(key, value) {
    setSettingsExtra(prev => ({ ...(prev || {}), [key]: value }))
  }

  function updateReviewConfig(key, value) {
    setSettingsExtra(prev => {
      const current = { ...(DEFAULT_EXTRA.daily_sales_review || {}), ...((prev || {}).daily_sales_review || {}) }
      return {
        ...(prev || {}),
        daily_sales_review: { ...current, [key]: value },
      }
    })
  }

  function toggleReviewArrayValue(key, value) {
    const current = { ...(DEFAULT_EXTRA.daily_sales_review || {}), ...((settingsExtra || {}).daily_sales_review || {}) }
    const values = Array.isArray(current[key]) ? current[key] : []
    const normalized = key === 'days' ? Number(value) : value
    const next = values.includes(normalized)
      ? values.filter(item => item !== normalized)
      : [...values, normalized]
    updateReviewConfig(key, next)
  }

  async function loadSettings() {
    setLoading(true)
    try {
      const [compRes, settRes, usersRes, productsRes, methodsRes, machinesRes, logsRes] = await Promise.all([
        supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
        supabase.from('settings').select('*').eq('company_id', companyId).maybeSingle(),
        supabase.from('profiles').select('id, full_name, email, role, is_active, created_at, updated_at').eq('company_id', companyId).order('full_name', { ascending: true }),
        supabase.from('products').select('id, name, code, min_stock, is_active').eq('company_id', companyId).order('code', { ascending: true }),
        supabase.from('payment_methods').select('id, name, type, delivery_fee, has_delivery_fee, requires_machine, is_active').eq('company_id', companyId).order('name', { ascending: true }),
        supabase.from('card_machines').select('id, name, provider, color, is_active').eq('company_id', companyId).order('name', { ascending: true }),
        supabase.from('audit_logs').select('id, action, table_name, record_id, old_data, new_data, created_at, user_id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(12),
      ])

      if (compRes.error) throw compRes.error
      if (settRes.error) throw settRes.error

      const c = compRes.data || {}
      setCompanyName(c.name || '')
      setCompanyCnpj(c.cnpj || '')
      setCompanyAddress(c.address || '')
      setCompanyPhone(c.phone || '')
      setCompanyEmail(c.email || '')

      if (settRes.data) {
        const s = settRes.data
        const extra = { ...DEFAULT_EXTRA, ...(s.extra || {}) }
        setSettingsId(s.id)
        setGasPovoFee(Number(s.gas_povo_delivery_fee || 20).toFixed(2).replace('.', ','))
        setLowStockQty(Number(s.low_stock_alert_qty ?? 35))
        setSettingsExtra(extra)
        setFullNoReturnInitialQty(Number(extra.full_no_return_initial_qty ?? 69))
      } else {
        setSettingsId(null)
        setSettingsExtra(DEFAULT_EXTRA)
      }

      setUsers(usersRes.data || [])
      setProducts(productsRes.data || [])
      setPaymentMethods(methodsRes.data || [])
      setCardMachines(machinesRes.data || [])
      setAuditLogs(logsRes.data || [])
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  async function createAuditLog(action, tableName, recordId, oldData, newData) {
    if (!companyId) return
    await supabase.from('audit_logs').insert({
      company_id: companyId,
      user_id: user?.id || profile?.id,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData || null,
      new_data: newData || null,
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!companyId) return

    setSubmitting(true)

    const cleanExtra = {
      ...(settingsExtra || {}),
      full_no_return_initial_qty: Number(fullNoReturnInitialQty || 0),
      block_sale_edit_after_days: Number(settingsExtra?.block_sale_edit_after_days || 0),
    }

    try {
      const companyPayload = {
        name: companyName.trim(),
        cnpj: companyCnpj,
        address: companyAddress,
        phone: companyPhone,
        email: companyEmail,
      }

      const settingsPayload = {
        company_id: companyId,
        gas_povo_delivery_fee: parseCurrency(gasPovoFee),
        low_stock_alert_qty: Number(lowStockQty || 0),
        extra: cleanExtra,
      }

      const companyRes = await supabase
        .from('companies')
        .update(companyPayload)
        .eq('id', companyId)
        .select()
        .maybeSingle()

      if (companyRes.error) throw companyRes.error

      let settingsRes
      if (settingsId) {
        settingsRes = await supabase
          .from('settings')
          .update(settingsPayload)
          .eq('id', settingsId)
          .select()
          .single()
      } else {
        settingsRes = await supabase
          .from('settings')
          .insert(settingsPayload)
          .select()
          .single()
      }
      if (settingsRes.error) throw settingsRes.error
      setSettingsId(settingsRes.data?.id || settingsId)

      const productUpdates = products.map(p =>
        supabase.from('products').update({
          min_stock: Number(p.min_stock || 0),
          is_active: Boolean(p.is_active),
        }).eq('id', p.id)
      )

      const methodUpdates = paymentMethods.map(m =>
        supabase.from('payment_methods').update({
          is_active: Boolean(m.is_active),
          delivery_fee: Number(m.delivery_fee || 0),
          has_delivery_fee: Boolean(m.has_delivery_fee),
        }).eq('id', m.id)
      )

      const machineUpdates = cardMachines.map(m =>
        supabase.from('card_machines').update({ is_active: Boolean(m.is_active) }).eq('id', m.id)
      )

      const updateResults = await Promise.all([...productUpdates, ...methodUpdates, ...machineUpdates])
      const updateError = updateResults.find(r => r.error)?.error
      if (updateError) throw updateError

      await createAuditLog('settings.update', 'settings', settingsRes.data?.id, null, {
        company: companyPayload,
        settings: settingsPayload,
        products: products.map(({ id, name, min_stock, is_active }) => ({ id, name, min_stock, is_active })),
        payment_methods: paymentMethods.map(({ id, name, delivery_fee, has_delivery_fee, is_active }) => ({ id, name, delivery_fee, has_delivery_fee, is_active })),
        card_machines: cardMachines.map(({ id, name, is_active }) => ({ id, name, is_active })),
      })

      toast.success('Configurações salvas com sucesso')
      await loadSettings()
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao salvar configurações')
    } finally {
      setSubmitting(false)
    }
  }

  async function updateUser(userRecord, patch) {
    if (!userRecord?.id) return
    setSavingUserId(userRecord.id)
    try {
      const oldData = { role: userRecord.role, is_active: userRecord.is_active }
      const newData = { ...oldData, ...patch }
      const { error } = await supabase
        .from('profiles')
        .update(newData)
        .eq('id', userRecord.id)

      if (error) throw error
      await createAuditLog('profile.permission_update', 'profiles', userRecord.id, oldData, newData)
      toast.success('Usuário atualizado')
      await loadSettings()
    } catch (error) {
      console.error(error)
      toast.error(error?.message || 'Erro ao atualizar usuário')
    } finally {
      setSavingUserId(null)
    }
  }

  function updateProduct(id, patch) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function updatePaymentMethod(id, patch) {
    setPaymentMethods(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function updateMachine(id, patch) {
    setCardMachines(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  if (loading) return <PageLoader />

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Configurações" subtitle="Dados da empresa, usuários, permissões e regras operacionais" />

      {!isAdmin && (
        <Alert
          type="warning"
          title="Acesso restrito"
          message="Apenas administradores podem alterar configurações e permissões."
        />
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Dados da Empresa</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="form-group sm:col-span-2">
              <label className="label">Nome da empresa *</label>
              <input className="input" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">CNPJ</label>
              <input className="input" value={companyCnpj} onChange={e => setCompanyCnpj(maskCpfCnpj(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="label">Telefone</label>
              <input className="input" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">E-mail</label>
              <input type="email" className="input" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
            </div>
            <div className="form-group sm:col-span-2">
              <label className="label">Endereço</label>
              <input className="input" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Usuários e Permissões</h3>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {ROLE_OPTIONS.map(role => (
              <div key={role.value} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className={roleBadgeClass(role.value)}>{role.label}</span>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{ROLE_DESCRIPTIONS[role.value]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-3">Usuário</th>
                  <th className="text-left px-3 py-3">Perfil</th>
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="text-left px-3 py-3">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const isSelf = u.id === user?.id
                  return (
                    <tr key={u.id}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-800">{u.full_name || 'Sem nome'}</p>
                        <p className="text-xs text-slate-500">{u.email || 'Sem e-mail'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className="input min-w-[140px]"
                          value={u.role || 'operator'}
                          disabled={!isAdmin || isSelf || savingUserId === u.id}
                          onChange={e => updateUser(u, { role: e.target.value })}
                        >
                          {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        {isSelf && <p className="text-[11px] text-slate-400 mt-1">Seu próprio perfil não pode ser alterado aqui.</p>}
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={u.is_active !== false}
                            disabled={!isAdmin || isSelf || savingUserId === u.id}
                            onChange={e => updateUser(u, { is_active: e.target.checked })}
                          />
                          {u.is_active !== false ? 'Ativo' : 'Inativo'}
                        </label>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{formatDateTime(u.created_at)}</td>
                    </tr>
                  )
                })}
                {!users.length && (
                  <tr><td colSpan="4" className="px-3 py-6 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Configurações Operacionais</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="form-group">
              <label className="label">Taxa de entrega — Gás do Povo (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input type="text" inputMode="numeric" className="input pl-8"
                  value={gasPovoFee}
                  onChange={e => setGasPovoFee(maskCurrency(e.target.value.replace(/\D/g,'')))}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Alerta geral de estoque baixo</label>
              <input type="number" min="0" className="input"
                value={lowStockQty}
                onChange={e => setLowStockQty(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Histórico inicial — cheios sem retorno</label>
              <input type="number" min="0" className="input"
                value={fullNoReturnInitialQty}
                onChange={e => setFullNoReturnInitialQty(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Bloquear edição de venda após X dias</label>
              <input type="number" min="0" className="input"
                value={settingsExtra.block_sale_edit_after_days ?? 0}
                onChange={e => updateExtra('block_sale_edit_after_days', Number(e.target.value || 0))}
              />
              <p className="text-xs text-slate-500 mt-1">0 deixa sem limite automático.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {[
              ['require_cancel_sale_reason', 'Exigir motivo ao cancelar venda'],
              ['require_stock_adjustment_reason', 'Exigir motivo ao ajustar estoque'],
              ['require_purchase_delete_reason', 'Exigir motivo ao excluir chegada'],
              ['retroactive_sales_admin_only', 'Venda retroativa somente Admin'],
              ['arrival_subtracts_empty', 'Chegada baixa vazios automaticamente'],
              ['exchange_out_subtracts_full', 'Troca baixa dos cheios'],
              ['allow_negative_stock', 'Permitir estoque negativo'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                <span className="text-sm text-slate-700">{label}</span>
                <input
                  type="checkbox"
                  checked={boolFromExtra(settingsExtra[key], key !== 'retroactive_sales_admin_only' && key !== 'allow_negative_stock')}
                  onChange={e => updateExtra(key, e.target.checked)}
                />
              </label>
            ))}
          </div>


          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-brand-600" />
              <div>
                <h4 className="font-display font-semibold text-slate-800">Conferência de Vendas</h4>
                <p className="text-xs text-slate-500">Configure o aviso leve para revisar as vendas do dia, sem virar fechamento de caixa.</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-3 py-2.5">
                <span className="text-sm text-slate-700">Ativar aviso automático</span>
                <input
                  type="checkbox"
                  checked={boolFromExtra(settingsExtra.daily_sales_review?.enabled, true)}
                  onChange={e => updateReviewConfig('enabled', e.target.checked)}
                />
              </label>
              <div className="form-group">
                <label className="label"><Clock className="w-3.5 h-3.5 inline mr-1" /> Horário do aviso</label>
                <input
                  type="time"
                  className="input bg-white"
                  value={settingsExtra.daily_sales_review?.time || '19:20'}
                  onChange={e => updateReviewConfig('time', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Repetir a cada X minutos</label>
                <input
                  type="number"
                  min="5"
                  className="input bg-white"
                  value={settingsExtra.daily_sales_review?.repeat_interval_minutes ?? 15}
                  onChange={e => updateReviewConfig('repeat_interval_minutes', Number(e.target.value || 15))}
                />
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-3 py-2.5">
              <span className="text-sm text-slate-700">Repetir aviso se o dia ainda não foi conferido</span>
              <input
                type="checkbox"
                checked={boolFromExtra(settingsExtra.daily_sales_review?.repeat_enabled, true)}
                onChange={e => updateReviewConfig('repeat_enabled', e.target.checked)}
              />
            </label>

            <div className="space-y-2">
              <p className="label">Dias de conferência</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(day => {
                  const active = (settingsExtra.daily_sales_review?.days || DEFAULT_EXTRA.daily_sales_review.days).includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={active ? 'btn-primary btn-sm' : 'btn-outline btn-sm bg-white'}
                      onClick={() => toggleReviewArrayValue('days', day.value)}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="label">Exibir aviso para</p>
              <div className="flex flex-wrap gap-2">
                {REVIEW_ROLE_OPTIONS.map(role => {
                  const active = (settingsExtra.daily_sales_review?.roles || DEFAULT_EXTRA.daily_sales_review.roles).includes(role.value)
                  return (
                    <button
                      key={role.value}
                      type="button"
                      className={active ? 'btn-primary btn-sm' : 'btn-outline btn-sm bg-white'}
                      onClick={() => toggleReviewArrayValue('roles', role.value)}
                    >
                      {role.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Mensagem do aviso</label>
              <textarea
                className="input min-h-[80px] bg-white"
                value={settingsExtra.daily_sales_review?.message || DEFAULT_EXTRA.daily_sales_review.message}
                onChange={e => updateReviewConfig('message', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6">
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-brand-600" />
              <h3 className="font-display font-semibold text-slate-800 text-base">Estoque por Produto</h3>
            </div>
            <div className="space-y-3">
              {products.map(product => (
                <div key={product.id} className="grid grid-cols-[1fr_100px_80px] items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.code || 'Sem código'}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={product.min_stock ?? 0}
                    onChange={e => updateProduct(product.id, { min_stock: e.target.value })}
                    aria-label={`Estoque mínimo de ${product.name}`}
                  />
                  <label className="text-xs text-slate-600 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={product.is_active !== false}
                      onChange={e => updateProduct(product.id, { is_active: e.target.checked })}
                    />
                    Ativo
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand-600" />
              <h3 className="font-display font-semibold text-slate-800 text-base">Financeiro e Pagamentos</h3>
            </div>
            <div className="space-y-3">
              {paymentMethods.map(method => (
                <div key={method.id} className="rounded-xl border border-slate-100 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800">{method.name}</p>
                      <p className="text-xs text-slate-500">{method.requires_machine ? 'Usa maquininha' : 'Sem maquininha'}</p>
                    </div>
                    <label className="text-xs text-slate-600 flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={method.is_active !== false}
                        onChange={e => updatePaymentMethod(method.id, { is_active: e.target.checked })}
                      />
                      Ativa
                    </label>
                  </div>
                  <div className="grid grid-cols-[1fr_120px] gap-2 items-end">
                    <label className="text-xs text-slate-600 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(method.has_delivery_fee)}
                        onChange={e => updatePaymentMethod(method.id, { has_delivery_fee: e.target.checked })}
                      />
                      Tem taxa de entrega
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input"
                      value={method.delivery_fee ?? 0}
                      onChange={e => updatePaymentMethod(method.id, { delivery_fee: e.target.value })}
                      aria-label={`Taxa de entrega de ${method.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-700">Maquininhas</h4>
              {cardMachines.map(machine => (
                <label key={machine.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <span>
                    <span className="text-sm font-medium text-slate-700">{machine.name}</span>
                    <span className="text-xs text-slate-400 block">{machine.provider || machine.color || 'Sem provedor'}</span>
                  </span>
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={machine.is_active !== false}
                      onChange={e => updateMachine(machine.id, { is_active: e.target.checked })}
                    />
                    Ativa
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Segurança Operacional</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-success-100 bg-success-50 p-3">
              <CheckCircle2 className="w-5 h-5 text-success-600 mb-2" />
              <p className="font-medium text-success-800 text-sm">Perfis de acesso</p>
              <p className="text-xs text-success-700 mt-1">Menu e rotas seguem o perfil do usuário.</p>
            </div>
            <div className="rounded-xl border border-warning-100 bg-warning-50 p-3">
              <AlertTriangle className="w-5 h-5 text-warning-600 mb-2" />
              <p className="font-medium text-warning-800 text-sm">Ações críticas</p>
              <p className="text-xs text-warning-700 mt-1">Cancelamentos, estoque e chegadas podem exigir motivo.</p>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
              <History className="w-5 h-5 text-brand-600 mb-2" />
              <p className="font-medium text-brand-800 text-sm">Auditoria</p>
              <p className="text-xs text-brand-700 mt-1">Alterações desta tela são registradas no histórico.</p>
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-brand-600" />
            <h3 className="font-display font-semibold text-slate-800 text-base">Histórico de Alterações Críticas</h3>
          </div>
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-3 py-3">Data</th>
                  <th className="text-left px-3 py-3">Ação</th>
                  <th className="text-left px-3 py-3">Tabela</th>
                  <th className="text-left px-3 py-3">Resumo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{log.action}</td>
                    <td className="px-3 py-3 text-slate-500">{log.table_name || '—'}</td>
                    <td className="px-3 py-3 text-slate-500 max-w-lg truncate" title={JSON.stringify(log.new_data || {})}>
                      {log.new_data ? JSON.stringify(log.new_data).slice(0, 120) : '—'}
                    </td>
                  </tr>
                ))}
                {!auditLogs.length && (
                  <tr><td colSpan="4" className="px-3 py-6 text-center text-slate-500">Nenhuma alteração crítica registrada ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" className="btn-primary btn-lg shadow-lg" disabled={submitting || !isAdmin}>
            <Save className="w-4 h-4" />
            {submitting ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  )
}
