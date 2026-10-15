# Access-request onboarding

Public users request access through the existing waitlist form. There is no public signup link. An authorized approver reviews requests at `/access-requests`; approval adds the email to `allowed_signins` and sends a Supabase Auth invitation. The invitee chooses their own password from the email link, then creates their own workspace and enters onboarding.

## Deploy

1. Apply `supabase/migrations/20261022000000_access_requests.sql` to the intended project. It requires the existing owner account `ayomideelijah1@gmail.com` to exist in `auth.users` and seeds only that user as the first approver.
2. Deploy the Edge Functions:

   ```powershell
   npx supabase functions deploy request-info --project-ref ovxfflilbqaxedzovgmz
   npx supabase functions deploy approve-signup --project-ref ovxfflilbqaxedzovgmz
   ```

3. Set the production app origin as an Edge Function secret. It must be an HTTPS origin, without a trailing slash:

   ```powershell
   npx supabase secrets set APP_BASE_URL=https://YOUR-PRODUCTION-APP-ORIGIN --project-ref ovxfflilbqaxedzovgmz
   ```

4. In Supabase Authentication URL Configuration, add `https://YOUR-PRODUCTION-APP-ORIGIN/?setup=1` (or an appropriately scoped wildcard) to the allowed redirect URLs.
5. In Authentication providers, disable public email signup if the project should accept new accounts only through administrator invitations. Supabase Admin invitations remain available when public signup is disabled. Check any existing company-invitation flows before changing this project-wide setting.
6. Deploy the frontend to `main`.

## Use

1. A visitor submits the existing Join the Waitlist form with intent `waitlist`.
2. The owner signs in at `/portal`, then opens `/access-requests`.
3. The owner reviews the request and selects **Approve and email setup link**.
4. Supabase sends an invitation email. The invitee opens the link, chooses and confirms a password, and continues to workspace setup.

If the email already has a Supabase Auth account, approval sends a password-reset email to set a password instead. The approver never creates, sees, or shares the user's password.

The Edge Function checks the signed-in user against `public.access_approvers` on every request. Do not add an approver through client-side code. A failure to load requests as the owner usually means the migration or function has not been deployed, or the current Auth user is not the seeded owner.
