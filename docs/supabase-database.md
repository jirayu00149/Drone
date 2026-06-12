# Supabase database setup

This project still runs the prototype UI with `localStorage`. The files in
`supabase/` define the first production database shape so the app can be moved
to Supabase without exposing sensitive rescue data directly in the browser.

## What gets created

- `staff_profiles`: maps Supabase Auth users to rescue roles.
- `missing_person_reports`: public intake table for unverified reports.
- `missing_persons`: reviewed cases shown to the public search page.
- `rescue_logs`: drone/operator status history and final found coordinates.
- `match_candidates`: AI/drone candidate matches that require human review.
- `drone_commands`: command queue for the drone operations view.
- Storage buckets:
  - `missing-person-references`
  - `drone-captures`

All public-schema tables have Row Level Security enabled. Anonymous users can
only submit reports, read non-sensitive case columns, and read `found` log
entries. Staff access is controlled through `staff_profiles`.

## Run in Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run [`supabase/setup.sql`](../supabase/setup.sql).
4. Optionally run [`supabase/seed.sql`](../supabase/seed.sql) for demo data.
5. Create at least one Supabase Auth user for the operator/admin.
6. Copy that user's Auth UID and run:

```sql
insert into public.staff_profiles (user_id, display_name, role)
values ('00000000-0000-0000-0000-000000000000', 'Admin', 'admin')
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    active = true,
    updated_at = now();
```

Replace the UUID with the real user ID.

## Environment values

Copy `.env.example` to `.env` locally and fill these values from the Supabase
dashboard:

```text
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

`SUPABASE_PUBLISHABLE_KEY` can be used by browser code. `SUPABASE_SERVICE_ROLE_KEY`
must stay server-side only.

## Notes

- Supabase CLI is not installed on this machine yet, so this is a SQL setup
  script rather than a generated CLI migration.
- New Supabase projects may not expose SQL-created tables to the Data API
  automatically. The setup script includes explicit grants for `anon` and
  `authenticated`, and RLS remains the row-level guard.
- Keep reference face photos and drone captures in private Storage buckets.
  The public report page should upload through a trusted backend or an
  authenticated staff flow, not directly with a service key in the browser.
