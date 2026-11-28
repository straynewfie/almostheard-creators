-- Storage onboarding, immutable artwork keys, and one current audio object.
-- Prepared for review. Do not apply to the shared project until the owner runs this file.
-- The five earlier migrations are already applied and must not be edited.

alter table public.acc_storage_connections
  add column onboarding_step text not null default 'manual',
  add column last_error text,
  add column browser_verified_at timestamptz;

alter table public.acc_storage_connections
  add constraint acc_storage_step check (
    onboarding_step in (
      'manual', 'account', 'bucket', 'cors', 'credential', 'verify', 'ready', 'paused'
    )
  ),
  add constraint acc_storage_error check (
    last_error is null or char_length(last_error) between 1 and 300
  );

create table public.acc_storage_deletions (
  creator_id uuid not null references public.acc_creators (id) on delete restrict,
  id uuid primary key default gen_random_uuid(),
  bucket_name text not null,
  object_key text not null,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  removal_granted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint acc_storage_deletion_key check (
    char_length(object_key) between 3 and 400
    and position('..' in object_key) = 0
    and left(object_key, 1) <> '/'
  ),
  constraint acc_storage_deletion_attempts check (attempts between 0 and 20),
  constraint acc_storage_deletion_error check (
    last_error is null or char_length(last_error) between 1 and 300
  ),
  unique (creator_id, bucket_name, object_key)
);

alter table public.acc_storage_deletions enable row level security;
alter table public.acc_storage_deletions force row level security;
revoke all on table public.acc_storage_deletions from public, anon, authenticated;
grant select, insert, update, delete on table public.acc_storage_deletions to service_role;

create or replace function public.acc_protect_upload_intent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_parent text;
  v_parent_id uuid;
  v_song_id uuid;
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
      select song.id into v_song_id
      from public.acc_recordings as recording
      join public.acc_songs as song
        on song.creator_id = recording.creator_id
       and song.id = recording.song_id
      where recording.creator_id = new.creator_id
        and recording.id = new.recording_id
        and recording.retired_at is null
        and song.deleted_at is null;
      if v_song_id is null then
        raise exception 'recording is not available for upload' using errcode = '42501';
      end if;
      new.object_key := 'songs/' || v_song_id::text || '/' || new.recording_id::text || '.mp3';
      new.expected_mime := 'audio/mpeg';
    elsif new.kind = 'cover' then
      if new.artist_id is not null then
        v_parent := 'artists';
        v_parent_id := new.artist_id;
        perform 1 from public.acc_artists
          where creator_id = new.creator_id and id = new.artist_id and deleted_at is null;
      elsif new.release_id is not null then
        v_parent := 'releases';
        v_parent_id := new.release_id;
        perform 1 from public.acc_releases
          where creator_id = new.creator_id and id = new.release_id and deleted_at is null;
      elsif new.song_id is not null then
        v_parent := 'songs';
        v_parent_id := new.song_id;
        perform 1 from public.acc_songs
          where creator_id = new.creator_id and id = new.song_id and deleted_at is null;
      else
        raise exception 'artwork uploads require one parent' using errcode = '42501';
      end if;
      if not found then
        raise exception 'that item is not in this catalogue' using errcode = '42501';
      end if;
      if new.expected_mime not in ('image/jpeg', 'image/png', 'image/webp')
        or new.expected_bytes < 1
        or new.expected_bytes > 15728640 then
        raise exception 'artwork upload is not valid';
      end if;
      new.object_key := v_parent || '/' || v_parent_id::text || '/' || new.id::text || '.webp';
    else
      raise exception 'upload kind is not valid';
    end if;
  end if;
  if tg_op = 'UPDATE' then
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
      or old.state is distinct from 'pending' then
      raise exception 'upload intent fields are immutable' using errcode = '42501';
    end if;
    if new.state = 'finalized' then
      if current_setting('acc.media_finalize', true) is distinct from 'on' then
        raise exception 'upload intents cannot be edited' using errcode = '42501';
      end if;
    elsif new.state = 'expired' then
      if current_setting('acc.upload_intent', true) is distinct from 'on' then
        raise exception 'upload intents cannot be edited' using errcode = '42501';
      end if;
    else
      raise exception 'upload intents cannot be edited' using errcode = '42501';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Historical rows keep the keys they were stored with. Pending rows that
