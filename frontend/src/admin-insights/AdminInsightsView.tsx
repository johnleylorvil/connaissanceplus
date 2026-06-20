import type { AdminAlert, AdminInsights, AdminInsightTab, AlertSeverity } from './types'
import './admin-insights.css'

type Props = {
  mode: 'overview' | 'indicators' | 'alerts'
  data: AdminInsights | null
  loading: boolean
  error: string
  onRefresh: () => void
  onNavigate: (action: { tab: AdminInsightTab; subTab?: 'moderation' }) => void
}

const severityLabels: Record<AlertSeverity, string> = {
  critical: 'Critique', warning: 'Avertissement', info: 'Information',
}

function Trend({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="admin-insight-trend neutral">Pas de comparaison</span>
  return <span className={`admin-insight-trend ${value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'}`}>{value > 0 ? '+' : ''}{value}{suffix} vs période précédente</span>
}

function AlertRow({ alert, onNavigate }: { alert: AdminAlert; onNavigate: Props['onNavigate'] }) {
  return (
    <article className={`admin-alert-row ${alert.severity}`}>
      <div className="admin-alert-icon" aria-hidden="true">{alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '!' : 'i'}</div>
      <div className="admin-alert-copy">
        <div><span className={`admin-alert-badge ${alert.severity}`}>{severityLabels[alert.severity]}</span><strong>{alert.title}</strong></div>
        <p>{alert.message}</p>
        {alert.examples.length > 0 && <small>Exemples : {alert.examples.join(', ')}</small>}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(alert.action)}>Corriger</button>
    </article>
  )
}

function LoadingState() {
  return <div className="card admin-insights-empty">Calcul des indicateurs...</div>
}

