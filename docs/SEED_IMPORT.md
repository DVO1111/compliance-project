# Seed-data import

## The Drive folder could not be read — what I need from you

`https://drive.google.com/drive/folders/1tzyC2WxLVfmm9CFf1PUaNYIAr6vZhMt9`
was **not** inspected. I am not describing files I have not seen.

Two independent reasons:

1. The **Google Drive connector is installed but not connected** for this
   session (`installState: not_connected`). Its tools are unavailable.
2. This container's egress proxy **cannot resolve `drive.google.com`**, so a
   direct fetch fails at DNS.

Neither is fixable from here. To proceed, either connect the Google Drive
connector for this workspace, or **upload the files into the repository**
under `seed/incoming/` (git-ignored — see below) and tell me they are there.

### What to send, and what I will report back

Per file, once I can read them, Task 4 asks for: contents and purpose,
target tables/columns/relationships, required fields and how foreign keys
are matched, whether it is reference data / company records / user data /
demo data, import order and dependencies, and any duplicates, invalid
values, missing relationships, sensitive data or conflicts with existing
migrations. The validator below produces most of that mechanically; the
classification needs me to read them.

### One thing to decide before you send them

**The approved-user list is already settled and is not in that folder.** The
source of truth is `public.allowed_signins` in project
`ovxfflilbqaxedzovgmz`, which currently holds five addresses. Seed data and
the Auth allowlist are kept separate on purpose.

If the folder contains a file of email addresses, **I will not treat it as
the allowlist** unless you tell me explicitly that it is. A file containing
emails is far more likely to be contacts, operators or demo users, and
quietly promoting one to "approved to register" would be the worst possible
guess. Name the file if it is meant to be authoritative.

---

## The import process

### Shape

```
seed/
  manifest.ts          the specs: table, required columns, natural key, references
  incoming/            your files (git-ignored — never commit real data)
```

Run:

```bash
npx tsx scripts/seed/import.ts                 # validate only. The default.
npx tsx scripts/seed/import.ts --apply         # validate, then write
```

**Dry run is the default and `--apply` is the only way to write.** A seed
importer whose default writes is one keystroke from overwriting a tenant.

### What it guarantees

**Validation happens before anything is written, and a file with any problem
writes nothing at all.** Importing the good rows of a bad file leaves a
partially-seeded tenant — and the rows that fail are the ones carrying
relationships, so what survives is a company with materials and no
suppliers, which looks like a successful import.

It catches:

| Problem | How |
|---|---|
| Invalid foreign key | the referenced value is looked up in the target table before writing |
| Duplicate records | two rows sharing a natural key, compared case- and space-insensitively |
| Missing required value | a blank cell in a required column — distinct from a zero, which is a value |
| Missing required column | including the natural key, without which the import cannot be re-run |
| Misspelled column | reported, never silently dropped |
| Value outside a vocabulary | checked against the column's allowed set |
| Empty file | refused, rather than reported as a clean import of nothing |

### Idempotence

Every table is seeded through a **natural key** — a code, a reference, a name
within a company — and never through a generated uuid. A uuid in a
spreadsheet is not stable across environments, and re-running an import
keyed on one creates a second copy of everything.

Re-running a validated import is an upsert on that key: the second run
updates and does not duplicate. This is a property of the spec, so a table
whose spec has no `conflictTarget` is rejected rather than imported once and
never safely again.

### Import order

Derived from the specs' own `references`, not written down separately, so
adding a spec cannot leave a stale list behind. A cycle throws rather than
picking an order: a cycle means the data cannot be loaded in one pass and
somebody has to decide what to do about it.

Tables that are referenced but not seeded (`companies`, for example) are
assumed to exist already.

### Writing a spec

```ts
{
  table: 'materials',
  required: ['code', 'name'],
  conflictTarget: ['code'],                      // the natural key
  references: [
    { column: 'supplier_code', table: 'suppliers', lookupColumn: 'code' },
  ],
  enums: { state: ['active', 'retired'] },
}
```

Headers are normalised on the way in, so a spreadsheet's `Supplier Code`
matches `supplier_code`.

---

## Rules this process keeps

* **Nothing is imported into production unreviewed.** The dry run is read
  against the target project and prints every row it would write; `--apply`
  is a separate, deliberate second command.
* **No SQL from the folder is executed.** Seed files are read as data —
  CSV/JSON rows — and written through the client. A `.sql` file in the
  folder will be reported, not run.
* **Seed data stays out of git.** `seed/incoming/` is ignored. Real company,
  supplier or personal data does not belong in a repository history, where
  it cannot be deleted.
* **The allowlist is not seed data.** It is administered through
  `admin_allowlist_add` / `admin_allowlist_set_enabled` by an approver — see
  `docs/ALLOWLIST_AND_RECOVERY.md`.

## Still required

The specs in `seed/manifest.ts` are **examples until the real files exist**.
They cannot be written correctly against files I have not seen: the column
names, the natural keys and the references all come from the data. Send the
files and the manifest becomes a half-hour's work with the validator already
in place to check it.
