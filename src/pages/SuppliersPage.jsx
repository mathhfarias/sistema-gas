// ── FORNECEDORES ──────────────────────────────────────────────
import { useState } from 'react'
import { Plus, Building2, Trash2, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { maskCpfCnpj, maskPhone } from '../utils/format'

export default function SuppliersPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)

  const { data: suppliers, loading, refetch } = useSupabaseQuery(
    () => supabase.from('suppliers').select('*').eq('company_id', companyId).order('name'),
    [companyId]
  )

  if (loading) return <PageLoader />

  async function deleteSupplier(s) {
    if (!confirm(`Excluir fornecedor "${s.name}"?`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Fornecedor excluído!')
    refetch()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fornecedores"
        subtitle="Gestão de fornecedores de gás"
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Novo Fornecedor
          </button>
        }
      />
      {!(suppliers || []).length ? (
        <EmptyState icon={Building2} title="Nenhum fornecedor cadastrado"
          action={<button className="btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus className="w-3.5 h-3.5" />Cadastrar</button>}
        />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>Contato</th><th></th></tr>
            </thead>
            <tbody>
              {(suppliers || []).map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="font-mono text-xs">{s.cnpj || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.contact_name || '—'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn-outline btn-sm" onClick={() => setViewing(s)} aria-label={`Visualizar fornecedor ${s.name || ''}`}><Eye className="w-3.5 h-3.5" /></button>
                      <button className="btn-outline btn-sm" onClick={() => { setEditing(s); setShowModal(true) }}>Editar</button>
                      <button className="btn-danger btn-sm" onClick={() => deleteSupplier(s)} aria-label={`Excluir fornecedor ${s.name || ''}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SupplierViewModal
        supplier={viewing}
        onClose={() => setViewing(null)}
        onEdit={s => { setViewing(null); setEditing(s); setShowModal(true) }}
      />

      <SupplierModal
        key={editing?.id || 'new'}
        open={showModal} editing={editing} companyId={companyId}
        onClose={() => { setShowModal(false); setEditing(null) }}
        onSuccess={() => { setShowModal(false); setEditing(null); refetch(); toast.success('Fornecedor salvo!') }}
      />
    </div>
  )
}

function SupplierModal({ open, editing, companyId, onClose, onSuccess }) {
  const [name, setName] = useState(editing?.name || '')
  const [cnpj, setCnpj] = useState(editing?.cnpj || '')
  const [phone, setPhone] = useState(editing?.phone || '')
  const [email, setEmail] = useState(editing?.email || '')
  const [address, setAddress] = useState(editing?.address || '')
  const [contact, setContact] = useState(editing?.contact_name || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const payload = { company_id: companyId, name, cnpj, phone, email, address, contact_name: contact, notes }
    const { error } = editing
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload)
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group sm:col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="label">CNPJ</label>
            <input className="input" value={cnpj} onChange={e => setCnpj(maskCpfCnpj(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="label">Telefone</label>
            <input className="input" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="label">E-mail</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Contato</label>
            <input className="input" value={contact} onChange={e => setContact(e.target.value)} />
          </div>
          <div className="form-group sm:col-span-2">
            <label className="label">Endereço</label>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="form-group sm:col-span-2">
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SupplierViewModal({ supplier: s, onClose, onEdit }) {
  if (!s) return null
  const Row = ({ label, value }) => value ? (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  ) : null

  return (
    <Modal open={!!s} onClose={onClose} title="Detalhes do Fornecedor" maxWidth="max-w-md">
      <div className="space-y-0">
        <Row label="Nome" value={s.name} />
        <Row label="CNPJ" value={s.cnpj} />
        <Row label="Telefone" value={s.phone} />
        <Row label="E-mail" value={s.email} />
        <Row label="Contato" value={s.contact_name} />
        <Row label="Endereço" value={s.address} />
        <Row label="Observações" value={s.notes} />
      </div>
      <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-slate-100">
        <button className="btn-secondary" onClick={onClose}>Fechar</button>
        <button className="btn-primary" onClick={() => onEdit(s)}>Editar</button>
      </div>
    </Modal>
  )
}
