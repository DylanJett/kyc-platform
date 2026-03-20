'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  getMyApplications, createApplication, updateApplicationByID,
  submitApplicationByID, uploadDocumentForApp, addOwner, deleteOwner, getOwners
} from '@/lib/api'
import {
  MCC_CODES, COUNTRIES, BUSINESS_ACTIVITIES, SETTLEMENT_FREQUENCIES,
  CURRENCIES, STORE_TYPES, DOC_TYPES, IDENTITY_TYPES
} from '@/lib/reference'

const STEPS = ['Business', 'Contact & Settlement', 'Owners', 'Documents', 'Preview']

const STATUS: Record<string, { label: string, color: string }> = {
  draft:           { label: 'Draft',                    color: '#6b7280' },
  pending:         { label: 'Under review',              color: '#d97706' },
  approved:        { label: 'Approved',                  color: '#16a34a' },
  rejected:        { label: 'Rejected',                  color: '#dc2626' },
  needs_more_docs: { label: 'More documents needed',     color: '#7c3aed' },
}

const EDITABLE_STATUSES = ['draft', 'needs_more_docs', 'rejected']

const emptyForm = {
  business_name: '', business_category: '', business_subcategory: '',
  free_zone: false, country: '', website: '', business_description: '',
  monthly_volume: '', owner_name: '', contact_phone: '', contact_address: '',
  mcc: '', store_type: '', contact_email: '', city: '',
  address_line1: '', address_line2: '', business_activities: '',
  accept_international_payments: false,
  settlement_currency: 'AED', settlement_bank_name: '',
  settlement_bank_iban: '', settlement_frequency: '',
}

