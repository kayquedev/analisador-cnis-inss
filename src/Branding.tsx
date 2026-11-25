import { createContext, useContext, useState, type ReactNode } from 'react'

const key = 'kode-cnis-branding-v1'
type Branding = { logo?: string; name: string; document?: string; role?: string; council?: string; councilNumber?: string }
const initial = (): Branding => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (value && typeof value.name === 'string' && (!value.logo || /^data:image\/(png|jpeg|webp);base64,/.test(value.logo))) return value
  } catch { /* Use default branding when storage is unavailable. */ }
  return { name: 'KODE CNIS' }
}
const Context = createContext<{ branding: Branding; save: (value: Branding) => void }>({ branding: { name: 'KODE CNIS' }, save: () => {} })
export const useBranding = () => useContext(Context)
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(initial)
  const save = (value: Branding) => { localStorage.setItem(key, JSON.stringify(value)); setBranding(value) }
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
    <p>Personalize a logo e a identificação do responsável. Todos os campos são opcionais. Somente os dados preenchidos aparecem no cabeçalho do PDF. A configuração fica salva neste navegador.</p>
    <div className="branding-preview"><img src={logo || '/kode-cnis.png'} alt="Prévia da logo"/></div>
    <label>Nome da empresa ou profissional (opcional)<input value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label>
    <label>CPF / CNPJ (opcional)<input value={details.document} maxLength={30} onChange={event => setDetails({ ...details, document: event.target.value })}/></label>
    <label>Cargo (opcional)<input value={details.role} maxLength={100} onChange={event => setDetails({ ...details, role: event.target.value })}/></label>
    <label>Conselho de classe (opcional)<input placeholder="Ex.: CRESS, OAB" value={details.council} maxLength={80} onChange={event => setDetails({ ...details, council: event.target.value })}/></label>
    <label>Número do conselho de classe (opcional)<input placeholder="Ex.: 31029 - MG" value={details.councilNumber} maxLength={60} onChange={event => setDetails({ ...details, councilNumber: event.target.value })}/></label>
    <label>Logo personalizada (opcional)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={reading} onChange={event => { void choose(event.target.files?.[0]) }}/></label>
    <small>PNG, JPG ou WebP · até 2 MB. Prefira fundo transparente ou branco.</small>
    <div className="branding-actions"><button disabled={reading} onClick={() => { try { save({ name: name.trim(), logo, document: details.document.trim(), role: details.role.trim(), council: details.council.trim(), councilNumber: details.councilNumber.trim() }); setMessage('Identidade salva e aplicada.') } catch { setMessage('Não foi possível salvar. Verifique o espaço e as permissões do navegador.') } }}>Salvar identidade</button><button disabled={reading} onClick={() => { try { save({ name: 'KODE CNIS' }); setLogo(undefined); setName('KODE CNIS'); setDetails({ document: '', role: '', council: '', councilNumber: '' }); setMessage('Identidade padrão restaurada.') } catch { setMessage('Não foi possível restaurar a identidade.') } }}>Restaurar KODE CNIS</button></div><p role="status">{reading ? 'Lendo imagem…' : message}</p>
  </section>
}