-- still use the previous key shape cannot be finalized, so they are closed
-- before the new check applies to future writes. NOT VALID leaves finalized
-- historical rows in place.
do $$
begin
  perform set_config('acc.upload_intent', 'on', true);
  update public.acc_upload_intents
  set state = 'expired'
  where state = 'pending'
    and not (
      (
        kind = 'audio'
        and object_key ~ '^songs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
      )
      or (
        kind = 'cover'
        and object_key ~ '^(artists|releases|songs)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
      )
    );
end;
$$;

alter table public.acc_upload_intents drop constraint acc_upload_keys;
alter table public.acc_upload_intents add constraint acc_upload_keys check (
  staging_key = 'staging/' || id::text || '/object'
  and position('..' in object_key) = 0
  and left(object_key, 1) <> '/'
  and (
    (
      kind = 'audio'
      and object_key ~ '^songs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$'
    )
    or (
      kind = 'cover'
      and (
        (
          artist_id is not null
          and object_key = 'artists/' || artist_id::text || '/' || id::text || '.webp'
        )
        or (
          release_id is not null
          and object_key = 'releases/' || release_id::text || '/' || id::text || '.webp'
        )
        or (
          song_id is not null
          and object_key = 'songs/' || song_id::text || '/' || id::text || '.webp'
        )
      )
    )
  )
) not valid;

create or replace function public.acc_create_upload_intent(
  p_kind text,
  p_parent text,
  p_parent_id uuid,
  p_mime text,
  p_bytes bigint,
  p_checksum text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_existing uuid;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_song uuid;
  v_object text;
begin
  if p_kind not in ('audio', 'cover') or p_parent_id is null then
    raise exception 'upload is not valid' using errcode = '42501';
  end if;
  if p_checksum !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or char_length(p_idempotency_key) < 8
    or char_length(p_idempotency_key) > 200 then
    raise exception 'upload is not valid';
  end if;
  if p_kind = 'audio' then
    if p_parent is distinct from 'recording'
      or p_mime is distinct from 'audio/mpeg'
      or p_bytes < 1
      or p_bytes > 52428800 then
      raise exception 'audio upload is not valid';
    end if;
    select song_id into v_song
    from public.acc_recordings
    where creator_id = v_creator and id = p_parent_id
    for update;
    if v_song is null then
      raise exception 'that item is not in this catalogue' using errcode = '42501';
    end if;
    v_object := 'songs/' || v_song::text || '/' || p_parent_id::text || '.mp3';
  elsif p_parent = 'artist' then
    perform 1 from public.acc_artists
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
    v_object := 'artists/' || p_parent_id::text || '/' || v_id::text || '.webp';
  elsif p_parent = 'release' then
    perform 1 from public.acc_releases
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
    v_object := 'releases/' || p_parent_id::text || '/' || v_id::text || '.webp';
  elsif p_parent = 'song' then
    perform 1 from public.acc_songs
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
    v_object := 'songs/' || p_parent_id::text || '/' || v_id::text || '.webp';
  else
    raise exception 'upload parent is not valid' using errcode = '42501';
  end if;
  if p_kind = 'cover' and not found then
    raise exception 'that item is not in this catalogue' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_storage_connections
    where creator_id = v_creator and health_status = 'healthy'
  ) then
    raise exception 'storage is not ready' using errcode = '42501';
  end if;

  perform set_config('acc.upload_intent', 'on', true);
  update public.acc_upload_intents
  set state = 'expired'
  where creator_id = v_creator
    and state = 'pending'
    and expires_at <= pg_catalog.now();

  select id into v_existing
  from public.acc_upload_intents
  where creator_id = v_creator and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if exists (
      select 1 from public.acc_upload_intents
      where creator_id = v_creator
        and id = v_existing
        and state = 'pending'
        and expires_at > pg_catalog.now()
        and kind = p_kind
        and expected_mime = p_mime
        and expected_bytes = p_bytes
        and expected_checksum_sha256 = p_checksum
        and (
          (p_parent = 'recording' and recording_id = p_parent_id)
          or (p_parent = 'artist' and artist_id = p_parent_id)
          or (p_parent = 'release' and release_id = p_parent_id)
          or (p_parent = 'song' and song_id = p_parent_id)
        )
    ) then
      return v_existing;
    end if;
    raise exception 'idempotency key was already used';
  end if;

  insert into public.acc_upload_intents (
    creator_id, id, kind, artist_id, release_id, song_id, recording_id,
    staging_key, object_key, expected_mime, expected_bytes, expected_checksum_sha256,
    expires_at, state, idempotency_key
  ) values (
    v_creator,
    v_id,
    p_kind,
    case when p_parent = 'artist' then p_parent_id else null end,
    case when p_parent = 'release' then p_parent_id else null end,
    case when p_parent = 'song' then p_parent_id else null end,
    case when p_parent = 'recording' then p_parent_id else null end,
    'staging/' || v_id::text || '/object',
    v_object,
    p_mime,
    p_bytes,
    p_checksum,
    pg_catalog.now() + interval '15 minutes',
    'pending',
    p_idempotency_key
  );
  return v_id;
