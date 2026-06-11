import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PageHeader, PageLoader } from '../components/ui'
import { parseCurrency, maskCurrency, maskCpfCnpj } from '../utils/format'

export default function SettingsPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Empresa
  const [companyName, setCompanyName] = useState('')
  const [companyCnpj, setCompanyCnpj] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')

  // Configurações operacionais
  const [gasPovoFee, setGasPovoFee] = useState('20,00')
  const [lowStockQty, setLowStockQty] = useState(5)
  const [fullNoReturnInitialQty, setFullNoReturnInitialQty] = useState(69)
  const [settingsExtra, setSettingsExtra] = useState({})

  useEffect(() => {
    if (companyId) loadSettings()
  }, [companyId])

  async function loadSettings() {
    const [compRes, settRes] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).single(),
      supabase.from('settings').select('*').eq('company_id', companyId).single(),
    ])
    if (compRes.data) {
      const c = compRes.data
      setCompanyName(c.name || '')
      setCompanyCnpj(c.cnpj || '')
      setCompanyAddress(c.address || '')
      setCompanyPhone(c.phone || '')
      setCompanyEmail(c.email || '')
    }
    if (settRes.data) {
      const s = settRes.data
      setGasPovoFee(Number(s.gas_povo_delivery_fee || 20).toFixed(2).replace('.', ','))
      setLowStockQty(s.low_stock_alert_qty || 5)
      setSettingsExtra(s.extra || {})
      setFullNoReturnInitialQty(Number(s.extra?.full_no_return_initial_qty ?? 69))
    }
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSubmitting(true)
    const [r1, r2] = await Promise.all([
      supabase.from('companies').update({
        name: companyName, cnpj: companyCnpj,
        address: companyAddress, phone: companyPhone, email: companyEmail,
      }).eq('id', companyId),
      supabase.from('settings').upsert({
        company_id: companyId,
        gas_povo_delivery_fee: parseCurrency(gasPovoFee),
        low_stock_alert_qty: Number(lowStockQty),
        extra: {
          ...(settingsExtra || {}),
          full_no_return_initial_qty: Number(fullNoReturnInitialQty || 0),
        },
      }),
    ])
    setSubmitting(false)
    if (r1.error || r2.error) { toast.error('Erro ao salvar configurações'); return }
    toast.success('Configurações salvas!')
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Configurações" subtitle="Dados da empresa e configurações operacionais" />

      <form onSubmit={handleSave} className="space-y-5">
        {/* Dados da empresa */}
        <div className="card space-y-4">
          <h3 className="font-display font-semibold text-slate-800 text-base">Dados da Empresa</h3>
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
        </div>

        {/* Configurações operacionais */}
        <div className="card space-y-4">
          <h3 className="font-display font-semibold text-slate-800 text-base">Configurações Operacionais</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label className="label">Taxa de entrega — Gás do Povo (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input type="text" inputMode="numeric" className="input pl-8"
                  value={gasPovoFee}
                  onChange={e => setGasPovoFee(maskCurrency(e.target.value.replace(/\D/g,'')))}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Adicionado automaticamente em vendas pelo Gás do Povo.</p>
            </div>
            <div className="form-group">
              <label className="label">Alerta de estoque baixo (unidades)</label>
              <input type="number" min="0" className="input"
                value={lowStockQty}
                onChange={e => setLowStockQty(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">Alerta quando estoque cheio for menor que este valor.</p>
            </div>
            <div className="form-group sm:col-span-2">
              <label className="label">Histórico inicial — cheios sem retorno</label>
              <input type="number" min="0" className="input"
                value={fullNoReturnInitialQty}
                onChange={e => setFullNoReturnInitialQty(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Use para registrar vendas antigas de botijão cheio sem retorno feitas antes do controle por tipo de venda. Valor atual sugerido: 69.
              </p>
            </div>
          </div>
        </div>

        {/* Módulos futuros */}
        <div className="card border-dashed border-slate-300 bg-slate-50">
          <h3 className="font-display font-semibold text-slate-600 text-sm mb-1">Módulos Futuros</h3>
          <p className="text-xs text-slate-500">
            Emissão de Nota Fiscal, integração com Ultragaz, app do motorista e gestão multi-filial estão planejados para as próximas versões.
          </p>
        </div>

        <button type="submit" className="btn-primary btn-lg" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </form>
    </div>
  )
}
