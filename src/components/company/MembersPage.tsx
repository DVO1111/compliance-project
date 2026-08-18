import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { getPermissions } from "../../lib/permissions";
import { MODULE_DEFINITIONS, getModuleLabel } from "../../lib/moduleAccess";
import { logger } from '../../lib/logger';
import { UserPlus, RefreshCw, Trash2, Users } from "lucide-react";

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  department_id: string | null;
  joined_at: string;
  module_access?: string[] | null;
  full_name?: string | null;
  email?: string | null;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function shortId(id: string) {
  if (!id) return "";
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name) return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function MembersPage() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const perms = getPermissions({ profileRole: profile?.role, customPermissions: (profile as any)?.customPermissions });

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canLoad = useMemo(() => Boolean(companyId), [companyId]);

  async function loadMembers() {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    const { data: memberData, error: memberErr } = await (supabase as any)
      .from("company_members")
      .select("id,user_id,role,status,department_id,joined_at,module_access")
      .eq("company_id", companyId)
      .order("joined_at", { ascending: false });

    if (memberErr) {
      setError(memberErr.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const baseMembers = (memberData ?? []) as Omit<MemberRow, "full_name" | "email">[];
    const userIds = Array.from(new Set(baseMembers.map((m) => m.user_id))).filter(Boolean);

    if (userIds.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileErr } = await (supabase as any)
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);

    const profileMap = new Map<string, ProfileMini>();
    if (!profileErr && profileData) {
      for (const p of profileData as unknown as ProfileMini[]) {
        profileMap.set(p.id, p);
      }
    }

    if (profileErr) logger.warn("Profiles lookup failed:", profileErr.message);

    setMembers(baseMembers.map((m: any) => {
      const p = profileMap.get(m.user_id);
      return { ...m, full_name: p?.full_name ?? null, email: p?.email ?? null, module_access: m.module_access ?? null };
    }));
    setLoading(false);
  }

  async function handleRemove(memberId: string, userId: string) {
    if (userId === profile?.id) return; // can't remove yourself
    setRemovingId(memberId);
    try {
      const { error } = await (supabase as any)
        .from("company_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err: any) {
      logger.error("Failed to remove member:", err);
      setError(err.message || "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  useEffect(() => {
    if (!canLoad) { setLoading(false); return; }
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, companyId]);

  if (!companyId) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold dash-text">Members</h1>
        <p className="text-sm dash-text-tertiary">No company selected. Please finish company setup.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold dash-text">Team Members</h1>
          <p className="text-sm dash-text-tertiary">
            {loading ? 'Loading…' : `${members.length} member${members.length !== 1 ? 's' : ''} in your organisation`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMembers}
            className="p-2 rounded-xl border dash-border hover:bg-[var(--color-surface-alt)] transition-colors dash-text-secondary"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {perms.canInvite && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'company-invites' } }))}
              className="dash-button-primary flex items-center gap-2"
            >
              <UserPlus size={16} />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-sm dash-text flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Table */}
      <div className="dash-card border dash-border rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="dash-surface border-b dash-border">
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Member</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Role</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Modules</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Joined</th>
              {perms.canInvite && <th className="px-6 py-4" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b dash-border last:border-0">
                  <td colSpan={perms.canInvite ? 6 : 5} className="px-6 py-5">
                    <div className="h-4 bg-[var(--color-surface-alt)] rounded animate-pulse w-2/3" />
                  </td>
                </tr>
              ))
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={perms.canInvite ? 6 : 5} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center">
                      <Users size={22} className="dash-text-tertiary" />
                    </div>
                    <p className="font-semibold dash-text">No members yet</p>
                    <p className="text-sm dash-text-tertiary">Invite your team to start collaborating.</p>
                    {perms.canInvite && (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'company-invites' } }))}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md mt-1"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <UserPlus size={16} /> Invite Member
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const isSelf = m.user_id === profile?.id;
                const isRemoving = removingId === m.id;
                return (
                  <tr key={m.id} className="border-b dash-border last:border-0 hover:bg-[var(--color-surface-alt)] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center text-[var(--color-accent)] text-xs font-bold flex-shrink-0">
                          {getInitials(m.full_name, m.email)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold dash-text">
                            {m.full_name || 'Unnamed'}
                            {isSelf && <span className="ml-2 text-[10px] font-normal dash-text-tertiary">(you)</span>}
                          </div>
                          <div className="text-xs dash-text-tertiary">{m.email || shortId(m.user_id)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold dash-surface-alt dash-text-secondary border dash-border capitalize">
                        {m.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {m.module_access && m.module_access.length > 0 ? (
                          m.module_access.map((mod: string) => (
                            <span
                              key={mod}
                              className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border"
                              style={{
                                background: 'var(--color-accent-soft, rgba(0,74,153,0.08))',
                                color: 'var(--color-accent, var(--color-accent))',
                                borderColor: 'var(--color-accent-soft, rgba(0,74,153,0.15))',
                              }}
                            >
                              {getModuleLabel(mod)}
                            </span>
                          ))
                        ) : (
                          m.role === 'owner' ? (
                            <span className="text-[10px] dash-text-tertiary italic">All modules</span>
                          ) : (
                            <span className="text-[10px] dash-text-tertiary">—</span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} />
                        <span className="text-xs dash-text capitalize">{m.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs dash-text-tertiary">
                      {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                    </td>
                    {perms.canInvite && (
                      <td className="px-6 py-4 text-right">
                        {!isSelf && (
                          <button
                            onClick={() => handleRemove(m.id, m.user_id)}
                            disabled={isRemoving}
                            title="Remove member"
                            className="p-1.5 rounded-lg text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors disabled:opacity-40"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
