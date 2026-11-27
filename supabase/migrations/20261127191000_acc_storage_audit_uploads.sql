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
  constraint acc_upload_idempotency check (char_length(idempotency_key) between 8 and 200),
  constraint acc_upload_mime check (
    (kind = 'audio' and expected_mime = 'audio/mpeg')
    or (
      kind = 'cover'
      and expected_mime in ('image/jpeg', 'image/png', 'image/webp')
      and expected_bytes <= 15728640
    )
  ),
  constraint acc_upload_parent check (
    (
      kind = 'audio'
      and recording_id is not null
      and artist_id is null
      and release_id is null
      and song_id is null
    )
    or (
      kind = 'cover'
      and recording_id is null
      and num_nonnulls(artist_id, release_id, song_id) = 1
    )
  ),
  constraint acc_upload_keys check (
    staging_key = 'staging/' || id::text || '/object'
    and position('..' in object_key) = 0
    and left(object_key, 1) <> '/'
    and (
      (
        kind = 'audio'
        and object_key = 'recordings/' || recording_id::text || '/audio.mp3'
      )
      or (
        kind = 'cover'
        and (
          (
            artist_id is not null
            and object_key ~ ('^artists/' || artist_id::text || '/cover/[1-9][0-9]*\.webp$')
          )
          or (
            release_id is not null
            and object_key ~ ('^releases/' || release_id::text || '/cover/[1-9][0-9]*\.webp$')
          )
          or (
            song_id is not null
            and object_key ~ ('^songs/' || song_id::text || '/cover/[1-9][0-9]*\.webp$')
          )
        )
      )
    )
  )
);

create unique index acc_upload_intents_pending_object
  on public.acc_upload_intents (creator_id, object_key)
  where state = 'pending';

create index acc_upload_intents_creator_state
  on public.acc_upload_intents (creator_id, state, expires_at);

create or replace function public.acc_audit_catalogue_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op is null then
    raise exception 'audit is trigger-only' using errcode = '42501';
  end if;
  if tg_table_name = 'acc_storage_secrets' then
    return coalesce(new, old);
  end if;
  perform set_config('acc.audit_write', 'on', true);
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
grant execute on function public.acc_audit_catalogue_row() to authenticated, service_role;

create or replace function public.acc_protect_audit_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' and current_setting('acc.audit_write', true) is distinct from 'on' then
    raise exception 'audit events are written by catalogue changes' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'audit events are append-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.acc_protect_audit_event() from public, anon, authenticated;
grant execute on function public.acc_protect_audit_event() to authenticated, service_role;

create trigger acc_audit_events_protect
  before insert or update or delete on public.acc_audit_events
  for each row execute function public.acc_protect_audit_event();

create or replace function public.acc_protect_upload_intent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op is null then
    raise exception 'upload intents are trigger-protected' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'upload intents cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if current_setting('acc.upload_intent', true) is distinct from 'on' then
      raise exception 'upload intents are server-created' using errcode = '42501';
    end if;
    if new.id is null then
      new.id := pg_catalog.gen_random_uuid();
    end if;
    new.state := 'pending';
    new.staging_key := 'staging/' || new.id::text || '/object';
    new.expires_at := pg_catalog.now() + interval '15 minutes';
    new.created_at := pg_catalog.now();
    if new.kind = 'audio' then
      if new.recording_id is null then
        raise exception 'audio uploads require a recording' using errcode = '42501';
      end if;
      new.object_key := 'recordings/' || new.recording_id::text || '/audio.mp3';
      new.expected_mime := 'audio/mpeg';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if current_setting('acc.media_finalize', true) is distinct from 'on' then
      raise exception 'upload intents cannot be edited' using errcode = '42501';
    end if;
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id
      or new.kind is distinct from old.kind
      or new.artist_id is distinct from old.artist_id
      or new.release_id is distinct from old.release_id
      or new.song_id is distinct from old.song_id
      or new.recording_id is distinct from old.recording_id
      or new.staging_key is distinct from old.staging_key
      or new.object_key is distinct from old.object_key
      or new.expected_mime is distinct from old.expected_mime
      or new.expected_bytes is distinct from old.expected_bytes
      or new.expected_checksum_sha256 is distinct from old.expected_checksum_sha256
      or new.expires_at is distinct from old.expires_at
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at
      or old.state is distinct from 'pending'
      or new.state is distinct from 'finalized' then
      raise exception 'upload intent fields are immutable' using errcode = '42501';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.acc_protect_upload_intent() from public, anon, authenticated;
grant execute on function public.acc_protect_upload_intent() to authenticated, service_role;

create trigger acc_upload_intents_protect
  before insert or update or delete on public.acc_upload_intents
  for each row execute function public.acc_protect_upload_intent();

alter table public.acc_storage_connections enable row level security;
alter table public.acc_storage_connections force row level security;
alter table public.acc_storage_secrets enable row level security;
alter table public.acc_storage_secrets force row level security;
alter table public.acc_audit_events enable row level security;
alter table public.acc_audit_events force row level security;
alter table public.acc_upload_intents enable row level security;
alter table public.acc_upload_intents force row level security;

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

revoke all on table public.acc_storage_connections from public, anon, authenticated;
revoke all on table public.acc_storage_secrets from public, anon, authenticated;
revoke all on table public.acc_audit_events from public, anon, authenticated;
revoke all on table public.acc_upload_intents from public, anon, authenticated;

grant select on table public.acc_storage_connections to authenticated;
grant select on table public.acc_audit_events to authenticated;
grant select on table public.acc_upload_intents to authenticated;

grant select, insert, update, delete on table public.acc_storage_connections to service_role;
grant select, insert, update, delete on table public.acc_storage_secrets to service_role;
grant select, insert on table public.acc_audit_events to service_role;
grant select, insert, update, delete on table public.acc_upload_intents to service_role;
