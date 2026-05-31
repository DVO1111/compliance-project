import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function OnboardingCompany({ onDone }: { onDone: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = useMemo(() => companyName.trim(), [companyName]);

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (trimmedName.length < 2) {
      setError("Company name must be at least 2 characters.");
      return;
    }

    setSubmitting(true);

    const { data, error: rpcErr } = await (supabase as any).rpc(
      "create_company_and_set_owner",
      { p_name: trimmedName }
    );

    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    if (data) onDone();
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Create your company</h1>
      <p style={{ marginTop: 0, marginBottom: 24, opacity: 0.8 }}>
        This will set up your workspace and make you the Owner.
      </p>

      <form onSubmit={handleCreateCompany}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Company name
        </label>

        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g., Criateur Media Ltd"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            marginBottom: 12,
          }}
          disabled={submitting}
        />

        {error && (
          <div
            style={{
              background: "rgba(255,0,0,0.08)",
              border: "1px solid rgba(255,0,0,0.2)",
              padding: 12,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Creating…" : "Create company"}
        </button>
      </form>
    </div>
  );
}
