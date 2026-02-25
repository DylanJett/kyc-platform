'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    const data = await login(email, password)
    setLoading(false)
    if (data.token) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('role', data.role)
      router.push(data.role === 'merchant' ? '/merchant' : '/reviewer')
    } else {
      setError(data.error || 'Invalid email or password')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 12, width: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="https://wefortis.com" target="_blank" style={{ textDecoration: 'none' }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.5px' }}>Fortis</h1>
          </a>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>Sign in to your account</p>
        </div>

        <label style={labelStyle}>Email</label>
        <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />

        <label style={labelStyle}>Password</label>
        <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />

        {error && <p style={{ color: 'red', fontSize: 14 }}>{error}</p>}

        <button style={btnStyle} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          No account? <a href="/register" style={{ color: '#2563eb' }}>Create one</a>
        </p>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: 16, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { width: '100%', padding: '12px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 }