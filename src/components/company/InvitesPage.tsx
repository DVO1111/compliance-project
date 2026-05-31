import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { getPermissions } from "../../lib/permissions";
import { MODULE_DEFINITIONS, type ModuleKey } from "../../lib/moduleAccess";
import {
  Upload, Scale, BarChart3, ShieldAlert, FileText,
  Building2, BrainCircuit, CheckSquare, Square,
  Copy, Check, X, UserPlus, RefreshCw, ShieldCheck
} from "lucide-react";

const MODULE_ICONS: Record<string, typeof Upload> = {
  Upload, Scale, BarChart3, ShieldAlert, FileText, Building2, BrainCircuit,
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  module_access: string[];
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type CreateInviteResult = {
  invite_id: string;
  raw_token: string;
  expires_at: string;
};

function statusOf(inv: InviteRow) {
  if (inv.revoked_at) return "revoked";
  if (inv.accepted_at) return "accepted";
  if (new Date(inv.expires_at).getTime() < Date.now()) return "expired";
  return "pending";
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/30",
  expired: "bg-[var(--color-surface-alt)] dash-text-tertiary border-[var(--color-border)]",
  revoked: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/30",
};

export default function InvitesPage() {
  const { profile } = useAuth();
  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
  });
  const companyId = profile?.company_id ?? null;

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedRole, setSelectedRole] = useState<string>("viewer");

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const canLoad = useMemo(() => Boolean(companyId), [companyId]);

  async function loadInvites() {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("company_invites" as any)
      .select("id,email,role,module_access,expires_at,accepted_at,revoked_at,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) { setError(error.message); setInvites([]); setLoading(false); return; }
    setInvites((data ?? []) as unknown as InviteRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!canLoad) { setLoading(false); return; }
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, companyId]);

  function toggleModule(key: ModuleKey) {
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    if (selectedModules.length === MODULE_DEFINITIONS.length) {
      setSelectedModules([]);
    } else {
      setSelectedModules(MODULE_DEFINITIONS.map(m => m.key));
    }
  }

  function openModal() {
    setError(null);
    setCreatedLink(null);
    setEmail("");
    setSelectedModules([]);
    setSelectedRole("viewer");
    setCopied(false);
    setShowModal(true);
  }

  async function createInvite() {
    if (!companyId) return;
    if (!perms.canInvite) { setError("You don't have permission to create invites."); return; }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) { setError("Please enter a valid email address."); return; }
    if (selectedModules.length === 0) { setError("Select at least one module for this person."); return; }

    setCreating(true);
    setError(null);
    setCreatedLink(null);

    const { data, error: rpcErr } = await (supabase as any).rpc("create_company_invite", {
      p_company_id: companyId,
      p_email: trimmed,
      p_role: selectedRole,
      p_module_access: selectedModules,
      p_department_id: null,
      p_expires_in_hours: 72,
    });

    setCreating(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as CreateInviteResult | undefined;

    if (row?.raw_token) {
      const link = `${window.location.origin}/invite/accept?token=${encodeURIComponent(row.raw_token)}`;
      setCreatedLink(link);
    }

    setEmail("");
    setSelectedModules([]);
    await loadInvites();
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function revokeInvite(inviteId: string) {
    if (!perms.canRevokeInvite) { setError("You don't have permission to revoke invites."); return; }
    if (!confirm("Revoke this invite? The invited person will no longer be able to accept it.")) return;

    setError(null);
    setRevokingId(inviteId);

    const { error: rpcErr } = await (supabase as any).rpc("revoke_company_invite", { p_invite_id: inviteId });

    if (rpcErr) {
      // Fallback: direct update
      const { error: updErr } = await supabase
        .from("company_invites" as any)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
        .is("accepted_at", null)
        .is("revoked_at", null);
      if (updErr) { setError(updErr.message); setRevokingId(null); return; }
    }

    await loadInvites();
    setRevokingId(null);
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Invites</h1>
        <p className="text-sm opacity-70 mt-2">No company selected. Please finish company setup.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold dash-text">Team Invites</h1>
          <p className="text-sm dash-text-secondary mt-0.5">
            Invite teammates and choose exactly which modules they can access.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadInvites}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border dash-border dash-card hover:bg-[var(--color-surface-alt)] transition text-sm dash-text-secondary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {perms.canInvite && (
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold transition hover:opacity-90"
              style={{ background: 'var(--color-accent)' }}
            >
              <UserPlus className="w-4 h-4" />
              Invite member
            </button>
          )}
        </div>
      </div>

      {!perms.canInvite && (
        <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm dash-text">
          You can view invites, but you don't have permission to create or revoke them.
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-sm dash-text">
          {error}
        </div>
      )}

      {/* Create Invite Modal */}
      {showModal && perms.canInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg dash-card rounded-2xl shadow-xl border dash-border flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="px-6 py-4 border-b dash-border flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold dash-text">Invite a team member</h2>
                <p className="text-xs dash-text-secondary mt-0.5">
                  Choose their email and the modules they can access.
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] dash-text-tertiary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

              {/* Email */}
              <div>
                <label className="text-sm font-semibold dash-text block mb-1.5">Email address</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  type="email"
                  className="w-full px-3 py-2.5 rounded-xl border dash-border bg-[var(--color-surface-alt)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                  disabled={creating}
                />
              </div>

              {/* Role selector */}
              <div>
                <label className="text-sm font-semibold dash-text block mb-1.5">Role</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["admin", "legal", "marketing", "viewer"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRole(r)}
                      disabled={creating}
                      className={`py-2 rounded-xl border text-sm font-medium capitalize transition ${
                        selectedRole === r
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "dash-border dash-card dash-text-secondary hover:bg-[var(--color-surface-alt)]"
                      }`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Module selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold dash-text">Module access</label>
                  <button
                    onClick={toggleAll}
                    className="text-xs dash-text-secondary hover:dash-text transition"
                  >
                    {selectedModules.length === MODULE_DEFINITIONS.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="space-y-2">
                  {MODULE_DEFINITIONS.map(mod => {
                    const Icon = MODULE_ICONS[mod.icon] ?? ShieldCheck;
                    const selected = selectedModules.includes(mod.key);
                    return (
                      <button
                        key={mod.key}
                        onClick={() => toggleModule(mod.key)}
                        disabled={creating}
                        className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border text-left transition ${
                          selected
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'dash-border dash-card hover:bg-[var(--color-surface-alt)]'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          selected ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-alt)] dash-border border'
                        }`}>
                          <Icon className={`w-4 h-4 ${selected ? 'text-white' : 'dash-text-secondary'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold dash-text">{mod.name}</p>
                          <p className="text-xs dash-text-tertiary mt-0.5">{mod.description}</p>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          {selected
                            ? <CheckSquare className="w-4 h-4 text-[var(--color-accent)]" />
                            : <Square className="w-4 h-4 dash-text-tertiary" />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedModules.length > 0 && (
                  <p className="text-xs dash-text-secondary mt-2">
                    {selectedModules.length} of {MODULE_DEFINITIONS.length} modules selected
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-xs dash-text">
                  {error}
                </div>
              )}

              {/* Created link */}
              {createdLink && (
                <div className="p-4 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)]">
                  <p className="text-xs font-semibold text-[var(--color-success)] mb-2">Invite link created — copy and share it</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] dash-text break-all bg-[var(--color-bg)] rounded-lg px-2 py-1.5 border dash-border">
                      {createdLink}
                    </code>
                    <button
                      onClick={() => copyLink(createdLink)}
                      className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[10px] dash-text-tertiary mt-2">
                    This one-time link expires in 72 hours. Treat it like a password.
                  </p>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t dash-border flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border dash-border hover:bg-[var(--color-surface-alt)] text-sm dash-text transition"
                disabled={creating}
              >
                {createdLink ? "Done" : "Cancel"}
              </button>
              {!createdLink && (
                <button
                  onClick={createInvite}
                  className="px-5 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--color-accent)' }}
                  disabled={creating || selectedModules.length === 0}
                >
                  {creating ? "Creating…" : "Create invite"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invites Table */}
      <div className="dash-card border dash-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm dash-text-secondary">Loading invites…</div>
        ) : invites.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-alt)] flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-6 h-6 dash-text-tertiary" />
            </div>
            <p className="text-sm font-semibold dash-text">No invites yet</p>
            <p className="text-xs dash-text-tertiary mt-1">
              Invite your first team member to get started.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dash-border bg-[var(--color-surface-alt)] text-left">
                <th className="px-4 py-3 text-xs font-semibold dash-text-secondary">Email</th>
                <th className="px-4 py-3 text-xs font-semibold dash-text-secondary">Modules</th>
                <th className="px-4 py-3 text-xs font-semibold dash-text-secondary">Status</th>
                <th className="px-4 py-3 text-xs font-semibold dash-text-secondary">Expires</th>
                <th className="px-4 py-3 text-xs font-semibold dash-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const st = statusOf(inv);
                const canRevoke = st === "pending" && perms.canRevokeInvite;
                const modules: string[] = Array.isArray(inv.module_access) ? inv.module_access : [];

                return (
                  <tr key={inv.id} className="border-t dash-border hover:bg-[var(--color-surface-alt)]/50 transition-colors">
                    <td className="px-4 py-3 dash-text font-medium">{inv.email}</td>
                    <td className="px-4 py-3">
                      {modules.length === 0 ? (
                        <span className="text-xs dash-text-tertiary">Legacy role: {inv.role}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {modules.slice(0, 3).map(m => {
                            const def = MODULE_DEFINITIONS.find(d => d.key === m);
                            return (
                              <span key={m} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border dash-border dash-text-secondary bg-[var(--color-surface-alt)]">
                                {def?.name ?? m}
                              </span>
                            );
                          })}
                          {modules.length > 3 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border dash-border dash-text-tertiary">
                              +{modules.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[st] ?? ''}`}>
                        {st}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs dash-text-secondary">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {canRevoke ? (
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          disabled={revokingId === inv.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition disabled:opacity-50"
                        >
                          {revokingId === inv.id ? "Revoking…" : "Revoke"}
                        </button>
                      ) : (
                        <span className="dash-text-tertiary text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
