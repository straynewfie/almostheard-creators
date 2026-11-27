# Creators database

Creators uses the existing Almost Heard Supabase project. These files add `acc_` tables and the `acc_private` schema beside the website schema. They do not replace website tables, policies, or functions.

All five files were applied to the shared project on November 27, 2026, in this order. Do not run them again, and do not edit them.

1. `migrations/20261127190000_acc_identity.sql`
2. `migrations/20261127191000_acc_storage_audit_uploads.sql`
3. `migrations/20261127192000_acc_catalogue.sql`
4. `migrations/20261127193000_acc_operations.sql`
5. `migrations/20261127200000_acc_drop_standalone_artist.sql`

The fifth file removes `standalone_artist`. A read-only check matched the live tables and columns to these files, and the live artist table no longer has that column. Supabase does not store the applied SQL, so a byte-for-byte comparison was not possible.

There is no down migration. Roll back by restoring a backup taken before the first migration. Hard deletion of catalogue rows is blocked. Deleting an `auth.users` row that has a creator profile is also blocked. A future purge needs its own reviewed migration.

New creator rows start `inactive`. An operator with the service role can activate one account:

```text
npx.cmd tsx scripts/activate-creator.ts creator@example.com
npx.cmd tsx scripts/activate-creator.ts --id <creator-uuid> active
```

The script loads its Supabase URL and service-role key from the environment or `.env.local`. It does not print the key. That command is not a self-serve subscription. Reactivating a cancelled creator still requires the unresolved billing policy unless `--test-reactivation` is passed deliberately.

`tests/database-security.test.ts` applies this sequence to a disposable database. It refuses any connection string whose database name is not `creators_migration_review`. When `CREATORS_TEST_DATABASE_URL` is unset, the test uses an in-process PostgreSQL instance instead of the live project.
