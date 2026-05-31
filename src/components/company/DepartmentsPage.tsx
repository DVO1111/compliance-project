import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

type DepartmentRow = {
  id: string;
  name: string;
  created_at?: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  department_id: string | null;
  joined_at: string;
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

export default function DepartmentsPage() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [members, setMembers] = useState<
    (MemberRow & { full_name?: string | null; email?: string | null })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDeptName, setNewDeptName] = useState("");

  const canLoad = useMemo(() => Boolean(companyId), [companyId]);

  async function loadAll() {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    // 1) departments
    const { data: deptData, error: deptErr } = await supabase
      .from("departments" as any)
      .select("id,name,created_at")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (deptErr) {
      setError(deptErr.message);
      setDepartments([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setDepartments((deptData ?? []) as unknown as DepartmentRow[]);

    // 2) members
    const { data: memberData, error: memberErr } = await supabase
      .from("company_members" as any)
      .select("id,user_id,role,status,department_id,joined_at")
      .eq("company_id", companyId)
      .order("joined_at", { ascending: false });

    if (memberErr) {
      setError(memberErr.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const baseMembers = (memberData ?? []) as unknown as MemberRow[];
    const userIds = Array.from(new Set(baseMembers.map((m) => m.user_id))).filter(Boolean);

    let profileMap = new Map<string, ProfileMini>();
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", userIds);

      if (profilesData) {
        for (const p of profilesData as ProfileMini[]) profileMap.set(p.id, p);
      }
    }

    setMembers(
      baseMembers.map((m) => {
        const p = profileMap.get(m.user_id);
        return { ...m, full_name: p?.full_name ?? null, email: p?.email ?? null };
      })
    );

    setLoading(false);
  }

  useEffect(() => {
    if (!canLoad) {
      setLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad, companyId]);

  async function createDepartment() {
    if (!companyId) return;
    const name = newDeptName.trim();
    if (!name) {
      setError("Please enter a department name.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("departments" as any).insert({
      company_id: companyId,
      name,
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setNewDeptName("");
    await loadAll();
  }

  async function renameDepartment(deptId: string, nextName: string) {
    const name = nextName.trim();
    if (!name) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("departments" as any).update({ name }).eq("id", deptId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await loadAll();
  }

  async function deleteDepartment(deptId: string) {
    if (!companyId) return;

    setSaving(true);
    setError(null);

    // clear members first (prevents FK issues)
    const { error: clearErr } = await supabase
      .from("company_members" as any)
      .update({ department_id: null })
      .eq("company_id", companyId)
      .eq("department_id", deptId);

    if (clearErr) {
      setSaving(false);
      setError(clearErr.message);
      return;
    }

    const { error: delErr } = await supabase.from("departments" as any).delete().eq("id", deptId);

    setSaving(false);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    await loadAll();
  }

  async function assignMemberDepartment(memberId: string, departmentId: string | null) {
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("company_members" as any)
      .update({ department_id: departmentId })
      .eq("id", memberId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, department_id: departmentId } : m))
    );
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Departments</h1>
        <p className="text-sm opacity-70 mt-2">No company selected.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Departments</h1>
          <p className="text-sm opacity-70 mt-1">Create departments and assign members.</p>
        </div>

        <button
          onClick={loadAll}
          className="px-4 py-2 rounded-lg border border-white/10 dash-card/5 hover:dash-card/10 transition"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="mt-6 text-sm opacity-70">Loading…</div>}

      {error && (
        <div className="mt-6 p-4 rounded-xl border border-red-500/30 bg-[var(--color-danger)]/10 text-sm">
          {error}
        </div>
      )}

      {!loading && (
        <>
          {/* Create Department */}
          <div className="mt-6 dash-card rounded-xl border dash-border p-4">
            <div className="font-semibold dash-text">Create department</div>
            <div className="mt-3 flex gap-2">
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Marketing, Compliance, Legal"
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] focus:outline-none"
                disabled={saving}
              />
              <button
                onClick={createDepartment}
                className="px-4 py-2 rounded-lg bg-[var(--color-behance-blue)] text-white hover:opacity-90"
                disabled={saving}
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>

          {/* Departments list */}
          <div className="mt-6 dash-card rounded-xl border dash-border p-4">
            <div className="font-semibold dash-text">Departments</div>

            {departments.length === 0 ? (
              <div className="mt-3 text-sm dash-text-secondary">No departments yet.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {departments.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-lg border dash-border"
                  >
                    <input
                      defaultValue={d.name}
                      onBlur={(e) => renameDepartment(d.id, e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] focus:outline-none"
                      disabled={saving}
                    />
                    <button
                      onClick={() => deleteDepartment(d.id)}
                      className="px-3 py-2 rounded-lg border border-[var(--color-border)] hover:dash-surface-alt"
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-xs dash-text-secondary">
              Tip: edit a department name then click outside the box to save.
            </div>
          </div>

          {/* Assign members */}
          <div className="mt-6 dash-card rounded-xl border dash-border p-4">
            <div className="font-semibold dash-text">Assign members</div>

            {members.length === 0 ? (
              <div className="mt-3 text-sm dash-text-secondary">No members found.</div>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border dash-border">
                <table className="w-full text-sm">
                  <thead className="dash-surface-alt">
                    <tr className="text-left">
                      <th className="p-3">Member</th>
                      <th className="p-3">Company Role</th>
                      <th className="p-3">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium">{m.full_name || "Unnamed"}</div>
                          <div className="text-xs dash-text-secondary">
                            {m.email || shortId(m.user_id)}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex px-2 py-1 rounded-md dash-surface-alt border dash-border">
                            {m.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <select
                            value={m.department_id ?? ""}
                            onChange={(e) => assignMemberDepartment(m.id, e.target.value || null)}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] focus:outline-none"
                            disabled={saving}
                          >
                            <option value="">No department</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

