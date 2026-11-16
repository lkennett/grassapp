# GreenTrack secure data migration

This branch starts the move from browser-only data to Supabase. The current
prototype stores all accounts and lawn-care records in `localStorage`, so it
must not be used for real customer data or credentials.

## Foundation in this branch

- `supabase/schema.sql` defines server-owned profiles, customers, task types,
  and ledger transactions.
- Row Level Security limits customer sessions to their linked customer record
  and transactions. Employee access is checked against a server-side profile.
- Passwords belong to Supabase Auth; this schema does not store passwords.
- `supabase/functions/invite-customer/index.ts` provides an employee-only, server-side customer invitation path. It validates the employee profile before creating the Auth user, profile, and customer record.
- The prototype now escapes editable values before inserting them into HTML and computes the default date in local time.

## Setup

1. Create a Supabase project for GreenTrack.
2. Apply `supabase/schema.sql` in the project's SQL editor.
3. Create the first employee in Supabase Auth, then insert a matching row in
   `public.profiles` with role `employee` and a display name.
4. Deploy `invite-customer` and use it to create customer Auth users, profiles,
   and linked customer records. Do not create customer passwords in app code.
5. Use only the project URL and anon/publishable key in the browser. Never put
   the service-role key in client code or commit it to Git.
6. Set `ALLOWED_ORIGIN` to the exact app origin and configure Auth's invite email
   and redirect URL.

## Remaining migration work

The existing HTML pages still use `db.js` and browser storage. They have not
been switched to Supabase in this foundation commit. Before pilot use, migrate
login/session handling and every data read/write to Supabase, remove the demo
credentials and seeded customer ledger, and add a server-side verify the RLS rules with separate employee and customer accounts. The demo
credentials and seed data remain for local, disposable previews only.
