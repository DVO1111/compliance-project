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
  | "registering"
  | "accepting"
  | "confirm-email"
  | "success"
  | "error";

export default function AcceptInvitePage({ token, onGoLogin, onGoSignup, onDone }: Props) {
  const { user, refreshProfile } = useAuth();

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  // Inline signup form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const trimmedToken = useMemo(() => (token ? token.trim() : ""), [token]);

  // Once we start processing (either via form submit or auto-accept for logged-in
  // users), prevent the effect from re-running and double-accepting.
  const processingRef = useRef(false);

  // Track which path triggered an error so retry works correctly.
  const errorOriginRef = useRef<"register" | "accept">("accept");

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
    errorOriginRef.current = "accept";

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

  const handleCreateAndAccept = async () => {
    if (!formName.trim()) { setMessage("Please enter your full name."); return; }
    if (!formEmail.trim()) { setMessage("Please enter your email address."); return; }
    if (formPassword.length < 6) { setMessage("Password must be at least 6 characters."); return; }

    processingRef.current = true;
    errorOriginRef.current = "register";
    setStatus("registering");
    setMessage("");

    try {
      // 1) Create auth account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formEmail.trim(),
        password: formPassword,
      });

      if (signUpError) throw signUpError;

      const userId = authData.user?.id;
      const userEmail = authData.user?.email;

      if (!userId || !userEmail) {
        throw new Error("Signup succeeded but no user data was returned.");
      }

      // Email confirmation required — can't proceed without a session
      if (!authData.session) {
        setStatus("confirm-email");
        setMessage(
          "Check your email inbox to confirm your account, then return to this invite link to continue."
        );
        return;
      }

      // 2) Insert minimal profile row (no company — the invite will set it)
      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        email: userEmail,
        full_name: formName.trim(),
        onboarding_completed: false,
      });

      if (profileError && profileError.code !== "23505") {
        // 23505 = unique_violation: profile row already exists — safe to continue
        throw profileError;
      }

      // 3) Accept invite → sets company_id on profile + creates company_members row
      const { error: acceptError } = await (supabase as any).rpc("accept_company_invite", {
        p_token: trimmedToken,
      });

      if (acceptError) throw acceptError;

      localStorage.removeItem("pending_invite_token");

      // 4) Reload profile with company + module data
      await refreshProfile();

      window.history.replaceState({}, "", "/");
      setStatus("success");
      setMessage("Welcome! Taking you to your dashboard…");
      onDone();
    } catch (e: any) {
      processingRef.current = false;
      setStatus("error");
      setMessage(e?.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002D62] to-[#00A86B] flex items-center justify-center p-6">
      <div className="w-full max-w-lg dash-card rounded-xl shadow-xl border dash-border p-6">
        <h1 className="text-xl font-bold dash-text">Accept Invite</h1>

        {/* Missing token */}
        {status === "needs-token" && (
          <div className="mt-4 p-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-sm dash-text">
            {message}
          </div>
        )}

        {/* Processing spinner */}
        {(status === "accepting" || status === "registering") && (
          <div className="mt-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 rounded-full border-b-2 border-[var(--color-behance-blue)]" />
            <p className="text-sm dash-text">
              {status === "registering" ? "Creating your account…" : "Accepting invite…"}
            </p>
          </div>
        )}

        {/* Email confirmation required */}
        {status === "confirm-email" && (
          <div className="mt-4 p-4 rounded-lg border border-yellow-400/40 bg-yellow-50/10 text-sm dash-text">
            {message}
          </div>
        )}

        {/* Inline signup form for unauthenticated users */}
        {status === "needs-auth" && (
          <>
            <p className="mt-2 text-sm dash-subtext">
              Create a free account to accept this invite and join your team.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium dash-subtext mb-1">Full Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 rounded-lg border dash-border dash-surface text-sm dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-behance-blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium dash-subtext mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="The email this invite was sent to"
                  className="w-full px-3 py-2 rounded-lg border dash-border dash-surface text-sm dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-behance-blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium dash-subtext mb-1">Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder="Create a password (min. 6 characters)"
                  className="w-full px-3 py-2 rounded-lg border dash-border dash-surface text-sm dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-behance-blue)]"
                />
              </div>

              {message && (
                <p className="text-sm text-[var(--color-danger)]">{message}</p>
              )}

              <button
                onClick={handleCreateAndAccept}
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-behance-blue)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Create account &amp; accept invite
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
                  // Return to form if error was during registration,
                  // otherwise reload to retry the auto-accept path.
                  if (errorOriginRef.current === "register") {
                    setStatus("needs-auth");
                    setMessage("");
                  } else {
                    window.location.reload();
                  }
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
