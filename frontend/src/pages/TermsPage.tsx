import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <div className="content-page">
      <div className="content-card">
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 28 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
          Conditions d'utilisation
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 42px)', color: 'var(--ink)', marginBottom: 14, letterSpacing: '-0.03em' }}>
          Des règles claires pour une compétition académique sérieuse.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.8, marginBottom: 28 }}>
          En utilisant Konesans+, vous acceptez un cadre conçu pour protéger l'équité des concours, la sécurité des comptes et le respect entre participants.
        </p>

        <div style={{ display: 'grid', gap: 24 }}>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>1. Accès au service</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              La plateforme est destinée en priorité aux élèves et encadrants autorisés. Chaque utilisateur doit fournir des informations exactes lors de l'inscription et préserver la confidentialité de son compte.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>2. Intégrité des compétitions</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Toute tentative de fraude, d'usurpation, d'automatisation abusive ou de perturbation d'un duel peut entraîner la suspension du compte, l'annulation de scores ou l'exclusion d'un événement.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>3. Classements et récompenses</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Les classements, podiums et récompenses sont publiés selon les règles en vigueur sur la plateforme. Konesans+ peut ajuster un résultat en cas d'erreur technique, d'abus ou de non-respect du règlement.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>4. Évolutions du service</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Certaines informations de contact, de partenariat ou d'organisation affichées publiquement peuvent être provisoires pendant la phase de déploiement. Elles pourront être mises à jour à mesure que la plateforme évolue.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}