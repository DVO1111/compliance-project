import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ManCapApplication, SonAudit, SonCertificate,
  ManCapStatus, SonAuditType, SonAuditStatus, SonCertType,
  MANCAP_STATUS_LABELS, MANCAP_STATUS_COLORS,
  AUDIT_STATUS_LABELS, AUDIT_STATUS_COLORS,
  CERT_TYPE_LABELS, NIS_STANDARDS,
  getCertExpiryStatus, getDaysUntilExpiry,
  getManCapApplications, createManCapApplication, updateManCapStatus, deleteManCapApplication,
  getSonAudits, createSonAudit, updateSonAuditStatus,
  getSonCertificates, createSonCertificate, deleteSonCertificate,
} from '../../lib/sonComplianceService';
import {
  Award, Plus, AlertTriangle, CheckCircle2, Clock, XCircle,
  ChevronDown, ChevronRight, Trash2, Loader2, RefreshCw,
  FileText, CalendarClock, Shield,
} from 'lucide-react';

type Tab = 'mancap' | 'audits' | 'certificates';

const EMPTY_MANCAP = { product_name: '', nis_standard: NIS_STANDARDS[0].value, application_date: new Date().toISOString().slice(0, 10), notes: '' };
const EMPTY_AUDIT  = { audit_type: 'quarterly' as SonAuditType, scheduled_date: '', auditor_name: '', notes: '' };
const EMPTY_CERT   = { certificate_type: 'man_cap' as SonCertType, certificate_number: '', product_name: '', nis_standard: NIS_STANDARDS[0].value, issue_date: '', expiry_date: '', notes: '' };

