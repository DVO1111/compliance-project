import { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function OnboardingCompany({ onDone }: { onDone: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = useMemo(() => companyName.trim(), [companyName]);

  const { provisionWorkspace } = useAuth();

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (trimmedName.length < 2) {
      setError("Company name must be at least 2 characters.");
      return;
    }

    setSubmitting(true);

    //  WHY THIS GOES THROUGH provisionWorkspace AND NOT A BARE RPC.
    //
    //  This screen used to call create_company_and_set_owner, which
    //  exists in no migration — so creating a company from the one
    //  screen whose job is creating a company failed every time.
    //
    //  The obvious repair, calling create_company instead, is still not
    //  enough: it writes the company and the caller's owner membership,
    //  and nothing else. profiles.company_id stays null, which is the
    //  very condition that routes here — so the person would land back
    //  on this screen having just created a company.
    //
    //  provisionWorkspace runs create_company AND provision_profile, the
    //  same pair verified sign-up runs. One definition of what a new
    //  workspace is, rather than three that disagree.
    const { error: err } = await provisionWorkspace(trimmedName);

    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    onDone();
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
