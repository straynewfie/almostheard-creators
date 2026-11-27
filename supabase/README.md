# Creators database

Apply these files, in order, only to an isolated Supabase database:

1. `migrations/20261127190000_acc_identity.sql`
2. `migrations/20261127191000_acc_storage_audit_uploads.sql`
3. `migrations/20261127192000_acc_catalogue.sql`
4. `migrations/20261127193000_acc_operations.sql`

Do not run them against the Originals project or any production database.

There is no down migration. Roll back by restoring a backup taken before the first migration. Hard deletion of catalogue rows is blocked; a future purge needs its own reviewed migration.

New creator rows start `inactive`. An operator with the service role can activate one local account:

```text
npx.cmd tsx scripts/activate-creator.ts creator@example.com
```

That command is not a self-serve subscription. Reactivating a cancelled creator still requires the unresolved billing policy unless the test flag is passed deliberately.
