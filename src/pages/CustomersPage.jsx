import { useState } from 'react'
import { Plus, Search, Users, Trash2, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { maskCpfCnpj, maskPhone, CUSTOMER_TYPES } from '../utils/format'

const DEFAULT_PRODUCTS = [
  { value: '', label: 'Não definido' },
  { value: 'P45', label: 'P45' },
  { value: 'P13', label: 'P13' },
  { value: 'P13,P45', label: 'P13 e P45' },
]

// Tipos que usam código MG e boleto
const INSTITUTIONAL_TYPES = ['daycare', 'company']

export default function CustomersPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const { data: customers, loading, refetch } = useSupabaseQuery(
    () => supabase.from('customers').select('*').eq('company_id', companyId).order('code', { ascending: true, nullsFirst: false }).order('name'),
    [companyId]
  )

  if (loading) return <PageLoader />

  const list = customers || []

  // Próximo código incremental
  const nextCode = (() => {
    const codes = list
      .map(c => c.code)
      .filter(Boolean)
      .map(c => parseInt(c.replace('MG', '')))
      .filter(n => !isNaN(n))
    const max = codes.length ? Math.max(...codes) : 0
    return `MG${String(max + 1).padStart(2, '0')}`
  })()

  const filtered = list.filter(c => {
    const matchType = filterType === 'all' || c.type === filterType
    const matchSearch =
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.code?.toLowerCase().includes(search.toLowerCase()) ||
      c.cpf_cnpj?.includes(search)
    return matchType && matchSearch
  })

  async function deleteCustomer(c) {
    if (!confirm(`Excluir cliente "${c.name}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    toast.success('Cliente excluído!')
    refetch()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        subtitle={`${list.length} clientes cadastrados`}
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Novo Cliente
          </button>
        }
      />

      {/* Busca e Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, código MG, telefone ou CNPJ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'company', label: 'Empresas' },
            { key: 'daycare', label: 'Creches' },
            { key: 'individual', label: 'Pessoa Física' },
            { key: 'fixed', label: 'Fixos' },
            { key: 'occasional', label: 'Avulsos' },
          ].map(f => (
            <button
              key={f.key}
              className={filterType === f.key ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}
              onClick={() => setFilterType(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente encontrado"
          action={<button className="btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true) }}><Plus className="w-3.5 h-3.5" /> Cadastrar</button>}
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Cód.</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Produto Padrão</th>
                <th>Telefone</th>
                <th>CNPJ/CPF</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="font-mono text-xs font-bold text-brand-600">
                    {c.code || '—'}
                  </td>
                  <td>
                    <div>
                      <p className="font-medium text-slate-800">{c.name}</p>
                      {c.responsible_name && <p className="text-xs text-slate-500">{c.responsible_name}</p>}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-blue">{CUSTOMER_TYPES[c.type] || c.type}</span>
                  </td>
                  <td className="text-sm font-medium">
                    {c.default_product || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="text-sm">{c.phone || '—'}</td>
                  <td className="text-sm font-mono">{c.cpf_cnpj || '—'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn-outline btn-sm" onClick={() => setViewing(c)}><Eye className="w-3.5 h-3.5" /></button>
                      <button className="btn-outline btn-sm" onClick={() => { setEditing(c); setShowModal(true) }}>Editar</button>
                      <button className="btn-danger btn-sm" onClick={() => deleteCustomer(c)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerViewModal
        customer={viewing}
        onClose={() => setViewing(null)}
        onEdit={c => { setViewing(null); setEditing(c); setShowModal(true) }}
      />

      <CustomerModal
        key={editing?.id || 'new'}
        open={showModal}
        editing={editing}
        companyId={companyId}
        nextCode={nextCode}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSuccess={() => { setShowModal(false); setEditing(null); refetch() }}
      />
    </div>
  )
}

function CustomerModal({ open, editing, companyId, nextCode, onClose, onSuccess }) {
  const isInstitutional = (t) => INSTITUTIONAL_TYPES.includes(t)

  const [name, setName] = useState(editing?.name || '')
  const [type, setType] = useState(editing?.type || 'individual')
  const [code, setCode] = useState(editing?.code || '')
  const [cpfCnpj, setCpfCnpj] = useState(editing?.cpf_cnpj || '')
  const [phone, setPhone] = useState(editing?.phone || '')
  const [email, setEmail] = useState(editing?.email || '')
  const [address, setAddress] = useState(editing?.address || '')
  const [responsible, setResponsible] = useState(editing?.responsible_name || '')
  const [defaultProduct, setDefaultProduct] = useState(editing?.default_product || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [submitting, setSubmitting] = useState(false)

  // Quando tipo muda para institucional e não tem código, sugere próximo
  function handleTypeChange(t) {
    setType(t)
    if (isInstitutional(t) && !code && !editing) {
      setCode(nextCode)
    }
    if (!isInstitutional(t)) {
      setCode('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      company_id: companyId,
      name, type,
      code: isInstitutional(type) ? code : null,
      cpf_cnpj: cpfCnpj,
      phone, email, address,
      responsible_name: responsible,
      default_product: defaultProduct || null,
      notes,
    }
    const { error } = editing
      ? await supabase.from('customers').update(payload).eq('id', editing.id)
      : await supabase.from('customers').insert(payload)
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Cliente atualizado!' : 'Cliente cadastrado!')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Cliente' : 'Novo Cliente'} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">

          {/* Tipo — primeiro para auto-preencher código */}
          <div className="form-group">
            <label className="label">Tipo *</label>
            <select className="input" value={type} onChange={e => handleTypeChange(e.target.value)}>
              {Object.entries(CUSTOMER_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Código MG — só para institucionais */}
          {isInstitutional(type) ? (
            <div className="form-group">
              <label className="label">Código (boleto)</label>
              <input
                className="input font-mono"
                placeholder={nextCode}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-slate-400 mt-1">Próximo disponível: {nextCode}</p>
            </div>
          ) : (
            <div className="form-group">
              <label className="label">Produto Padrão</label>
              <select className="input" value={defaultProduct} onChange={e => setDefaultProduct(e.target.value)}>
                {DEFAULT_PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}

          <div className="form-group sm:col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          {/* Produto padrão para institucionais */}
          {isInstitutional(type) && (
            <div className="form-group">
              <label className="label">Produto Padrão</label>
              <select className="input" value={defaultProduct} onChange={e => setDefaultProduct(e.target.value)}>
                {DEFAULT_PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="label">CNPJ / CPF</label>
            <input className="input" value={cpfCnpj}
              onChange={e => setCpfCnpj(maskCpfCnpj(e.target.value))} placeholder="00.000.000/0001-00" />
          </div>

          <div className="form-group">
            <label className="label">Telefone</label>
            <input className="input" value={phone}
              onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
          </div>

          <div className="form-group">
            <label className="label">E-mail</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Endereço</label>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Responsável</label>
            <input className="input" value={responsible} onChange={e => setResponsible(e.target.value)} />
          </div>

          <div className="form-group sm:col-span-2">
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CustomerViewModal({ customer: c, onClose, onEdit }) {
  if (!c) return null
  const Row = ({ label, value }) => value ? (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  ) : null

  return (
    <Modal open={!!c} onClose={onClose} title="Detalhes do Cliente" maxWidth="max-w-md">
      <div className="space-y-0">
        {c.code && (
          <div className="flex items-center gap-2 mb-4 bg-brand-50 rounded-xl px-4 py-2.5">
            <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Código Boleto</span>
            <span className="ml-auto font-mono font-bold text-brand-700 text-lg">{c.code}</span>
          </div>
        )}
        <Row label="Nome" value={c.name} />
        <Row label="Tipo" value={CUSTOMER_TYPES[c.type]} />
        <Row label="Produto Padrão" value={c.default_product} />
        <Row label="CNPJ / CPF" value={c.cpf_cnpj} />
        <Row label="Telefone" value={c.phone} />
        <Row label="E-mail" value={c.email} />
        <Row label="Endereço" value={c.address} />
        <Row label="Responsável" value={c.responsible_name} />
        <Row label="Observações" value={c.notes} />
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-slate-100">
        <button className="btn-secondary" onClick={onClose}>Fechar</button>
        <button className="btn-primary" onClick={() => onEdit(c)}>Editar</button>
      </div>
    </Modal>
  )
}