end;
$$;

create or replace function public.acc_write_verified_media(
  p_creator_id uuid,
  p_intent_id uuid,
  p_checksum text,
  p_bytes bigint,
  p_mime text,
  p_etag text,
  p_bucket text,
  p_duration_ms integer,
  p_source_checksum text,
  p_source_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.acc_upload_intents%rowtype;
  v_media_id uuid := pg_catalog.gen_random_uuid();
  v_song uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'media verification is server-only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_creators
    where id = p_creator_id and membership_state = 'active'
  ) then
    raise exception 'creator is not active' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_storage_connections
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and health_status = 'healthy'
  ) then
    raise exception 'storage is not ready' using errcode = '42501';
  end if;
  select * into v_intent
  from public.acc_upload_intents
  where creator_id = p_creator_id and id = p_intent_id
  for update;
  if v_intent.id is null then
    raise exception 'upload not found' using errcode = '42501';
  end if;
  if v_intent.state <> 'pending' or v_intent.expires_at <= pg_catalog.now() then
    raise exception 'upload cannot be finalized';
  end if;
  if p_source_checksum is distinct from v_intent.expected_checksum_sha256
    or p_source_bytes is distinct from v_intent.expected_bytes then
    raise exception 'uploaded object does not match the upload intent';
  end if;
  if p_checksum !~ '^[a-f0-9]{64}$' or p_bytes < 1 or p_bytes > 52428800 then
    raise exception 'verified file is not acceptable';
  end if;
  if v_intent.kind = 'audio' then
    select song_id into v_song
    from public.acc_recordings
    where creator_id = p_creator_id and id = v_intent.recording_id;
  end if;
  if v_intent.kind = 'audio' and (
    p_mime <> 'audio/mpeg'
    or p_mime is distinct from v_intent.expected_mime
    or p_checksum is distinct from v_intent.expected_checksum_sha256
    or p_bytes is distinct from v_intent.expected_bytes
    or p_duration_ms is null
    or p_duration_ms <= 0
    or v_song is null
    or v_intent.object_key is distinct from 'songs/' || v_song::text || '/' || v_intent.recording_id::text || '.mp3'
  ) then
    raise exception 'verified audio does not match the upload intent';
  end if;
  if v_intent.kind = 'cover' and (
    v_intent.expected_mime not in ('image/jpeg', 'image/png', 'image/webp')
    or p_mime <> 'image/webp'
    or p_bytes > 15728640
    or (
      v_intent.artist_id is not null
      and v_intent.object_key is distinct from 'artists/' || v_intent.artist_id::text || '/' || v_intent.id::text || '.webp'
    )
    or (
      v_intent.release_id is not null
      and v_intent.object_key is distinct from 'releases/' || v_intent.release_id::text || '/' || v_intent.id::text || '.webp'
    )
    or (
      v_intent.song_id is not null
      and v_intent.object_key is distinct from 'songs/' || v_intent.song_id::text || '/' || v_intent.id::text || '.webp'
    )
  ) then
    raise exception 'verified artwork does not match the upload intent';
  end if;

  -- Cleanup may already have leased this new key. A granted removal wins.
  -- A lease that has not been granted is cancelled so this key can become current.
  if exists (
    select 1 from public.acc_storage_deletions
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and object_key = v_intent.object_key
      and removal_granted
    for update
  ) then
    raise exception 'storage object is reserved for removal' using errcode = '40001';
  end if;
  delete from public.acc_storage_deletions
  where creator_id = p_creator_id
    and bucket_name = p_bucket
    and object_key = v_intent.object_key
    and removal_granted is false;

  perform set_config('acc.media_finalize', 'on', true);

  if v_intent.kind = 'cover' then
    if v_intent.artist_id is not null then
      perform 1 from public.acc_artists
        where creator_id = p_creator_id and id = v_intent.artist_id
        for update;
    elsif v_intent.release_id is not null then
      perform 1 from public.acc_releases
        where creator_id = p_creator_id and id = v_intent.release_id
        for update;
    elsif v_intent.song_id is not null then
      perform 1 from public.acc_songs
        where creator_id = p_creator_id and id = v_intent.song_id
        for update;
    end if;
    with previous as (
      update public.acc_media
      set is_current = false
      where creator_id = p_creator_id
        and kind = 'cover'
        and is_current
        and object_key is distinct from v_intent.object_key
        and (
          (artist_id = v_intent.artist_id and v_intent.artist_id is not null)
          or (release_id = v_intent.release_id and v_intent.release_id is not null)
          or (song_id = v_intent.song_id and v_intent.song_id is not null)
        )
      returning creator_id, bucket, object_key
    )
    insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
    select previous.creator_id, previous.bucket, previous.object_key, 'Replaced artwork is waiting for removal.'
    from previous
    on conflict (creator_id, bucket_name, object_key) do nothing;
  end if;

  insert into public.acc_media (
    creator_id, id, artist_id, release_id, song_id, recording_id, kind, bucket,
    object_key, byte_size, mime_type, checksum_sha256, etag, revision,
    verification_state, verified_at, is_current
  ) values (
    p_creator_id, v_media_id, v_intent.artist_id, v_intent.release_id, v_intent.song_id,
    v_intent.recording_id, v_intent.kind, p_bucket, v_intent.object_key, p_bytes, p_mime,
    p_checksum, p_etag, 1, 'verified', pg_catalog.now(), true
  );

  if v_intent.kind = 'audio' then
    update public.acc_recordings
    set checksum_sha256 = p_checksum,
        duration_ms = p_duration_ms
    where creator_id = p_creator_id and id = v_intent.recording_id;
  end if;

  update public.acc_upload_intents
  set state = 'finalized'
  where creator_id = p_creator_id and id = p_intent_id;
  return v_media_id;
