import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type CommentRow = {
  id: string;
  company_id: string;
  submission_id: string;
  author_id: string;
  body: string;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
};

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function CommentsPanel(props: { submissionId: string; companyId: string }) {
  const { submissionId, companyId } = props;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});

  const [newBody, setNewBody] = useState("");

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    comments.forEach((c) => ids.add(c.author_id));
    return Array.from(ids);
  }, [comments]);

  async function loadComments() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("comments" as any)
      .select("id, company_id, submission_id, author_id, body, is_deleted, edited_at, created_at")
      .eq("submission_id", submissionId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setComments((data ?? []) as any);
    setLoading(false);
  }

  async function loadProfiles(ids: string[]) {
    if (!ids.length) return;

    // Pull minimal profile fields for display (name/role/email)
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", ids);

    if (error) return;

    const map: Record<string, ProfileLite> = {};
    (data ?? []).forEach((p) => {
      map[p.id] = p as ProfileLite;
    });

    setProfilesById((prev) => ({ ...prev, ...map }));
  }

  async function sendComment() {
    const body = newBody.trim();
    if (!body) return;

    setSending(true);
    setError(null);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setError("You must be logged in to comment.");
      setSending(false);
      return;
    }

    const authorId = authData.user.id;

    const { error: insertErr } = await supabase.from("comments" as any).insert({
      company_id: companyId,
      submission_id: submissionId,
      author_id: authorId,
      body,
    });

    if (insertErr) {
      setError(insertErr.message);
      setSending(false);
      return;
    }

    setNewBody("");
    setSending(false);

    // Refresh list (simple + reliable)
    await loadComments();
  }

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  useEffect(() => {
    loadProfiles(authorIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorIds.join(",")]);

  // OPTIONAL realtime: if you have Supabase Realtime enabled, this will live-update.
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${submissionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `submission_id=eq.${submissionId}` },
        () => {
          // simplest: reload on any change
          loadComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700 }}>Comments</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Marketing + Compliance thread</div>
      </div>

      {error ? (
        <div style={{ padding: 10, border: "1px solid #ffb3b3", borderRadius: 8 }}>
          <div style={{ color: "#b00020", fontSize: 13 }}>Error: {error}</div>
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          padding: 12,
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {loading ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Loading comments…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            No comments yet. Start a thread between Marketing and Compliance.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map((c) => {
              const p = profilesById[c.author_id];
              const name = p?.full_name || p?.email || c.author_id.slice(0, 8);
              const role = p?.role || "User";

              return (
                <div
                  key={c.id}
                  style={{
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 650 }}>{name}</div>
                      <div
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.16)",
                          opacity: 0.9,
                        }}
                      >
                        {role}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{formatDateTime(c.created_at)}</div>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.4, opacity: c.is_deleted ? 0.6 : 1 }}>
                    {c.is_deleted ? <i>Deleted</i> : c.body}
                    {c.edited_at ? <span style={{ fontSize: 12, opacity: 0.75 }}> (edited)</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Write a comment…"
          rows={3}
          style={{
            flex: 1,
            resize: "vertical",
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
          }}
        />
        <button
          onClick={sendComment}
          disabled={sending || !newBody.trim()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: sending ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
            cursor: sending ? "not-allowed" : "pointer",
            color: "inherit",
            minWidth: 90,
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
