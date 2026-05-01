import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="content-page">
      <div className="content-card">
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', marginBottom: 28 }}>
          <span className="brand" style={{ fontSize: 18, color: 'var(--cobalt)' }}>Konesans</span>
          <span className="brand" style={{ fontSize: 18, color: 'var(--gold)' }}>+</span>
        </Link>

        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12 }}>
          Politique de confidentialité
        </p>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 42px)', color: 'var(--ink)', marginBottom: 14, letterSpacing: '-0.03em' }}>
          Vos données sont utilisées pour faire fonctionner la plateforme de manière claire et responsable.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.8, marginBottom: 28 }}>
          Konesans+ collecte uniquement les informations nécessaires à l’authentification, au positionnement scolaire, aux classements et aux communications que vous avez choisies.
        </p>

        <div style={{ display: 'grid', gap: 24 }}>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>1. Données collectées</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Nous conservons les informations utiles à votre compte: identité, adresse e-mail, classe, section, établissement, résultats de quiz et de duel, ainsi que vos préférences de contact. En cas de connexion avec Google, seules les données de base nécessaires à la création du compte sont utilisées.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>2. Usage des données</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Ces données servent à sécuriser l’accès, afficher le bon niveau scolaire, établir les classements, suivre vos performances et améliorer l’expérience globale. Les communications promotionnelles ne sont envoyées qu’aux utilisateurs qui l’ont explicitement accepté.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>3. Partage et visibilité</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Vos données personnelles ne sont pas destinées à être exposées publiquement hors des besoins stricts du service. Les espaces d’administration et de modération sont réservés aux personnes autorisées.
            </p>
          </section>
          <section>
            <h2 style={{ fontSize: 18, color: 'var(--cobalt)', marginBottom: 8 }}>4. Vos choix</h2>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              Vous pouvez mettre à jour votre profil et vos préférences de contact depuis votre espace. Pour toute demande liée à la protection ou à la suppression de vos données, vous pouvez contacter l’équipe Konesans+.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}