export default function AdminInsightsView({ mode, data, loading, error, onRefresh, onNavigate }: Props) {
  if (!data && loading) return <LoadingState />
  if (!data) return <div className="alert alert-error">{error || 'Aucune donnée disponible.'} <button onClick={onRefresh}>Réessayer</button></div>

  const { kpis } = data
  const alertCounts = data.alerts.reduce<Record<AlertSeverity, number>>((counts, alert) => {
    counts[alert.severity] += 1
    return counts
  }, { critical: 0, warning: 0, info: 0 })
  const maxTimeline = Math.max(1, ...data.timeline.flatMap((day) => [day.newStudents, day.completedQuizzes]))
  const updatedLabel = new Date(data.generatedAt).toLocaleString('fr-HT', { dateStyle: 'short', timeStyle: 'short' })

  if (mode === 'overview') {
    return (
      <div className="admin-insights-overview">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="admin-insights-toolbar"><span>Actualisé le {updatedLabel}</span><button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>{loading ? 'Actualisation...' : 'Actualiser'}</button></div>
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card"><span>Élèves inscrits</span><strong className="display">{kpis.students.total}</strong><small>+{kpis.students.new7} sur 7 jours</small></div>
          <div className="admin-kpi-card"><span>Élèves actifs</span><strong className="display">{kpis.activity.active30}</strong><small>{kpis.activity.activeRate}% sur 30 jours</small></div>
          <div className="admin-kpi-card"><span>Quiz terminés</span><strong className="display">{kpis.quizzes.completed30}</strong><small>sur 30 jours</small></div>
          <div className="admin-kpi-card"><span>Précision quiz</span><strong className="display">{kpis.quizzes.accuracy30 === null ? '—' : `${kpis.quizzes.accuracy30}%`}</strong><small>sur 30 jours</small></div>
        </div>
        <div className="admin-overview-insight-grid">
          <section className="card admin-coverage-summary"><div><p className="overline">Programme</p><h2>Couverture pédagogique</h2></div><div><strong>{kpis.content.questionCoverage}%</strong><span>matières avec questions</span></div><div><strong>{kpis.content.chapterCoverage}%</strong><span>matières avec chapitres</span></div></section>
          <section className="card admin-alert-summary"><div><p className="overline">À traiter</p><h2>Alertes prioritaires</h2></div>{data.alerts.length === 0 ? <p className="admin-insights-ok">Aucune alerte active.</p> : data.alerts.slice(0, 3).map((alert) => <button key={alert.id} onClick={() => onNavigate(alert.action)}><span className={`admin-alert-dot ${alert.severity}`} /> <span>{alert.title}</span><strong>{alert.count}</strong></button>)}</section>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-insights-page">
      <header className="admin-insights-heading">
        <div><p className="overline">Pilotage en direct</p><h1 className="display">{mode === 'indicators' ? 'Indicateurs clés' : 'Alertes'}</h1><p>{mode === 'indicators' ? 'Croissance, engagement, contenus et opérations sur les 30 derniers jours.' : 'Problèmes détectés automatiquement à partir des données actuelles.'}</p></div>
        <div><span>Actualisé le {updatedLabel}</span><button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>{loading ? 'Actualisation...' : 'Actualiser'}</button></div>
      </header>
      {error && <div className="alert alert-error">{error}</div>}

      {mode === 'indicators' ? (
        <>
          <div className="admin-kpi-grid detailed">
            <div className="admin-kpi-card"><span>Nouveaux élèves</span><strong className="display">{kpis.students.new30}</strong><Trend value={kpis.students.trend.delta} /></div>
            <div className="admin-kpi-card"><span>Élèves actifs</span><strong className="display">{kpis.activity.active30}</strong><Trend value={kpis.activity.trend.delta} /></div>
            <div className="admin-kpi-card"><span>Quiz terminés</span><strong className="display">{kpis.quizzes.completed30}</strong><Trend value={kpis.quizzes.trend.delta} /></div>
            <div className="admin-kpi-card"><span>Précision moyenne</span><strong className="display">{kpis.quizzes.accuracy30 === null ? '—' : `${kpis.quizzes.accuracy30}%`}</strong><Trend value={kpis.quizzes.accuracyDelta} suffix=" pts" /></div>
          </div>
          <section className="card admin-timeline-card">
            <div><p className="overline">30 jours</p><h2>Inscriptions et quiz terminés</h2></div>
            <div className="admin-chart-legend"><span><i className="students" />Nouveaux élèves</span><span><i className="quizzes" />Quiz</span></div>
            <div className="admin-timeline" aria-label="Activité quotidienne sur 30 jours">{data.timeline.map((day, index) => <div className="admin-timeline-day" key={day.date} title={`${day.date} : ${day.newStudents} élève(s), ${day.completedQuizzes} quiz`}><div><i className="students" style={{ height: `${(day.newStudents / maxTimeline) * 100}%` }} /><i className="quizzes" style={{ height: `${(day.completedQuizzes / maxTimeline) * 100}%` }} /></div>{index % 5 === 0 && <span>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString('fr-HT', { day: '2-digit', month: '2-digit' })}</span>}</div>)}</div>
          </section>
          <div className="admin-domain-grid">
            <section className="card"><p className="overline">Contenus</p><h2>Couverture</h2><div className="admin-domain-metrics"><div><strong>{kpis.content.questionCoverage}%</strong><span>matières avec questions</span></div><div><strong>{kpis.content.chapterCoverage}%</strong><span>matières avec chapitres</span></div><div><strong>{kpis.content.publishedChapters}</strong><span>chapitres publiés</span></div></div></section>
            <section className="card"><p className="overline">Opérations</p><h2>Arena et modération</h2><div className="admin-domain-metrics"><div><strong>{kpis.operations.upcomingCompetitions7}</strong><span>Arena sous 7 jours</span></div><div><strong>{kpis.operations.liveCompetitions}</strong><span>sessions live</span></div><div><strong>{kpis.operations.pendingModeration}</strong><span>signalements</span></div></div></section>
          </div>
          <section className="card admin-coverage-table"><div><p className="overline">Par classe</p><h2>Couverture du programme</h2></div>{data.coverageByClass.length === 0 ? <p className="admin-insights-muted">Aucune classe disponible.</p> : <div className="admin-table-scroll"><table className="data-table"><thead><tr><th>Classe</th><th>Élèves</th><th>Matières</th><th>Questions</th><th>Chapitres</th><th>Couverture Q.</th><th>Couverture Ch.</th></tr></thead><tbody>{data.coverageByClass.map((row) => <tr key={row.classId}><td><strong>{row.className}</strong></td><td>{row.students}</td><td>{row.subjects}</td><td>{row.questions}</td><td>{row.publishedChapters}</td><td>{row.questionCoverage}%</td><td>{row.chapterCoverage}%</td></tr>)}</tbody></table></div>}</section>
        </>
      ) : (
        <>
          <div className="admin-alert-counts">{(['critical', 'warning', 'info'] as AlertSeverity[]).map((severity) => <div className={`card ${severity}`} key={severity}><span>{severityLabels[severity]}</span><strong className="display">{alertCounts[severity]}</strong></div>)}</div>
          {data.alerts.length === 0 ? <div className="card admin-alerts-clear"><strong>Aucune alerte active</strong><span>Les contenus et opérations ne présentent aucun problème détecté.</span></div> : <div className="admin-alert-list">{data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} onNavigate={onNavigate} />)}</div>}
        </>
      )}
    </div>
  )
}
