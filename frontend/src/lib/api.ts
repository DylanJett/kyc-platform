const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null
export const getRole = () => typeof window !== 'undefined' ? localStorage.getItem('role') : null

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
})

export async function login(email: string, password: string) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  return res.json()
}

export async function register(email: string, password: string, full_name: string, role: string) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name, role })
  })
  return res.json()
}

export async function getMyApplication() {
  const res = await fetch(`${API}/api/application`, { headers: headers() })
  return res.json()
}

export async function createApplication(data: object) {
  const res = await fetch(`${API}/api/application`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data)
  })
  return res.json()
}

export async function updateApplication(data: object) {
  const res = await fetch(`${API}/api/application`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data)
  })
  return res.json()
}

export async function submitApplication() {
  const res = await fetch(`${API}/api/application/submit`, {
    method: 'POST', headers: headers()
  })
  return res.json()
}

export async function uploadDocument(file: File, docType: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('doc_type', docType)
  const res = await fetch(`${API}/api/application/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: form
  })
  return res.json()
}

export async function listApplications(status?: string) {
  const url = status ? `${API}/api/applications?status=${status}` : `${API}/api/applications`
  const res = await fetch(url, { headers: headers() })
  return res.json()
}

export async function getApplication(id: string) {
  const res = await fetch(`${API}/api/applications/${id}`, { headers: headers() })
  return res.json()
}

export async function reviewApplication(id: string, status: string, comment: string) {
  const res = await fetch(`${API}/api/applications/${id}/review`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ status, comment })
  })
  return res.json()
}