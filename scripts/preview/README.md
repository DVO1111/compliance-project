# Rendering a screen without a database

Opens ONB-08 — `src/components/Dashboard/FirstRunDashboard.tsx`, inside
the real `MainLayout` — in a browser with canned rows in place of
Supabase, so the whole screen can be looked at, screenshotted, or shown
to somebody without signing in, seeding a workspace, or deploying
anything.

The sidebar and top bar are included deliberately. The first version of
this harness rendered only the content area, which was the half that was
already correct; the half that was wrong was the chrome around it, and
leaving it out of the picture is how it stayed wrong.

```sh
npx vite build --config scripts/preview/vite.config.ts
npx http-server scripts/preview/out -p 8099 -s
```

Then open <http://127.0.0.1:8099/>. `npx vite --config
scripts/preview/vite.config.ts` serves it with hot reload instead.

## Why it exists

ONB-08 shipped, the deploy was green, the bundle was verified to contain
it, and the person it was built for still saw the old dashboard. Five
rounds went into checking the deployment chain — artifact contents,
deployment SHA, custom domain, workflow status — and inferring from that
what the screen must look like.

Rendering it took three minutes and settled it. **Look at the thing.**
Evidence that the code is correct and evidence that the screen is
correct are different kinds of evidence, and no amount of the first adds
up to the second.

## What is real and what is not

The components, their data layer, the tokens and the fonts are the
shipped ones. Three modules are replaced at resolve time:

| Replaced | By | Why |
|---|---|---|
| `lib/supabase` | `stub-supabase.ts` | Fixed rows for one workspace — three unaccepted invitations, twelve starter records, one site, nothing operational yet. Realtime and auth are no-ops. |
| `contexts/AuthContext` | `stub-auth.tsx` | A signed-in person with a job title, so the top bar has something to show. |
| `hooks/usePlan` | `stub-plan.ts` | A plan, so the trial banner does not decide the layout. |

A resolver, not `resolve.alias`, because these are imported by relative
path from several depths — `firstRun.ts` asks for `'../supabase'` — and
an alias matches the specifier as written rather than the file it
resolves to.

Change the counts in `stub-supabase.ts` to see other states. Setting
`regulatory_licences` above zero, for instance, moves the Licence
details row off "To do" and gives the licence tile a denominator.

It is a viewer, not a test. The rules it draws are asserted in
`src/tests/dashboardFirstRun.test.ts`; this only shows you what they
look like.
