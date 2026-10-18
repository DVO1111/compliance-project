# Rendering a screen without a database

Opens ONB-08 — `src/components/Dashboard/FirstRunDashboard.tsx` — in a
browser with canned rows in place of Supabase, so the screen can be
looked at, screenshotted, or shown to somebody without signing in,
seeding a workspace, or deploying anything.

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

The component, its data layer, the tokens and the fonts are the shipped
ones. Exactly one module is replaced: `lib/supabase`, swapped at resolve
time for `stub-supabase.ts`, which answers every query with fixed rows
for one workspace — three unaccepted invitations, twelve starter
records, one site, and nothing operational yet.

A resolver, not `resolve.alias`, because `firstRun.ts` imports the
client as `'../supabase'` and an alias matches the import specifier as
written rather than the file it resolves to.

Change the counts in `stub-supabase.ts` to see other states. Setting
`regulatory_licences` above zero, for instance, moves the Licence
details row off "To do" and gives the licence tile a denominator.

It is a viewer, not a test. The rules it draws are asserted in
`src/tests/dashboardFirstRun.test.ts`; this only shows you what they
look like.
