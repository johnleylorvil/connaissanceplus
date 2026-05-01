import { useEffect, useState } from 'react'
import { apiCall } from '../api/client'

type PublicSponsor = {
  id: string
  name: string
  logoUrl: string
  websiteUrl: string | null
  displayOrder: number
}

export default function SponsorsSection() {
  const [sponsors, setSponsors] = useState<PublicSponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false

    apiCall<PublicSponsor[]>('/public/sponsors')
      .then((data) => {
        if (cancelled) return
        setSponsors(data)
      })
      .catch(() => {
        if (cancelled) return
        setHasError(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="sponsors" style={{ background: 'var(--paper)', padding: '96px 6vw', borderTop: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap' }}>
            Nos sponsors
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        {loading && (
          <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Chargement des partenaires…</p>
        )}

        {!loading && (hasError || sponsors.length === 0) && (
          <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Les partenaires officiels seront annoncés prochainement.</p>
        )}

        {!loading && sponsors.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {sponsors.map((sponsor) => {
              const content = (
                <div style={{ background: '#fff', border: '1px solid var(--rule)', borderRadius: 8, padding: '18px 16px', minHeight: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  <img src={sponsor.logoUrl} alt={sponsor.name} style={{ maxWidth: '100%', maxHeight: 46, objectFit: 'contain' }} />
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>{sponsor.name}</p>
                </div>
              )

              if (sponsor.websiteUrl) {
                return (
                  <a key={sponsor.id} href={sponsor.websiteUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    {content}
                  </a>
                )
              }

              return <div key={sponsor.id}>{content}</div>
            })}
          </div>
        )}
      </div>
    </section>
  )
}
