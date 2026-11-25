export type BrandingData = { logo?: string; name: string; document?: string; role?: string; council?: string; councilNumber?: string }
export type Account = { id: string; cpf: string; name: string; role: 'admin' | 'user'; active: number }
export type Session = { user: Account; branding: BrandingData }
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 401 && path !== 'login' && path !== 'me') window.dispatchEvent(new Event('cnis-session-expired'))
    throw new Error(result.error || 'Não foi possível concluir a solicitação.')
  }
  return result
}
