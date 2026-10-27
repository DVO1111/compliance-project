# Demo identities — and why none of them are real accounts

The seed package expects eleven users with `.example` addresses:
`ada.okafor@ibadanpharma.example` and ten others, across two fictional
companies.

**They are story actors. They are not approved users, and none of them has
been created anywhere.**

## What was not done, and will not be

* Not added to `allowed_signins`. The allowlist is the list of people
  permitted to register against the real product; a fictional QA manager
  at a fictional factory is not one of them.
* No Auth accounts created on the live project — `ovxfflilbqaxedzovgmz`.
* No `company_members` rows seeded, so no demo actor has access to
  anything. That table is classed `blocked` in `mapping.ts` for exactly
  this reason: its `user_id` has a foreign key to `auth.users`, so loading
  it *requires* creating the accounts first.

The source's own helper raises rather than inventing ids:

```sql
SELECT id INTO r FROM auth.users WHERE lower(email) = lower(e);
IF r IS NULL THEN RAISE EXCEPTION 'Demo user % does not exist...'
```

Good design on the generator's part, and it is what makes the dependency
unavoidable rather than accidental.

## For local testing

The SQL suites already create their own throwaway identities inside each
fixture, with ids in a reserved range and addresses on `.test` domains, and
delete them again in the same file. That is the pattern to follow: a test
owns its identities and cleans them up.

The demo rehearsal (`scripts/seed/demo/rehearse.sh`) needs no identities at
all — the 98 rows it loads carry no user reference. That is not an accident
of the mapping; it is why those eleven tables were the ones that could be
loaded.

## For a real demonstration

If a demo is ever shown against a real environment, two rules:

**It must not be the production project.** There is no staging Supabase
project today, so this means standing one up. Everything below assumes a
separate project.

**The actors must be genuinely approved people, not fabrications.** The
honest shape is:

1. Decide which real people will appear in the demonstration — the person
   running it, and any colleague who will act in it.
2. Add *their* addresses to that environment's `allowed_signins` through
   `admin_allowlist_add`. Not the `.example` ones.
3. Have them register and verify normally, through the hook and the
   ordinary signup path. No account is created on their behalf.
4. Map the story's roles onto those real accounts when loading
   `company_members` — Ada Okafor's part is played by a real QA user, whose
   name is the one that appears on anything they sign.

The point of (4) is the one that matters. If a demo user signs a formula
approval, the signature records **them**, truthfully, in a demo
environment. What must never happen is a signature attributed to
`ada.okafor@ibadanpharma.example` as though a person by that name approved
something — that is fabricated attribution, and it is indistinguishable
from the real thing once it is in the table.

## What this costs the story

Eleven named actors become however many real participants there are,
probably one or two. Steps written for different people — operator records,
supervisor verifies — need either two real accounts or a rewritten script
that does not pretend to be four-eyes.

`DEMO_STORY_GAPS.md` has the rest of what the demo cannot currently show.
