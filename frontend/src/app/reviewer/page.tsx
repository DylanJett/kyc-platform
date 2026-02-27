'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { listApplications, getApplication, reviewApplication } from '@/lib/api'

const STATUS: Record<string, { label: string, color: string }> = {
  draft:           { label: 'Draft',                   color: '#6b7280' },
  pending:         { label: 'Under review',             color: '#d97706' },
  approved:        { label: 'Approved',                 color: '#16a34a' },
  rejected:        { label: 'Rejected',                 color: '#dc2626' },
  needs_more_docs: { label: 'More documents needed',    color: '#7c3aed' },
}

export default function ReviewerPage() {
  const router = useRouter()
  const [apps, setApps] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    loadApps()
  }, [filter])

  const loadApps = async () => {
    setLoading(true)
    const data = await listApplications(filter || undefined)
    setApps(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  const openApp = async (id: string) => {
    const data = await getApplication(id)
    setSelected(data)
    setComment('')
    setMsg('')
  }

  const handleReview = async (status: string) => {
    setSaving(true)
    await reviewApplication(selected.id, status, comment)
    setSaving(false)
    setMsg('Status updated!')
    setSelected((s: any) => ({ ...s, status }))
    loadApps()
  }

  const logout = () => { localStorage.clear(); router.push('/login') }

  if (selected) return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 15, marginBottom: 16 }}>← Back to list</button>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>{selected.business_name || 'Unnamed'}</h2>
          <span style={{ padding: '4px 12px', borderRadius: 20, background: STATUS[selected.status]?.color + '20', color: STATUS[selected.status]?.color, fontSize: 13, fontWeight: 600 }}>
            {STATUS[selected.status]?.label}
          </span>
        </div>

        <Row label="Merchant" value={`${selected.merchant_name} (${selected.email})`} />
        <Row label="Business type" value={selected.business_type} />
        <Row label="Country" value={selected.country} />
        <Row label="Website" value={selected.website} />
        <Row label="Description" value={selected.business_description} />
        <Row label="Monthly volume (AED)" value={selected.monthly_volume ? Number(selected.monthly_volume).toLocaleString('en-US').replace(/,/g, ' ') : null} />
        <Row label="Phone" value={selected.contact_phone} />
        <Row label="Address" value={selected.contact_address} />

        <h3 style={{ marginTop: 24, marginBottom: 12 }}>Documents ({selected.documents?.length || 0})</h3>
        {selected.documents?.length === 0 && <p style={{ color: '#9ca3af' }}>No documents uploaded</p>}
        {selected.documents?.map((d: any) => (
          <div key={d.id} style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 8, marginBottom: 8, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📄 {d.original_name} <span style={{ color: '#6b7280' }}>({d.doc_type})</span></span>
            <button onClick={() => {
              const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
              const token = localStorage.getItem('token')
              window.open(`${api}/api/documents/${d.id}/url?token=${token}`, '_blank')
            }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}>
              View
            </button>
          </div>
        ))}

        {selected.status === 'pending' && <>
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Decision</h3>
          <label style={labelStyle}>Comment (required for rejection or document requests)</label>
          <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={comment} onChange={e => setComment(e.target.value)} placeholder="Explain the reason or what documents are needed..." />
          {msg && <p style={{ color: '#16a34a' }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button style={{ ...btnStyle, background: '#16a34a' }} onClick={() => handleReview('approved')} disabled={saving}>✅ Approve</button>
            <button style={{ ...btnStyle, background: '#7c3aed' }} onClick={() => handleReview('needs_more_docs')} disabled={saving}>📎 Request documents</button>
            <button style={{ ...btnStyle, background: '#dc2626' }} onClick={() => handleReview('rejected')} disabled={saving}>❌ Reject</button>
          </div>
        </>}
        {msg && selected.status !== 'pending' && <p style={{ color: '#16a34a', marginTop: 12 }}>{msg}</p>}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <a href="https://wefortis.com" target="_blank" style={{ textDecoration: 'none' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Fortis</h1>
        </a>
        <button onClick={logout} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Sign out</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['', 'pending', 'approved', 'rejected', 'needs_more_docs'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: filter === s ? '#1e293b' : '#e5e7eb', color: filter === s ? '#fff' : '#374151', cursor: 'pointer', fontSize: 13 }}>
            {s === '' ? 'All' : STATUS[s]?.label}
          </button>
        ))}
      </div>

      {loading ? <p>Loading...</p> : apps.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>No applications found</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map(a => (
            <div key={a.id} onClick={() => openApp(a.id)} style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.business_name || 'Unnamed'}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{a.merchant_name} · {a.email} · {a.country}</div>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 20, background: STATUS[a.status]?.color + '20', color: STATUS[a.status]?.color, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {STATUS[a.status]?.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const Row = ({ label, value }: any) => value ? (
  <div style={{ marginBottom: 10 }}>
    <span style={{ fontSize: 12, color: '#9ca3af', display: 'block' }}>{label}</span>
    <span style={{ fontSize: 15 }}>{value}</span>
  </div>
) : null

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 600 }