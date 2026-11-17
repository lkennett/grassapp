Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
# GreenTrack

Lawn maintenance manager with employee and customer portals.

## Multi-company foundation

The `supabase/` directory contains a tenant-isolated PostgreSQL schema and
Edge Functions for inviting customers and managing company employee accounts.
See [SECURE_DATA_MIGRATION.md](SECURE_DATA_MIGRATION.md) for company setup,
employee invitation/deactivation, and current limitations.

The browser prototype has not yet been connected to Supabase. It uses local
demo accounts and browser storage; do not use it with real customer data.

