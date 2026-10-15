-- Access requests are created from the public waitlist form and can only be
-- read or approved by the Edge Functions using the service-role key.
CREATE TABLE IF NOT EXISTS public.access_requests (
  email        text PRIMARY KEY,
  full_name    text,
  company      text,
  role         text,
  industry     text,
  notes        text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  approved_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_requests FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.access_approvers (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_approvers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_approvers FROM anon, authenticated;

-- The existing product owner is the first approver. No browser role or
-- caller-supplied email can grant approval authority.
INSERT INTO public.access_approvers (user_id)
SELECT id FROM auth.users
WHERE lower(email) = 'ayomideelijah1@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.access_approvers a
    JOIN auth.users u ON u.id = a.user_id
    WHERE lower(u.email) = 'ayomideelijah1@gmail.com'
  ) THEN
    RAISE EXCEPTION
      'ACCESS REQUESTS: owner account ayomideelijah1@gmail.com must exist in auth.users before installing this migration';
  END IF;
END $$;

COMMENT ON TABLE public.access_requests IS
  'Signup requests pending owner review. Only the service-role Edge Functions can read or mutate rows.';
COMMENT ON TABLE public.access_approvers IS
  'Auth user IDs allowed to approve signup requests. Managed only through trusted database operations.';