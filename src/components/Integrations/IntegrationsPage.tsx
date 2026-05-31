import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  recordHealthCheck,
  fetchLogs,
  providerRegistry,
} from '../../integrations';
import type {
  IntegrationConnection,
  IntegrationLog,
  ProviderManifest,
} from '../../integrations';
import {
  Plug,
  Slack,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
  ExternalLink,
  Clock,
  X,
  Zap,
  ArrowUpDown,
  FileWarning,
  HeartPulse,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SyncEvent = { id: string; provider_id: string; direction: string; event_type: string; entity_type: string; status: string; error_message: string | null; created_at: string; completed_at: string | null };
type AeReport = { id: string; source_channel: string; product_name: string; event_description: string; seriousness: string; status: string; pv_case_id: string | null; forwarded_to_pv: boolean; created_at: string };
type LabelChange = { id: string; product_name: string; label_version: string | null; change_type: string; change_summary: string; affected_content_count: number; re_review_triggered: boolean; status: string; received_at: string };

type Tab = 'integrations' | 'sync_log' | 'ae_queue' | 'label_changes';

const LOGO_MAP: Record<string, string> = {
  slack: 'https://cdn.simpleicons.org/slack',
  jira: 'https://cdn.simpleicons.org/jira',
  notion: 'https://cdn.simpleicons.org/notion/white',
  microsoft_teams: 'https://icon.horse/icon/teams.microsoft.com',
  google_drive: 'https://cdn.simpleicons.org/googledrive',
  microsoft_365: 'https://icon.horse/icon/microsoft365.com',
  trello: 'https://cdn.simpleicons.org/trello',
  zapier: 'https://cdn.simpleicons.org/zapier',
  hubspot: 'https://cdn.simpleicons.org/hubspot',
  monday: 'https://icon.horse/icon/monday.com',
  asana: 'https://cdn.simpleicons.org/asana',
  adobe_aem: 'https://icon.horse/icon/adobe.com',
  veeva_promomats: 'https://icon.horse/icon/veeva.com',
  veeva_rim: 'https://icon.horse/icon/veeva.com',
  pharmacovigilance: 'https://api.dicebear.com/7.x/shapes/svg?seed=pv&backgroundColor=0F172A',
  healthcare_lms: 'https://api.dicebear.com/7.x/shapes/svg?seed=lms&backgroundColor=0F172A',
  webhook: 'https://api.dicebear.com/7.x/shapes/svg?seed=webhook&backgroundColor=0F172A',
};

function getProviderLogoById(id: string, name: string, iconUrl?: string): string {
  if (LOGO_MAP[id]) return LOGO_MAP[id];
  if (iconUrl && !iconUrl.includes('clearbit.com')) return iconUrl;
  const baseName = id.split('_')[0];
  return `https://icon.horse/icon/${baseName}.com`;
}

export default function IntegrationsPage() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;

  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState<boolean | string>(false);
  const [expandedLogs, setExpandedLogs] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dbMissing, setDbMissing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<any>('all');

  const [tab, setTab] = useState<Tab>('integrations');
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [aeReports, setAeReports] = useState<AeReport[]>([]);
  const [labelChanges, setLabelChanges] = useState<LabelChange[]>([]);
  const [showAeForm, setShowAeForm] = useState(false);
  const [aeForm, setAeForm] = useState({ source_channel: 'social_media', product_name: '', event_description: '', seriousness: 'non_serious', patient_initials: '', meddra_pt: '' });
  const [showLabelForm, setShowLabelForm] = useState(false);
  const [labelForm, setLabelForm] = useState({ product_name: '', change_type: 'general_update', change_summary: '', label_version: '' });

  // Slack OAuth channel picker state (per connection)
  const [slackChannelsByConn, setSlackChannelsByConn] = useState<
    Record<string, { id: string; name: string; is_private: boolean; is_member: boolean }[]>
  >({});
  const [loadingSlackChannels, setLoadingSlackChannels] = useState<Record<string, boolean>>({});

  const [slackBotInfoByConn, setSlackBotInfoByConn] = useState<
    Record<string, { bot_user_id?: string | null; bot_user_name?: string | null; team_id?: string | null; team_name?: string | null }>
  >({});

  const commonEventTypes = useMemo(
    () => [
      'submission.created',
      'approval.approved',
      'approval.rejected',
      'expiry.warning',
      'expiry.expired',
      'regulatory.update',
    ],
    [],
  );

  const showToast = (t: { type: 'success' | 'error'; message: string }) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  };

  // Handle OAuth redirect status (Slack / Google Drive / Microsoft 365)
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const integ = u.searchParams.get('integration');
      const status = u.searchParams.get('status');
      if (!integ || !status) return;

      if (status === 'success') {
        showToast({ type: 'success', message: `${integ.replace('_', ' ')} connected successfully.` });
      } else {
        const reason = u.searchParams.get('reason') || 'Connection failed.';
        showToast({ type: 'error', message: `${integ.replace('_', ' ')}: ${reason}` });
      }
      u.searchParams.delete('integration');
      u.searchParams.delete('status');
      u.searchParams.delete('reason');
      window.history.replaceState({}, '', u.toString());
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [conns, recentLogs] = await Promise.all([
        listConnections(companyId),
        fetchLogs(companyId, { limit: 20 }),
      ]);
      setConnections(conns);
      setLogs(recentLogs);

      const { data: se } = await supabase.from('pharma_sync_events' as any).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50);
      setSyncEvents((se || []) as any);

      const { data: ae } = await supabase.from('pharma_ae_reports' as any).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50);
      setAeReports((ae || []) as any);

      const { data: lc } = await supabase.from('pharma_label_changes' as any).select('*').eq('company_id', companyId).order('received_at', { ascending: false }).limit(50);
      setLabelChanges((lc || []) as any);

      setDbMissing(false);
    } catch (err: any) {
      if (err?.message?.includes('relation') || err?.code === '42P01') {
        setDbMissing(true);
      }
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const manifests = providerRegistry.getAllManifests();
  const MOCK_AVATARS = [
    'https://i.pravatar.cc/150?u=1',
    'https://i.pravatar.cc/150?u=2',
    'https://i.pravatar.cc/150?u=3',
    'https://i.pravatar.cc/150?u=4'
  ];

  async function handleReportAe() {
    if (!companyId || !user || !aeForm.product_name || !aeForm.event_description) return;
    await supabase.from('pharma_ae_reports' as any).insert({ company_id: companyId, source_channel: aeForm.source_channel, product_name: aeForm.product_name, event_description: aeForm.event_description, seriousness: aeForm.seriousness, patient_initials: aeForm.patient_initials || null, meddra_pt: aeForm.meddra_pt || null, created_by: user.id } as never);
    setShowAeForm(false); setAeForm({ source_channel: 'social_media', product_name: '', event_description: '', seriousness: 'non_serious', patient_initials: '', meddra_pt: '' }); loadData();
  }

  async function handleForwardAe(id: string) {
    const pvConn = connections.find(c => c.provider_id === 'pharmacovigilance' && c.status === 'active');
    if (!pvConn) { showToast({ type: 'error', message: 'No active Pharmacovigilance connection' }); return; }
    await supabase.from('pharma_ae_reports' as any).update({ forwarded_to_pv: true, forwarded_at: new Date().toISOString(), status: 'forwarded' } as never).eq('id', id);
    loadData();
  }

  async function handleLogLabelChange() {
    if (!companyId || !labelForm.product_name || !labelForm.change_summary) return;
    await supabase.from('pharma_label_changes' as any).insert({ company_id: companyId, product_name: labelForm.product_name, change_type: labelForm.change_type, change_summary: labelForm.change_summary, label_version: labelForm.label_version || null, source_system: 'manual' } as never);
    setShowLabelForm(false); setLabelForm({ product_name: '', change_type: 'general_update', change_summary: '', label_version: '' }); loadData();
  }

  async function handleTriggerReReview(id: string) {
    await supabase.from('pharma_label_changes' as any).update({ re_review_triggered: true, status: 'reviewing' } as never).eq('id', id);
    loadData();
  }

  // ── Handlers ─────────────────────────────────────────────

  const handleToggle = async (conn: IntegrationConnection) => {
    const newStatus = conn.status === 'active' ? 'disabled' : 'active';
    try {
      await updateConnection(conn.id, { status: newStatus });
      showToast({ type: 'success', message: `${conn.display_name} ${newStatus === 'active' ? 'enabled' : 'disabled'}` });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', message: err.message });
    }
  };

  const handleDelete = async (conn: IntegrationConnection) => {
    if (!confirm(`Remove ${conn.display_name}? This cannot be undone.`)) return;
    try {
      await deleteConnection(conn.id);
      showToast({ type: 'success', message: `${conn.display_name} removed` });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', message: err.message });
    }
  };

  const handleHealthCheck = async (conn: IntegrationConnection) => {
    const provider = providerRegistry.get(conn.provider_id as any);
    if (!provider) return;
    try {
      const result = await provider.healthCheck(conn);
      await recordHealthCheck(conn.id, result.healthy, result.error);
      showToast({
        type: result.healthy ? 'success' : 'error',
        message: result.healthy ? `${conn.display_name} is healthy` : `Health check failed: ${result.error}`,
      });
      loadData();
    } catch (err: any) {
      showToast({ type: 'error', message: err.message });
    }
  };

  const loadSlackChannels = async (conn: IntegrationConnection) => {
    if (!companyId) return;
    setLoadingSlackChannels((s) => ({ ...s, [conn.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('slack-channels', {
        body: { action: 'list_channels', company_id: companyId, connection_id: conn.id },
      });
      if (error) throw error;
      const channels = (data?.channels || []) as { id: string; name: string; is_private: boolean; is_member: boolean }[];
      setSlackChannelsByConn((prev) => ({ ...prev, [conn.id]: channels }));

      // Fetch bot identity for invite helper text
      try {
        const botResp = await supabase.functions.invoke('slack-channels', {
          body: { action: 'botinfo', company_id: companyId, connection_id: conn.id },
        });
        if (!botResp.error && botResp.data?.ok) {
          setSlackBotInfoByConn((prev) => ({
            ...prev,
            [conn.id]: {
              bot_user_id: botResp.data?.bot_user_id ?? null,
              bot_user_name: botResp.data?.bot_user_name ?? null,
              team_id: botResp.data?.team_id ?? null,
              team_name: botResp.data?.team_name ?? null,
            },
          }));
        }
      } catch {
        // ignore botinfo failures
      }

      showToast({ type: 'success', message: `Loaded ${channels.length} Slack channels` });
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Failed to load Slack channels' });
    } finally {
      setLoadingSlackChannels((s) => ({ ...s, [conn.id]: false }));
    }
  };

  // ── DB not set up ────────────────────────────────────────

  if (dbMissing) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 bg-[#0B0F19] min-h-screen">
        <div className="bg-behance-amber-500/5 border border-behance-amber-500/20 rounded-2xl p-8 text-center">
          <Plug className="w-12 h-12 text-behance-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Integration Tables Not Found</h2>
          <p className="text-sm dash-text-tertiary mb-4">
            Run the{' '}
            <code className="bg-behance-amber-500/20 px-1.5 py-0.5 rounded text-xs text-behance-amber-400">integration_infrastructure_migration.sql</code>{' '}
            migration in your Supabase SQL Editor.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-[#0B0F19]">
        <Loader2 className="w-8 h-8 text-[var(--color-purple)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] relative overflow-hidden">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-danger)] text-white'}`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Radial glow background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[var(--color-purple)]/[0.12] via-indigo-500/[0.06] to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full dash-card/[0.04] border border-white/[0.08] text-xs font-medium text-[var(--color-purple)] mb-6">
            <Plug className="w-3.5 h-3.5" />
            Integration Hub
          </div>
          <h1 className="text-behance-bluexl sm:text-5xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent tracking-tight">
            Connect Your Ecosystem
          </h1>
          <p className="dash-text-tertiary mt-4 text-lg max-w-xl mx-auto leading-relaxed">
            Seamlessly integrate external services to automate compliance workflows and notifications.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl dash-card/[0.04] border border-white/[0.08] mb-8 w-fit mx-auto backdrop-blur-sm">
          {([{ id: 'integrations' as Tab, label: 'Integrations', icon: Plug }, { id: 'sync_log' as Tab, label: 'Sync Log', icon: ArrowUpDown }, { id: 'ae_queue' as Tab, label: 'AE Queue', icon: HeartPulse }, { id: 'label_changes' as Tab, label: 'Label Changes', icon: FileWarning }]).map(t => {
            const pendingAe = aeReports.filter(r => r.status === 'pending').length;
            const pendingLabels = labelChanges.filter(l => l.status === 'pending').length;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'dash-card/[0.1] shadow-sm text-white cursor-default' : 'dash-text-secondary hover:dash-text-tertiary'}`}><t.icon className="w-4 h-4" />{t.label}{t.id === 'ae_queue' && pendingAe > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-danger)]/20 text-[var(--color-danger)]">{pendingAe}</span>}{t.id === 'label_changes' && pendingLabels > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-behance-amber-500/20 text-behance-amber-400">{pendingLabels}</span>}</button>
            )
          })}
        </div>

        {tab === 'integrations' && (
          <div className="space-y-12 pb-12">
            {/* Spotlight Carousel */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Spotlight</h2>
              </div>
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x hide-scrollbar">
                {manifests.filter(m => m.featured).slice(0, 3).map((m) => {
                  const conn = connections.find(c => c.provider_id === m.id);
                  const isConnected = !!conn;
                  const ProviderIcon = m.id === 'slack' || m.id.includes('slack') ? Slack : Plug;

                  return (
                    <div key={m.id} className="min-w-[340px] md:min-w-[420px] snap-center dash-card/[0.03] rounded-2xl border border-white/[0.08] p-6 hover:border-indigo-500/30 transition-all flex flex-col justify-between backdrop-blur-sm group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-purple)]/10 rounded-full blur-3xl group-hover:bg-[var(--color-purple)]/20 transition-all" />

                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center dash-card/[0.06] border border-white/[0.05]`}>
                            <img src={getProviderLogoById(m.id, m.name, m.iconUrl)} alt={m.name} className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                            <ProviderIcon className="w-6 h-6 text-[var(--color-text-primary)] hidden" />
                          </div>
                          <span className="text-xs bg-[var(--color-purple)]/20 text-indigo-300 px-2 py-1 rounded-full font-medium border border-indigo-500/10">Featured</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">{m.name}</h3>
                        <p className="text-sm dash-text-tertiary line-clamp-2">{m.description}</p>
                      </div>

                      <div className="mt-8 flex items-center justify-between">
                        <div className="flex items-center -space-x-2">
                          {MOCK_AVATARS.map((u, i) => (
                            <img key={i} src={u} className="w-7 h-7 rounded-full border-2 border-[#131620]" alt="user" />
                          ))}
                          <div className="w-7 h-7 rounded-full border-2 border-[#131620] dash-card/[0.08] flex items-center justify-center text-[10px] dash-text-tertiary font-medium">+{m.users || 120}</div>
                        </div>

                        {isConnected ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-success)] bg-[var(--color-success)]/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" /> Active
                            </span>
                            <button onClick={(e) => {
                              // Open settings logic (we'll just scroll to it or open modal in a real app)
                              // For now, toggle the IntegrationCard below
                              const row = document.getElementById(`conn-row-${conn.id}`);
                              if (row) row.scrollIntoView({ behavior: 'smooth' });
                            }} className="px-4 py-2 dash-card/[0.06] hover:dash-card/[0.1] text-white text-sm font-medium rounded-xl transition-all border border-white/[0.05]">
                              Manage
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setShowAddModal(m.id)} className="px-5 py-2 bg-[var(--color-purple)] hover:bg-[var(--color-purple)] text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/20 inline-flex items-center gap-2">
                            Connect <Plug className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Categories */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar border-b border-white/[0.08]">
              {['all', 'communication', 'storage', 'project_mgmt', 'automation', 'webhook', 'pharma'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2.5 rounded-t-lg text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-[1px] ${activeCategory === cat
                    ? 'border-indigo-500 text-[var(--color-purple)] bg-[var(--color-purple)]/5'
                    : 'border-transparent dash-text-secondary hover:dash-text-tertiary hover:dash-border0'
                    }`}
                >
                  {cat === 'all' ? 'All Integrations' : cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>

            {/* Grid Directory */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {manifests.filter(m => activeCategory === 'all' || m.category === activeCategory).map(m => {
                const conn = connections.find(c => c.provider_id === m.id);
                const isConnected = !!conn;
                const ProviderIcon = m.id === 'slack' || m.id.includes('slack') ? Slack : Plug;

                return (
                  <div key={m.id} className="dash-card/[0.02] border border-white/[0.06] hover:dash-card/[0.04] hover:border-white/[0.15] transition-all rounded-xl p-5 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center dash-card/[0.06]">
                          <img src={getProviderLogoById(m.id, m.name, m.iconUrl)} alt={m.name} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                          <ProviderIcon className="w-5 h-5 dash-text-tertiary group-hover:text-[var(--color-purple)] transition-colors hidden" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-[var(--color-text-primary)]">{m.name}</h4>
                          <div className="flex items-center gap-2 text-xs dash-text-secondary">
                            <span className="capitalize">{m.category.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>
                      {isConnected && (
                        <div className="w-2 h-2 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_rgba(16,185,129,0.8)]" title="Active" />
                      )}
                    </div>

                    <p className="text-sm dash-text-tertiary line-clamp-2 mb-4 h-10">{m.description}</p>

                    <div className="flex justify-between items-center border-t border-white/[0.06] pt-4">
                      <div className="text-xs font-medium dash-text-secondary flex items-center gap-1.5">
                        <span className="flex items-center gap-1"><HeartPulse className="w-3 h-3" /> {m.likes || 42}</span>
                      </div>
                      {isConnected ? (
                        <button onClick={() => {
                          const row = document.getElementById(`conn-row-${conn.id}`);
                          if (row) row.scrollIntoView({ behavior: 'smooth' });
                        }} className="text-xs font-medium text-[var(--color-purple)] hover:text-indigo-300">
                          Configure →
                        </button>
                      ) : (
                        <button onClick={() => {
                          setShowAddModal(m.id);
                        }} className="text-xs font-medium dash-text-tertiary dash-card/[0.06] hover:dash-card/[0.1] px-3 py-1.5 rounded-lg border border-white/[0.05] transition-colors">
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Connections Settings List (The old list view for expanded settings) */}
            {connections.length > 0 && (
              <div className="mt-12 pt-12 border-t border-white/[0.08]">
                <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-6">Manage Settings</h3>
                <div className="space-y-4">
                  {connections.map((conn) => (
                    <div id={`conn-row-${conn.id}`} key={conn.id} className="scroll-mt-24">
                      <IntegrationCard
                        companyId={companyId!}
                        connection={conn}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onHealthCheck={handleHealthCheck}
                        onUpdate={(id, patch) => updateConnection(id, patch).then(() => loadData())}
                        showToast={showToast}
                        commonEventTypes={commonEventTypes}
                        slackChannels={slackChannelsByConn}
                        onLoadSlackChannels={loadSlackChannels}
                        loadingSlackChannels={loadingSlackChannels}
                        slackBotInfo={slackBotInfoByConn}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Banner */}
            <div className="mt-12 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-2xl p-8 md:p-12 text-center relative overflow-hidden flex flex-col items-center">
              <div className="absolute inset-0 bg-noise opacity-10 mix-blend-overlay pointer-events-none" />
              <div className="w-16 h-16 dash-card/[0.05] border border-white/[0.1] rounded-2xl flex items-center justify-center mb-6 shadow-xl backdrop-blur-md relative z-10">
                <Zap className="w-8 h-8 text-behance-amber-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3 relative z-10">Build Your Own Integration</h3>
              <p className="dash-text-tertiary max-w-lg mx-auto mb-8 relative z-10">
                Can't find what you're looking for? Use our powerful API and custom webhooks to connect any internal tool seamlessly.
              </p>
              <button className="relative z-10 px-6 py-3 dash-card dash-text font-semibold rounded-xl hover:dash-surface-alt transition-all shadow-xl shadow-white/10 flex items-center gap-2">
                View Developer Docs <ExternalLink className="w-4 h-4 dash-text-secondary" />
              </button>
            </div>

          </div>
        )}
        {/* ═══ SYNC LOG TAB ═══ */}
        {tab === 'sync_log' && (
          <>
            {syncEvents.length === 0 ? (
              <div className="dash-card/[0.03] rounded-2xl border border-white/[0.08] p-8 text-center backdrop-blur-sm">
                <ArrowUpDown className="w-10 h-10 mx-auto mb-3 dash-text-secondary" />
                <p className="dash-text-tertiary text-sm">No sync events yet. Connect a pharma integration to start.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {syncEvents.map((e) => (
                  <div key={e.id} className="dash-card/[0.03] rounded-xl p-4 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${e.direction === 'inbound' ? 'bg-[var(--color-info)]/15 text-[var(--color-info)]' : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'}`}>
                        {e.direction === 'inbound' ? '↓' : '↑'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{e.event_type}</p>
                        <p className="text-xs dash-text-secondary">{e.provider_id} · {e.entity_type || 'unknown'} · {new Date(e.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.status === 'completed' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : e.status === 'failed' ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' : 'bg-behance-amber-500/15 text-behance-amber-400'}`}>
                        {e.status}
                      </span>
                    </div>
                    {e.error_message && <p className="text-xs text-[var(--color-danger)] mt-1 ml-11 truncate">{e.error_message}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ AE QUEUE TAB ═══ */}
        {tab === 'ae_queue' && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowAeForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] hover:from-[var(--color-purple)] hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20">
                <Plus className="w-4 h-4" />
                Report AE
              </button>
            </div>
            {aeReports.length === 0 ? (
              <div className="dash-card/[0.03] rounded-2xl border border-white/[0.08] p-8 text-center backdrop-blur-sm">
                <HeartPulse className="w-10 h-10 mx-auto mb-3 dash-text-secondary" />
                <p className="dash-text-tertiary text-sm">No adverse event reports. Monitor marketing channels for AE signals.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {aeReports.map((r) => (
                  <div key={r.id} className={`dash-card/[0.03] rounded-xl p-4 border ${r.seriousness === 'serious' || r.seriousness === 'fatal' ? 'border-red-500/30' : 'border-white/[0.08]'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${r.seriousness === 'fatal' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : r.seriousness === 'serious' ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' : 'bg-behance-amber-500/15 text-behance-amber-400'}`}>
                        <HeartPulse className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-[var(--color-text-primary)]">{r.product_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.seriousness === 'fatal' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : r.seriousness === 'serious' ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' : 'bg-behance-amber-500/15 text-behance-amber-400'}`}>{r.seriousness}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'forwarded' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : r.status === 'pending' ? 'dash-card/[0.06] dash-text-tertiary' : 'bg-[var(--color-info)]/15 text-[var(--color-info)]'}`}>{r.status}</span>
                        </div>
                        <p className="text-sm dash-text-tertiary line-clamp-2">{r.event_description}</p>
                        <p className="text-xs dash-text-tertiary mt-0.5">Source: {r.source_channel.replace(/_/g, ' ')} · {new Date(r.created_at).toLocaleString()}{r.pv_case_id ? ` · PV Case: ${r.pv_case_id}` : ''}</p>
                      </div>
                      {r.status === 'pending' && (
                        <button onClick={() => handleForwardAe(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium hover:bg-[var(--color-purple)]/20 border border-indigo-500/20 shrink-0 flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Forward to PV
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ LABEL CHANGES TAB ═══ */}
        {tab === 'label_changes' && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowLabelForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] hover:from-[var(--color-purple)] hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20">
                <Plus className="w-4 h-4" />
                Log Label Change
              </button>
            </div>
            {labelChanges.length === 0 ? (
              <div className="dash-card/[0.03] rounded-2xl border border-white/[0.08] p-8 text-center backdrop-blur-sm">
                <FileWarning className="w-10 h-10 mx-auto mb-3 dash-text-secondary" />
                <p className="dash-text-tertiary text-sm">No label changes received. Connect Veeva RIM for automatic notifications.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {labelChanges.map((l) => (
                  <div key={l.id} className={`dash-card/[0.03] rounded-xl p-4 border ${l.change_type === 'black_box' || l.change_type === 'contraindication' ? 'border-red-500/30' : l.change_type === 'safety_update' ? 'border-behance-amber-500/30' : 'border-white/[0.08]'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${l.change_type === 'black_box' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : l.change_type === 'safety_update' ? 'bg-behance-amber-500/15 text-behance-amber-400' : 'bg-[var(--color-info)]/15 text-[var(--color-info)]'}`}>
                        <FileWarning className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-[var(--color-text-primary)]">{l.product_name}</span>
                          {l.label_version && <span className="text-xs dash-text-tertiary">v{l.label_version}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.change_type === 'black_box' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : l.change_type === 'safety_update' || l.change_type === 'contraindication' ? 'bg-behance-amber-500/15 text-behance-amber-400' : 'bg-[var(--color-info)]/15 text-[var(--color-info)]'}`}>{l.change_type.replace(/_/g, ' ')}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'completed' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : l.status === 'reviewing' ? 'bg-[var(--color-info)]/15 text-[var(--color-info)]' : 'dash-card/[0.06] dash-text-tertiary'}`}>{l.status}</span>
                          {l.re_review_triggered && <span className="text-xs px-1.5 py-0.5 rounded bg-behance-purple/100/15 text-[var(--color-purple)] flex items-center gap-0.5"><RefreshCw className="w-2.5 h-2.5" />Re-review</span>}
                        </div>
                        <p className="text-sm dash-text-tertiary">{l.change_summary}</p>
                        <p className="text-xs dash-text-tertiary mt-0.5">{l.affected_content_count} affected material(s) · {new Date(l.received_at).toLocaleString()}</p>
                      </div>
                      {l.status === 'pending' && !l.re_review_triggered && (
                        <button onClick={() => handleTriggerReReview(l.id)} className="text-xs px-3 py-1.5 rounded-lg bg-behance-purple/100/10 text-[var(--color-purple)] font-medium hover:bg-behance-purple/100/20 border border-purple-500/20 shrink-0 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          Trigger Re-Review
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ REPORT AE MODAL ═══ */}
        <AnimatePresence>
          {showAeForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAeForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#131620] rounded-2xl shadow-2xl max-w-lg w-full border border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
                <div className="border-b border-white/[0.08] p-5 flex items-center justify-between rounded-t-2xl">
                  <h3 className="font-bold text-[var(--color-text-primary)] text-lg flex items-center gap-2"><HeartPulse className="w-5 h-5 text-[var(--color-danger)]" />Report Adverse Event</h3>
                  <button onClick={() => setShowAeForm(false)} className="p-1.5 rounded-lg hover:dash-card/[0.06]"><X className="w-5 h-5 dash-text-tertiary" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">Source Channel *</label>
                      <select value={aeForm.source_channel} onChange={(e) => setAeForm({ ...aeForm, source_channel: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm">
                        {['social_media', 'patient_support', 'field_report', 'digital_channel', 'hcp_interaction', 'call_center'].map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">Seriousness *</label>
                      <select value={aeForm.seriousness} onChange={(e) => setAeForm({ ...aeForm, seriousness: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm">
                        <option value="non_serious">Non-Serious</option>
                        <option value="serious">Serious</option>
                        <option value="fatal">Fatal</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium dash-text-tertiary block mb-1">Product Name *</label>
                    <input value={aeForm.product_name} onChange={(e) => setAeForm({ ...aeForm, product_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium dash-text-tertiary block mb-1">Event Description *</label>
                    <textarea value={aeForm.event_description} onChange={(e) => setAeForm({ ...aeForm, event_description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">Patient Initials</label>
                      <input value={aeForm.patient_initials} onChange={(e) => setAeForm({ ...aeForm, patient_initials: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm" placeholder="e.g. J.D." />
                    </div>
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">MedDRA Preferred Term</label>
                      <input value={aeForm.meddra_pt} onChange={(e) => setAeForm({ ...aeForm, meddra_pt: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm" placeholder="e.g. Headache" />
                    </div>
                  </div>
                  <button onClick={handleReportAe} disabled={!aeForm.product_name || !aeForm.event_description} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-[var(--color-danger)] hover:to-rose-500 disabled:opacity-50 transition-all">Report Adverse Event</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ LOG LABEL CHANGE MODAL ═══ */}
        <AnimatePresence>
          {showLabelForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowLabelForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#131620] rounded-2xl shadow-2xl max-w-lg w-full border border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
                <div className="border-b border-white/[0.08] p-5 flex items-center justify-between rounded-t-2xl">
                  <h3 className="font-bold text-[var(--color-text-primary)] text-lg flex items-center gap-2"><FileWarning className="w-5 h-5 text-behance-amber-500" />Log Label Change</h3>
                  <button onClick={() => setShowLabelForm(false)} className="p-1.5 rounded-lg hover:dash-card/[0.06]"><X className="w-5 h-5 dash-text-tertiary" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">Product *</label>
                      <input value={labelForm.product_name} onChange={(e) => setLabelForm({ ...labelForm, product_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-medium dash-text-tertiary block mb-1">Label Version</label>
                      <input value={labelForm.label_version} onChange={(e) => setLabelForm({ ...labelForm, label_version: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm" placeholder="e.g. 4.2" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium dash-text-tertiary block mb-1">Change Type *</label>
                    <select value={labelForm.change_type} onChange={(e) => setLabelForm({ ...labelForm, change_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm">
                      {['new_indication', 'safety_update', 'dosage_change', 'contraindication', 'black_box', 'general_update'].map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium dash-text-tertiary block mb-1">Change Summary *</label>
                    <textarea value={labelForm.change_summary} onChange={(e) => setLabelForm({ ...labelForm, change_summary: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-white/[0.1] dash-card/[0.04] text-[var(--color-text-primary)] text-sm resize-none" placeholder="Describe what changed in the label..." />
                  </div>
                  <button onClick={handleLogLabelChange} disabled={!labelForm.product_name || !labelForm.change_summary} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] hover:from-[var(--color-purple)] hover:to-purple-500 disabled:opacity-50 transition-all">Log Label Change</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Integration Modal */}
      <AnimatePresence>
        {showAddModal && companyId && user && (
          <AddIntegrationModal
            manifests={manifests}
            existingProviders={connections.map((c) => c.provider_id)}
            companyId={companyId}
            userId={user.id}
            initialSelectedId={typeof showAddModal === 'string' ? showAddModal : undefined}
            onClose={() => setShowAddModal(false)}
            onCreated={() => {
              setShowAddModal(false);
              loadData();
            }}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Integration Card
// ══════════════════════════════════════════════════════════════

function IntegrationCard({
  companyId,
  connection,
  onToggle,
  onDelete,
  onHealthCheck,
  onUpdate,
  showToast,
  commonEventTypes,
  slackChannels,
  onLoadSlackChannels,
  loadingSlackChannels,
  slackBotInfo,
}: {
  companyId: string;
  connection: IntegrationConnection;
  onToggle: (c: IntegrationConnection) => void;
  onDelete: (c: IntegrationConnection) => void;
  onHealthCheck: (c: IntegrationConnection) => void;
  onUpdate: (id: string, patch: any) => Promise<void>;
  showToast: (t: { type: 'success' | 'error'; message: string }) => void;
  commonEventTypes: string[];
  slackChannels: Record<string, { id: string; name: string; is_private: boolean; is_member: boolean }[]>;
  onLoadSlackChannels: (c: IntegrationConnection) => Promise<void>;
  loadingSlackChannels: Record<string, boolean>;
  slackBotInfo: Record<string, { bot_user_id?: string | null; bot_user_name?: string | null; team_id?: string | null; team_name?: string | null }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState((connection.config.webhook_url as string) || '');
  const [saving, setSaving] = useState(false);

  const isActive = connection.status === 'active';
  const isSlack = connection.provider_id === 'slack';
  const isSlackOAuth = isSlack && (connection.config.auth_mode === 'oauth');
  const isTeams = connection.provider_id === 'microsoft_teams';
  const isGoogleDrive = connection.provider_id === 'google_drive';
  const isMicrosoft365 = connection.provider_id === 'microsoft_365';
  const ProviderIcon = isSlack ? Slack : Plug;

  // Google Drive picker state (minimal)
  const [driveFolders, setDriveFolders] = useState<{ id: string; name: string }[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const driveRootFolderId = (connection.config.root_folder_id as string | undefined) || '';
  const driveRootFolderName = (connection.config.root_folder_name as string | undefined) || '';

  // Microsoft 365 (drives + folders)
  const [msDrives, setMsDrives] = useState<{ id: string; name: string }[]>([]);
  const [msFolders, setMsFolders] = useState<{ id: string; name: string; web_url?: string | null }[]>([]);
  const [msItems, setMsItems] = useState<{ id: string; name: string; kind: 'folder' | 'file'; web_url?: string | null }[]>([]);
  const [loadingMs, setLoadingMs] = useState(false);
  const msDriveId = (connection.config.ms_drive_id as string | undefined) || '';
  const msDriveName = (connection.config.ms_drive_name as string | undefined) || '';
  const msRootId = (connection.config.ms_root_item_id as string | undefined) || '';
  const msRootName = (connection.config.ms_root_item_name as string | undefined) || '';
  const msRootWebUrl = (connection.config.ms_root_web_url as string | undefined) || '';
  const msDefaultAssetUrl = (connection.config.ms_default_asset_url as string | undefined) || '';
  const msDefaultAssetName = (connection.config.ms_default_asset_name as string | undefined) || '';

  const channelMap = (connection.config.channel_map as Record<string, string> | undefined) || {};
  const defaultChannelId = (connection.config.default_channel_id as string | undefined) || '';

  // Teams event routing (per webhook URL)
  const teamsWebhookMap = (connection.config.webhook_map as Record<string, string> | undefined) || {};
  const teamsDefaultWebhookUrl =
    (connection.config.default_webhook_url as string | undefined) ||
    (connection.config.webhook_url as string | undefined) ||
    '';

  const slackChannelsForConn = slackChannels[connection.id] || [];
  const botInfo = slackBotInfo[connection.id];
  const slackBotDisplay = botInfo?.bot_user_name ? `@${botInfo.bot_user_name}` : '@your-app';
  const selectedSlackDefault = slackChannelsForConn.find((c) => c.id === defaultChannelId);

  const statusColor = {
    active: 'bg-[var(--color-success)]',
    error: 'bg-[var(--color-danger)]',
    disabled: 'bg-[var(--color-text-tertiary)]',
    pending: 'bg-behance-amber-500',
    revoked: 'bg-[var(--color-danger)]',
  }[connection.status] || 'bg-[var(--color-text-tertiary)]';

  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      await onUpdate(connection.id, { config: { ...connection.config, webhook_url: webhookUrl } });
      setEditing(false);
      showToast({ type: 'success', message: 'Webhook URL updated' });
    } catch (err: any) {
      showToast({ type: 'error', message: err.message });
    }
    setSaving(false);
  };

  const joinSlackChannel = async (channelId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('slack-channels', {
        body: { action: 'join_channel', company_id: companyId, connection_id: connection.id, channel_id: channelId },
      });
      if (error) throw error;
      if (!data?.ok) {
        showToast({ type: 'error', message: data?.message || data?.error || 'Could not join channel' });
        return;
      }
      showToast({ type: 'success', message: 'Joined channel (or already a member).' });
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not join channel' });
    }
  };

  const connectGoogleDrive = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-oauth', {
        body: { action: 'start', company_id: companyId, connection_id: connection.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || 'Missing OAuth URL');
      window.location.href = data.url;
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not start Google Drive OAuth' });
    }
  };

  const loadDriveFolders = async (parentId?: string) => {
    setLoadingDrive(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-browse', {
        body: { company_id: companyId, connection_id: connection.id, parent_id: parentId || 'root' },
      });
      if (error) throw error;
      setDriveFolders(((data?.folders || []) as any[]).map((f) => ({ id: f.id, name: f.name })));
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not load Drive folders' });
    }
    setLoadingDrive(false);
  };

  const connectMicrosoft365 = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('microsoft-oauth', {
        body: { action: 'start', company_id: companyId, connection_id: connection.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || 'Missing OAuth URL');
      window.location.href = data.url;
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not start Microsoft OAuth' });
    }
  };

  const loadMicrosoftDrives = async () => {
    setLoadingMs(true);
    try {
      const { data, error } = await supabase.functions.invoke('microsoft-browse', {
        body: { action: 'list_drives', company_id: companyId, connection_id: connection.id },
      });
      if (error) throw error;
      const drives = ((data?.drives || []) as any[]).map((d) => ({ id: d.id, name: d.name }));
      setMsDrives(drives);
      showToast({ type: 'success', message: `Loaded ${drives.length} locations` });
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not load Microsoft drives' });
    }
    setLoadingMs(false);
  };

  const loadMicrosoftFolders = async (parentId?: string) => {
    if (!msDriveId) {
      showToast({ type: 'error', message: 'Select a location first' });
      return;
    }
    setLoadingMs(true);
    try {
      const { data, error } = await supabase.functions.invoke('microsoft-browse', {
        body: { action: 'list_folders', company_id: companyId, connection_id: connection.id, drive_id: msDriveId, parent_id: parentId || 'root' },
      });
      if (error) throw error;
      const folders = ((data?.folders || []) as any[]).map((f) => ({ id: f.id, name: f.name, web_url: f.web_url || null }));
      setMsFolders(folders);
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not load folders' });
    }
    setLoadingMs(false);
  };

  const loadMicrosoftItems = async (parentId?: string) => {
    if (!msDriveId) {
      showToast({ type: 'error', message: 'Select a location first' });
      return;
    }
    setLoadingMs(true);
    try {
      const { data, error } = await supabase.functions.invoke('microsoft-browse', {
        body: {
          action: 'list_items',
          company_id: companyId,
          connection_id: connection.id,
          drive_id: msDriveId,
          parent_id: parentId || (msRootId || 'root'),
          limit: 50,
        },
      });
      if (error) throw error;
      const items = ((data?.items || []) as any[]).map((it) => ({
        id: it.id,
        name: it.name,
        kind: (it.kind as 'folder' | 'file') || (it.folder ? 'folder' : 'file'),
        web_url: it.web_url || null,
      }));
      setMsItems(items);
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message || 'Could not load items' });
    }
    setLoadingMs(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: 'success', message: 'Copied link' });
    } catch {
      showToast({ type: 'error', message: 'Could not copy (browser blocked clipboard)' });
    }
  };

  return (
    <motion.div layout className="dash-card/[0.03] rounded-2xl border border-white/[0.08] shadow-sm overflow-hidden hover:border-white/[0.15] transition-all backdrop-blur-sm group">
      {/* Card Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center dash-card/[0.06]">
            <img src={getProviderLogoById(connection.provider_id, connection.display_name)} alt={connection.display_name} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            <ProviderIcon className="w-5 h-5 dash-text-tertiary hidden" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--color-text-primary)]">{connection.display_name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span className="text-xs dash-text-tertiary capitalize">{connection.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onHealthCheck(connection)}
            title="Test connection"
            className="p-2 dash-text-secondary hover:text-[var(--color-purple)] hover:dash-card/[0.06] rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(connection)}
            className="p-2 dash-text-secondary hover:text-[var(--color-purple)] hover:dash-card/[0.06] rounded-lg transition-colors"
          >
            {isActive ? <ToggleRight className="w-5 h-5 text-[var(--color-success)]" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 dash-text-secondary hover:dash-text-tertiary hover:dash-card/[0.06] rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Settings */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-white/[0.06] px-6 py-4 space-y-4">
              {/* Microsoft 365 (SharePoint + OneDrive) */}
              {isMicrosoft365 && (
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Shield className="w-4 h-4 text-sky-700" />
                        Microsoft 365 Connection
                      </p>
                      <p className="text-xs dash-text-tertiary mt-1">
                        Connect once per company. Pick a SharePoint/OneDrive location where compliance files will be attached from.
                      </p>
                    </div>
                    <button
                      onClick={connectMicrosoft365}
                      className="px-3 py-2 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500"
                    >
                      Connect Microsoft 365
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={loadMicrosoftDrives}
                      className="px-3 py-2 text-xs font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08]"
                      disabled={loadingMs}
                    >
                      {loadingMs ? 'Loading…' : 'Load locations'}
                    </button>
                    {msDriveId && (
                      <div className="text-[11px] dash-text-secondary">
                        Selected: <span className="font-medium">{msDriveName || msDriveId}</span>
                      </div>
                    )}
                  </div>

                  {msDrives.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-medium dash-text-secondary mb-1">Location</label>
                      <select
                        className="w-full px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                        value={msDriveId}
                        onChange={(e) => {
                          const driveId = e.target.value;
                          const drive = msDrives.find((d) => d.id === driveId);
                          onUpdate(connection.id, {
                            config: {
                              ...connection.config,
                              ms_drive_id: driveId,
                              ms_drive_name: drive?.name || null,
                              ms_root_item_id: null,
                              ms_root_item_name: null,
                              ms_root_web_url: null,
                            },
                          });
                          setMsFolders([]);
                          setMsItems([]);
                        }}
                      >
                        <option value="">Select a location…</option>
                        {msDrives.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => loadMicrosoftFolders('root')}
                          className="px-3 py-2 text-xs font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08]"
                          disabled={loadingMs || !msDriveId}
                        >
                          {loadingMs ? 'Loading…' : 'Load folders'}
                        </button>
                        {msRootId && (
                          <div className="text-[11px] dash-text-secondary">
                            Root: <span className="font-medium">{msRootName || msRootId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {msFolders.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-medium dash-text-secondary mb-1">Set root folder</label>
                      <select
                        className="w-full px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                        value={msRootId}
                        onChange={(e) => {
                          const folderId = e.target.value;
                          const folder = msFolders.find((f) => f.id === folderId);
                          onUpdate(connection.id, {
                            config: {
                              ...connection.config,
                              ms_root_item_id: folderId,
                              ms_root_item_name: folder?.name || null,
                              ms_root_web_url: folder?.web_url || null,
                            },
                          });
                          setMsItems([]);
                        }}
                      >
                        <option value="">(Use drive root)</option>
                        {msFolders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      {msRootWebUrl && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(msRootWebUrl)}
                            className="px-3 py-2 text-xs font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08]"
                          >
                            Copy folder link
                          </button>
                          <a
                            href={msRootWebUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-sky-400 hover:underline"
                          >
                            Open folder
                          </a>
                        </div>
                      )}
                      <p className="text-[11px] dash-text-secondary mt-1">This controls where the Microsoft picker starts.</p>
                    </div>
                  )}

                  {/* Microsoft file picker (deep links) */}
                  {msDriveId && (
                    <div className="mt-4 dash-card/[0.03] border border-white/[0.08] rounded-xl p-3">
                      <p className="text-xs font-semibold dash-text-tertiary mb-2">File picker (deep links)</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => loadMicrosoftItems(msRootId || 'root')}
                          className="px-3 py-2 text-xs font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08]"
                          disabled={loadingMs}
                        >
                          {loadingMs ? 'Loading…' : 'Load items'}
                        </button>
                        {msDefaultAssetUrl && (
                          <div className="text-[11px] dash-text-secondary">
                            Default asset: <span className="font-medium">{msDefaultAssetName || 'Selected file'}</span>
                          </div>
                        )}
                      </div>

                      {msItems.length > 0 && (
                        <div className="mt-3 max-h-56 overflow-y-auto divide-y dash-divide">
                          {msItems
                            .filter((it) => it.kind === 'file')
                            .slice(0, 20)
                            .map((it) => (
                              <div key={it.id} className="py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs text-[var(--color-text-primary)] truncate">📄 {it.name}</div>
                                  {it.web_url && (
                                    <div className="text-[11px] dash-text-secondary truncate">{it.web_url}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => it.web_url && copyToClipboard(it.web_url)}
                                    disabled={!it.web_url}
                                    className="px-2.5 py-1.5 text-[11px] font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08] disabled:opacity-50"
                                  >
                                    Copy link
                                  </button>
                                  <button
                                    onClick={() =>
                                      onUpdate(connection.id, {
                                        config: {
                                          ...connection.config,
                                          ms_default_asset_url: it.web_url || null,
                                          ms_default_asset_name: it.name,
                                        },
                                      })
                                    }
                                    disabled={!it.web_url}
                                    className="px-2.5 py-1.5 text-[11px] font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500 disabled:opacity-50"
                                  >
                                    Use as default
                                  </button>
                                </div>
                              </div>
                            ))}
                          {msItems.filter((it) => it.kind === 'file').length === 0 && (
                            <div className="py-2 text-[11px] dash-text-secondary">No files found in this folder.</div>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] dash-text-secondary mt-2">
                        These links are what you’ll store as <span className="font-mono">asset_url</span> when you start attaching Microsoft files to reviews.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Google Drive (OAuth + folder picker) */}
              {isGoogleDrive && (
                <div className="bg-behance-amber-500/5 border border-behance-amber-500/20 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Shield className="w-4 h-4 text-behance-amber-700" />
                        Google Drive Connection
                      </p>
                      <p className="text-xs dash-text-tertiary mt-1">Connect Drive once per company. Then choose a root folder for picking files.</p>
                    </div>
                    <button
                      onClick={connectGoogleDrive}
                      className="px-3 py-2 text-xs font-medium text-white bg-behance-amber-600 rounded-lg hover:bg-behance-amber-500"
                    >
                      Connect Google Drive
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => loadDriveFolders('root')}
                      className="px-3 py-2 text-xs font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08]"
                      disabled={loadingDrive}
                    >
                      {loadingDrive ? 'Loading folders…' : 'Load folders'}
                    </button>
                    {driveRootFolderId && (
                      <div className="text-[11px] dash-text-secondary">
                        Current root: <span className="font-medium">{driveRootFolderName || driveRootFolderId}</span>
                      </div>
                    )}
                  </div>

                  {driveFolders.length > 0 && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-medium dash-text-secondary mb-1">Set root folder</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                          value={driveRootFolderId}
                          onChange={(e) => {
                            const folderId = e.target.value;
                            const folder = driveFolders.find((f) => f.id === folderId);
                            onUpdate(connection.id, {
                              config: {
                                ...connection.config,
                                root_folder_id: folderId,
                                root_folder_name: folder?.name || null,
                              },
                            });
                          }}
                        >
                          <option value="">(Start from Drive root)</option>
                          {driveFolders.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setDriveFolders([]);
                          }}
                          className="px-3 py-2 text-xs font-medium dash-text-secondary dash-card border dash-border rounded-lg hover:dash-surface-alt"
                        >
                          Close
                        </button>
                      </div>
                      <p className="text-[11px] dash-text-secondary mt-1">This controls where the Drive picker starts.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Webhook URL (only for non-OAuth Slack + generic webhooks) */}
              {!isTeams && (connection.provider_id === 'webhook' || (isSlack && !isSlackOAuth)) && (
                <div>
                  <label className="block text-xs font-semibold dash-text-tertiary mb-1.5">Webhook URL</label>
                  {editing ? (
                    <div className="flex gap-2">
                      <input
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="flex-1 px-3 py-2 border border-white/[0.1] dash-card/[0.04] rounded-lg text-sm text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none"
                        placeholder="https://hooks.slack.com/services/..."
                      />
                      <button
                        onClick={handleSaveUrl}
                        disabled={saving}
                        className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] text-white text-sm rounded-lg hover:from-[var(--color-purple)] hover:to-purple-500 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setWebhookUrl((connection.config.webhook_url as string) || '');
                        }}
                        className="px-3 py-2 text-sm dash-text-tertiary border border-white/[0.1] rounded-lg hover:dash-card/[0.06]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 dash-card/[0.04] px-3 py-2 rounded-lg text-sm dash-text-tertiary font-mono truncate">
                        {connection.config.webhook_url ? '••••••••' + (connection.config.webhook_url as string).slice(-12) : 'Not set'}
                      </div>
                      <button
                        onClick={() => setEditing(true)}
                        className="px-3 py-2 text-sm text-[var(--color-purple)] border border-indigo-500/20 rounded-lg hover:bg-[var(--color-purple)]/10 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Teams Event Routing */}
              {isTeams && (
                <div className="bg-[var(--color-purple)]/5 border border-indigo-500/20 rounded-xl p-4">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--color-purple)]" />
                    Teams Event Routing
                  </p>
                  <p className="text-xs dash-text-tertiary mt-1">
                    Set a default Teams webhook, then optionally route specific event types to different channels.
                  </p>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold dash-text-tertiary mb-1.5">Default Teams Webhook URL</label>
                    <input
                      value={teamsDefaultWebhookUrl}
                      onChange={(e) =>
                        onUpdate(connection.id, {
                          config: { ...connection.config, default_webhook_url: e.target.value, webhook_url: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                      placeholder="https://outlook.office.com/webhook/..."
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold dash-text-tertiary mb-2">Route Events to Webhooks</label>
                    <div className="space-y-2">
                      {commonEventTypes.map((evt) => (
                        <div key={evt} className="flex items-center gap-3">
                          <div className="text-xs font-mono dash-text-tertiary w-44 truncate" title={evt}>{evt}</div>
                          <input
                            value={teamsWebhookMap[evt] || ''}
                            onChange={(e) => {
                              const next = { ...teamsWebhookMap };
                              if (!e.target.value) delete next[evt];
                              else next[evt] = e.target.value;
                              onUpdate(connection.id, { config: { ...connection.config, webhook_map: next } });
                            }}
                            className="flex-1 px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                            placeholder="Leave blank to use default"
                          />
                          <button
                            onClick={() => {
                              const next = { ...teamsWebhookMap };
                              delete next[evt];
                              onUpdate(connection.id, { config: { ...connection.config, webhook_map: next } });
                            }}
                            className="text-xs dash-text-secondary hover:dash-text"
                            title="Clear routing"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] dash-text-secondary mt-2">Each Teams channel has its own Incoming Webhook URL.</p>
                  </div>
                </div>
              )}

              {/* Slack OAuth Routing */}
              {isSlackOAuth && (
                <div className="bg-[var(--color-purple)]/5 border border-indigo-500/20 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[var(--color-behance-blue)]" />
                        Slack OAuth Routing
                      </p>
                      <p className="text-xs dash-text-tertiary mt-1">Choose a default channel, then optionally route specific event types to different channels.</p>
                    </div>
                    <button
                      onClick={() => onLoadSlackChannels(connection)}
                      disabled={!!loadingSlackChannels[connection.id]}
                      className="px-3 py-2 text-xs font-medium text-[var(--color-purple)] dash-card/[0.04] border border-indigo-500/20 rounded-lg hover:bg-[var(--color-purple)]/10 disabled:opacity-50"
                    >
                      {loadingSlackChannels[connection.id] ? 'Loading…' : 'Load channels'}
                    </button>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold dash-text-tertiary mb-1.5">Default Channel</label>
                    <select
                      value={defaultChannelId}
                      onChange={(e) => onUpdate(connection.id, { config: { ...connection.config, default_channel_id: e.target.value } })}
                      className="w-full px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                    >
                      <option value="">Select a channel…</option>
                      {slackChannelsForConn.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.is_private && !c.is_member}>
                          {c.is_private ? '🔒 ' : ''}#{c.name}{c.is_member ? '' : ' (not joined)'}
                        </option>
                      ))}
                    </select>

                    {selectedSlackDefault && !selectedSlackDefault.is_private && !selectedSlackDefault.is_member && (
                      <button
                        onClick={() => joinSlackChannel(selectedSlackDefault.id)}
                        className="mt-2 inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-purple)] dash-card/[0.04] border border-indigo-500/20 rounded-lg hover:bg-[var(--color-purple)]/10"
                      >
                        Join selected channel
                      </button>
                    )}

                    {selectedSlackDefault && selectedSlackDefault.is_private && !selectedSlackDefault.is_member && (
                      <div className="mt-2 text-[11px] dash-text-secondary">
                        Private channels require inviting the Slack app/bot into the channel first. In Slack, open that channel and run:{' '}
                        <span className="font-mono dash-card/60 px-1 rounded">/invite {slackBotDisplay}</span>, then click “Load channels” again.
                        {botInfo?.bot_user_id ? <span className="ml-2 text-[11px] dash-text-secondary">(Bot ID: {botInfo.bot_user_id})</span> : null}
                      </div>
                    )}
                    <p className="text-[11px] dash-text-secondary mt-1">If no event-specific routing is set, notifications go here.</p>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold dash-text-tertiary mb-2">Route Events to Channels</label>
                    <div className="space-y-2">
                      {commonEventTypes.map((evt) => (
                        <div key={evt} className="flex items-center gap-3">
                          <div className="text-xs font-mono dash-text-tertiary w-44 truncate" title={evt}>{evt}</div>
                          <select
                            value={channelMap[evt] || ''}
                            onChange={(e) => {
                              const next = { ...channelMap };
                              if (!e.target.value) delete next[evt];
                              else next[evt] = e.target.value;
                              onUpdate(connection.id, { config: { ...connection.config, channel_map: next } });
                            }}
                            className="flex-1 px-3 py-2 border border-white/[0.1] rounded-lg text-sm dash-card/[0.04] text-[var(--color-text-primary)]"
                          >
                            <option value="">Use default</option>
                            {slackChannelsForConn
                              .filter((c) => !c.is_private || c.is_member)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.is_private ? '🔒 ' : ''}#{c.name}</option>
                              ))}
                          </select>
                          <button
                            onClick={() => {
                              const next = { ...channelMap };
                              delete next[evt];
                              onUpdate(connection.id, { config: { ...connection.config, channel_map: next } });
                            }}
                            className="text-xs dash-text-secondary hover:dash-text"
                            title="Clear routing"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] dash-text-secondary mt-2">Tip: You can keep everything in one channel until you’re ready.</p>
                  </div>
                </div>
              )}

              {/* Notification Toggles */}
              <div>
                <label className="block text-xs font-semibold dash-text-tertiary mb-2">Notification Events</label>
                <div className="space-y-2">
                  {[
                    { key: 'notify_submissions', label: 'New submissions', desc: 'When content is submitted for review' },
                    { key: 'notify_approvals', label: 'Approvals & rejections', desc: 'When content is approved or rejected' },
                    { key: 'notify_expiry', label: 'License expiry alerts', desc: 'When licenses are expiring or expired' },
                  ].map((toggle) => (
                    <div key={toggle.key} className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{toggle.label}</p>
                        <p className="text-xs dash-text-secondary">{toggle.desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const newVal = connection.config[toggle.key] === false ? true : (connection.config[toggle.key] === true ? false : false);
                          onUpdate(connection.id, { config: { ...connection.config, [toggle.key]: newVal } });
                        }}
                      >
                        {connection.config[toggle.key] !== false ? (
                          <ToggleRight className="w-6 h-6 text-[var(--color-success)]" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 dash-text-tertiary" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metadata */}
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs dash-text-secondary">
                <span>Created {new Date(connection.created_at).toLocaleDateString()}</span>
                <button
                  onClick={() => onDelete(connection)}
                  className="flex items-center gap-1 text-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Add Integration Modal
// ══════════════════════════════════════════════════════════════

function AddIntegrationModal({
  manifests,
  existingProviders,
  companyId,
  userId,
  initialSelectedId,
  onClose,
  onCreated,
  showToast,
}: {
  manifests: ProviderManifest[];
  existingProviders: string[];
  companyId: string;
  userId: string;
  initialSelectedId?: string;
  onClose: () => void;
  onCreated: () => void;
  showToast: (t: { type: 'success' | 'error'; message: string }) => void;
}) {
  const [selected, setSelected] = useState<ProviderManifest | null>(() => {
    return initialSelectedId ? manifests.find(m => m.id === initialSelectedId) || null : null;
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleConnect = async () => {
    if (!selected) return;
    setSaving(true);

    // Build config from form
    const config: Record<string, unknown> = {};
    for (const field of selected.configSchema) {
      if (field.type === 'toggle') config[field.key] = true;
      else config[field.key] = form[field.key] || '';
    }

    // Validate required fields
    for (const field of selected.configSchema) {
      if (field.required && field.type !== 'toggle' && !form[field.key]?.trim()) {
        showToast({ type: 'error', message: `${field.label} is required` });
        setSaving(false);
        return;
      }
    }

    try {
      await createConnection({
        company_id: companyId,
        provider_id: selected.id,
        display_name: selected.name,
        status: 'active',
        credentials_encrypted: null,
        config,
        created_by: userId,
      });
      showToast({ type: 'success', message: `${selected.name} connected! 🎉` });
      onCreated();
    } catch (err: any) {
      showToast({ type: 'error', message: err.message });
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#131620] rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white/[0.08]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600/40 to-[var(--color-purple)]/40 border-b border-white/[0.08] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-semibold text-lg">{selected ? `Connect ${selected.name}` : 'Add Integration'}</h3>
          <button onClick={onClose} className="p-1 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {!selected ? (
            <div className="space-y-3">
              <p className="text-sm dash-text-tertiary mb-4">Select a service to connect:</p>
              {manifests.map((m) => {
                const alreadyConnected = existingProviders.includes(m.id);
                const isSlack = m.id === 'slack';
                return (
                  <button
                    key={m.id}
                    disabled={alreadyConnected}
                    onClick={() => setSelected(m)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${alreadyConnected ? 'border-white/[0.04] dash-card/[0.02] opacity-60 cursor-not-allowed' : 'border-white/[0.08] hover:border-indigo-500/40 hover:dash-card/[0.04] cursor-pointer'}`}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center dash-card/[0.06]">
                      <img src={getProviderLogoById(m.id, m.name, m.iconUrl)} alt={m.name} className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                      <Plug className="w-6 h-6 dash-text-secondary hidden" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-[var(--color-text-primary)]">{m.name}</h4>
                        {alreadyConnected && (
                          <span className="text-xs bg-[var(--color-success)]/20 text-[var(--color-success)] px-2 py-0.5 rounded-full">Connected</span>
                        )}
                      </div>
                      <p className="text-sm dash-text-tertiary mt-0.5">{m.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-purple)]/10 border border-indigo-500/20 rounded-lg text-xs text-[var(--color-purple)]">
                <Shield className="w-4 h-4" />
                Secrets are stored securely and never exposed in the UI.
              </div>

              {selected.configSchema
                .filter((f) => f.type !== 'toggle')
                .map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium dash-text-tertiary mb-1">
                      {field.label} {field.required && <span className="text-[var(--color-danger)]">*</span>}
                    </label>
                    <input
                      type={field.type === 'url' ? 'url' : 'text'}
                      value={form[field.key] || ''}
                      onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-white/[0.1] dash-card/[0.04] rounded-lg text-sm text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none"
                      placeholder={field.placeholder}
                    />
                    {field.helpText && (
                      <p className="text-xs dash-text-secondary mt-1 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> {field.helpText}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-6 py-4 flex items-center justify-between">
          <button
            onClick={selected && !initialSelectedId ? () => setSelected(null) : onClose}
            className="px-4 py-2 text-sm font-medium dash-text-tertiary dash-card/[0.04] border border-white/[0.1] rounded-lg hover:dash-card/[0.08] transition-colors"
          >
            {selected && !initialSelectedId ? 'Back' : 'Cancel'}
          </button>
          {selected && (
            <button
              onClick={handleConnect}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] rounded-lg hover:from-[var(--color-purple)] hover:to-purple-500 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Connect
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

