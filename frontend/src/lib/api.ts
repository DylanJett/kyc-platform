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

export async function getMyApplications() {
  const res = await fetch(`${API}/api/application/list`, { headers: headers() })
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

export async function updateApplicationByID(id: string, data: object) {
  const res = await fetch(`${API}/api/application/${id}`, {
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

export async function submitApplicationByID(id: string) {
  const res = await fetch(`${API}/api/application/${id}/submit`, {
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

export async function uploadDocumentForApp(appId: string, file: File, docType: string, ownerId?: string, matchName?: string, businessName?: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('doc_type', docType)
  if (ownerId) form.append('owner_id', ownerId)
  if (matchName) form.append('match_name', matchName)
  if (businessName) form.append('business_name', businessName)
  const res = await fetch(`${API}/api/application/${appId}/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    body: form
  })
  return res.json()
}

export async function addOwner(appId: string, data: object) {
  const res = await fetch(`${API}/api/application/${appId}/owners`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data)
  })
  return res.json()
}

export async function updateOwner(appId: string, ownerId: string, data: object) {
  const res = await fetch(`${API}/api/application/${appId}/owners/${ownerId}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data)
  })
  return res.json()
}

export async function deleteOwner(appId: string, ownerId: string) {
  const res = await fetch(`${API}/api/application/${appId}/owners/${ownerId}`, {
    method: 'DELETE', headers: headers()
  })
  return res.json()
}

export async function getOwners(appId: string) {
  const res = await fetch(`${API}/api/application/${appId}/owners`, { headers: headers() })
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
