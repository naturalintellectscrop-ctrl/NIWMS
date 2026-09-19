import { useAuthStore } from '@/store/auth-store'

class ApiError extends Error {
  status: number
  data: unknown
  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = useAuthStore.getState().token
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// Auto-logout on 401 (expired/invalid token)
function handleUnauthorized(status: number) {
  if (status === 401) {
    useAuthStore.getState().logout()
  }
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers, method: 'GET' })
  if (!response.ok) {
    handleUnauthorized(response.status)
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }
  return response.json()
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers, method: 'POST', body: JSON.stringify(body) })
  if (!response.ok) {
    handleUnauthorized(response.status)
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }
  return response.json()
}

export async function apiPut<T = unknown>(url: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers, method: 'PUT', body: JSON.stringify(body) })
  if (!response.ok) {
    handleUnauthorized(response.status)
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }
  return response.json()
}

export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers, method: 'PATCH', body: JSON.stringify(body) })
  if (!response.ok) {
    handleUnauthorized(response.status)
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }
  return response.json()
}

export async function apiDelete(url: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(url, { headers, method: 'DELETE' })
  if (!response.ok) {
    handleUnauthorized(response.status)
    const data = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }
}

export { ApiError }
