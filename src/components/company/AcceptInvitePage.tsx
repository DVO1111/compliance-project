import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

type Props = {
  token: string | null;
  onGoLogin: () => void;
  onGoSignup: () => void;
  onDone: () => void;
};

type Status =
  | "idle"
  | "needs-token"
  | "needs-auth"
  | "accepting"
  | "success"
  | "error";

export default function AcceptInvitePage({ token, onGoLogin, onGoSignup, onDone }: Props) {
  const { user, refreshProfile } = useAuth();

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const trimmedToken = useMemo(() => (token ? token.trim() : ""), [token]);

  // Once we start processing (either via form submit or auto-accept for logged-in
  // users), prevent the effect from re-running and double-accepting.
  const processingRef = useRef(false);

  useEffect(() => {
    if (!trimmedToken) {
      setStatus("needs-token");
      setMessage("Invite token is missing or invalid.");
      return;
    }

    if (processingRef.current) return; // form submit or earlier auto-accept is handling it

    if (!user) {
      localStorage.setItem("pending_invite_token", trimmedToken);
      setStatus("needs-auth");
      return;
    }

    // Already logged in — accept now
    processingRef.current = true;

    (async () => {
      try {
        setStatus("accepting");
        setMessage("");

        const { error } = await (supabase as any).rpc("accept_company_invite", {
          p_token: trimmedToken,
        });

        if (error) throw error;

        localStorage.removeItem("pending_invite_token");
        await refreshProfile();
        window.history.replaceState({}, "", "/");

        setStatus("success");
        setMessage("Invite accepted! Redirecting…");
        onDone();
      } catch (e: any) {
        processingRef.current = false;
        setStatus("error");
        setMessage(e?.message || "Failed to accept invite.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedToken, user]);

  return (
    /*  The brand's own ground, not the #002D62 → #00A86B gradient this
        screen used to carry. See src/components/BrandSplash.tsx.  */
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--onboarding-glow)' }}
    >
      <div className="w-full max-w-lg dash-card rounded-xl shadow-xl border dash-border p-6">
        <h1 className="text-xl font-bold dash-text">Accept Invite</h1>

        {/* Missing token */}
        {status === "needs-token" && (
          <div className="mt-4 p-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-sm dash-text">
            {message}
          </div>
        )}

        {/* Processing spinner */}
        {status === "accepting" && (
          <div className="mt-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 rounded-full border-b-2 border-[var(--color-behance-blue)]" />
            <p className="text-sm dash-text">Accepting invite…</p>
          </div>
        )}

        {/* Use the standard signup flow so profile creation stays server-controlled. */}
        {status === "needs-auth" && (
          <>
            <p className="mt-2 text-sm dash-subtext">
              Create an account with the invited email address to join your team.
            </p>

            <div className="mt-5 space-y-4">
              <button
                onClick={onGoSignup}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-behance-blue)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Continue to account setup
              </button>

              <p className="text-center text-xs dash-subtext">
                Already have an account?{" "}
                <button
                  onClick={onGoLogin}
                  className="text-[var(--color-behance-blue)] hover:underline"
                >
                  Log in instead
                </button>
              </p>
            </div>
          </>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="mt-4 p-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-sm dash-text">
            {message}
            <div className="mt-3">
              <button
                onClick={() => {
                  processingRef.current = false;
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] dash-surface-alt text-sm hover:opacity-80"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="mt-4 p-4 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-sm dash-text">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