end;
$$;

create or replace function public.acc_retire_replaced_audio(p_recording_id uuid)
returns setof text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_song uuid;
begin
  select song_id into v_song
  from public.acc_recordings
  where creator_id = v_creator and id = p_recording_id and is_current;
  if v_song is null then
    raise exception 'recording is not current' using errcode = '42501';
  end if;
  perform set_config('acc.media_finalize', 'on', true);
  return query
  with retired as (
    update public.acc_media
    set is_current = false
    where creator_id = v_creator
      and kind = 'audio'
      and is_current
      and recording_id is distinct from p_recording_id
      and recording_id in (
        select id from public.acc_recordings
        where creator_id = v_creator
          and song_id = v_song
          and retired_at is not null
          and is_current is false
      )
    returning creator_id, bucket, object_key
  )
  insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
  select retired.creator_id, retired.bucket, retired.object_key, 'Replaced audio is waiting for removal.'
  from retired
  on conflict (creator_id, bucket_name, object_key) do nothing
  returning object_key;
end;
$$;

create or replace function public.acc_recover_obsolete_audio(p_creator_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
begin
  if v_creator is distinct from p_creator_id then
    raise exception 'recording is not current' using errcode = '42501';
  end if;
  perform set_config('acc.media_finalize', 'on', true);
  with obsolete as (
    update public.acc_media as media
    set is_current = false
    from public.acc_recordings as recording
    where media.creator_id = v_creator
      and media.kind = 'audio'
      and media.is_current
      and recording.creator_id = media.creator_id
      and recording.id = media.recording_id
      and recording.retired_at is not null
      and recording.is_current is false
    returning media.creator_id, media.bucket, media.object_key
  )
  insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
  select obsolete.creator_id, obsolete.bucket, obsolete.object_key, 'Replaced audio is waiting for removal.'
  from obsolete
  on conflict (creator_id, bucket_name, object_key) do nothing;
end;
$$;

create or replace function public.acc_queue_storage_deletion(
  p_creator_id uuid,
  p_bucket text,
  p_object_key text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  if p_object_key is null
    or position('..' in p_object_key) > 0
    or left(p_object_key, 1) = '/'
    or char_length(p_object_key) < 3
    or char_length(p_object_key) > 400 then
    raise exception 'storage object is not valid' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_storage_connections
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and health_status = 'healthy'
  ) then
    raise exception 'storage bucket does not match this creator' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.acc_media
    where creator_id = p_creator_id
      and bucket = p_bucket
      and object_key = p_object_key
      and is_current
  ) then
    raise exception 'current media cannot be queued for deletion' using errcode = '42501';
  end if;
  insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
  values (p_creator_id, p_bucket, p_object_key, left(coalesce(p_error, 'The file could not be deleted.'), 300))
  on conflict (creator_id, bucket_name, object_key) do update
  set attempts = least(public.acc_storage_deletions.attempts + 1, 20),
      last_error = excluded.last_error,
      removal_granted = false,
      lease_token = null,
      next_attempt_at = pg_catalog.now() + make_interval(mins => least(public.acc_storage_deletions.attempts + 1, 8));
