import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import AccountSecurity from '../account/AccountSecurity'
import { getIntegrations, getSettings, updateSettings, type IntegrationStatus, type PlatformSettings } from './adminSettingsApi'

type Mode = 'organization' | 'integrations' | 'security' | 'global'
type Props = { token: string; mode: Mode }
const integrationLabels: Record<Exclude<keyof IntegrationStatus, 'generatedAt'>, string> = { openai: 'OpenAI', google: 'Google OAuth', email: 'Serveur email', sponsorStorage: 'Stockage sponsors', livekit: 'LiveKit', youtube: 'YouTube Live' }

export default function AdminSettingsView({ token, mode }: Props) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'integrations') setIntegrations(await getIntegrations(token))
      else setSettings(await getSettings(token))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de charger les paramètres.') }
    finally { setLoading(false) }
  }, [mode, token])
  useEffect(() => { void load() }, [load])

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!settings) return
    setSaving(true); setError(''); setMessage('')
    try { setSettings(await updateSettings(token, settings)); setMessage('Paramètres enregistrés et appliqués.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.') }
    finally { setSaving(false) }
  }

  const title = mode === 'organization' ? 'Organisation' : mode === 'integrations' ? 'Intégrations' : mode === 'security' ? 'Sécurité' : 'Configuration globale'
  if (loading) return <div className="card">Chargement des paramètres…</div>
  const heading = <><p className="overline">Paramètres</p><h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', margin: '6px 0 20px' }}>{title}</h1></>
  const errorBox = error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Réessayer</button></div>
  if (mode === 'integrations') return <div>{heading}{errorBox}<Integrations value={integrations} /></div>
  if (!settings) return <div>{heading}{errorBox}</div>
  if (mode === 'security') return <div>{heading}{errorBox}{message && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{message}</div>}<form onSubmit={save}><Security value={settings} setValue={setSettings} /><button className="btn btn-primary" disabled={saving} style={{ marginTop: 16 }}>{saving ? 'Enregistrement…' : 'Enregistrer la politique'}</button></form><div style={{ marginTop: 18 }}><AccountSecurity token={token} compact minimumLength={settings.minimumPasswordLength} /></div></div>
  return <div>{heading}{errorBox}<form onSubmit={save}>{message && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{message}</div>}{mode === 'organization' && <Organization value={settings} setValue={setSettings} />}{mode === 'global' && <Global value={settings} setValue={setSettings} />}<button className="btn btn-primary" disabled={saving} style={{ marginTop: 16 }}>{saving ? 'Enregistrement…' : 'Enregistrer et appliquer'}</button></form></div>
}

function Organization({ value, setValue }: EditorProps) { return <div className="card" style={grid}><Field label="Nom de la plateforme"><input required className="field-input" value={value.organizationName} onChange={(e) => setValue({ ...value, organizationName: e.target.value })} /></Field><Field label="Raison sociale"><input className="field-input" value={value.legalName ?? ''} onChange={(e) => setValue({ ...value, legalName: e.target.value || null })} /></Field><Field label="Email de support"><input type="email" className="field-input" value={value.supportEmail ?? ''} onChange={(e) => setValue({ ...value, supportEmail: e.target.value || null })} /></Field><Field label="Site web"><input type="url" className="field-input" placeholder="https://" value={value.websiteUrl ?? ''} onChange={(e) => setValue({ ...value, websiteUrl: e.target.value || null })} /></Field><Field label="Pays"><input className="field-input" value={value.country} onChange={(e) => setValue({ ...value, country: e.target.value })} /></Field><Field label="Fuseau horaire"><input required className="field-input" value={value.timezone} onChange={(e) => setValue({ ...value, timezone: e.target.value })} /></Field><Field label="URL du logo"><input type="url" className="field-input" placeholder="https://" value={value.logoUrl ?? ''} onChange={(e) => setValue({ ...value, logoUrl: e.target.value || null })} /></Field></div> }
function Security({ value, setValue }: EditorProps) { return <div className="card"><h2 style={{ marginBottom: 6 }}>Politique des mots de passe</h2><p style={{ color: 'var(--ink-3)', marginBottom: 16 }}>Cette règle s’applique aux nouvelles inscriptions et aux changements de mot de passe.</p><Field label="Longueur minimale"><input type="number" min={6} max={32} className="field-input" style={{ maxWidth: 180 }} value={value.minimumPasswordLength} onChange={(e) => setValue({ ...value, minimumPasswordLength: Number(e.target.value) })} /></Field></div> }
function Global({ value, setValue }: EditorProps) { return <div className="card"><h2 style={{ marginBottom: 6 }}>Fonctionnalités de la plateforme</h2><p style={{ color: 'var(--ink-3)', marginBottom: 16 }}>Les changements sont appliqués immédiatement par le serveur.</p><Toggle label="Nouvelles inscriptions" checked={value.registrationEnabled} onChange={(checked) => setValue({ ...value, registrationEnabled: checked })} /><Toggle label="Tuteur IA pédagogique" checked={value.tutorEnabled} onChange={(checked) => setValue({ ...value, tutorEnabled: checked })} /><Toggle label="Concours de Correspondance" checked={value.correspondenceEnabled} onChange={(checked) => setValue({ ...value, correspondenceEnabled: checked })} /><Toggle label="Notifications de la plateforme" checked={value.notificationsEnabled} onChange={(checked) => setValue({ ...value, notificationsEnabled: checked })} /></div> }
function Integrations({ value }: { value: IntegrationStatus | null }) { if (!value) return null; return <div className="responsive-two-col" style={{ gap: 12 }}>{(Object.keys(integrationLabels) as Array<Exclude<keyof IntegrationStatus, 'generatedAt'>>).map((key) => { const item = value[key]; return <div className="card" key={key}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><h2>{integrationLabels[key]}</h2><strong style={{ color: item.configured ? 'var(--ok)' : 'var(--error)' }}>{item.configured ? 'Configurée' : 'Incomplète'}</strong></div>{!item.configured && <p style={{ color: 'var(--ink-3)', marginTop: 10 }}>Variables manquantes : {item.missing.join(', ')}</p>}<p style={{ color: 'var(--ink-3)', marginTop: 10, fontSize: 12 }}>Les secrets restent exclusivement dans l’environnement serveur.</p></div> })}</div> }

type EditorProps = { value: PlatformSettings; setValue: (value: PlatformSettings) => void }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="field-label">{label}</span>{children}</label> }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--rule)' }}><strong>{label}</strong><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label> }