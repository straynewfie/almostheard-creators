-- Storage configuration, encrypted credentials, audit, and upload intents.
-- Issue #17. Credentials are revoked from client roles.
-- Do not apply to production without owner approval.

create table public.acc_storage_connections (
  creator_id uuid primary key references public.acc_creators (id) on delete restrict,
  account_identifier text not null,
  bucket_name text not null,
  public_base_url text,
  health_status text not null default 'unknown',
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acc_storage_account check (account_identifier ~ '^[a-f0-9]{32}$'),
  constraint acc_storage_bucket check (
    bucket_name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
  ),
  constraint acc_storage_health check (
    health_status in ('unknown', 'healthy', 'unhealthy')
  ),
  constraint acc_storage_base_url check (
    public_base_url is null
    or (
      char_length(public_base_url) between 12 and 300
      and left(public_base_url, 8) = 'https://'
      and position(' ' in public_base_url) = 0
      and position('@' in public_base_url) = 0
    )
  )
);

create table public.acc_storage_secrets (
  creator_id uuid primary key references public.acc_creators (id) on delete restrict,
  ciphertext bytea not null,
  nonce bytea not null,
  auth_tag bytea not null,
  key_version integer not null,
  updated_at timestamptz not null default now(),
  constraint acc_storage_secret_bounds check (
    octet_length(ciphertext) between 1 and 4096
    and octet_length(nonce) = 12
    and octet_length(auth_tag) = 16
    and key_version > 0
  )
);

create table public.acc_audit_events (
  creator_id uuid not null references public.acc_creators (id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  primary key (creator_id, id),
  constraint acc_audit_action check (char_length(action) between 1 and 80),
  constraint acc_audit_entity check (char_length(entity_type) between 1 and 80)
);

create index acc_audit_events_time
  on public.acc_audit_events (creator_id, occurred_at desc);

create table public.acc_upload_intents (
  creator_id uuid not null references public.acc_creators (id) on delete restrict,
  id uuid not null,
  kind text not null,
  artist_id uuid,
  release_id uuid,
  song_id uuid,
  recording_id uuid,
  staging_key text not null,
  object_key text not null,
  expected_mime text not null,
  expected_bytes bigint not null,
  expected_checksum_sha256 text not null,
  expires_at timestamptz not null,
  state text not null default 'pending',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, id),
  unique (creator_id, idempotency_key),
  constraint acc_upload_kind check (kind in ('cover', 'audio')),
  constraint acc_upload_state check (
    state in ('pending', 'uploaded', 'finalized', 'failed', 'expired', 'cancelled')
  ),
  constraint acc_upload_size check (expected_bytes > 0 and expected_bytes <= 52428800),
  constraint acc_upload_checksum check (expected_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint acc_upload_keys check (
    staging_key = 'staging/' || id::text || '/object'
    and position('..' in object_key) = 0
    and left(object_key, 1) <> '/'
  )
);

create index acc_upload_intents_creator_state
  on public.acc_upload_intents (creator_id, state, expires_at);

create or replace function public.acc_audit_catalogue_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'acc_storage_secrets' then
    return coalesce(new, old);
  end if;
  insert into public.acc_audit_events (
    creator_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    coalesce(new.creator_id, old.creator_id),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    jsonb_build_object('operation', lower(tg_op))
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.acc_audit_catalogue_row() from public, anon, authenticated;

alter table public.acc_storage_connections enable row level security;
alter table public.acc_storage_secrets enable row level security;
alter table public.acc_audit_events enable row level security;
alter table public.acc_upload_intents enable row level security;

create policy acc_storage_connections_select
  on public.acc_storage_connections
  for select
  to authenticated
  using (
    creator_id = acc_private.current_creator_id()
    and acc_private.can_read_own_metadata()
  );

create policy acc_audit_events_select
  on public.acc_audit_events
  for select
  to authenticated
  using (
    creator_id = acc_private.current_creator_id()
    and acc_private.can_read_own_metadata()
  );

create policy acc_upload_intents_select
  on public.acc_upload_intents
  for select
  to authenticated
  using (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
  );

create policy acc_upload_intents_insert
  on public.acc_upload_intents
  for insert
  to authenticated
  with check (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
    and state = 'pending'
  );

revoke all on table public.acc_storage_connections from public, anon;
revoke all on table public.acc_storage_secrets from public, anon, authenticated;
revoke all on table public.acc_audit_events from public, anon;
revoke all on table public.acc_upload_intents from public, anon;

grant select on table public.acc_storage_connections to authenticated;
grant select on table public.acc_audit_events to authenticated;
grant select, insert on table public.acc_upload_intents to authenticated;

grant select, insert, update, delete on table public.acc_storage_connections to service_role;
grant select, insert, update, delete on table public.acc_storage_secrets to service_role;
grant select, insert on table public.acc_audit_events to service_role;
grant select, insert, update, delete on table public.acc_upload_intents to service_role;
