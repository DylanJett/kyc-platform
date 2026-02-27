'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getMyApplication, createApplication, updateApplication, submitApplication, uploadDocument } from '@/lib/api'

const STEPS = ['Business', 'Contact', 'Documents', 'Submit']

const STATUS: Record<string, { label: string, color: string }> = {
  draft:           { label: 'Draft',                    color: '#6b7280' },
  pending:         { label: 'Under review',              color: '#d97706' },
  approved:        { label: '✅ Approved',               color: '#16a34a' },
  rejected:        { label: '❌ Rejected',               color: '#dc2626' },
  needs_more_docs: { label: '📎 More documents needed',  color: '#7c3aed' },
}

const CATEGORIES: Record<string, string[]> = {
  'E-commerce':      ['Online Retail', 'Marketplace', 'Digital Goods', 'Subscriptions'],
  'Retail':          ['Clothing', 'Electronics', 'Food & Grocery', 'Furniture'],
  'Services':        ['Consulting', 'Freelance', 'Cleaning', 'Maintenance'],
  'Technology':      ['SaaS', 'Mobile Apps', 'IT Services', 'Cybersecurity'],
  'Healthcare':      ['Pharmacy', 'Clinic', 'Telemedicine', 'Medical Devices'],
  'Education':       ['Online Courses', 'Tutoring', 'Training', 'Certification'],
  'Travel':          ['Hotel', 'Tour Operator', 'Car Rental', 'Airlines'],
  'Food & Beverage': ['Restaurant', 'Catering', 'Delivery', 'Cafe'],
  'Finance':         ['Lending', 'Insurance', 'Investment', 'Accounting'],
  'Other':           ['Other'],
}

const DOC_TYPES = [
  { key: 'passport',                  label: 'Passport',                  icon: '🛂', desc: 'Valid passport of the business owner' },
  { key: 'visa',                      label: 'Visa',                      icon: '✈️', desc: 'Current visa if applicable' },
  { key: 'identity_document',         label: 'Identity Document',         icon: '🪪', desc: 'National ID or Emirates ID' },
  { key: 'business_license',          label: 'Business License',          icon: '📋', desc: 'Official business license' },
  { key: 'memorandum_of_association', label: 'Memorandum of Association', icon: '📜', desc: 'MOA or Articles of Association' },
  { key: 'business_documents',        label: 'Business Documents',        icon: '🗂️', desc: 'Bank statements, invoices, etc.' },
  { key: 'other',                     label: 'Additional Information',    icon: '📎', desc: 'Any other supporting documents' },
]

const EDITABLE_STATUSES = ['draft', 'needs_more_docs', 'rejected']