export default function MerchantPage() {
  const router = useRouter()
  const [apps, setApps] = useState<any[]>([])
  const [currentApp, setCurrentApp] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({})
  const [docValidation, setDocValidation] = useState<Record<string, { status: string, errors?: string[], details?: string }>>({})
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [owners, setOwners] = useState<any[]>([])
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [ownerForm, setOwnerForm] = useState({ ownership_type: 'shareHolder', owner_type: 'individual', first_name: '', last_name: '', company_name: '', email: '', identity_type: 'emiratesId' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [mccSearch, setMccSearch] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [showMccDropdown, setShowMccDropdown] = useState(false)
  const [showCountryDropdown, setShowCountryDropdown] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }
    loadApps(true) // autoRedirect: go to new form if no active apps
  }, [])

  const ACTIVE_STATUSES = ['draft', 'pending', 'needs_more_docs']

  const loadApps = async (autoRedirect = false) => {
    setLoading(true)
    const data = await getMyApplications()
    const list = Array.isArray(data) ? data : []
    setApps(list)
    setLoading(false)

    // If merchant has no applications at all, go straight to new application form
    if (autoRedirect && list.length === 0) {
      startNewApp()
    }
  }

  const openApp = (app: any) => {
    setCurrentApp(app)
    setForm({
      business_name:        app.business_name || '',
      business_category:    app.business_category || '',
      business_subcategory: app.business_subcategory || '',
      free_zone:            app.free_zone || false,
      country:              app.country || '',
      website:              app.website || '',
      business_description: app.business_description || '',
      monthly_volume:       app.monthly_volume || '',
      owner_name:           app.owner_name || '',
      contact_phone:        app.contact_phone || '',
      contact_address:      app.contact_address || '',
      mcc:                  app.mcc || '',
      store_type:           app.store_type || '',
      contact_email:        app.contact_email || '',
      city:                 app.city || '',
      address_line1:        app.address_line1 || '',
      address_line2:        app.address_line2 || '',
      business_activities:  app.business_activities || '',
      accept_international_payments: app.accept_international_payments || false,
      settlement_currency:  app.settlement_currency || 'AED',
      settlement_bank_name: app.settlement_bank_name || '',
      settlement_bank_iban: app.settlement_bank_iban || '',
      settlement_frequency: app.settlement_frequency || '',
    })
    setMccSearch(app.mcc ? `${app.mcc} — ${MCC_CODES.find(m => m.code === app.mcc)?.label || ''}` : '')
    setCountrySearch(app.country || '')
    // Load existing uploaded docs and validation from app.documents
    const docs: Record<string, string> = {}
    const validations: Record<string, { status: string, errors?: string[], details?: string }> = {}
    if (app.documents) {
      app.documents.forEach((d: any) => {
        docs[d.doc_type] = d.original_name
        if (d.validation_status) {
          validations[d.doc_type] = { status: d.validation_status, details: d.validation_details }
        }
      })
    }
    setUploadedDocs(docs)
    setDocValidation(validations)
    setTouched({})
    const canEdit = EDITABLE_STATUSES.includes(app.status)
    if (canEdit) {
      setStep(0)
    } else {
      setStep(4) // show preview for non-editable
    }
    setView('form')
    // Load owners
    loadOwners(app.id)
  }

  const loadOwners = async (appId: string) => {
    const data = await getOwners(appId)
    setOwners(Array.isArray(data) ? data : [])
  }

  const startNewApp = () => {
    setCurrentApp(null)
    setForm({ ...emptyForm })
    setMccSearch('')
    setCountrySearch('')
    setUploadedDocs({})
    setDocValidation({})
    setTouched({})
    setOwners([])
    setStep(0)
    setView('form')
    setShowConfirm(false)
  }

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }))
  const touchAll = (fields: string[]) => setTouched(t => { const n = { ...t }; fields.forEach(f => n[f] = true); return n })

  const step0Fields = ['business_name', 'mcc', 'store_type', 'country', 'city', 'address_line1', 'website', 'business_activities', 'monthly_volume']
  const step1Fields = ['owner_name', 'contact_phone', 'contact_email', 'settlement_currency', 'settlement_bank_name', 'settlement_bank_iban', 'settlement_frequency']

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
    try {
      if (!currentApp?.id) {
        const res = await createApplication(form)
        setCurrentApp((a: any) => ({ ...a, id: res.id, status: 'draft' }))
      } else {
        await updateApplicationByID(currentApp.id, form)
      }
    } finally {
      setSaving(false)
    }
    setStep(s => s + 1)
  }

  const handleUpload = async (docKey: string, file: File) => {
    if (!currentApp?.id) return
    setUploadingDoc(docKey)
    // Clear previous validation for this doc type
    setDocValidation(v => { const n = { ...v }; delete n[docKey]; return n })

    const res = await uploadDocumentForApp(currentApp.id, file, docKey)

    if (res.error) {
      // Validation failed — show errors but don't mark as uploaded
      setDocValidation(v => ({
        ...v,
        [docKey]: {
          status: res.validation_status || 'rejected',
          errors: res.validation_errors || [res.error],
          details: res.validation_details || res.error
        }
      }))
      setUploadingDoc(null)
      return
    }

    // Upload succeeded
    setUploadedDocs(d => ({ ...d, [docKey]: file.name }))
    setDocValidation(v => ({
      ...v,
      [docKey]: {
        status: res.validation_status || 'passed',
        errors: res.validation_errors,
        details: res.validation_details
      }
    }))
    setUploadingDoc(null)
  }

  const handleAddOwner = async () => {
    if (!currentApp?.id) return
    setSaving(true)
    await addOwner(currentApp.id, ownerForm)
    await loadOwners(currentApp.id)
    setShowOwnerForm(false)
    setOwnerForm({ ownership_type: 'shareHolder', owner_type: 'individual', first_name: '', last_name: '', company_name: '', email: '', identity_type: 'emiratesId' })
    setSaving(false)
  }

  const handleDeleteOwner = async (ownerId: string) => {
    if (!currentApp?.id) return
    await deleteOwner(currentApp.id, ownerId)
    await loadOwners(currentApp.id)
  }

  const handleSubmit = async () => {
    if (!currentApp?.id) return
    setSaving(true)
    const res = await submitApplicationByID(currentApp.id)
    setSaving(false)
    if (res.message) {
      setCurrentApp((a: any) => ({ ...a, status: 'pending' }))
      setShowConfirm(false)
      setView('list')
      loadApps()
    }
  }

  const logout = () => { localStorage.clear(); router.push('/login') }

  // Filtered MCC codes
  const filteredMCC = useMemo(() => {
    if (!mccSearch) return MCC_CODES.slice(0, 20)
    const q = mccSearch.toLowerCase()
    return MCC_CODES.filter(m => m.code.includes(q) || m.label.toLowerCase().includes(q)).slice(0, 20)
  }, [mccSearch])

  // Filtered countries
  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES
    const q = countrySearch.toLowerCase()
    return COUNTRIES.filter(c => c.toLowerCase().includes(q))
  }, [countrySearch])

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  const canEdit = currentApp ? EDITABLE_STATUSES.includes(currentApp.status) : true
  const status = currentApp?.status ? STATUS[currentApp.status] : null

  // ======== APPLICATION LIST VIEW ========
  if (view === 'list') return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <a href="https://wefortis.com" target="_blank" style={{ textDecoration: 'none' }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Fortis</h1>
        </a>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={startNewApp} style={{ ...btnStyle, padding: '8px 18px', fontSize: 14 }}>+ New Application</button>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 16, color: '#374151' }}>My Applications</h2>

      {apps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>📋</p>
          <p style={{ fontSize: 16, marginBottom: 16 }}>No applications yet</p>
          <button onClick={startNewApp} style={{ ...btnStyle, padding: '12px 28px' }}>Create your first application</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map((a: any) => {
            const s = STATUS[a.status] || { label: a.status, color: '#6b7280' }
            return (
              <div key={a.id} onClick={() => openApp(a)} style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${s.color}` }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.business_name || 'Unnamed application'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {a.mcc && `MCC: ${a.mcc} · `}{a.country || 'No country'} · Created: {new Date(a.created_at).toLocaleDateString()}
                  </div>
                  {a.reviewer_comment && <div style={{ fontSize: 13, color: '#7c3aed', marginTop: 4 }}>💬 {a.reviewer_comment}</div>}
                </div>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: s.color + '20', color: s.color, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ======== APPLICATION FORM VIEW ========
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={() => { setView('list'); loadApps() }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 15 }}>← Back to applications</button>
        <button onClick={logout} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Sign out</button>
      </div>

      {status && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', marginBottom: 20, borderLeft: `4px solid ${status.color}` }}>
          <strong>Status: </strong><span style={{ color: status.color }}>{status.label}</span>
          {currentApp?.reviewer_comment && <p style={{ margin: '8px 0 0', color: '#374151' }}>💬 {currentApp.reviewer_comment}</p>}
          {EDITABLE_STATUSES.includes(currentApp?.status) && currentApp?.status !== 'draft' && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#2563eb', cursor: 'pointer' }} onClick={() => setStep(0)}>
              ✏️ Edit and resubmit your application
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

        {/* ===== Step 0: Business Info ===== */}
        {step === 0 && <>
          <h3 style={h3}>Business information</h3>

          <Field label="Store / Company Name *" value={form.business_name} onChange={v => set('business_name', v)} onBlur={() => touch('business_name')} invalid={isInvalid('business_name')} placeholder="Acme Inc." error="Company name is required" disabled={!canEdit} />

          {/* Store Type */}
          <label style={labelStyle}>Store Type *</label>
          <select style={{ ...inputStyle, borderColor: isInvalid('store_type') ? '#ef4444' : '#d1d5db' }}
            value={form.store_type}
            onChange={e => set('store_type', e.target.value)}
            onBlur={() => touch('store_type')}
            disabled={!canEdit}>
            <option value="">Select store type...</option>
            {STORE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {isInvalid('store_type') && <p style={errStyle}>Store type is required</p>}

          {/* MCC with search */}
          <label style={labelStyle}>MCC Code *</label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inputStyle, borderColor: isInvalid('mcc') ? '#ef4444' : '#d1d5db' }}
              value={mccSearch}
              onChange={e => { setMccSearch(e.target.value); setShowMccDropdown(true); set('mcc', '') }}
              onFocus={() => setShowMccDropdown(true)}
              onBlur={() => { setTimeout(() => setShowMccDropdown(false), 200); touch('mcc') }}
              placeholder="Search MCC code or description..."
              disabled={!canEdit}
            />
            {showMccDropdown && filteredMCC.length > 0 && (
              <div style={dropdownStyle}>
                {filteredMCC.map(m => (
                  <div key={m.code} style={dropdownItem}
                    onMouseDown={() => { set('mcc', m.code); setMccSearch(`${m.code} — ${m.label}`); setShowMccDropdown(false) }}>
                    <strong>{m.code}</strong> — {m.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isInvalid('mcc') && <p style={errStyle}>MCC code is required</p>}

          {/* Country with search */}
          <label style={labelStyle}>Country *</label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inputStyle, borderColor: isInvalid('country') ? '#ef4444' : '#d1d5db' }}
              value={countrySearch}
              onChange={e => { setCountrySearch(e.target.value); setShowCountryDropdown(true); set('country', '') }}
              onFocus={() => setShowCountryDropdown(true)}
              onBlur={() => { setTimeout(() => setShowCountryDropdown(false), 200); touch('country') }}
              placeholder="Search country..."
              disabled={!canEdit}
            />
            {showCountryDropdown && filteredCountries.length > 0 && (
              <div style={dropdownStyle}>
                {filteredCountries.slice(0, 15).map(c => (
                  <div key={c} style={dropdownItem}
                    onMouseDown={() => { set('country', c); setCountrySearch(c); setShowCountryDropdown(false) }}>
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isInvalid('country') && <p style={errStyle}>Country is required</p>}

          <Field label="City *" value={form.city} onChange={v => set('city', v)} onBlur={() => touch('city')} invalid={isInvalid('city')} placeholder="Dubai" error="City is required" disabled={!canEdit} />
          <Field label="Address Line 1 *" value={form.address_line1} onChange={v => set('address_line1', v)} onBlur={() => touch('address_line1')} invalid={isInvalid('address_line1')} placeholder="123 Main Street" error="Address is required" disabled={!canEdit} />
          <Field label="Address Line 2" value={form.address_line2} onChange={v => set('address_line2', v)} placeholder="Suite 100 (optional)" disabled={!canEdit} />

          <Field label="Website *" value={form.website} onChange={v => set('website', v)} onBlur={() => touch('website')} invalid={isInvalid('website')} placeholder="https://example.com" error="Website is required" disabled={!canEdit} />

          {/* Business Activities */}
          <label style={labelStyle}>Business Activities *</label>
          <select style={{ ...inputStyle, borderColor: isInvalid('business_activities') ? '#ef4444' : '#d1d5db' }}
            value={form.business_activities}
            onChange={e => set('business_activities', e.target.value)}
            onBlur={() => touch('business_activities')}
            disabled={!canEdit}>
            <option value="">Select business activity...</option>
            {BUSINESS_ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {isInvalid('business_activities') && <p style={errStyle}>Business activity is required</p>}

          <label style={labelStyle}>Business Description</label>
          <textarea
            style={{ ...inputStyle, height: 80, resize: 'vertical' }}
            value={form.business_description}
            onChange={e => set('business_description', e.target.value)}
            placeholder="Brief description of your business operations"
            disabled={!canEdit} />

          <label style={labelStyle}>Expected Monthly Volume (AED) *</label>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" id="freezone" checked={form.free_zone} onChange={e => set('free_zone', e.target.checked)} disabled={!canEdit} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="freezone" style={{ fontSize: 15, cursor: 'pointer' }}>Free Zone company</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" id="intl" checked={form.accept_international_payments} onChange={e => set('accept_international_payments', e.target.checked)} disabled={!canEdit} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor="intl" style={{ fontSize: 15, cursor: 'pointer' }}>Accept international payments</label>
          </div>

          {canEdit && <button style={btnStyle} onClick={saveAndNext} disabled={saving}>{saving ? 'Saving...' : 'Next →'}</button>}
        </>}

        {/* ===== Step 1: Contact & Settlement ===== */}
        {step === 1 && <>
          <h3 style={h3}>Contact & Settlement details</h3>
          <Field label="Owner / Contact Name *" value={form.owner_name} onChange={v => set('owner_name', v)} onBlur={() => touch('owner_name')} invalid={isInvalid('owner_name')} placeholder="John Smith" error="Owner name is required" disabled={!canEdit} />
          <Field label="Contact Phone *" value={form.contact_phone} onChange={v => set('contact_phone', v)} onBlur={() => touch('contact_phone')} invalid={isInvalid('contact_phone')} placeholder="+971 50 000 0000" error="Phone is required" disabled={!canEdit} />
          <Field label="Contact Email *" value={form.contact_email} onChange={v => set('contact_email', v)} onBlur={() => touch('contact_email')} invalid={isInvalid('contact_email')} placeholder="contact@company.com" error="Email is required" disabled={!canEdit} />

          <div style={{ borderTop: '1px solid #e5e7eb', margin: '20px 0', paddingTop: 20 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 16, color: '#374151' }}>Settlement Information</h4>

            <label style={labelStyle}>Settlement Currency *</label>
            <select style={{ ...inputStyle, borderColor: isInvalid('settlement_currency') ? '#ef4444' : '#d1d5db' }}
              value={form.settlement_currency}
              onChange={e => set('settlement_currency', e.target.value)}
              onBlur={() => touch('settlement_currency')}
              disabled={!canEdit}>
              <option value="">Select currency...</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {isInvalid('settlement_currency') && <p style={errStyle}>Currency is required</p>}

            <Field label="Bank Name *" value={form.settlement_bank_name} onChange={v => set('settlement_bank_name', v)} onBlur={() => touch('settlement_bank_name')} invalid={isInvalid('settlement_bank_name')} placeholder="Emirates NBD" error="Bank name is required" disabled={!canEdit} />
            <Field label="Bank IBAN *" value={form.settlement_bank_iban} onChange={v => set('settlement_bank_iban', v)} onBlur={() => touch('settlement_bank_iban')} invalid={isInvalid('settlement_bank_iban')} placeholder="AE070331234567890123456" error="IBAN is required" disabled={!canEdit} />

            <label style={labelStyle}>Settlement Frequency *</label>
            <select style={{ ...inputStyle, borderColor: isInvalid('settlement_frequency') ? '#ef4444' : '#d1d5db' }}
              value={form.settlement_frequency}
              onChange={e => set('settlement_frequency', e.target.value)}
              onBlur={() => touch('settlement_frequency')}
              disabled={!canEdit}>
              <option value="">Select frequency...</option>
              {SETTLEMENT_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {isInvalid('settlement_frequency') && <p style={errStyle}>Settlement frequency is required</p>}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button style={btnOutline} onClick={() => setStep(0)}>← Back</button>
            {canEdit && <button style={btnStyle} onClick={saveAndNext} disabled={saving}>{saving ? 'Saving...' : 'Next →'}</button>}
          </div>
        </>}

        {/* ===== Step 2: Owners ===== */}
        {step === 2 && <>
          <h3 style={h3}>Owners & Signatories</h3>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
            Add shareholders and authorized signatories for this business.
          </p>

          {owners.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {owners.map((o: any) => (
                <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {o.ownership_type === 'authorizedSignatory' ? '✍️ Authorized Signatory' : '👤 Shareholder'}
                      {o.owner_type === 'corporate' ? ' (Corporate)' : o.owner_type === 'individual' ? ' (Individual)' : ''}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      {o.company_name || `${o.first_name || ''} ${o.last_name || ''}`.trim() || 'No name'}
                      {o.email ? ` · ${o.email}` : ''}
                      {o.identity_type ? ` · ID: ${o.identity_type}` : ''}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => handleDeleteOwner(o.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canEdit && !showOwnerForm && (
            <button onClick={() => setShowOwnerForm(true)} style={{ ...btnOutline, marginBottom: 16, width: '100%' }}>+ Add Owner / Signatory</button>
          )}

          {showOwnerForm && (
            <div style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: 16, marginBottom: 16, background: '#f9fafb' }}>
              <label style={labelStyle}>Role</label>
              <select style={inputStyle} value={ownerForm.ownership_type} onChange={e => {
                const newRole = e.target.value
                // Authorized signatory is always individual; reset identity to emiratesId
                setOwnerForm(f => ({
                  ...f,
                  ownership_type: newRole,
                  owner_type: newRole === 'authorizedSignatory' ? '' : f.owner_type || 'individual',
                  identity_type: newRole === 'authorizedSignatory' ? 'emiratesId' : f.identity_type,
                }))
              }}>
                <option value="shareHolder">Shareholder</option>
                <option value="authorizedSignatory">Authorized Signatory</option>
              </select>

              {ownerForm.ownership_type === 'shareHolder' && (
                <>
                  <label style={labelStyle}>Type</label>
                  <select style={inputStyle} value={ownerForm.owner_type} onChange={e => {
                    const newType = e.target.value
                    // Auto-set identity type: corporate → tradeLicense, individual → emiratesId
                    const newIdentity = newType === 'corporate' ? 'tradeLicense' : 'emiratesId'
                    setOwnerForm(f => ({ ...f, owner_type: newType, identity_type: newIdentity }))
                  }}>
                    <option value="individual">Individual</option>
                    <option value="corporate">Corporate</option>
                  </select>
                </>
              )}

              {ownerForm.owner_type === 'corporate' && ownerForm.ownership_type === 'shareHolder' ? (
                <>
                  <label style={labelStyle}>Company Name</label>
                  <input style={inputStyle} value={ownerForm.company_name} onChange={e => setOwnerForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Company LLC" />
                </>
              ) : (
                <>
                  <label style={labelStyle}>First Name</label>
                  <input style={inputStyle} value={ownerForm.first_name} onChange={e => setOwnerForm(f => ({ ...f, first_name: e.target.value }))} placeholder="John" />
                  <label style={labelStyle}>Last Name</label>
                  <input style={inputStyle} value={ownerForm.last_name} onChange={e => setOwnerForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Smith" />
                </>
              )}

              <label style={labelStyle}>Email (optional)</label>
              <input style={inputStyle} value={ownerForm.email} onChange={e => setOwnerForm(f => ({ ...f, email: e.target.value }))} placeholder="owner@company.com" />

              <label style={labelStyle}>Identity Document Type</label>
              {(() => {
                const isCorporate = ownerForm.ownership_type === 'shareHolder' && ownerForm.owner_type === 'corporate'
                const allowedTypes = isCorporate
                  ? IDENTITY_TYPES.filter(t => t.value === 'tradeLicense')
                  : IDENTITY_TYPES.filter(t => t.value === 'emiratesId' || t.value === 'passport')
                return (
                  <select style={inputStyle} value={ownerForm.identity_type} onChange={e => setOwnerForm(f => ({ ...f, identity_type: e.target.value }))}>
                    {allowedTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                )
              })()}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={btnStyle} onClick={handleAddOwner} disabled={saving}>{saving ? 'Adding...' : 'Add'}</button>
                <button style={btnOutline} onClick={() => setShowOwnerForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button style={btnOutline} onClick={() => setStep(1)}>← Back</button>
            <button style={btnStyle} onClick={() => setStep(3)}>Next →</button>
          </div>
        </>}

        {/* ===== Step 3: Documents ===== */}
        {step === 3 && <>
          <h3 style={h3}>Upload documents</h3>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Upload the required documents for verification. Trade License is required.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {DOC_TYPES.map(doc => {
              const val = docValidation[doc.key]
              const isRejected = val?.status === 'rejected'
              const isWarning = val?.status === 'warning'
              const isPassed = uploadedDocs[doc.key] && !isRejected
              const borderColor = isRejected ? '#ef4444' : isWarning ? '#d97706' : isPassed ? '#16a34a' : '#e5e7eb'
              const bgColor = isRejected ? '#fef2f2' : isWarning ? '#fffbeb' : isPassed ? '#f0fdf4' : '#fafafa'

              return (
                <div key={doc.key} style={{ border: `1px solid ${borderColor}`, borderRadius: 10, padding: '14px 16px', background: bgColor }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{doc.icon} {doc.label}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{doc.desc}</div>
                      {isPassed && !isWarning && <div style={{ fontSize: 13, color: '#16a34a', marginTop: 4 }}>✅ {uploadedDocs[doc.key]}</div>}
                      {isPassed && isWarning && <div style={{ fontSize: 13, color: '#d97706', marginTop: 4 }}>⚠️ {uploadedDocs[doc.key]}</div>}

                      {/* Validation messages */}
                      {val?.errors && val.errors.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {val.errors.map((err: string, i: number) => (
                            <div key={i} style={{ fontSize: 12, color: isRejected ? '#dc2626' : '#d97706', padding: '3px 0', display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                              <span>{isRejected ? '❌' : '⚠️'}</span>
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <label style={{ cursor: 'pointer', background: isRejected ? '#dc2626' : isPassed ? '#16a34a' : '#1e293b', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>
                        {uploadingDoc === doc.key ? 'Checking...' : isRejected ? 'Retry' : isPassed ? 'Replace' : 'Upload'}
                        <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(doc.key, f) }} />
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={btnOutline} onClick={() => setStep(2)}>← Back</button>
            <button style={btnStyle} onClick={() => setStep(4)}>Next → Preview</button>
          </div>
        </>}

        {/* ===== Step 4: Preview & Submit ===== */}
        {step === 4 && <>
          <h3 style={h3}>Application Preview</h3>

          {currentApp?.status === 'pending' || currentApp?.status === 'approved' ? (
            <p style={{ color: '#16a34a', marginBottom: 16 }}>✅ Your application has been submitted{currentApp?.status === 'approved' ? ' and approved' : ' for review'}.</p>
          ) : null}

          {/* Business Info Section */}
          <Section title="Business Information">
            <Row label="Company Name" value={form.business_name} />
            <Row label="Store Type" value={STORE_TYPES.find(t => t.value === form.store_type)?.label} />
            <Row label="MCC Code" value={form.mcc ? `${form.mcc} — ${MCC_CODES.find(m => m.code === form.mcc)?.label || ''}` : ''} />
            <Row label="Country" value={form.country} />
            <Row label="City" value={form.city} />
            <Row label="Address" value={[form.address_line1, form.address_line2].filter(Boolean).join(', ')} />
            <Row label="Website" value={form.website} />
            <Row label="Business Activity" value={form.business_activities} />
            <Row label="Description" value={form.business_description} />
            <Row label="Monthly Volume (AED)" value={form.monthly_volume ? Number(form.monthly_volume).toLocaleString('en-US').replace(/,/g, ' ') : ''} />
            <Row label="Free Zone" value={form.free_zone ? 'Yes' : 'No'} />
            <Row label="International Payments" value={form.accept_international_payments ? 'Yes' : 'No'} />
          </Section>

          {/* Contact & Settlement Section */}
          <Section title="Contact & Settlement">
            <Row label="Contact Name" value={form.owner_name} />
            <Row label="Phone" value={form.contact_phone} />
            <Row label="Email" value={form.contact_email} />
            <Row label="Settlement Currency" value={form.settlement_currency} />
            <Row label="Bank" value={form.settlement_bank_name} />
            <Row label="IBAN" value={form.settlement_bank_iban} />
            <Row label="Frequency" value={form.settlement_frequency} />
          </Section>

          {/* Owners Section */}
          <Section title={`Owners & Signatories (${owners.length})`}>
            {owners.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 14 }}>No owners added</p>
            ) : owners.map((o: any) => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontWeight: 500 }}>
                  {o.ownership_type === 'authorizedSignatory' ? '✍️' : '👤'}{' '}
                  {o.company_name || `${o.first_name || ''} ${o.last_name || ''}`.trim()}
                </span>
                <span style={{ color: '#6b7280', fontSize: 13 }}>
                  {' '}— {o.ownership_type === 'authorizedSignatory' ? 'Signatory' : `Shareholder (${o.owner_type})`}
                  {o.identity_type ? `, ${o.identity_type}` : ''}
                </span>
              </div>
            ))}
          </Section>

          {/* Documents Section */}
          <Section title={`Documents (${Object.keys(uploadedDocs).length})`}>
            {Object.keys(uploadedDocs).length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 14 }}>No documents uploaded</p>
            ) : Object.entries(uploadedDocs).map(([key, name]) => {
              const doc = DOC_TYPES.find(d => d.key === key)
              return (
                <div key={key} style={{ padding: '6px 0', fontSize: 14 }}>
                  {doc?.icon} <strong>{doc?.label || key}</strong>: {name}
                </div>
              )
            })}
          </Section>

          {/* Submit / Confirm */}
          {canEdit && currentApp?.status !== 'pending' && currentApp?.status !== 'approved' && (
            <>
              {!showConfirm ? (
                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button style={btnOutline} onClick={() => setStep(3)}>← Back</button>
                  <button style={{ ...btnStyle, background: '#16a34a' }} onClick={() => setShowConfirm(true)}>Submit for review</button>
                </div>
              ) : (
                <div style={{ marginTop: 20, padding: 16, border: '2px solid #16a34a', borderRadius: 10, background: '#f0fdf4' }}>
                  <p style={{ fontWeight: 600, color: '#15803d', margin: '0 0 12px' }}>⚠️ Please confirm submission</p>
                  <p style={{ color: '#374151', fontSize: 14, margin: '0 0 16px' }}>
                    Once submitted, the application will be locked for review. Are you sure all information is correct?
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button style={btnOutline} onClick={() => setShowConfirm(false)}>Cancel</button>
                    <button style={{ ...btnStyle, background: '#16a34a' }} onClick={handleSubmit} disabled={saving}>
                      {saving ? 'Submitting...' : '✓ Confirm & Submit'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {(!canEdit || currentApp?.status === 'pending' || currentApp?.status === 'approved') && (
            <div style={{ marginTop: 16 }}>
              <button style={btnOutline} onClick={() => { setView('list'); loadApps() }}>← Back to applications</button>
            </div>
          )}
        </>}
      </div>
    </div>
  )
}

// ======== Reusable Components ========

const Field = ({ label, value, onChange, onBlur, invalid, placeholder, error, disabled }: any) => (
  <>
    <label style={labelStyle}>{label}</label>
    <input style={{ ...inputStyle, borderColor: invalid ? '#ef4444' : '#d1d5db', background: disabled ? '#f9fafb' : '#fff' }} value={value} onChange={(e: any) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} disabled={disabled} />
    {invalid && error && <p style={errStyle}>{error}</p>}
  </>
)

const Section = ({ title, children }: any) => (
  <div style={{ marginBottom: 20 }}>
    <h4 style={{ margin: '0 0 12px', fontSize: 15, color: '#1e293b', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>{title}</h4>
    {children}
  </div>
)

const Row = ({ label, value }: any) => value ? (
  <div style={{ display: 'flex', marginBottom: 6, fontSize: 14 }}>
    <span style={{ width: 180, flexShrink: 0, color: '#6b7280' }}>{label}</span>
    <span style={{ color: '#1e293b' }}>{value}</span>
  </div>
) : null

// ======== Styles ========
const h3: React.CSSProperties = { margin: '0 0 20px', fontSize: 18 }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: 4, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const errStyle: React.CSSProperties = { color: '#ef4444', fontSize: 13, margin: '2px 0 12px' }
const btnStyle: React.CSSProperties = { flex: 1, padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 }
const btnOutline: React.CSSProperties = { flex: 1, padding: '12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, cursor: 'pointer' }
const dropdownStyle: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
const dropdownItem: React.CSSProperties = { padding: '8px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f3f4f6' }
