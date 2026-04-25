import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', padding: '72px 6vw' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', border: '1px solid var(--rule)', padding: '40px clamp(24px, 4vw, 48px)' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 28 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
          Politique de confidentialité
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 42px)', color: 'var(--ink)', marginBottom: 14, letterSpacing: '-0.03em' }}>
          Vos données servent à faire tourner la plateforme, pas à vous profiler.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.8, marginBottom: 28 }}>
          Konesans+ collecte uniquement les informations nécessaires à l'authentification, au positionnement scolaire, au classement académique et aux communications que vous avez acceptées.
        </p>

        <div style={{ display: 'grid', gap: 24 }}>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>1. Données collectées</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Nous stockons votre identité de compte, votre classe scolaire, votre section, votre email, vos résultats de quiz et duel, ainsi que vos préférences de contact. Lors d'une connexion Google, nous récupérons uniquement l'email et les informations de base du profil nécessaires à la création du compte.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>2. Usage des données</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Vos données servent à personnaliser votre expérience académique, sécuriser l'accès, alimenter les classements et suivre vos performances. Les messages promotionnels ne sont envoyés qu'aux utilisateurs qui ont explicitement accepté d'être contactés.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>3. Partage et visibilité</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Les données personnelles ne doivent pas être exposées publiquement hors des besoins stricts du service. Les tableaux de bord administratifs et de modération sont réservés aux rôles autorisés.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>4. Vos choix</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Vous pouvez mettre à jour votre profil et vos préférences de contact depuis votre espace. Pour toute demande liée à la protection des données, contactez l'équipe Konesans+ avant suppression ou anonymisation des informations concernées.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}