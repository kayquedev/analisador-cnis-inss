import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, type BrandingData } from './account'
import { AccountSettings, useAuth } from './Auth'

const Context = createContext<{ branding: BrandingData; save: (value: BrandingData) => Promise<void> }>({ branding: { name: 'KODE CNIS' }, save: async () => {} })
// oxlint-disable-next-line react/only-export-components
export const useBranding = () => useContext(Context)
export function BrandingProvider({ children, initialBranding }: { children: ReactNode; initialBranding?: BrandingData }) {
  const { session } = useAuth()
  const [branding, setBranding] = useState<BrandingData>(initialBranding || session?.branding || { name: 'KODE CNIS' })
  const save = async (value: BrandingData) => { const result = await api<{ branding: BrandingData }>('branding', 'PUT', value); setBranding(result.branding) }
  return <Context.Provider value={{ branding, save }}>{children}</Context.Provider>
}
export function BrandLogo({ className }: { className?: string }) {
  const { branding } = useBranding()
  return <img src={branding.logo || '/kode-cnis.png'} alt={branding.name} className={className}/>
}
export function Administration() {
  const { branding, save } = useBranding()
  const [name, setName] = useState(branding.name)
  const [logo, setLogo] = useState(branding.logo)
  const [details, setDetails] = useState({ document: branding.document || '', role: branding.role || '', council: branding.council || '', councilNumber: branding.councilNumber || '' })
  const [message, setMessage] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const persist = async (reset = false) => {
    setSaving(true); setMessage('')
    try {
      await save(reset ? { name: 'KODE CNIS' } : { name: name.trim(), logo, document: details.document.trim(), role: details.role.trim(), council: details.council.trim(), councilNumber: details.councilNumber.trim() })
      if (reset) { setLogo(undefined); setName('KODE CNIS'); setDetails({ document: '', role: '', council: '', councilNumber: '' }) }
      setMessage(reset ? 'Identidade padrão restaurada para sua conta.' : 'Identidade salva na sua conta.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.') } finally { setSaving(false) }
  }
  const choose = async (file?: File) => {
    if (!file) return
    setMessage('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setMessage('Selecione PNG, JPG ou WebP de até 2 MB.'); return }
    setReading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = reject; image.src = data })
      setLogo(data)
    } catch { setMessage('Não foi possível ler essa imagem.') } finally { setReading(false) }
  }
  return <section className="content-section branding-admin"><div className="section-heading"><div><span>Administração</span><h2>Identidade da ferramenta e dos relatórios</h2></div></div>
    <p>Personalize sua logo e identificação. Todos os campos são opcionais. Somente os dados preenchidos aparecem no cabeçalho do PDF. A identidade fica salva na sua conta, disponível em outros dispositivos após o login.</p>
    <div className="branding-preview"><img src={logo || '/kode-cnis.png'} alt="Prévia da logo"/></div>
    <label>Nome da empresa ou profissional (opcional)<input value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label>
    <label>CPF / CNPJ (opcional)<input value={details.document} maxLength={30} onChange={event => setDetails({ ...details, document: event.target.value })}/></label>
    <label>Cargo (opcional)<input value={details.role} maxLength={100} onChange={event => setDetails({ ...details, role: event.target.value })}/></label>
    <label>Conselho de classe (opcional)<input placeholder="Ex.: CRESS, OAB" value={details.council} maxLength={80} onChange={event => setDetails({ ...details, council: event.target.value })}/></label>
    <label>Número do conselho de classe (opcional)<input placeholder="Ex.: 31029 - MG" value={details.councilNumber} maxLength={60} onChange={event => setDetails({ ...details, councilNumber: event.target.value })}/></label>
    <label>Logo personalizada (opcional)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={reading} onChange={event => { void choose(event.target.files?.[0]) }}/></label>
    <small>PNG, JPG ou WebP · até 2 MB. Prefira fundo transparente ou branco.</small>
    <div className="branding-actions"><button disabled={reading || saving} onClick={() => void persist()}>Salvar identidade</button><button disabled={reading || saving} onClick={() => void persist(true)}>Restaurar KODE CNIS</button></div><p role="status">{reading ? 'Lendo imagem…' : message}</p>
    <AccountSettings/>
  </section>
}
