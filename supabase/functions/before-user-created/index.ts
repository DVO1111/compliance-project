/**
 * before-user-created — the allowlist gate, moved in front of Auth
 *
 * ── WHY THIS EXISTS, GIVEN THE ALLOWLIST ALREADY DID ──────────────────────
 *
 * 20261017000000_signin_allowlist.sql put the allowlist on
 * `provision_profile`, and said in its own header what it could not do:
 *
 *   "It does not stop someone creating an auth user: sign-up is Supabase's
 *    own endpoint and is governed in the dashboard, not here. It stops that
 *    user becoming a member of anything."
 *
 * That was true and it was the right control to build first — without a
 * profile there is no company, no membership, and every RLS policy in this
 * schema is written against company membership, so such a session can read
 * nothing. But it leaves a real residue: an unapproved address can still
 * create an `auth.users` row, receive a verification email branded as
 * Criateur, and sit in the project forever. That is the gap this closes.
 *
 * Supabase's "Before User Created" hook runs INSIDE the signup transaction.
 * Returning an error aborts it, so no `auth.users` row is written at all.
 *
 * ── THIS DOES NOT REPLACE THE DATABASE GATE ───────────────────────────────
 *
 * Both stay. The hook is configuration — it can be switched off in the
 * dashboard, and a project restored from a template may not have it. The
 * `provision_profile` guard is in the schema and travels with the database.
 * Defence in depth is the point: the hook stops the account being created,
 * the database stops an account that exists from becoming a member.
 *
 * `security_boundaries_test.sql` asserts both are present for that reason.
 *
 * ── SECRETS ───────────────────────────────────────────────────────────────
 *
 *   SUPABASE_URL              auto-set by the runtime
 *   SUPABASE_SERVICE_ROLE_KEY auto-set by the runtime; server-side only, and
 *                             it never leaves this function
 *   AUTH_HOOK_SECRET          the signing secret Supabase shows when the
 *                             hook is created, in the form `v1,whsec_...`
 *
 * The service-role key is used because the gate must read `allowed_signins`,
 * which has RLS enabled and NO policy — by design, so that the list of who
 * has early access cannot be enumerated from a browser.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

/** What Supabase POSTs to a Before User Created hook. */
interface HookPayload {
  user?: { email?: string | null };
  metadata?: Record<string, unknown>;
}

/**
 * The message an unapproved address sees.
 *
 * Deliberately says the address is not approved and how to ask, rather than
 * pretending the signup worked. This is NOT the enumeration case the
 * password-reset flow guards against: there, the question is "does this
 * address have an account", which leaks who works where. Here the answer is
 * only "this address is not on our pilot list", which the person typing it
 * already knows about themselves and cannot use to probe anyone else — the
 * hook only ever runs on an address its own caller is trying to register.
 */
const NOT_APPROVED =
  "This email address is not approved for Criateur yet. " +
  "Criateur is in a closed pilot. Request access at criateur.com " +
  "and an administrator will add you.";

function deny(message: string, httpCode = 403): Response {
  //  The shape Supabase expects: a 200 carrying an `error` object aborts
  //  the signup and surfaces `message` to the client. A non-200 from the
  //  hook itself is treated as the hook being broken, not as a rejection.
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Allow: an empty object is how the hook says "proceed". */
function allow(): Response {
  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verify the Standard Webhooks signature Supabase sends.
 *
 * Without this, anyone who learns the function URL could POST to it — which
 * would not create a user, but would let them probe the allowlist one
 * address at a time, turning the gate into the enumeration oracle the table
 * has no RLS policy precisely to avoid.
 */
async function signatureValid(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get("AUTH_HOOK_SECRET") ?? "";
  if (!secret) {
    //  Fail closed. An unconfigured secret must not mean "accept anything".
    console.error("[before-user-created] AUTH_HOOK_SECRET is not set");
    return false;
  }

  const id = req.headers.get("webhook-id") ?? "";
  const timestamp = req.headers.get("webhook-timestamp") ?? "";
  const signatureHeader = req.headers.get("webhook-signature") ?? "";
  if (!id || !timestamp || !signatureHeader) return false;

  //  Reject anything older than five minutes, so a captured request cannot
  //  be replayed indefinitely.
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(Date.now() / 1000 - sent) > 300) {
    return false;
  }

  //  `v1,whsec_...` — the part after the comma is base64.
  const base64Secret = secret.includes(",") ? secret.split(",")[1] : secret;
  const keyBytes = Uint8Array.from(
    atob(base64Secret.replace(/^whsec_/, "")),
    (c) => c.charCodeAt(0),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  //  The header may carry several space-separated `v1,<sig>` values during
  //  a secret rotation. Constant-time compare each.
  return signatureHeader
    .split(" ")
    .map((part) => (part.includes(",") ? part.split(",")[1] : part))
    .some((candidate) => timingSafeEqual(candidate, expected));
}

/** Length-independent, value-constant comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return deny("Method not allowed", 405);

  const raw = await req.text();

  if (!(await signatureValid(req, raw))) {
    //  Not `deny(NOT_APPROVED)`: an unsigned caller is not a signup being
    //  refused, it is someone poking the endpoint, and it must learn
    //  nothing about any address.
    return deny("Unauthorized", 401);
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return deny("Malformed hook payload", 400);
  }

  //  Normalised the same way the database normalises: trimmed and lowered.
  //  If these two ever disagree, an address approved in the table would be
  //  refused at signup, so the SQL suite asserts they match.
  const email = (payload.user?.email ?? "").trim().toLowerCase();
  if (!email) return deny(NOT_APPROVED);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  //  The same function the database gate calls, so there is one rule and
  //  not two that can drift. It is SECURITY DEFINER, so it reads the table
  //  that RLS otherwise hides completely.
  const { data, error } = await supabase.rpc("app_signin_is_allowed", {
    p_email: email,
  });

  if (error) {
    /*
     *  FAIL CLOSED. If the gate cannot be evaluated, refuse the signup.
     *
     *  The alternative — letting signups through when the check is broken —
     *  turns any database blip into an open front door, and nobody would
     *  notice, because the symptom is accounts being created successfully.
     *  A refused signup is visible and recoverable; an unnoticed opening is
     *  neither.
     */
    console.error("[before-user-created] allowlist check failed", error.message);
    return deny(
      "Registration is temporarily unavailable. Please try again shortly.",
      503,
    );
  }

  if (data !== true) {
    //  Logged without the address: the function's logs are not a place to
    //  accumulate the email of everyone who ever tried to sign up.
    console.info("[before-user-created] signup refused: address not approved");
    return deny(NOT_APPROVED);
  }

  return allow();
});
