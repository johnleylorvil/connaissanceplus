import { useMemo, useState, type ReactNode } from 'react'
import type { AdminInsights } from '../admin-insights/types'

type Props = { mode: 'statistics' | 'reports'; data: AdminInsights | null; loading: boolean; error: string; onRefresh: () => void }
type ReportKind = 'summary' | 'coverage' | 'activity' | 'operations'

export default function AdminAnalysisView({ mode, data, loading, error, onRefresh }: Props) {
  if (loading && !data) return <div className="card">Chargement des données d’analyse…</div>
  if (error && !data) return <div className="alert alert-error">{error} <button className="btn btn-ghost btn-sm" onClick={onRefresh}>Réessayer</button></div>
  if (!data) return <div className="card">Aucune donnée disponible.</div>
  return mode === 'statistics' ? <Statistics data={data} onRefresh={onRefresh} /> : <Reports data={data} />
}

function Statistics({ data, onRefresh }: { data: AdminInsights; onRefresh: () => void }) {
  const { kpis } = data
  const max = Math.max(1, ...data.timeline.flatMap((day) => [day.newStudents, day.completedQuizzes]))
  return <div>
    <Header title="Statistiques" subtitle="Lecture détaillée de l’activité, des apprentissages et de la couverture académique." action={<button className="btn btn-ghost btn-sm" onClick={onRefresh}>Actualiser</button>} />
    <div className="responsive-four-col" style={{ gap: 12, marginBottom: 18 }}>
      <Metric label="Élèves" value={kpis.students.total} detail={`${kpis.students.new30} nouveaux sur 30 jours`} />
      <Metric label="Actifs" value={`${kpis.activity.activeRate}%`} detail={`${kpis.activity.active30} élèves actifs`} />
      <Metric label="Quiz terminés" value={kpis.quizzes.completed30} detail={`Précision ${kpis.quizzes.accuracy30 ?? 0}%`} />
      <Metric label="Couverture" value={`${kpis.content.chapterCoverage}%`} detail={`${kpis.content.publishedChapters} chapitres publiés`} />
    </div>
    <section className="card" style={{ marginBottom: 18 }}><h2 style={{ marginBottom: 14 }}>Activité sur 30 jours</h2><div style={{ height: 190, display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: '1px solid var(--rule)' }}>{data.timeline.map((day, index) => <div key={day.date} title={`${day.date}: ${day.newStudents} inscription(s), ${day.completedQuizzes} quiz`} style={{ flex: 1, minWidth: 5, display: 'flex', alignItems: 'flex-end', gap: 1, height: '100%' }}><span style={{ width: '50%', height: `${Math.max(2, day.newStudents / max * 100)}%`, background: 'var(--cobalt)', borderRadius: '3px 3px 0 0' }} /><span style={{ width: '50%', height: `${Math.max(2, day.completedQuizzes / max * 100)}%`, background: 'var(--gold)', borderRadius: '3px 3px 0 0' }} />{index % 7 === 0 ? null : null}</div>)}</div><div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 13 }}><span>■ Inscriptions</span><span style={{ color: 'var(--gold)' }}>■ Quiz</span></div></section>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: 18 }}><h2>Statistiques par classe</h2></div><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Classe</th><th>Élèves</th><th>Matières</th><th>Questions</th><th>Chapitres</th><th>Questions couvertes</th><th>Chapitres couverts</th></tr></thead><tbody>{data.coverageByClass.map((row) => <tr key={row.classId}><td><strong>{row.className}</strong></td><td>{row.students}</td><td>{row.subjects}</td><td>{row.questions}</td><td>{row.publishedChapters}</td><td>{row.questionCoverage}%</td><td>{row.chapterCoverage}%</td></tr>)}</tbody></table>{data.coverageByClass.length === 0 && <p style={{ padding: 24, textAlign: 'center' }}>Aucune classe disponible.</p>}</div></section>
  </div>
}

function Reports({ data }: { data: AdminInsights }) {
  const [kind, setKind] = useState<ReportKind>('summary')
  const report = useMemo(() => buildReport(data, kind), [data, kind])
  const exportCsv = () => {
    const csv = report.rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `rapport-${kind}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="admin-report-page">
    <Header title="Rapports" subtitle="Générez une synthèse à jour, exportez-la en CSV ou imprimez-la en PDF." />
    <div className="card admin-report-actions"style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}><label style={{ flex: '1 1 240px' }}><span className="field-label">Type de rapport</span><select className="field-input" value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}><option value="summary">Synthèse générale</option><option value="coverage">Couverture académique</option><option value="activity">Activité sur 30 jours</option><option value="operations">Compétitions et modération</option></select></label><button className="btn btn-primary btn-sm" onClick={exportCsv}>Exporter CSV</button><button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Imprimer / PDF</button></div>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: 18, borderBottom: '1px solid var(--rule)' }}><p className="overline">{new Date(data.generatedAt).toLocaleString('fr-HT')}</p><h2>{report.title}</h2></div><div style={{ overflowX: 'auto' }}><table className="data-table"><tbody>{report.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => index === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></section>
  </div>
}

function buildReport(data: AdminInsights, kind: ReportKind) {
  const k = data.kpis
  if (kind === 'coverage') return { title: 'Couverture académique', rows: [['Classe', 'Élèves', 'Matières', 'Questions', 'Chapitres publiés', 'Couverture questions', 'Couverture chapitres'], ...data.coverageByClass.map((r) => [r.className, r.students, r.subjects, r.questions, r.publishedChapters, `${r.questionCoverage}%`, `${r.chapterCoverage}%`])] }
  if (kind === 'activity') return { title: 'Activité quotidienne', rows: [['Date', 'Nouveaux élèves', 'Quiz terminés'], ...data.timeline.map((r) => [r.date, r.newStudents, r.completedQuizzes])] }
  if (kind === 'operations') return { title: 'Compétitions et modération', rows: [['Indicateur', 'Valeur'], ['Compétitions à venir (7 j)', k.operations.upcomingCompetitions7], ['Compétitions live', k.operations.liveCompetitions], ['Inscriptions Arena en attente', k.operations.pendingArenaRegistrations], ['Signalements en attente', k.operations.pendingModeration]] }
  return { title: 'Synthèse générale', rows: [['Indicateur', 'Valeur'], ['Élèves inscrits', k.students.total], ['Nouveaux élèves (30 j)', k.students.new30], ['Élèves actifs (30 j)', k.activity.active30], ['Taux activité', `${k.activity.activeRate}%`], ['Quiz terminés (30 j)', k.quizzes.completed30], ['Précision moyenne', `${k.quizzes.accuracy30 ?? 0}%`], ['Questions', k.content.questions], ['Chapitres publiés', k.content.publishedChapters]] }
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) { return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}><div><p className="overline">Analyse</p><h1 className="display" style={{ fontSize: 32, color: 'var(--cobalt)', marginBottom: 6 }}>{title}</h1><p style={{ color: 'var(--ink-3)' }}>{subtitle}</p></div>{action}</div> }
function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="card"><p style={{ color: 'var(--ink-3)', fontSize: 13 }}>{label}</p><strong className="display" style={{ display: 'block', fontSize: 30, color: 'var(--cobalt)', margin: '5px 0' }}>{value}</strong><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{detail}</span></div> }