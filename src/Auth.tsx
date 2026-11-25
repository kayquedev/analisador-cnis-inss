import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Session } from './account'

const Context = createContext<{ session: Session | null; logout: () => Promise<void> }>({ session: null, logout: async () => {} })
// oxlint-disable-next-line react/only-export-components
export const useAuth = () => useContext(Context)

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [cpf, setCpf] = useState(''); const [password, setPassword] = useState('')
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    api<Session>('me').then(value => { if (active) setSession(value) }).catch(() => {}).finally(() => { if (active) setLoading(false) })
    const expired = () => { setSession(null); setError('Sua sessão expirou. Entre novamente.') }
    const updated = () => { void api<Session>('me').then(setSession).catch(() => {}) }
    window.addEventListener('cnis-session-expired', expired)
    window.addEventListener('cnis-account-updated', updated)
    return () => { active = false; window.removeEventListener('cnis-session-expired', expired); window.removeEventListener('cnis-account-updated', updated) }
  }, [])
  const logout = async () => { await api('logout', 'POST', {}); setSession(null); setPassword(''); setError('') }
  if (loading) return <main className="login-page"><p>Carregando acesso…</p></main>
  if (!session) return <main className="login-page"><form className="login-box" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { setSession(await api<Session>('login', 'POST', { cpf, password })); setPassword('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.') } finally { setBusy(false) } }}>
    <img src="/kode-cnis.png" alt="KODE CNIS"/><h1>Acesse sua conta</h1><p>Entre para analisar o CNIS e emitir relatórios com sua identidade.</p>
    <label>CPF<input autoComplete="username" inputMode="numeric" value={cpf} maxLength={14} onChange={event => setCpf(event.target.value)} required/></label>
    <label>Senha<input type="password" autoComplete="current-password" value={password} maxLength={128} onChange={event => setPassword(event.target.value)} required/></label>
    {error && <p role="alert" className="account-error">{error}</p>}<button disabled={busy} type="submit">{busy ? 'Entrando…' : 'Entrar'}</button><small>Solicite seu acesso ao administrador.</small>
  </form></main>
  return <Context.Provider value={{ session, logout }}><div className="account-bar"><span>{session.user.name} · {session.user.role === 'admin' ? 'Administrador' : 'Usuário'}</span><button onClick={async () => { try { await logout() } catch { window.alert('Não foi possível sair. Tente novamente.') } }}>Sair</button></div>{children}</Context.Provider>
}

export function AccountSettings() {
  const { session } = useAuth()
  const [users, setUsers] = useState<Session['user'][]>([])
  const [form, setForm] = useState({ name: '', cpf: '', password: '', role: 'user' })
  const [currentPassword, setCurrentPassword] = useState(''); const [password, setPassword] = useState('')
  const [resetId, setResetId] = useState(''); const [resetPassword, setResetPassword] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; cpf: string } | null>(null)
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const refresh = async () => setUsers((await api<{ users: Session['user'][] }>('users')).users)
  useEffect(() => { if (session?.user.role === 'admin') api<{ users: Session['user'][] }>('users').then(value => setUsers(value.users)).catch(reason => setMessage(String(reason.message))) }, [session?.user.role])
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(''); try { await action(); setMessage('Alteração salva.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.') } finally { setBusy(false) } }
  return <section className="content-section account-settings"><h2>Acessos e senha</h2><p>Senhas: mínimo de 6 caracteres, com uma letra e um número. Não é obrigatório usar maiúsculas ou símbolos.</p>
    <form onSubmit={event => { event.preventDefault(); void run(async () => { await api('password', 'PUT', { currentPassword, password }); setCurrentPassword(''); setPassword('') }) }}><h3>Alterar minha senha</h3><label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required/></label><label>Nova senha<input type="password" autoComplete="new-password" minLength={6} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{6,}" value={password} onChange={event => setPassword(event.target.value)} required/></label><button disabled={busy}>Salvar senha</button></form>
    {session?.user.role === 'admin' && <><form onSubmit={event => { event.preventDefault(); void run(async () => { await api('users', 'POST', form); setForm({ name: '', cpf: '', password: '', role: 'user' }); await refresh() }) }}><h3>Cadastrar acesso</h3><label>Nome<input maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required/></label><label>CPF<input inputMode="numeric" maxLength={14} value={form.cpf} onChange={event => setForm({ ...form, cpf: event.target.value })} required/></label><label>Senha inicial<input type="password" autoComplete="new-password" minLength={6} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{6,}" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required/></label><label>Perfil<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="user">Usuário</option><option value="admin">Administrador</option></select></label><button disabled={busy}>Cadastrar usuário</button></form>
      <div className="table-wrap"><table><thead><tr><th>Nome / CPF</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}<br/>{user.cpf}</td><td>{user.role === 'admin' ? 'Administrador' : 'Usuário'}</td><td>{user.active ? 'Ativo' : 'Inativo'}</td><td><button disabled={busy} onClick={() => { setEditing({ id: user.id, name: user.name, cpf: user.cpf }); setResetId(''); setMessage('') }}>Editar</button><button disabled={busy || user.id === session.user.id} onClick={() => void run(async () => { await api(`users/${user.id}`, 'PUT', { active: !user.active }); await refresh() })}>{user.active ? 'Desativar' : 'Ativar'}</button><button disabled={busy} onClick={() => { setResetId(user.id); setEditing(null); setResetPassword('') }}>Redefinir senha</button></td></tr>)}</tbody></table></div>
      {editing && <form onSubmit={event => { event.preventDefault(); void run(async () => { await api(`users/${editing.id}`, 'PUT', { name: editing.name, cpf: editing.cpf }); if (editing.id === session.user.id) window.dispatchEvent(new Event('cnis-account-updated')); await refresh(); setEditing(null) }) }}><h3>Editar usuário</h3><p>Ao alterar o CPF, o próximo login será feito com o CPF corrigido. A senha e a identidade visual serão mantidas.</p><label>Nome do usuário<input value={editing.name} maxLength={100} required onChange={event => setEditing({ ...editing, name: event.target.value })}/></label><label>CPF do usuário<input value={editing.cpf} inputMode="numeric" maxLength={14} required onChange={event => setEditing({ ...editing, cpf: event.target.value })}/></label><button disabled={busy}>Salvar alterações</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></form>}
      {resetId && <form onSubmit={event => { event.preventDefault(); void run(async () => { await api(`users/${resetId}`, 'PUT', { password: resetPassword }); setResetId(''); setResetPassword('') }) }}><h3>Redefinir senha de {users.find(user => user.id === resetId)?.name}</h3><label>Nova senha<input type="password" autoComplete="new-password" minLength={6} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{6,}" required value={resetPassword} onChange={event => setResetPassword(event.target.value)}/></label><button disabled={busy}>Confirmar nova senha</button><button type="button" onClick={() => setResetId('')}>Cancelar</button></form>}
    </>}<p role="status">{message}</p></section>
}
