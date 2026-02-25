'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { register } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    const data = await register(form.email, form.password, form.full_name, 'merchant')
    setLoading(false)
    if (data.token) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('role', data.role)
      router.push('/merchant')
    } else {
      setError(data.error || 'Registration failed')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 12, width: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="https://wefortis.com" target="_blank" style={{ textDecoration: 'none' }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.5px' }}>Fortis</h1>
          </a>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>Create your merchant account</p>
        </div>

        <label style={labelStyle}>Full name</label>
        <input style={inputStyle} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="John Smith" />

        <label style={labelStyle}>Email</label>
        <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />

        <label style={labelStyle}>Password</label>
        <input style={inputStyle} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 8 characters" />

        {error && <p style={{ color: 'red', fontSize: 14 }}>{error}</p>}

        <button style={btnStyle} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          Already have an account? <a href="/login" style={{ color: '#2563eb' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: 16, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { width: '100%', padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 }