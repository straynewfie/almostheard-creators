-- Transactional catalogue operations.
-- Issues #17, #19, #20. Privileged publication and media writes are service-role only.
-- Do not apply to production without owner approval.

create or replace function public.acc_touch_catalogue_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id then
      raise exception 'ownership cannot be reassigned' using errcode = '42501';
    end if;
    if new.published_at is distinct from old.published_at
      and current_setting('acc.allow_publication', true) is distinct from 'on'
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
  end if;

  if new.visibility = 'public'
    and (tg_op = 'INSERT' or old.visibility is distinct from 'public')
    and current_setting('acc.allow_publication', true) is distinct from 'on' then
    raise exception 'publication is disabled' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.deleted_at is distinct from old.deleted_at
    and current_setting('acc.soft_delete', true) is distinct from 'on' then
    raise exception 'deletion is server-controlled' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.acc_protect_song_derived()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.duration_ms is distinct from old.duration_ms
    and current_setting('acc.media_finalize', true) is distinct from 'on' then
    raise exception 'duration is derived from audio' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists acc_songs_derived on public.acc_songs;
create trigger acc_songs_derived
  before update on public.acc_songs
  for each row execute function public.acc_protect_song_derived();

create or replace function public.acc_protect_recording()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id
      or new.song_id is distinct from old.song_id
      or new.version is distinct from old.version
      or new.created_at is distinct from old.created_at then
      raise exception 'recording identity is immutable' using errcode = '42501';
    end if;
    if new.is_current is distinct from old.is_current
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'recording promotion is server-controlled' using errcode = '42501';
    end if;
    if new.checksum_sha256 is distinct from old.checksum_sha256
      and current_setting('acc.media_finalize', true) is distinct from 'on' then
      raise exception 'checksum is server-controlled' using errcode = '42501';
    end if;
    if new.first_published_at is distinct from old.first_published_at
      and current_setting('acc.allow_publication', true) is distinct from 'on'
      and current_setting('acc.recording_rotation', true) is distinct from 'on' then
      raise exception 'publication date is server-controlled' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and new.is_current
    and current_setting('acc.recording_rotation', true) is distinct from 'on' then
    raise exception 'new recordings start out of the current slot' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.acc_require_active_creator()
returns uuid
language plpgsql
stable
security definer
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
end;
$$;

create or replace function public.acc_soft_delete_artist(p_artist_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
set search_path = public
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
set search_path = public
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
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.acc_upload_intents%rowtype;
  v_media_id uuid := gen_random_uuid();
  v_revision integer := 1;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'media verification is server-only' using errcode = '42501';
  end if;
  select * into v_intent
  from public.acc_upload_intents
  where creator_id = p_creator_id and id = p_intent_id
  for update;
  if v_intent.id is null then
    raise exception 'upload not found' using errcode = '42501';
  end if;
  if v_intent.state <> 'pending' or v_intent.expires_at <= now() then
    raise exception 'upload cannot be finalized';
  end if;
  if p_checksum !~ '^[a-f0-9]{64}$' or p_bytes < 1 or p_bytes > 52428800 then
    raise exception 'verified file is not acceptable';
  end if;
  if v_intent.kind = 'audio' and (p_mime <> 'audio/mpeg' or p_duration_ms is null or p_duration_ms <= 0) then
    raise exception 'verified audio is not acceptable';
  end if;
  if v_intent.kind = 'cover' and p_mime <> 'image/webp' then
    raise exception 'verified artwork must be webp';
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
    set checksum_sha256 = p_checksum
    where creator_id = p_creator_id and id = v_intent.recording_id;
    update public.acc_songs as song
    set duration_ms = p_duration_ms
    from public.acc_recordings as recording
    where recording.creator_id = p_creator_id
      and recording.id = v_intent.recording_id
      and song.creator_id = recording.creator_id
      and song.id = recording.song_id;
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
set search_path = public
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

revoke all on function public.acc_require_active_creator() from public, anon;
revoke all on function public.acc_add_release_placeholder(uuid, text, integer) from public, anon;
revoke all on function public.acc_attach_release_song(uuid, uuid) from public, anon;
revoke all on function public.acc_remove_release_track(uuid) from public, anon;
revoke all on function public.acc_reorder_release_tracks(uuid, uuid[]) from public, anon;
revoke all on function public.acc_promote_recording(uuid, boolean) from public, anon;
revoke all on function public.acc_soft_delete_artist(uuid) from public, anon;
revoke all on function public.acc_soft_delete_release(uuid) from public, anon;
revoke all on function public.acc_soft_delete_song(uuid) from public, anon;
revoke all on function public.acc_write_verified_media(uuid, uuid, text, bigint, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.acc_publish_song(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.acc_add_release_placeholder(uuid, text, integer) to authenticated;
grant execute on function public.acc_attach_release_song(uuid, uuid) to authenticated;
grant execute on function public.acc_remove_release_track(uuid) to authenticated;
grant execute on function public.acc_reorder_release_tracks(uuid, uuid[]) to authenticated;
grant execute on function public.acc_promote_recording(uuid, boolean) to authenticated;
grant execute on function public.acc_soft_delete_artist(uuid) to authenticated;
grant execute on function public.acc_soft_delete_release(uuid) to authenticated;
grant execute on function public.acc_soft_delete_song(uuid) to authenticated;
grant execute on function public.acc_write_verified_media(uuid, uuid, text, bigint, text, text, text, integer) to service_role;
grant execute on function public.acc_publish_song(uuid, uuid, boolean) to service_role;