export default function MerchantPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [app, setApp] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({})
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [form, setForm] = useState({
    business_name: '', business_category: '', business_subcategory: '',
    free_zone: false, country: '', website: '', business_description: '',
    monthly_volume: '', owner_name: '', contact_phone: '', contact_address: ''
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    getMyApplication().then(data => {
      if (data?.id) {
        setApp(data)
        setForm({
          business_name:        data.business_name || '',
          business_category:    data.business_category || '',
          business_subcategory: data.business_subcategory || '',
          free_zone:            data.free_zone || false,
          country:              data.country || '',
          website:              data.website || '',
          business_description: data.business_description || '',
          monthly_volume:       data.monthly_volume || '',
          owner_name:           data.owner_name || '',
          contact_phone:        data.contact_phone || '',
          contact_address:      data.contact_address || '',
        })
        if (data.status === 'pending' || data.status === 'approved') setStep(3)
      }
      setLoading(false)
    })
  }, [])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }))
  const touchAll = (fields: string[]) => setTouched(t => { const n = { ...t }; fields.forEach(f => n[f] = true); return n })

  const step0Fields = ['business_name', 'business_category', 'business_subcategory', 'country', 'website', 'business_description', 'monthly_volume']
  const step1Fields = ['owner_name', 'contact_phone', 'contact_address']

  const isVolumInvalid = (v: string) => !!v && !/^\d+(\.\d{1,2})?$/.test(v)
  const isInvalid = (k: string) => {
    if (!touched[k]) return false
    if (k === 'monthly_volume') return !form.monthly_volume || isVolumInvalid(form.monthly_volume)
    return !(form as any)[k]
  }

  const validateStep = (fields: string[]) => {
    touchAll(fields)
    if (fields.includes('monthly_volume') && (!form.monthly_volume || isVolumInvalid(form.monthly_volume))) return false
    return fields.every(f => !!(form as any)[f])
  }

  const saveAndNext = async () => {
    const fields = step === 0 ? step0Fields : step1Fields
    if (!validateStep(fields)) return
    setSaving(true)
    if (!app?.id) {
      const res = await createApplication(form)
      setApp((a: any) => ({ ...a, id: res.id, status: 'draft' }))
    } else {
      await updateApplication(form)
    }
    setSaving(false)
    setStep(s => s + 1)
  }

  const handleUpload = async (docKey: string, file: File) => {
    setUploadingDoc(docKey)
    await uploadDocument(file, docKey)
    setUploadedDocs(d => ({ ...d, [docKey]: file.name }))
    setUploadingDoc(null)
  }

  const handleSubmit = async () => {
    setSaving(true)
    const res = await submitApplication()
    setSaving(false)
    if (res.message) setApp((a: any) => ({ ...a, status: 'pending' }))
  }

  const logout = () => { localStorage.clear(); router.push('/login') }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const status = app?.status ? STATUS[app.status] : null
  const canEdit = !app?.status || EDITABLE_STATUSES.includes(app?.status)
  const subcategories = CATEGORIES[form.business_category] || []

  return (
    <div style={{ maxWidth: 660, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <a href="https://wefortis.com" target="_blank" style={{ textDecoration: 'none' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Fortis</h1>
        </a>
        <button onClick={logout} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Sign out</button>
      </div>

      {status && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', marginBottom: 20, borderLeft: `4px solid ${status.color}` }}>
          <strong>Application status: </strong><span style={{ color: status.color }}>{status.label}</span>
          {app?.reviewer_comment && <p style={{ margin: '8px 0 0', color: '#374151' }}>💬 {app.reviewer_comment}</p>}
          {(app?.status === 'rejected' || app?.status === 'needs_more_docs') && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#2563eb', cursor: 'pointer' }} onClick={() => setStep(0)}>
              ✏️ Click here to edit and resubmit your application
            </p>
          )}
        </div>
      )}

      {/* Steps */}
      <div style={{ display: 'flex', marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: i <= step ? '#1e293b' : '#e5e7eb', color: i <= step ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 13, fontWeight: 600 }}>{i + 1}</div>
            <div style={{ fontSize: 11, color: i === step ? '#1e293b' : '#9ca3af' }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>

        {/* Step 1 — Business */}
        {step === 0 && <>
          <h3 style={h3}>Business information</h3>

          <Field label="Company Name" value={form.business_name} onChange={v => set('business_name', v)} onBlur={() => touch('business_name')} invalid={isInvalid('business_name')} placeholder="Acme Inc." error="Company name is required" disabled={!canEdit} />

          <label style={labelStyle}>Business Category</label>
          <select style={{ ...inputStyle, borderColor: isInvalid('business_category') ? '#ef4444' : '#d1d5db' }}
            value={form.business_category}
            onChange={e => { set('business_category', e.target.value); set('business_subcategory', '') }}
            onBlur={() => touch('business_category')}
            disabled={!canEdit}>
            <option value="">Select category...</option>
            {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {isInvalid('business_category') && <p style={errStyle}>Business category is required</p>}

          <label style={labelStyle}>Business Subcategory</label>
          <select style={{ ...inputStyle, borderColor: isInvalid('business_subcategory') ? '#ef4444' : '#d1d5db' }}
            value={form.business_subcategory}
            onChange={e => set('business_subcategory', e.target.value)}
            onBlur={() => touch('business_subcategory')}
            disabled={!canEdit || !form.business_category}>
            <option value="">Select subcategory...</option>
            {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {isInvalid('business_subcategory') && <p style={errStyle}>Business subcategory is required</p>}

          <Field label="Country" value={form.country} onChange={v => set('country', v)} onBlur={() => touch('country')} invalid={isInvalid('country')} placeholder="United Arab Emirates" error="Country is required" disabled={!canEdit} />
          <Field label="Website" value={form.website} onChange={v => set('website', v)} onBlur={() => touch('website')} invalid={isInvalid('website')} placeholder="https://example.com" error="Website is required" disabled={!canEdit} />
          <label style={labelStyle}>Business Description</label>
          <textarea
            style={{ ...inputStyle, height: 100, resize: 'vertical', borderColor: isInvalid('business_description') ? '#ef4444' : '#d1d5db' }}
            value={form.business_description}
            onChange={e => set('business_description', e.target.value)}
            onBlur={() => touch('business_description')}
            placeholder="What does your business do?"
            disabled={!canEdit} />
          {isInvalid('business_description') && <p style={errStyle}>Business description is required</p>}

          <label style={labelStyle}>Expected Monthly Volume (AED)</label>
          <input
            style={{ ...inputStyle, borderColor: isInvalid('monthly_volume') ? '#ef4444' : '#d1d5db' }}
            value={form.monthly_volume ? Number(form.monthly_volume.replace(/\s/g, '')).toLocaleString('en-US').replace(/,/g, ' ') : ''}
            onChange={e => {
              const raw = e.target.value.replace(/\s/g, '')
              if (raw === '' || /^\d+$/.test(raw)) set('monthly_volume', raw)
            }}
            onBlur={() => touch('monthly_volume')}
            placeholder="85 000"
            disabled={!canEdit} />
          {isInvalid('monthly_volume') && <p style={errStyle}>{!form.monthly_volume ? 'Monthly volume is required' : 'Please enter a valid amount (numbers only)'}</p>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" id="freezone" checked={form.free_zone} onChange={e => set('free_zone', e.target.checked)} disabled={!canEdit} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="freezone" style={{ fontSize: 15, cursor: 'pointer' }}>Free Zone company</label>
          </div>

          {canEdit && <button style={btnStyle} onClick={saveAndNext} disabled={saving}>{saving ? 'Saving...' : 'Next →'}</button>}
        </>}

        {/* Step 2 — Contact */}
        {step === 1 && <>
          <h3 style={h3}>Contact details</h3>
          <Field label="Owner Name" value={form.owner_name} onChange={v => set('owner_name', v)} onBlur={() => touch('owner_name')} invalid={isInvalid('owner_name')} placeholder="John Smith" error="Owner name is required" disabled={!canEdit} />
          <Field label="Phone" value={form.contact_phone} onChange={v => set('contact_phone', v)} onBlur={() => touch('contact_phone')} invalid={isInvalid('contact_phone')} placeholder="+971 50 000 0000" error="Phone is required" disabled={!canEdit} />
          <Field label="Address" value={form.contact_address} onChange={v => set('contact_address', v)} onBlur={() => touch('contact_address')} invalid={isInvalid('contact_address')} placeholder="123 Main St, Dubai, UAE" error="Address is required" disabled={!canEdit} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={btnOutline} onClick={() => setStep(0)}>← Back</button>
            {canEdit && <button style={btnStyle} onClick={saveAndNext} disabled={saving}>{saving ? 'Saving...' : 'Next →'}</button>}
          </div>
        </>}

        {/* Step 3 — Documents */}
        {step === 2 && <>
          <h3 style={h3}>Upload documents</h3>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Upload the required documents for verification.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {DOC_TYPES.map(doc => (
              <div key={doc.key} style={{ border: `1px solid ${uploadedDocs[doc.key] ? '#16a34a' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 16px', background: uploadedDocs[doc.key] ? '#f0fdf4' : '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{doc.icon} {doc.label}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{doc.desc}</div>
                    {uploadedDocs[doc.key] && <div style={{ fontSize: 13, color: '#16a34a', marginTop: 4 }}>✓ {uploadedDocs[doc.key]}</div>}
                  </div>
                  {canEdit && (
                    <label style={{ cursor: 'pointer', background: uploadedDocs[doc.key] ? '#16a34a' : '#1e293b', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {uploadingDoc === doc.key ? 'Uploading...' : uploadedDocs[doc.key] ? 'Replace' : 'Upload'}
                      <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(doc.key, f) }} />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={btnOutline} onClick={() => setStep(1)}>← Back</button>
            <button style={btnStyle} onClick={() => setStep(3)}>Next →</button>
          </div>
        </>}

        {/* Step 4 — Submit */}
        {step === 3 && <>
          <h3 style={h3}>Submit application</h3>
          {app?.status === 'pending' || app?.status === 'approved' ? (
            <p style={{ color: '#16a34a' }}>✅ Your application has been submitted for review</p>
          ) : (
            <>
              <p style={{ color: '#374151', marginBottom: 20 }}>Everything looks good! Submit your application for review.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={btnOutline} onClick={() => setStep(2)}>← Back</button>
                <button style={btnStyle} onClick={handleSubmit} disabled={saving}>{saving ? 'Submitting...' : 'Submit for review'}</button>
              </div>
            </>
          )}
        </>}
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange, onBlur, invalid, placeholder, error, disabled }: any) => (
  <>
    <label style={labelStyle}>{label}</label>
    <input style={{ ...inputStyle, borderColor: invalid ? '#ef4444' : '#d1d5db', background: disabled ? '#f9fafb' : '#fff' }} value={value} onChange={(e: any) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} disabled={disabled} />
    {invalid && error && <p style={errStyle}>{error}</p>}
  </>
)

const h3: React.CSSProperties = { margin: '0 0 20px', fontSize: 18 }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: 4, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const errStyle: React.CSSProperties = { color: '#ef4444', fontSize: 13, margin: '2px 0 12px' }
const btnStyle: React.CSSProperties = { flex: 1, padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 }
const btnOutline: React.CSSProperties = { flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, cursor: 'pointer' }