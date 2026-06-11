import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SponsorsSection from '../components/SponsorsSection'
import KonesansLogo from '../components/KonesansLogo'
import { userHome } from '../auth/authRules'
import { apiCall } from '../api/client'

type WeeklyLeaderboardRow = {
  userId: string
  studentName: string
  winCount: number
  totalCorrectAnswers: number
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [topStudents, setTopStudents] = useState<WeeklyLeaderboardRow[]>([])
  const navLinks = [['À propos', '#about'], ['Fonctionnalités', '#features'], ['Parcours', '#how']] as const

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight - 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    apiCall<WeeklyLeaderboardRow[]>('/leaderboard/weekly')
      .then((rows) => setTopStudents(rows.slice(0, 3)))
      .catch(() => setTopStudents([]))
  }, [])

  const handleStudentCta = () => {
    if (user) navigate(userHome(user))
    else navigate('/register')
  }

  const handleLogin = () => {
    if (user) navigate(userHome(user))
    else navigate('/login')
  }

  const onDark = !scrolled

  return (
    <div id="top" className="landing-shell">

      {/* ── NAVBAR ── */}
      <nav className="landing-navbar" style={{ transition: 'padding 0.35s' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{
            borderRadius: 20,
            background: scrolled ? 'rgba(247,244,238,0.94)' : 'rgba(10,24,54,0.38)',
            backdropFilter: 'blur(14px)',
            border: `1px solid ${scrolled ? 'rgba(22,36,71,0.08)' : 'rgba(255,255,255,0.12)'}`,
            boxShadow: scrolled ? '0 14px 42px rgba(14,22,38,0.10)' : '0 18px 48px rgba(7,14,28,0.24)',
            transition: 'all 0.35s',
          }} className="landing-nav-shell">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <KonesansLogo size={36} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <span className="brand" style={{ fontSize: 19, color: onDark ? '#fff' : 'var(--cobalt)', transition: 'color 0.35s' }}>Konesans</span>
              <span className="brand" style={{ fontSize: 19, color: 'var(--gold)' }}>+</span>
            </div>
            <div className="hidden md:flex" style={{ alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 999, background: onDark ? 'rgba(255,255,255,0.08)' : 'rgba(22,36,71,0.06)', border: `1px solid ${onDark ? 'rgba(255,255,255,0.08)' : 'rgba(22,36,71,0.08)'}` }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--gold)', boxShadow: '0 0 0 4px rgba(201,145,36,0.12)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: onDark ? 'rgba(255,255,255,0.72)' : 'var(--cobalt)' }}>Arena en direct</span>
            </div>
          </div>
          <div className="hidden md:flex" style={{ gap: 10, padding: '6px', borderRadius: 999, background: onDark ? 'rgba(255,255,255,0.05)' : 'rgba(22,36,71,0.04)', border: `1px solid ${onDark ? 'rgba(255,255,255,0.08)' : 'rgba(22,36,71,0.06)'}` }}>
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} style={{ textDecoration: 'none', color: onDark ? 'rgba(255,255,255,0.72)' : 'var(--ink-2)', transition: 'all 0.35s', letterSpacing: '0.01em', fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 999 }}>
                {label}
              </a>
            ))}
          </div>
          <div className="landing-nav-actions" style={{ alignItems: 'center' }}>
            {user ? (
              <>
                <span style={{ fontSize: 13, color: onDark ? 'rgba(255,255,255,0.52)' : 'var(--ink-3)', transition: 'color 0.35s', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.firstName}</span>
                <button
                  onClick={() => navigate(userHome(user))}
                  className="btn btn-sm"
                  style={{ color: onDark ? 'rgba(255,255,255,0.86)' : 'var(--ink-2)', border: `1px solid ${onDark ? 'rgba(255,255,255,0.16)' : 'rgba(22,36,71,0.08)'}`, background: onDark ? 'rgba(255,255,255,0.04)' : '#fff', transition: 'all 0.35s', boxShadow: onDark ? 'none' : '0 10px 22px rgba(16,22,36,0.06)' }}
                >Tableau de bord</button>
                <button onClick={() => { logout(); navigate('/') }} className="btn btn-gold btn-sm" style={{ boxShadow: '0 12px 24px rgba(201,145,36,0.22)' }}>Déconnexion</button>
              </>
            ) : (
              <>
                <button
                  onClick={handleLogin}
                  className="btn btn-sm landing-nav-button"
                  style={{ color: onDark ? 'rgba(255,255,255,0.86)' : 'var(--ink-2)', border: `1px solid ${onDark ? 'rgba(255,255,255,0.16)' : 'rgba(22,36,71,0.08)'}`, background: onDark ? 'rgba(255,255,255,0.04)' : '#fff', transition: 'all 0.35s', boxShadow: onDark ? 'none' : '0 10px 22px rgba(16,22,36,0.06)' }}
                >Connexion</button>
                <button onClick={handleStudentCta} className="btn btn-gold btn-sm landing-nav-button" style={{ boxShadow: '0 12px 24px rgba(201,145,36,0.22)' }}>S'inscrire</button>
              </>
            )}
          </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="landing-hero" style={{ background: 'var(--cobalt)', color: '#fff', display: 'flex', alignItems: 'center' }}>
        <div className="responsive-split-panel" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>

          {/* LEFT: text */}
          <div>
            <p className="overline" style={{ marginBottom: 24 }}>Génie scolaire en ligne</p>
            <h1 className="display landing-hero-title" style={{ letterSpacing: '-0.03em', marginBottom: 18, color: '#fff' }}>
              La plateforme haïtienne<br />
              de <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>génie scolaire</em><br />
              en ligne.
            </h1>
            <p className="landing-hero-copy" style={{ color: 'rgba(255,255,255,0.58)' }}>
              Konesans+ transforme l'esprit du génie scolaire en une expérience numérique claire: manches de questions, affrontements en direct, classement hebdomadaire et reconnaissance des meilleurs élèves, de la 6e AF à la NS4.
            </p>
            <div className="landing-hero-cta">
              <button onClick={handleStudentCta} className="btn btn-gold btn-lg">Créer mon compte</button>
              <a href="#about" className="btn btn-lg" style={{ color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', textDecoration: 'none' }}>Découvrir la plateforme</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              {[{ v: '500+', l: 'Questions' }, { v: 'Hebdo', l: 'Classement' }, { v: 'En direct', l: 'Duels' }].map((s, i) => (
                <div key={s.l} style={{ paddingRight: 32, paddingLeft: i > 0 ? 32 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <div className="display" style={{ fontSize: 24, color: '#fff', letterSpacing: '-0.03em' }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: demo cards */}
          <div className="hidden md:block">
            {/* Live duel card */}
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '24px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                Duel en direct · Sciences
              </p>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 20 }}>
                Jean R. 8 · 7 Marie C.
              </p>
              <div className="responsive-card-grid" style={{ gap: 10 }}>
                {[{ l: 'Élève 1', v: 'Jean R.', active: true }, { l: 'Élève 2', v: 'Marie C.', active: false }, { l: 'Public', v: '214', active: false }, { l: 'Prime', v: '500 HTG', active: false }].map(opt => (
                  <div key={opt.l} style={{ padding: '12px 16px', borderRadius: 6, background: opt.active ? 'var(--gold)' : 'rgba(255,255,255,0.06)', border: `1px solid ${opt.active ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}`, fontSize: 14, color: opt.active ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: opt.active ? 600 : 400, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{opt.l}</span>{opt.v}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                  <div style={{ width: '92%', height: '100%', background: 'var(--gold)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Finale</span>
              </div>
            </div>

            {/* Leaderboard card */}
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '24px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                Podium national
              </p>
              {[{ rank: 1, name: 'Louissa P.', score: 145, gold: true }, { rank: 2, name: 'Peterson J.', score: 132, gold: false }, { rank: 3, name: 'Naika M.', score: 118, gold: false }].map(entry => (
                <div key={entry.rank} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: entry.rank < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', width: 16 }}>{entry.rank}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{entry.name}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: entry.gold ? 'var(--gold)' : 'rgba(255,255,255,0.6)' }}>{entry.score}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      <section style={{ background: 'var(--paper)', padding: '0 6vw 32px' }}>
        <div style={{ maxWidth: 1100, margin: '-38px auto 0', position: 'relative', zIndex: 2 }}>
          <div style={{ borderRadius: 28, background: '#fff', border: '1px solid var(--rule)', boxShadow: '0 24px 60px rgba(15,32,64,0.10)', padding: '24px clamp(18px, 3vw, 30px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                  Étudiants de la semaine
                </p>
                <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                  Les trois meilleurs talents du génie scolaire de la semaine, selon les victoires et la qualité des réponses.
                </p>
              </div>
              <a href="/login" style={{ textDecoration: 'none' }}>
                <span className="btn btn-ghost btn-sm">Voir le classement complet</span>
              </a>
            </div>

            {topStudents.length > 0 ? (
              <div className="responsive-three-col" style={{ gap: 14 }}>
                {topStudents.map((student, index) => {
                  const rank = index + 1
                  const accent = rank === 1 ? 'var(--gold)' : rank === 2 ? 'var(--cobalt)' : '#8A6A43'

                  return (
                    <div key={student.userId} style={{ background: rank === 1 ? 'linear-gradient(180deg, rgba(201,145,36,0.14), rgba(255,255,255,1))' : '#fff', border: `1px solid ${rank === 1 ? 'rgba(201,145,36,0.28)' : 'var(--rule)'}`, borderRadius: 22, padding: '20px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {rank === 1 ? '1re place' : rank === 2 ? '2e place' : '3e place'}
                        </span>
                        <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rank === 1 ? accent : '#fff', border: `1px solid ${accent}`, color: rank === 1 ? '#fff' : accent, fontSize: 15, fontWeight: 800 }}>
                          {rank}
                        </span>
                      </div>

                      <p className="display" style={{ margin: '0 0 8px', fontSize: 24, color: 'var(--ink)', lineHeight: 1.2 }}>
                        {student.studentName}
                      </p>
                      <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                        Performance hebdomadaire remarquée sur le classement national.
                      </p>

                      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <p className="display" style={{ margin: 0, fontSize: 30, color: accent, lineHeight: 1 }}>
                            {student.winCount}
                          </p>
                          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                            Victoires
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                            {student.totalCorrectAnswers}
                          </p>
                          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
                            Bonnes réponses
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ borderRadius: 20, border: '1px solid var(--rule)', background: 'var(--surface)', padding: '22px 18px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-3)', lineHeight: 1.7 }}>
                  Le podium hebdomadaire apparaîtra ici dès que les premiers résultats de la semaine seront disponibles.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── À PROPOS ── */}
      <section id="about" className="landing-section" style={{ background: 'var(--paper)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 72 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap' }}>01 — À propos</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>

          <div className="about-grid">
            <div>
              <blockquote style={{ margin: '0 0 24px', fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: 'italic', fontSize: 'clamp(20px,2.4vw,30px)', color: 'var(--cobalt)', lineHeight: 1.45, letterSpacing: '-0.02em' }}>
                "Faire de l'excellence scolaire une expérience visible, motivante et reconnue."
              </blockquote>
              <p style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 600 }}>
                — Johnley-Roosevelt Lorvil, Fondateur de Konesans+
              </p>
              <p style={{ margin: '18px 0 0', maxWidth: 520, fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                Konesans+ est porté par une ambition simple: faire vivre le génie scolaire haïtien en ligne, avec un cadre moderne pour apprendre, s'affronter et faire reconnaître sa progression.
              </p>
            </div>
            <div className="about-side-panel">
              {[
                { n: '01', t: 'Accessible', d: 'Inscription gratuite et accès simplifié pour les élèves haïtiens, où qu’ils se trouvent.' },
                { n: '02', t: 'Structuré', d: 'Règles claires, parcours lisible et classement compréhensible, comme dans un génie scolaire bien organisé.' },
                { n: '03', t: 'Ancré localement', d: 'Contenus alignés sur le programme haïtien, de la 6e AF à la NS4.' },
              ].map((item, i, arr) => (
                <div key={item.n} style={{ paddingBottom: i < arr.length - 1 ? 28 : 0, marginBottom: i < arr.length - 1 ? 28 : 0, borderBottom: i < arr.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.1em', paddingTop: 3, minWidth: 20 }}>{item.n}</span>
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{item.t}</p>
                      <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.75 }}>{item.d}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FONCTIONNALITÉS ── */}
      <section id="features" className="landing-section" style={{ background: 'var(--stone)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap' }}>02 — Fonctionnalités</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>
          <div className="features-grid">
            {[
              { n: '01', t: 'Manches académiques', d: "Des manches de questions par matière pour réviser et se préparer dans l'esprit du génie scolaire." },
              { n: '02', t: 'Classement hebdomadaire', d: 'Un classement remis à jour chaque semaine pour valoriser la régularité, la victoire et la progression.' },
              { n: '03', t: 'Podium visible', d: 'Les meilleurs profils du génie scolaire gagnent en visibilité sans faire disparaître le reste du classement.' },
              { n: '04', t: 'Affrontements en direct', d: 'Affrontez un autre élève sur une matière donnée dans un format compétitif, clair et chronométré.' },
            ].map((f, i) => (
              <div key={f.n} style={{ background: [0, 3].includes(i) ? '#fff' : 'var(--stone)', padding: '40px 36px' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 18 }}>{f.n}</span>
                <h3 className="display" style={{ fontSize: 24, color: 'var(--cobalt)', marginBottom: 12 }}>{f.t}</h3>
                <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.8 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SponsorsSection />

      {/* ── COMMENT ÇA MARCHE ── */}
      <section id="how" className="landing-section" style={{ background: 'var(--cobalt)', color: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 72 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', whiteSpace: 'nowrap' }}>03 — Processus</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>
          <div className="steps-row">
            {[
              { s: '01', t: 'Créez votre compte', d: 'Inscrivez-vous avec vos informations scolaires et confirmez votre adresse e-mail en quelques minutes.' },
              { s: '02', t: 'Préparez vos manches', d: 'Choisissez une matière, lancez un entraînement et développez vos réflexes avant les confrontations.' },
              { s: '03', t: 'Entrez dans le génie', d: 'Participez aux affrontements, améliorez votre rang et visez le podium hebdomadaire.' },
            ].map((s, i) => (
              <div key={s.s} style={{ padding: '48px 36px 48px 0', paddingLeft: i > 0 ? 36 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                <div className="display" style={{ fontSize: 56, color: 'rgba(255,255,255,0.06)', lineHeight: 1, marginBottom: 12, letterSpacing: '-0.05em' }}>{s.s}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 10 }}>{s.t}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.85 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="landing-section" style={{ paddingTop: '112px', paddingBottom: '112px', background: 'var(--paper)', borderTop: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            position: 'relative',
            borderRadius: 30,
            padding: 'clamp(28px, 4vw, 52px)',
            background: 'var(--cobalt)',
            border: '1px solid rgba(22,36,71,0.16)',
            boxShadow: '0 20px 44px rgba(18,28,52,0.14)',
          }}>
            <div className="responsive-split-panel" style={{ position: 'relative', gap: 26, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', marginBottom: 22, width: 'fit-content' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--gold)', boxShadow: '0 0 0 4px rgba(201,145,36,0.18)' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)' }}>Prêt pour le génie scolaire national</span>
                </div>

                <h2 className="display" style={{ fontSize: 'clamp(36px,5vw,68px)', color: '#fff', marginBottom: 20, letterSpacing: '-0.04em', lineHeight: 1.02, maxWidth: 620 }}>
                  Votre prochaine performance<br />
                  peut vous rapprocher du <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>podium</em><br />
                  national.
                </h2>

                <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.82)', lineHeight: 1.8, maxWidth: 520, margin: '0 0 30px' }}>
                  Inscription gratuite, génie scolaire cadré, et reconnaissance visible pour les meilleurs profils.
                </p>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={handleStudentCta} className="btn btn-gold btn-lg" style={{ boxShadow: '0 16px 30px rgba(201,145,36,0.24)' }}>
                    Commencer maintenant
                  </button>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', letterSpacing: '0.03em' }}>
                    Sans carte bancaire. Accès immédiat.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
                  {['Génie scolaire en ligne', 'Affrontements en direct', 'Classement national'].map((item) => (
                    <span key={item} style={{ padding: '9px 13px', borderRadius: 999, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.16)', fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 24, padding: '24px 22px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
                    Pourquoi rejoindre Konesans+
                  </p>
                  <p style={{ margin: 0, fontSize: 20, lineHeight: 1.45, color: '#fff' }}>
                    Prenez vos repères dès maintenant avant les prochaines manches, confrontations et mises à jour du classement.
                  </p>
                </div>

                <div className="responsive-card-grid" style={{ gap: 14 }}>
                  {[
                    { value: 'Top 3', label: 'Visibilité hebdo' },
                    { value: 'Direct', label: 'Défis en temps réel' },
                    { value: 'Primes', label: 'Récompenses' },
                    { value: 'National', label: 'Portée du classement' },
                  ].map((item) => (
                    <div key={item.label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '18px 16px' }}>
                      <p className="display" style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.04em', color: '#fff' }}>{item.value}</p>
                      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: 'var(--cobalt)', padding: '64px 6vw 28px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', padding: '0 0 22px', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>
                Konesans+
              </p>
              <p style={{ margin: 0, fontSize: 15, color: '#fff', lineHeight: 1.7 }}>
                La plateforme de génie scolaire en ligne conçue pour valoriser les élèves haïtiens.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Éducation', 'Compétition', 'Reconnaissance'].map((item) => (
                <span key={item} style={{ padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', fontSize: 12, color: 'rgba(255,255,255,0.86)' }}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, paddingBottom: 36, borderBottom: '1px solid rgba(255,255,255,0.14)' }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '24px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: 18 }}>
                <span className="brand" style={{ fontSize: 20, color: '#fff' }}>Konesans</span>
                <span className="brand" style={{ fontSize: 20, color: 'var(--gold)' }}>+</span>
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,0.82)', maxWidth: 320 }}>
                Plateforme haïtienne de génie scolaire en ligne, avec manches académiques, affrontements et classement national.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['6e AF à NS4', 'Classement national', 'Affrontements en direct'].map((item) => (
                  <span key={item} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
                    {item}
                  </span>
                ))}
              </div>
              <p style={{ margin: '18px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
                Port-au-Prince, Haïti
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '24px 22px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.66)' }}>
                Navigation
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {[['Accueil', '#top'], ['À propos', '#about'], ['Fonctionnalités', '#features'], ['Comment ça marche', '#how']].map(([label, href]) => (
                  <a key={href} href={href} style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(201,145,36,0.9)', flexShrink: 0 }} />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '24px 22px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.66)' }}>
                Plateforme
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                <a href="#features" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>Manches académiques</a>
                <a href="#features" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>Affrontements en direct</a>
                <a href="#features" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>Classements nationaux</a>
                <a href="#sponsors" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>Sponsors et soutien</a>
              </div>
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>
                  Engagement
                </p>
                <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.84)', lineHeight: 1.7 }}>
                  Une expérience claire, équitable et évolutive au service du génie scolaire haïtien.
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '24px 22px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.66)' }}>
                Contact & légal
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>Email</p>
                  <a href="mailto:contact@konesansplus.ht" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                    contact@konesansplus.ht
                  </a>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>Téléphone</p>
                  <a href="tel:+50941312777" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                    +509 41 31 27 77
                  </a>
                </div>
                <Link to={user ? userHome(user) : '/login'} style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
                  {user ? 'Tableau de bord' : 'Connexion'}
                </Link>
                {!user && (
                  <Link to="/register" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                    Créer un compte
                  </Link>
                )}
                <Link to="/terms" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                  Conditions d'utilisation
                </Link>
                <Link to="/privacy" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                  Politique de confidentialité
                </Link>
                <a href="#sponsors" style={{ color: 'rgba(255,255,255,0.90)', textDecoration: 'none', fontSize: 14 }}>
                  Partenariats
                </a>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, paddingTop: 22 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.34)', letterSpacing: '0.04em' }}>
              © 2026 Konesans+. Tous droits réservés.
            </p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <a href="#about" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: 12 }}>Vision</a>
              <a href="#sponsors" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: 12 }}>Sponsors</a>
              <Link to="/terms" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: 12 }}>Conditions</Link>
              <Link to="/privacy" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: 12 }}>Confidentialité</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}