end;
$$;

create or replace function public.acc_claim_storage_deletions(p_creator_id uuid)
returns table (bucket_name text, object_key text, lease_token uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  delete from public.acc_storage_deletions as queued
  where queued.creator_id = p_creator_id
    and exists (
      select 1 from public.acc_media as media
      where media.creator_id = queued.creator_id
        and media.bucket = queued.bucket_name
        and media.object_key = queued.object_key
        and media.is_current
    );
  -- Leasing pushes next_attempt_at forward. A second cleanup waits on the
  -- row lock, then no longer matches, so it cannot remove the same object.
  -- Rows at eight attempts stay stored for a manual retry.
  return query
  update public.acc_storage_deletions as queued
  set lease_token = pg_catalog.gen_random_uuid(),
      removal_granted = false,
      next_attempt_at = pg_catalog.now() + interval '10 minutes'
  where queued.creator_id = p_creator_id
    and queued.attempts < 8
    and queued.next_attempt_at <= pg_catalog.now()
    and exists (
      select 1 from public.acc_storage_connections as connection
      where connection.creator_id = queued.creator_id
        and connection.bucket_name = queued.bucket_name
        and connection.health_status = 'healthy'
    )
    and not exists (
      select 1 from public.acc_media as media
      where media.creator_id = queued.creator_id
        and media.bucket = queued.bucket_name
        and media.object_key = queued.object_key
        and media.is_current
    )
  returning queued.bucket_name, queued.object_key, queued.lease_token;
end;
$$;

create or replace function public.acc_grant_storage_deletion(
  p_creator_id uuid,
  p_bucket text,
  p_object_key text,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_granted boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  select removal_granted into v_granted
  from public.acc_storage_deletions
  where creator_id = p_creator_id
    and bucket_name = p_bucket
    and object_key = p_object_key
    and lease_token = p_lease_token
    and next_attempt_at > pg_catalog.now()
  for update;
  if not found then
    return false;
  end if;
  if exists (
    select 1 from public.acc_media
    where creator_id = p_creator_id
      and bucket = p_bucket
      and object_key = p_object_key
      and is_current
    for update
  ) then
    delete from public.acc_storage_deletions
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and object_key = p_object_key;
    return false;
  end if;
  update public.acc_storage_deletions
  set removal_granted = true
  where creator_id = p_creator_id
    and bucket_name = p_bucket
    and object_key = p_object_key
    and lease_token = p_lease_token;
  return true;
end;
$$;

create or replace function public.acc_list_storage_deletions(p_creator_id uuid)
returns table (
  bucket_name text,
  object_key text,
  attempts integer,
  last_error text,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  return query
  select queued.bucket_name, queued.object_key, queued.attempts, queued.last_error, queued.next_attempt_at
  from public.acc_storage_deletions as queued
  where queued.creator_id = p_creator_id
  order by queued.attempts desc, queued.object_key;
end;
$$;

create or replace function public.acc_reopen_storage_deletions(
  p_creator_id uuid,
  p_bucket text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_storage_connections
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and health_status = 'healthy'
  ) then
    return 0;
  end if;
  delete from public.acc_storage_deletions as queued
  where queued.creator_id = p_creator_id
    and queued.bucket_name = p_bucket
    and exists (
      select 1 from public.acc_media as media
      where media.creator_id = queued.creator_id
        and media.bucket = queued.bucket_name
        and media.object_key = queued.object_key
        and media.is_current
    );
  update public.acc_storage_deletions
  set attempts = 0,
      next_attempt_at = pg_catalog.now(),
      removal_granted = false,
      lease_token = null,
      last_error = coalesce(last_error, 'Removal is being tried again.')
  where creator_id = p_creator_id
    and bucket_name = p_bucket
    and attempts >= 8;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.acc_queue_finished_staging(
  p_creator_id uuid,
  p_bucket text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_storage_connections
    where creator_id = p_creator_id
      and bucket_name = p_bucket
      and health_status = 'healthy'
  ) then
    return;
  end if;
  perform set_config('acc.upload_intent', 'on', true);
  update public.acc_upload_intents
  set state = 'expired'
  where creator_id = p_creator_id
    and state = 'pending'
    and expires_at <= pg_catalog.now();
  insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
  select p_creator_id, p_bucket, intent.object_key, 'An unfinished upload is waiting for removal.'
  from public.acc_upload_intents as intent
  where intent.creator_id = p_creator_id
    and intent.state in ('expired', 'failed', 'cancelled')
    and position('..' in intent.object_key) = 0
    and left(intent.object_key, 1) <> '/'
    and char_length(intent.object_key) between 3 and 400
    and not exists (
      select 1 from public.acc_media as media
      where media.creator_id = p_creator_id
        and media.bucket = p_bucket
        and media.object_key = intent.object_key
        and media.is_current
    )
  on conflict (creator_id, bucket_name, object_key) do nothing;
  insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, last_error)
  select p_creator_id, p_bucket, intent.staging_key, 'Finished upload staging is waiting for removal.'
  from public.acc_upload_intents as intent
  where intent.creator_id = p_creator_id
    and intent.state in ('finalized', 'expired', 'failed', 'cancelled')
    and intent.staging_key like 'staging/%'
    and position('..' in intent.staging_key) = 0
    and not exists (
      select 1 from public.acc_media as media
      where media.creator_id = p_creator_id
        and media.bucket = p_bucket
        and media.object_key = intent.staging_key
        and media.is_current
    )
  on conflict (creator_id, bucket_name, object_key) do nothing;
end;
$$;

create or replace function public.acc_complete_storage_deletion(
  p_creator_id uuid,
  p_bucket text,
  p_object_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'storage cleanup is server-only' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.acc_media
    where creator_id = p_creator_id
      and bucket = p_bucket
      and object_key = p_object_key
      and is_current
  ) then
    raise exception 'current media cannot be queued for deletion' using errcode = '42501';
  end if;
  delete from public.acc_storage_deletions
  where creator_id = p_creator_id
    and bucket_name = p_bucket
    and object_key = p_object_key;
end;
$$;

revoke all on function public.acc_retire_replaced_audio(uuid) from public, anon;
grant execute on function public.acc_retire_replaced_audio(uuid) to authenticated, service_role;
revoke all on function public.acc_recover_obsolete_audio(uuid) from public, anon;
grant execute on function public.acc_recover_obsolete_audio(uuid) to authenticated, service_role;
revoke all on function public.acc_queue_storage_deletion(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.acc_queue_storage_deletion(uuid, text, text, text) to service_role;
revoke all on function public.acc_claim_storage_deletions(uuid) from public, anon, authenticated;
grant execute on function public.acc_claim_storage_deletions(uuid) to service_role;
revoke all on function public.acc_grant_storage_deletion(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.acc_grant_storage_deletion(uuid, text, text, uuid) to service_role;
revoke all on function public.acc_list_storage_deletions(uuid) from public, anon, authenticated;
grant execute on function public.acc_list_storage_deletions(uuid) to service_role;
revoke all on function public.acc_reopen_storage_deletions(uuid, text) from public, anon, authenticated;
grant execute on function public.acc_reopen_storage_deletions(uuid, text) to service_role;
revoke all on function public.acc_queue_finished_staging(uuid, text) from public, anon, authenticated;
grant execute on function public.acc_queue_finished_staging(uuid, text) to service_role;
revoke all on function public.acc_complete_storage_deletion(uuid, text, text) from public, anon, authenticated;
grant execute on function public.acc_complete_storage_deletion(uuid, text, text) to service_role;
