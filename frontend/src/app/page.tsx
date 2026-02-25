'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, getRole } from '@/lib/api'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const token = getToken()
    const role = getRole()
    if (!token) {
      router.push('/login')
    } else if (role === 'merchant') {
      router.push('/merchant')
    } else if (role === 'reviewer') {
      router.push('/reviewer')
    }
  }, [])

  return <div style={{ padding: 40 }}>Загрузка...</div>
}