export default function SONCompliancePage() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? '';
  const userId    = user?.id ?? '';

  const [tab, setTab] = useState<Tab>('mancap');

  // ── MAN CAP state
  const [apps, setApps]         = useState<ManCapApplication[]>([]);
  const [audits, setAudits]     = useState<SonAudit[]>([]);
  const [certs, setCerts]       = useState<SonCertificate[]>([]);
  const [loading, setLoading]   = useState(true);

  // ── modals
  const [showManCapForm, setShowManCapForm] = useState(false);
  const [showAuditForm, setShowAuditForm]   = useState(false);
  const [showCertForm, setShowCertForm]     = useState(false);
  const [saving, setSaving]                 = useState(false);

  // ── forms
  const [manCapForm, setManCapForm] = useState(EMPTY_MANCAP);
  const [auditForm, setAuditForm]   = useState(EMPTY_AUDIT);
  const [certForm, setCertForm]     = useState(EMPTY_CERT);

  // ── status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    const [a, au, c] = await Promise.all([
      getManCapApplications(companyId),
      getSonAudits(companyId),
      getSonCertificates(companyId),
    ]);
    setApps(a); setAudits(au); setCerts(c);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  // ── stats
  const manCapStats = useMemo(() => ({
    total:    apps.length,
    pending:  apps.filter(a => ['submitted', 'under_review', 'inspection_scheduled'].includes(a.status)).length,
    approved: apps.filter(a => a.status === 'approved').length,
    action:   apps.filter(a => a.status === 'rejected' || a.status === 'expired').length,
  }), [apps]);

  const auditStats = useMemo(() => ({
    upcoming: audits.filter(a => a.status === 'scheduled').length,
    passed:   audits.filter(a => a.status === 'passed').length,
    failed:   audits.filter(a => a.status === 'failed').length,
    action:   audits.filter(a => a.status === 'pending_corrective_action').length,
  }), [audits]);

  const certStats = useMemo(() => ({
    active:   certs.filter(c => getCertExpiryStatus(c.expiry_date) === 'active').length,
    expiring: certs.filter(c => getCertExpiryStatus(c.expiry_date) === 'expiring').length,
    expired:  certs.filter(c => getCertExpiryStatus(c.expiry_date) === 'expired').length,
  }), [certs]);

  const expiringSoon = useMemo(() =>
    certs.filter(c => getCertExpiryStatus(c.expiry_date) === 'expiring')
         .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()),
  [certs]);

  // ── handlers
  async function handleCreateManCap() {
    if (!manCapForm.product_name || !manCapForm.nis_standard) return;
    setSaving(true);
    await createManCapApplication(companyId, userId, manCapForm);
    setShowManCapForm(false); setManCapForm(EMPTY_MANCAP); setSaving(false); load();
  }

  async function handleManCapStatusChange(id: string, status: ManCapStatus) {
    setUpdatingId(id);
    await updateManCapStatus(id, status, companyId, userId);
    setUpdatingId(null); load();
  }

  async function handleDeleteManCap(id: string) {
    if (!confirm('Delete this application?')) return;
    await deleteManCapApplication(id, companyId, userId); load();
  }

  async function handleCreateAudit() {
    if (!auditForm.scheduled_date) return;
    setSaving(true);
    await createSonAudit(companyId, userId, auditForm);
    setShowAuditForm(false); setAuditForm(EMPTY_AUDIT); setSaving(false); load();
  }

  async function handleAuditStatusChange(id: string, status: SonAuditStatus) {
    setUpdatingId(id);
    await updateSonAuditStatus(id, status, companyId, userId);
    setUpdatingId(null); load();
  }

  async function handleCreateCert() {
    if (!certForm.certificate_number || !certForm.product_name || !certForm.expiry_date) return;
    setSaving(true);
    await createSonCertificate(companyId, userId, certForm);
    setShowCertForm(false); setCertForm(EMPTY_CERT); setSaving(false); load();
  }

  async function handleDeleteCert(id: string) {
    if (!confirm('Delete this certificate?')) return;
    await deleteSonCertificate(id, companyId, userId); load();
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <Award className="w-5 h-5 dash-accent" />
            </div>
            <h2 className="text-2xl font-bold dash-text">SON Compliance Tracker</h2>
          </div>
          <p className="dash-text-secondary text-sm ml-12">
            Standards Organisation of Nigeria — MAN CAP applications, audit schedule, and certificate vault
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm dash-text hover:bg-[var(--color-bg-secondary)]">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Expiry alert */}
      {expiringSoon.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              {expiringSoon.length} SON {expiringSoon.length === 1 ? 'certificate' : 'certificates'} expiring within 90 days
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              {expiringSoon.map(c => `${c.product_name} (${getDaysUntilExpiry(c.expiry_date)}d)`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {([
          { id: 'mancap',       label: 'MAN CAP Applications', count: apps.length },
          { id: 'audits',       label: 'Audit Schedule',        count: audits.length },
          { id: 'certificates', label: 'Certificates',          count: certs.length },
        ] as { id: Tab; label: string; count: number }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent dash-text-secondary hover:dash-text'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              tab === t.id ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'bg-[var(--color-bg-secondary)] dash-text-tertiary'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin dash-text-secondary" />
        </div>
      ) : (
        <>
          {/* ── MAN CAP TAB ─────────────────────────────────────────────────── */}
          {tab === 'mancap' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Applications', value: manCapStats.total, icon: FileText, color: 'text-gray-500' },
                  { label: 'In Progress',         value: manCapStats.pending,  icon: Clock,        color: 'text-blue-500' },
                  { label: 'Approved',            value: manCapStats.approved, icon: CheckCircle2, color: 'text-green-500' },
                  { label: 'Needs Attention',     value: manCapStats.action,   icon: AlertTriangle,color: 'text-red-500' },
                ].map(s => (
                  <div key={s.label} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <div className="flex items-center justify-between mb-1">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className="text-2xl font-bold dash-text">{s.value}</p>
                    <p className="text-xs dash-text-tertiary">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button onClick={() => setShowManCapForm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90">
                  <Plus className="w-4 h-4" /> New Application
                </button>
              </div>

              {apps.length === 0 ? (
                <div className="text-center py-16 dash-text-secondary">
                  <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No MAN CAP applications yet</p>
                  <p className="text-sm mt-1">Add your first Mandatory Conformity Assessment application</p>
                </div>
              ) : (
                <div className="dash-card rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                      <tr>
                        {['Product / NIS Standard', 'Application Date', 'Status', 'Reference No', 'Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold dash-text-secondary uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {apps.map(app => (
                        <tr key={app.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium dash-text">{app.product_name}</p>
                            <p className="text-xs dash-text-tertiary">{app.nis_standard}</p>
                          </td>
                          <td className="px-4 py-3 dash-text-secondary">
                            {new Date(app.application_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={app.status}
                              disabled={updatingId === app.id}
                              onChange={e => handleManCapStatusChange(app.id, e.target.value as ManCapStatus)}
                              className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${MANCAP_STATUS_COLORS[app.status]}`}
                            >
                              {(Object.keys(MANCAP_STATUS_LABELS) as ManCapStatus[]).map(s => (
                                <option key={s} value={s}>{MANCAP_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs dash-text-secondary">
                            {app.reference_number ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteManCap(app.id)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── AUDITS TAB ──────────────────────────────────────────────────── */}
          {tab === 'audits' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Upcoming',           value: auditStats.upcoming, icon: CalendarClock, color: 'text-blue-500' },
                  { label: 'Passed',             value: auditStats.passed,   icon: CheckCircle2,  color: 'text-green-500' },
                  { label: 'Failed',             value: auditStats.failed,   icon: XCircle,       color: 'text-red-500' },
                  { label: 'Corrective Action',  value: auditStats.action,   icon: AlertTriangle, color: 'text-orange-500' },
                ].map(s => (
                  <div key={s.label} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <s.icon className={`w-4 h-4 ${s.color} mb-1`} />
                    <p className="text-2xl font-bold dash-text">{s.value}</p>
                    <p className="text-xs dash-text-tertiary">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button onClick={() => setShowAuditForm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90">
                  <Plus className="w-4 h-4" /> Schedule Audit
                </button>
              </div>

              {audits.length === 0 ? (
                <div className="text-center py-16 dash-text-secondary">
                  <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No SON audits recorded</p>
                  <p className="text-sm mt-1">Schedule your next SON conformity audit</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {audits.map(audit => (
                    <div key={audit.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold dash-text capitalize">
                              {audit.audit_type} SON Audit
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${AUDIT_STATUS_COLORS[audit.status]}`}>
                              {AUDIT_STATUS_LABELS[audit.status]}
                            </span>
                          </div>
                          <p className="text-xs dash-text-secondary">
                            Scheduled: {new Date(audit.scheduled_date).toLocaleDateString()}
                            {audit.auditor_name && ` · Auditor: ${audit.auditor_name}`}
                          </p>
                          {audit.findings && (
                            <p className="text-xs dash-text-secondary mt-1.5 italic">Findings: {audit.findings}</p>
                          )}
                          {audit.corrective_actions && (
                            <p className="text-xs text-orange-600 mt-1">Corrective actions: {audit.corrective_actions}</p>
                          )}
                        </div>
                        <select
                          value={audit.status}
                          disabled={updatingId === audit.id}
                          onChange={e => handleAuditStatusChange(audit.id, e.target.value as SonAuditStatus)}
                          className="text-xs border border-[var(--color-border)] rounded-lg px-2 py-1.5 dash-text bg-[var(--color-bg-primary)] cursor-pointer"
                        >
                          {(Object.keys(AUDIT_STATUS_LABELS) as SonAuditStatus[]).map(s => (
                            <option key={s} value={s}>{AUDIT_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CERTIFICATES TAB ────────────────────────────────────────────── */}
          {tab === 'certificates' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Active',   value: certStats.active,   color: 'text-green-500',  icon: CheckCircle2 },
                  { label: 'Expiring', value: certStats.expiring, color: 'text-orange-500', icon: Clock },
                  { label: 'Expired',  value: certStats.expired,  color: 'text-red-500',    icon: XCircle },
                ].map(s => (
                  <div key={s.label} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <s.icon className={`w-4 h-4 ${s.color} mb-1`} />
                    <p className="text-2xl font-bold dash-text">{s.value}</p>
                    <p className="text-xs dash-text-tertiary">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button onClick={() => setShowCertForm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90">
                  <Plus className="w-4 h-4" /> Add Certificate
                </button>
              </div>

              {certs.length === 0 ? (
                <div className="text-center py-16 dash-text-secondary">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No SON certificates stored</p>
                  <p className="text-sm mt-1">Add your MAN CAP and NIS conformity certificates</p>
                </div>
              ) : (
                <div className="dash-card rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                      <tr>
                        {['Certificate', 'Product / NIS Standard', 'Issue Date', 'Expiry', 'Status', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold dash-text-secondary uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {certs.map(cert => {
                        const expiryStatus = getCertExpiryStatus(cert.expiry_date);
                        const daysLeft = getDaysUntilExpiry(cert.expiry_date);
                        return (
                          <tr key={cert.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium dash-text font-mono text-xs">{cert.certificate_number}</p>
                              <p className="text-xs dash-text-tertiary">{CERT_TYPE_LABELS[cert.certificate_type]}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium dash-text">{cert.product_name}</p>
                              <p className="text-xs dash-text-tertiary">{cert.nis_standard}</p>
                            </td>
                            <td className="px-4 py-3 dash-text-secondary text-xs">
                              {new Date(cert.issue_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <p className={expiryStatus === 'expired' ? 'text-red-600 font-medium' : expiryStatus === 'expiring' ? 'text-orange-600 font-medium' : 'dash-text'}>
                                {new Date(cert.expiry_date).toLocaleDateString()}
                              </p>
                              <p className={`text-xs ${expiryStatus === 'expired' ? 'text-red-500' : expiryStatus === 'expiring' ? 'text-orange-500' : 'dash-text-tertiary'}`}>
                                {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d remaining`}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                expiryStatus === 'active'   ? 'bg-green-100 text-green-700' :
                                expiryStatus === 'expiring' ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {expiryStatus === 'active' ? 'Active' : expiryStatus === 'expiring' ? 'Expiring Soon' : 'Expired'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleDeleteCert(cert.id)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal: New MAN CAP Application ────────────────────────────────── */}
      {showManCapForm && (
        <Modal title="New MAN CAP Application" onClose={() => setShowManCapForm(false)}>
          <div className="space-y-4">
            <Field label="Product Name *">
              <input value={manCapForm.product_name} onChange={e => setManCapForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="e.g. AquaPure Sachet Water" className={INPUT} />
            </Field>
            <Field label="NIS Standard *">
              <select value={manCapForm.nis_standard} onChange={e => setManCapForm(f => ({ ...f, nis_standard: e.target.value }))} className={INPUT}>
                {NIS_STANDARDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Application Date *">
              <input type="date" value={manCapForm.application_date} onChange={e => setManCapForm(f => ({ ...f, application_date: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Notes">
              <textarea value={manCapForm.notes} onChange={e => setManCapForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Additional details…" className={INPUT} />
            </Field>
            <ModalActions onCancel={() => setShowManCapForm(false)} onSave={handleCreateManCap} saving={saving} />
          </div>
        </Modal>
      )}

      {/* ── Modal: Schedule Audit ──────────────────────────────────────────── */}
      {showAuditForm && (
        <Modal title="Schedule SON Audit" onClose={() => setShowAuditForm(false)}>
          <div className="space-y-4">
            <Field label="Audit Type *">
              <select value={auditForm.audit_type} onChange={e => setAuditForm(f => ({ ...f, audit_type: e.target.value as SonAuditType }))} className={INPUT}>
                <option value="quarterly">Quarterly Conformity Audit</option>
                <option value="annual">Annual Surveillance Audit</option>
                <option value="special">Special / Follow-up Audit</option>
              </select>
            </Field>
            <Field label="Scheduled Date *">
              <input type="date" value={auditForm.scheduled_date} onChange={e => setAuditForm(f => ({ ...f, scheduled_date: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="SON Auditor Name">
              <input value={auditForm.auditor_name} onChange={e => setAuditForm(f => ({ ...f, auditor_name: e.target.value }))}
                placeholder="Name of assigned SON auditor (if known)" className={INPUT} />
            </Field>
            <ModalActions onCancel={() => setShowAuditForm(false)} onSave={handleCreateAudit} saving={saving} />
          </div>
        </Modal>
      )}

      {/* ── Modal: Add Certificate ─────────────────────────────────────────── */}
      {showCertForm && (
        <Modal title="Add SON Certificate" onClose={() => setShowCertForm(false)}>
          <div className="space-y-4">
            <Field label="Certificate Type *">
              <select value={certForm.certificate_type} onChange={e => setCertForm(f => ({ ...f, certificate_type: e.target.value as SonCertType }))} className={INPUT}>
                <option value="man_cap">MAN CAP Certificate</option>
                <option value="nis_conformity">NIS Conformity Certificate</option>
                <option value="son_approval">SON Approval Certificate</option>
              </select>
            </Field>
            <Field label="Certificate Number *">
              <input value={certForm.certificate_number} onChange={e => setCertForm(f => ({ ...f, certificate_number: e.target.value }))}
                placeholder="e.g. SON/MAN-CAP/2025/001234" className={INPUT} />
            </Field>
            <Field label="Product Name *">
              <input value={certForm.product_name} onChange={e => setCertForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="Product covered by this certificate" className={INPUT} />
            </Field>
            <Field label="NIS Standard *">
              <select value={certForm.nis_standard} onChange={e => setCertForm(f => ({ ...f, nis_standard: e.target.value }))} className={INPUT}>
                {NIS_STANDARDS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issue Date *">
                <input type="date" value={certForm.issue_date} onChange={e => setCertForm(f => ({ ...f, issue_date: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Expiry Date *">
                <input type="date" value={certForm.expiry_date} onChange={e => setCertForm(f => ({ ...f, expiry_date: e.target.value }))} className={INPUT} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={certForm.notes} onChange={e => setCertForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="e.g. Renewal submitted, awaiting re-issue" className={INPUT} />
            </Field>
            <ModalActions onCancel={() => setShowCertForm(false)} onSave={handleCreateCert} saving={saving} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Local sub-components ───────────────────────────────────────────────────────

const INPUT = 'w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-text bg-[var(--color-bg-primary)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium dash-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h3 className="font-semibold dash-text">{title}</h3>
          <button onClick={onClose} className="dash-text-secondary hover:dash-text"><span className="text-lg">×</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancel} className="flex-1 py-2 text-sm border border-[var(--color-border)] rounded-lg dash-text hover:bg-[var(--color-bg-secondary)]">
        Cancel
      </button>
      <button onClick={onSave} disabled={saving}
        className="flex-1 py-2 text-sm text-white bg-[var(--color-accent)] rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
