Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
# GreenTrack: multi-company and secure data foundation

## How company accounts are separated

Each company is an `organizations` row. `organization_members` links employee
accounts to companies with `owner`, `admin`, or `employee` access. Customers,
service types, and transactions all carry an `organization_id`; database RLS
checks that company membership on every request. The same person can be a staff
member of more than one company, while each company's customer list and ledger
remain isolated. Customer portal access is linked to the specific customer
record and that record's organization.

Owners and admins can invite staff with the `manage-employee` Edge Function,
view their company's roster through its `list` action, and deactivate an
employee's membership with its `deactivate` action. Deactivation removes that
employee's access to that company without deleting their account or affecting
any other company memberships. Employee invitations use Supabase Auth email
invites; passwords are never managed or stored by GreenTrack code.

## Apply the schema

`supabase/schema.sql` describes the multi-tenant schema for a **new/empty**
Supabase project. Apply it using Supabase's SQL editor or migrations. If you
already applied the older single-company schema, do not run this file on top of
it: your existing customer and transaction tables need a backfill to a new
organization first. The prototype's local seed data does not migrate
automatically.

For the first company, create the owner user in Supabase Auth, then insert a
matching `profiles` row, an `organizations` row, and an `organization_members`
row with role `owner` using the SQL editor or a trusted administrative script.
For example, substitute the real Auth user UUID and company name/slug:

```sql
insert into public.profiles (user_id, role, display_name)
values ('AUTH-USER-UUID', 'employee', 'Company Owner');

with new_org as (
  insert into public.organizations (name, slug)
  values ('Example Lawn Co.', 'example-lawn-co')
  returning id
)
insert into public.organization_members (organization_id, user_id, role)
select id, 'AUTH-USER-UUID', 'owner' from new_org;
```

Each additional company gets its own organization row and owner membership.
Never give a company an employee membership in another company's organization
unless cross-company access is intended.

## Invite and deactivate employees

Deploy both Edge Functions and configure `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGIN` in the
function environment. Keep the service-role key server-side only. Set `ALLOWED_ORIGIN`
to the exact origin where the app is hosted.

After owner account setup, invite an employee (the invite email is sent by
Supabase Auth):

```js
const { data, error } = await supabase.functions.invoke('manage-employee', {
  body: {
    action: 'invite',
    organization_id: activeOrganizationId,
    name: 'Jordan Smith',
    email: 'jordan@example.com',
  },
});
```

List the roster with `{ action: 'list', organization_id: activeOrganizationId }`.
Deactivate a staff member with
`{ action: 'deactivate', organization_id: activeOrganizationId, user_id: employeeUserId }`.
Only owners and admins can use these actions. This endpoint only deactivates
ordinary employee memberships; owner and admin changes remain a trusted
administrative operation.

Customer invites now require `organization_id` in the request body. The caller
must have active employee membership in that company, and the new customer and
ledger are scoped to it.

## Product status and remaining work

This is the multi-tenant **backend foundation**, not a finished SaaS product.
The HTML prototype still authenticates against hard-coded demo credentials
and stores all data in browser `localStorage`. It does not call Supabase, has
no company switcher or employee-management screen, and cannot yet safely host
real customer data. The Edge Functions and SQL are ready to guide that next
integration, but must be deployed and wired into the app before any real use.

The next product work is to connect Supabase Auth and data operations, add
company onboarding and a company switcher, build the owner/admin team screen,
scope every view to the active company, and migrate or discard demo data. Then
verify isolation using accounts from two separate companies and customer
accounts in each one. Existing single-company installations need a reviewed
backfill migration before applying the tenant schema.

