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

## Setup

1. Create a Supabase project for GreenTrack.
2. Apply `supabase/schema.sql` in the project's SQL editor.
3. Create the first employee in Supabase Auth, then insert a matching row in
   `public.profiles` with role `employee` and a display name.
4. Create customer accounts through a trusted server-side invite flow, then
   link each `public.customers.user_id` and `public.profiles` record to the
   new Auth user.
5. Use only the project URL and anon/publishable key in the browser. Never put
   the service-role key in client code or commit it to Git.

## Remaining migration work

The existing HTML pages still use `db.js` and browser storage. They have not
been switched to Supabase in this foundation commit. Before pilot use, migrate
login/session handling and every data read/write to Supabase, remove the demo
credentials and seeded customer ledger, and add a server-side customer invite
flow. Then verify the RLS rules with separate employee and customer accounts.
