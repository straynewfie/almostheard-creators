-- Transactional catalogue operations.
-- Issues #17, #19, #20. Privileged publication and media writes are service-role only.
-- Do not apply to production without owner approval.

create or replace function public.acc_touch_catalogue_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id then
      raise exception 'ownership cannot be reassigned' using errcode = '42501';
    end if;
  end if;

  -- Artists have no publication date. Touch the column only on tables that store it.
  if tg_table_name in ('acc_releases', 'acc_songs') then
    if tg_op = 'INSERT' and new.published_at is not null
      and current_setting('acc.allow_publication', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE'
      and new.published_at is distinct from old.published_at
      and current_setting('acc.allow_publication', true) is distinct from 'on'
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and new.visibility is distinct from 'draft'
    and current_setting('acc.allow_publication', true) is distinct from 'on' then
    raise exception 'publication is disabled' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.visibility is distinct from old.visibility then
    if new.visibility = 'public'
      and current_setting('acc.allow_publication', true) is distinct from 'on' then
      raise exception 'publication is disabled' using errcode = '42501';
    end if;
    if new.visibility is distinct from 'public'
      and current_setting('acc.allow_publication', true) is distinct from 'on'
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'visibility is server-controlled' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.deleted_at is distinct from old.deleted_at
    and current_setting('acc.soft_delete', true) is distinct from 'on' then
    raise exception 'deletion is server-controlled' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  end if;
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.acc_protect_song_derived()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' and new.duration_ms is not null
    and current_setting('acc.media_finalize', true) is distinct from 'on'
    and current_setting('acc.recording_rotation', true) is distinct from 'on' then
    raise exception 'duration is derived from the current recording' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
    and new.duration_ms is distinct from old.duration_ms
    and current_setting('acc.media_finalize', true) is distinct from 'on'
    and current_setting('acc.recording_rotation', true) is distinct from 'on' then
    raise exception 'duration is derived from the current recording' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists acc_songs_derived on public.acc_songs;
create trigger acc_songs_derived
  before insert or update on public.acc_songs
  for each row execute function public.acc_protect_song_derived();

create or replace function public.acc_protect_recording()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_version integer;
begin
  if tg_op = 'INSERT' then
    perform 1 from public.acc_songs
      where creator_id = new.creator_id and id = new.song_id
      for update;
    select coalesce(max(version), 0) + 1 into v_version
    from public.acc_recordings
    where creator_id = new.creator_id and song_id = new.song_id;
    new.version := v_version;
    new.created_at := pg_catalog.now();
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    if new.is_current
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'new recordings start out of the current slot' using errcode = '42501';
    end if;
    if new.retired_at is not null
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'recording retirement is server-controlled' using errcode = '42501';
    end if;
    if new.first_published_at is not null
      and current_setting('acc.allow_publication', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
    if (new.checksum_sha256 is not null or new.duration_ms is not null)
      and current_setting('acc.media_finalize', true) is distinct from 'on' then
      raise exception 'recording media fields are server-controlled' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version;
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id
      or new.song_id is distinct from old.song_id then
      raise exception 'recording identity is immutable' using errcode = '42501';
    end if;
    if new.is_current is distinct from old.is_current
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'recording promotion is server-controlled' using errcode = '42501';
    end if;
    if new.retired_at is distinct from old.retired_at
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'recording retirement is server-controlled' using errcode = '42501';
    end if;
    if new.checksum_sha256 is distinct from old.checksum_sha256
      and current_setting('acc.media_finalize', true) is distinct from 'on' then
      raise exception 'checksum is server-controlled' using errcode = '42501';
    end if;
    if new.duration_ms is distinct from old.duration_ms
      and current_setting('acc.media_finalize', true) is distinct from 'on' then
      raise exception 'recording duration is server-controlled' using errcode = '42501';
    end if;
    if new.first_published_at is distinct from old.first_published_at
      and current_setting('acc.allow_publication', true) is distinct from 'on'
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.acc_require_active_creator()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := acc_private.current_creator_id();
begin
  if v_creator is null or not acc_private.is_active_member() then
    raise exception 'inactive creators cannot edit' using errcode = '42501';
  end if;
  return v_creator;
end;
$$;

create or replace function public.acc_add_release_placeholder(
  p_release_id uuid,
  p_title text,
  p_disc integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid := gen_random_uuid();
  v_position integer;
begin
  if p_disc is null or p_disc < 1 or char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'placeholder title is not valid';
  end if;
  perform 1 from public.acc_releases
    where creator_id = v_creator and id = p_release_id and deleted_at is null
    for update;
  if not found then
    raise exception 'release not found' using errcode = '42501';
  end if;
  select coalesce(max(track_number), 0) + 1 into v_position
  from public.acc_release_tracks
  where creator_id = v_creator and release_id = p_release_id and disc_number = p_disc;
  perform set_config('acc.track_write', 'on', true);
  insert into public.acc_release_tracks (
    creator_id, id, release_id, placeholder_title, disc_number, track_number, created_by, updated_by
  ) values (
    v_creator, v_id, p_release_id, v_title, p_disc, v_position, auth.uid(), auth.uid()
  );
  return v_id;
end;
$$;

create or replace function public.acc_attach_release_song(
  p_track_id uuid,
  p_song_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_release uuid;
begin
  select release_id into v_release
  from public.acc_release_tracks
  where creator_id = v_creator and id = p_track_id
  for update;
  if v_release is null then
    raise exception 'track not found' using errcode = '42501';
  end if;
  perform 1 from public.acc_songs
    where creator_id = v_creator and id = p_song_id and deleted_at is null;
  if not found then
    raise exception 'song not found' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.acc_release_tracks
    where creator_id = v_creator
      and release_id = v_release
      and song_id = p_song_id
      and id <> p_track_id
  ) then
    raise exception 'that song is already on this release';
  end if;
  perform set_config('acc.track_write', 'on', true);
  update public.acc_release_tracks
  set song_id = p_song_id,
      placeholder_title = null
  where creator_id = v_creator and id = p_track_id;
end;
$$;

create or replace function public.acc_remove_release_track(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
begin
  perform set_config('acc.track_write', 'on', true);
  delete from public.acc_release_tracks
  where creator_id = v_creator and id = p_track_id;
  if not found then
    raise exception 'track not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.acc_reorder_release_tracks(
  p_release_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_count integer;
begin
  perform 1 from public.acc_releases
    where creator_id = v_creator and id = p_release_id and deleted_at is null
    for update;
  if not found then
    raise exception 'release not found' using errcode = '42501';
  end if;
  select count(*) into v_count
  from public.acc_release_tracks
  where creator_id = v_creator and release_id = p_release_id;
  if coalesce(array_length(p_ordered_ids, 1), 0) <> v_count
    or (select count(distinct ordered_id) from unnest(p_ordered_ids) as ordered_id) <> v_count
    or (
      select count(*) from public.acc_release_tracks
      where creator_id = v_creator
        and release_id = p_release_id
        and id = any (p_ordered_ids)
    ) <> v_count then
    raise exception 'track order does not match this release';
  end if;

  perform set_config('acc.reorder', 'on', true);
  update public.acc_release_tracks as track
  set track_number = 100000 + ordered.ord::integer
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where track.creator_id = v_creator
    and track.release_id = p_release_id
    and track.id = ordered.id;

  update public.acc_release_tracks as track
  set track_number = ranked.position
  from (
    select track_row.id,
           row_number() over (
             partition by track_row.disc_number
             order by ordered.ord
           )::integer as position
    from public.acc_release_tracks as track_row
    join unnest(p_ordered_ids) with ordinality as ordered(id, ord)
      on ordered.id = track_row.id
    where track_row.creator_id = v_creator
      and track_row.release_id = p_release_id
  ) as ranked
  where track.id = ranked.id
    and track.creator_id = v_creator;
end;
$$;

create or replace function public.acc_promote_recording(
  p_recording_id uuid,
  p_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
  v_song uuid;
  v_old uuid;
  v_old_published timestamptz;
begin
  if p_confirmed is distinct from true then
    raise exception 'audio replacement requires explicit confirmation';
  end if;
  select song_id into v_song
  from public.acc_recordings
  where creator_id = v_creator and id = p_recording_id
  for update;
  if v_song is null then
    raise exception 'recording not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_media
    where creator_id = v_creator
      and recording_id = p_recording_id
      and kind = 'audio'
      and is_current
      and verification_state = 'verified'
  ) or not exists (
    select 1 from public.acc_recordings
    where creator_id = v_creator and id = p_recording_id and duration_ms > 0
  ) then
    raise exception 'recording has no verified audio';
  end if;

  perform set_config('acc.recording_rotation', 'on', true);
  select id, first_published_at into v_old, v_old_published
  from public.acc_recordings
  where creator_id = v_creator and song_id = v_song and is_current
  for update;

  if v_old is not null and v_old <> p_recording_id then
    update public.acc_recordings
    set is_current = false, retired_at = now()
    where creator_id = v_creator and id = v_old;
    if v_old_published is not null then
      insert into public.acc_publication_events (
        creator_id, recording_id, event_kind, idempotency_key, details
      ) values (
        v_creator,
        v_old,
        'audio_replaced',
        'audio_replaced:' || v_old::text || ':' || p_recording_id::text,
        jsonb_build_object('quota', 'not_enforced_pending_owner_policy', 'replacement_id', p_recording_id)
      );
      update public.acc_songs
      set visibility = 'draft', published_at = null
      where creator_id = v_creator and id = v_song and visibility = 'public';
    end if;
  end if;

  update public.acc_recordings
  set is_current = true, retired_at = null
  where creator_id = v_creator and id = p_recording_id;
  update public.acc_songs as song
  set duration_ms = recording.duration_ms
  from public.acc_recordings as recording
  where recording.creator_id = v_creator
    and recording.id = p_recording_id
    and song.creator_id = v_creator
    and song.id = v_song;
end;
$$;

create or replace function public.acc_soft_delete_artist(p_artist_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
begin
  if exists (
    select 1 from public.acc_songs
    where creator_id = v_creator and primary_artist_id = p_artist_id and deleted_at is null
  ) or exists (
    select 1 from public.acc_releases
    where creator_id = v_creator and primary_artist_id = p_artist_id and deleted_at is null
  ) then
    raise exception 'remove this artist''s songs and releases first';
  end if;
  perform set_config('acc.soft_delete', 'on', true);
  update public.acc_artists
  set deleted_at = now()
  where creator_id = v_creator and id = p_artist_id and deleted_at is null;
  if not found then
    raise exception 'artist not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.acc_soft_delete_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
begin
  perform 1 from public.acc_releases
    where creator_id = v_creator and id = p_release_id and deleted_at is null
    for update;
  if not found then
    raise exception 'release not found' using errcode = '42501';
  end if;
  perform set_config('acc.track_write', 'on', true);
  delete from public.acc_release_tracks
  where creator_id = v_creator and release_id = p_release_id;
  perform set_config('acc.soft_delete', 'on', true);
  update public.acc_releases
  set deleted_at = now()
  where creator_id = v_creator and id = p_release_id;
end;
$$;

create or replace function public.acc_soft_delete_song(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator uuid := public.acc_require_active_creator();
begin
  if exists (
    select 1
    from public.acc_release_tracks as track
    join public.acc_releases as release
      on release.creator_id = track.creator_id
     and release.id = track.release_id
    where track.creator_id = v_creator
      and track.song_id = p_song_id
      and release.deleted_at is null
  ) then
    raise exception 'remove this song from its releases first';
  end if;
  perform set_config('acc.soft_delete', 'on', true);
  update public.acc_songs
  set deleted_at = now()
  where creator_id = v_creator and id = p_song_id and deleted_at is null;
  if not found then
    raise exception 'song not found' using errcode = '42501';
  end if;
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
  v_revision integer := 1;
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
    where creator_id = p_creator_id and bucket_name = p_bucket
  ) then
    raise exception 'storage bucket does not match this creator' using errcode = '42501';
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
  if v_intent.kind = 'audio' and (
    p_mime <> 'audio/mpeg'
    or p_mime is distinct from v_intent.expected_mime
    or p_checksum is distinct from v_intent.expected_checksum_sha256
    or p_bytes is distinct from v_intent.expected_bytes
    or p_duration_ms is null
    or p_duration_ms <= 0
    or v_intent.object_key is distinct from 'recordings/' || v_intent.recording_id::text || '/audio.mp3'
  ) then
    raise exception 'verified audio does not match the upload intent';
  end if;
  if v_intent.kind = 'cover' and (
    v_intent.expected_mime not in ('image/jpeg', 'image/png', 'image/webp')
    or p_mime <> 'image/webp'
    or p_bytes > 15728640
    or (
      v_intent.artist_id is not null
      and v_intent.object_key !~ ('^artists/' || v_intent.artist_id::text || '/cover/[1-9][0-9]*\.webp$')
    )
    or (
      v_intent.release_id is not null
      and v_intent.object_key !~ ('^releases/' || v_intent.release_id::text || '/cover/[1-9][0-9]*\.webp$')
    )
    or (
      v_intent.song_id is not null
      and v_intent.object_key !~ ('^songs/' || v_intent.song_id::text || '/cover/[1-9][0-9]*\.webp$')
    )
  ) then
    raise exception 'verified artwork does not match the upload intent';
  end if;

  perform set_config('acc.media_finalize', 'on', true);

  if v_intent.kind = 'cover' then
    select coalesce(max(revision), 0) + 1 into v_revision
    from public.acc_media
    where creator_id = p_creator_id
      and (
        (artist_id = v_intent.artist_id and v_intent.artist_id is not null)
        or (release_id = v_intent.release_id and v_intent.release_id is not null)
        or (song_id = v_intent.song_id and v_intent.song_id is not null)
      );
    update public.acc_media
    set is_current = false
    where creator_id = p_creator_id
      and kind = 'cover'
      and is_current
      and (
        (artist_id = v_intent.artist_id and v_intent.artist_id is not null)
        or (release_id = v_intent.release_id and v_intent.release_id is not null)
        or (song_id = v_intent.song_id and v_intent.song_id is not null)
      );
  end if;

  insert into public.acc_media (
    creator_id, id, artist_id, release_id, song_id, recording_id, kind, bucket,
    object_key, byte_size, mime_type, checksum_sha256, etag, revision,
    verification_state, verified_at, is_current
  ) values (
    p_creator_id, v_media_id, v_intent.artist_id, v_intent.release_id, v_intent.song_id,
    v_intent.recording_id, v_intent.kind, p_bucket, v_intent.object_key, p_bytes, p_mime,
    p_checksum, p_etag, v_revision, 'verified', now(), true
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

create or replace function public.acc_publish_song(
  p_creator_id uuid,
  p_song_id uuid,
  p_allow boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recording uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'publication is server-only' using errcode = '42501';
  end if;
  if p_allow is distinct from true then
    raise exception 'publication is disabled' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.acc_creators
    where id = p_creator_id and membership_state = 'active'
  ) then
    raise exception 'creator is not active' using errcode = '42501';
  end if;

  select recording.id into v_recording
  from public.acc_songs as song
  join public.acc_recordings as recording
    on recording.creator_id = song.creator_id
   and recording.song_id = song.id
   and recording.is_current
  join public.acc_media as media
    on media.creator_id = recording.creator_id
   and media.recording_id = recording.id
   and media.kind = 'audio'
   and media.is_current
   and media.verification_state = 'verified'
  where song.creator_id = p_creator_id
    and song.id = p_song_id
    and song.deleted_at is null
    and song.visibility = 'draft'
    and song.duration_ms > 0
    and char_length(btrim(song.title)) > 0
    and char_length(btrim(song.slug)) > 0;
  if v_recording is null then
    raise exception 'song is not ready to publish';
  end if;

  perform set_config('acc.allow_publication', 'on', true);
  update public.acc_songs
  set visibility = 'public', published_at = now()
  where creator_id = p_creator_id and id = p_song_id;
  update public.acc_recordings
  set first_published_at = coalesce(first_published_at, now())
  where creator_id = p_creator_id and id = v_recording;
  insert into public.acc_publication_events (
    creator_id, recording_id, event_kind, idempotency_key, details
  ) values (
    p_creator_id,
    v_recording,
    'first_published',
    'first_published:' || v_recording::text,
    jsonb_build_object('quota', 'not_enforced_pending_owner_policy')
  )
  on conflict (creator_id, idempotency_key) do nothing;
end;
$$;

create or replace function public.acc_protect_upload_intent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_media_revision integer := 0;
  v_intent_revision integer := 0;
  v_parent text;
  v_parent_id uuid;
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
      if not exists (
        select 1
        from public.acc_recordings as recording
        join public.acc_songs as song
          on song.creator_id = recording.creator_id
         and song.id = recording.song_id
        where recording.creator_id = new.creator_id
          and recording.id = new.recording_id
          and recording.retired_at is null
          and song.deleted_at is null
      ) then
        raise exception 'recording is not available for upload' using errcode = '42501';
      end if;
      new.object_key := 'recordings/' || new.recording_id::text || '/audio.mp3';
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
      select coalesce(max(revision), 0) into v_media_revision
      from public.acc_media
      where creator_id = new.creator_id
        and kind = 'cover'
        and (
          (artist_id = new.artist_id and new.artist_id is not null)
          or (release_id = new.release_id and new.release_id is not null)
          or (song_id = new.song_id and new.song_id is not null)
        );
      select coalesce(max((substring(object_key, '/cover/([0-9]+)\.webp$'))::integer), 0)
        into v_intent_revision
      from public.acc_upload_intents
      where creator_id = new.creator_id
        and kind = 'cover'
        and state = 'pending'
        and (
          (artist_id = new.artist_id and new.artist_id is not null)
          or (release_id = new.release_id and new.release_id is not null)
          or (song_id = new.song_id and new.song_id is not null)
        );
      new.object_key := v_parent || '/' || v_parent_id::text || '/cover/'
        || (
          case
            when v_media_revision > v_intent_revision then v_media_revision
            else v_intent_revision
          end + 1
        )::text || '.webp';
    else
      raise exception 'upload kind is not valid';
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
    perform 1 from public.acc_recordings
      where creator_id = v_creator and id = p_parent_id
      for update;
  elsif p_parent = 'artist' then
    perform 1 from public.acc_artists
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
  elsif p_parent = 'release' then
    perform 1 from public.acc_releases
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
  elsif p_parent = 'song' then
    perform 1 from public.acc_songs
      where creator_id = v_creator and id = p_parent_id and deleted_at is null
      for update;
  else
    raise exception 'upload parent is not valid' using errcode = '42501';
  end if;
  if not found then
    raise exception 'that item is not in this catalogue' using errcode = '42501';
  end if;

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

  perform set_config('acc.upload_intent', 'on', true);
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
    'recordings/' || p_parent_id::text || '/audio.mp3',
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

create or replace function public.acc_protect_publication_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
    and current_setting('acc.allow_publication', true) is distinct from 'on'
    and current_setting('acc.recording_rotation', true) is distinct from 'on' then
    raise exception 'publication history is server-controlled' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'publication history cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists acc_publication_events_protect on public.acc_publication_events;
create trigger acc_publication_events_protect
  before insert or update or delete on public.acc_publication_events
  for each row execute function public.acc_protect_publication_event();

revoke all on function public.acc_touch_catalogue_row() from public, anon, authenticated, service_role;
revoke all on function public.acc_forbid_hard_delete() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_recording() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_track() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_media() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_song_derived() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_upload_intent() from public, anon, authenticated, service_role;
revoke all on function public.acc_protect_publication_event() from public, anon, authenticated, service_role;
grant execute on function public.acc_touch_catalogue_row() to authenticated, service_role;
grant execute on function public.acc_forbid_hard_delete() to authenticated, service_role;
grant execute on function public.acc_protect_recording() to authenticated, service_role;
grant execute on function public.acc_protect_track() to authenticated, service_role;
grant execute on function public.acc_protect_media() to authenticated, service_role;
grant execute on function public.acc_protect_song_derived() to authenticated, service_role;
grant execute on function public.acc_protect_upload_intent() to authenticated, service_role;
grant execute on function public.acc_protect_publication_event() to authenticated, service_role;

revoke all on function public.acc_require_active_creator() from public, anon, authenticated, service_role;
revoke all on function public.acc_add_release_placeholder(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.acc_attach_release_song(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.acc_remove_release_track(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acc_reorder_release_tracks(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.acc_promote_recording(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.acc_soft_delete_artist(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acc_soft_delete_release(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acc_soft_delete_song(uuid) from public, anon, authenticated, service_role;
revoke all on function public.acc_create_upload_intent(text, text, uuid, text, bigint, text, text) from public, anon, authenticated, service_role;
revoke all on function public.acc_write_verified_media(uuid, uuid, text, bigint, text, text, text, integer, text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.acc_publish_song(uuid, uuid, boolean) from public, anon, authenticated, service_role;

grant execute on function public.acc_add_release_placeholder(uuid, text, integer) to authenticated;
grant execute on function public.acc_attach_release_song(uuid, uuid) to authenticated;
grant execute on function public.acc_remove_release_track(uuid) to authenticated;
grant execute on function public.acc_reorder_release_tracks(uuid, uuid[]) to authenticated;
grant execute on function public.acc_promote_recording(uuid, boolean) to authenticated;
grant execute on function public.acc_soft_delete_artist(uuid) to authenticated;
grant execute on function public.acc_soft_delete_release(uuid) to authenticated;
grant execute on function public.acc_soft_delete_song(uuid) to authenticated;
grant execute on function public.acc_create_upload_intent(text, text, uuid, text, bigint, text, text) to authenticated;
grant execute on function public.acc_write_verified_media(uuid, uuid, text, bigint, text, text, text, integer, text, bigint) to service_role;
grant execute on function public.acc_publish_song(uuid, uuid, boolean) to service_role;
