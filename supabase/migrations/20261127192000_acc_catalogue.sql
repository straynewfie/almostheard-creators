-- Catalogue entities, recordings, media, and publication history.
-- Issues #16, #18, #19, #20. Composite tenant foreign keys. No anonymous access.
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
  end if;

  if new.visibility = 'public'
    and (
      tg_op = 'INSERT'
      or old.visibility is distinct from 'public'
    )
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

create or replace function public.acc_forbid_hard_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'this record cannot be hard-deleted' using errcode = '42501';
end;
$$;

create table public.acc_artists (
  creator_id uuid not null references public.acc_creators (id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  bio text,
  artist_kind text not null default 'individual',
  standalone_artist boolean not null default true,
  distrokid_distributed boolean not null default false,
  visibility text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  constraint acc_artists_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  constraint acc_artists_name check (char_length(btrim(name)) between 1 and 200),
  constraint acc_artists_bio check (bio is null or char_length(bio) <= 4000),
  constraint acc_artists_kind check (artist_kind in ('individual', 'band')),
  constraint acc_artists_visibility check (visibility in ('draft', 'public', 'withdrawn')),
  constraint acc_artists_individual_standalone check (
    artist_kind = 'band' or standalone_artist = true
  )
);

create unique index acc_artists_live_slug
  on public.acc_artists (creator_id, slug)
  where deleted_at is null;

create index acc_artists_creator_visibility
  on public.acc_artists (creator_id, visibility, deleted_at);

create table public.acc_releases (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  primary_artist_id uuid not null,
  release_type text not null,
  release_date date,
  distrokid_distributed boolean not null default false,
  visibility text not null default 'draft',
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, primary_artist_id)
    references public.acc_artists (creator_id, id) on delete restrict,
  constraint acc_releases_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  constraint acc_releases_title check (char_length(btrim(title)) between 1 and 200),
  constraint acc_releases_description check (description is null or char_length(description) <= 4000),
  constraint acc_releases_type check (release_type in ('album', 'ep', 'single', 'compilation')),
  constraint acc_releases_visibility check (visibility in ('draft', 'public', 'withdrawn'))
);

create unique index acc_releases_live_slug
  on public.acc_releases (creator_id, slug)
  where deleted_at is null;

create index acc_releases_creator_artist
  on public.acc_releases (creator_id, primary_artist_id);

create table public.acc_songs (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  primary_artist_id uuid not null,
  duration_ms integer,
  recording_kind text,
  distrokid_distributed boolean not null default false,
  visibility text not null default 'draft',
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, primary_artist_id)
    references public.acc_artists (creator_id, id) on delete restrict,
  constraint acc_songs_slug check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  constraint acc_songs_title check (char_length(btrim(title)) between 1 and 200),
  constraint acc_songs_description check (description is null or char_length(description) <= 4000),
  constraint acc_songs_duration check (duration_ms is null or duration_ms >= 0),
  constraint acc_songs_recording_kind check (
    recording_kind is null
    or recording_kind in ('standard', 'demo', 'alternate', 'live', 'lost', 'guest')
  ),
  constraint acc_songs_visibility check (visibility in ('draft', 'public', 'withdrawn'))
);

create unique index acc_songs_live_slug
  on public.acc_songs (creator_id, slug)
  where deleted_at is null;

create index acc_songs_creator_artist
  on public.acc_songs (creator_id, primary_artist_id);

create index acc_songs_creator_visibility
  on public.acc_songs (creator_id, visibility, deleted_at);

create table public.acc_recordings (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  song_id uuid not null,
  version integer not null,
  is_current boolean not null default false,
  first_published_at timestamptz,
  retired_at timestamptz,
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  unique (creator_id, song_id, version),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, song_id)
    references public.acc_songs (creator_id, id) on delete restrict,
  constraint acc_recordings_version check (version > 0),
  constraint acc_recordings_checksum check (
    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint acc_recordings_current_not_retired check (
    not (is_current and retired_at is not null)
  )
);

create unique index acc_recordings_one_current
  on public.acc_recordings (creator_id, song_id)
  where is_current and retired_at is null;

create index acc_recordings_song
  on public.acc_recordings (creator_id, song_id, version desc);

create table public.acc_release_tracks (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  release_id uuid not null,
  song_id uuid,
  placeholder_title text,
  disc_number integer not null,
  track_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  unique (creator_id, release_id, disc_number, track_number),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, release_id)
    references public.acc_releases (creator_id, id) on delete restrict,
  foreign key (creator_id, song_id)
    references public.acc_songs (creator_id, id) on delete restrict,
  constraint acc_tracks_position check (disc_number > 0 and track_number > 0),
  constraint acc_tracks_shape check (
    (
      song_id is not null
      and placeholder_title is null
    )
    or (
      song_id is null
      and placeholder_title is not null
      and char_length(btrim(placeholder_title)) > 0
    )
  )
);

create unique index acc_release_tracks_song
  on public.acc_release_tracks (creator_id, release_id, song_id)
  where song_id is not null;

create index acc_release_tracks_order
  on public.acc_release_tracks (creator_id, release_id, disc_number, track_number);

create table public.acc_media (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  artist_id uuid,
  release_id uuid,
  song_id uuid,
  recording_id uuid,
  kind text not null,
  bucket text not null,
  object_key text not null,
  byte_size bigint not null,
  mime_type text not null,
  checksum_sha256 text not null,
  etag text,
  revision integer not null default 1,
  verification_state text not null,
  verified_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  primary key (id),
  unique (creator_id, id),
  unique (creator_id, bucket, object_key),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, artist_id)
    references public.acc_artists (creator_id, id) on delete restrict,
  foreign key (creator_id, release_id)
    references public.acc_releases (creator_id, id) on delete restrict,
  foreign key (creator_id, song_id)
    references public.acc_songs (creator_id, id) on delete restrict,
  foreign key (creator_id, recording_id)
    references public.acc_recordings (creator_id, id) on delete restrict,
  constraint acc_media_kind check (kind in ('cover', 'audio')),
  constraint acc_media_size check (byte_size > 0),
  constraint acc_media_checksum check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint acc_media_revision check (revision > 0),
  constraint acc_media_verification check (
    verification_state in ('pending', 'verified', 'rejected', 'unhealthy')
  ),
  constraint acc_media_one_parent check (
    num_nonnulls(artist_id, release_id, song_id, recording_id) = 1
  ),
  constraint acc_media_parent_kind check (
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
  )
);

create unique index acc_media_current_artist_cover
  on public.acc_media (creator_id, artist_id)
  where kind = 'cover' and is_current and artist_id is not null;

create unique index acc_media_current_release_cover
  on public.acc_media (creator_id, release_id)
  where kind = 'cover' and is_current and release_id is not null;

create unique index acc_media_current_song_cover
  on public.acc_media (creator_id, song_id)
  where kind = 'cover' and is_current and song_id is not null;

create unique index acc_media_current_verified_audio
  on public.acc_media (creator_id, recording_id)
  where kind = 'audio' and is_current and verification_state = 'verified';

create table public.acc_publication_events (
  creator_id uuid not null,
  id uuid not null default gen_random_uuid(),
  recording_id uuid not null,
  occurred_at timestamptz not null default now(),
  event_kind text not null,
  idempotency_key text not null,
  details jsonb not null default '{}'::jsonb,
  primary key (creator_id, id),
  unique (creator_id, idempotency_key),
  foreign key (creator_id) references public.acc_creators (id) on delete restrict,
  foreign key (creator_id, recording_id)
    references public.acc_recordings (creator_id, id) on delete restrict,
  constraint acc_publication_kind check (
    event_kind in ('first_published', 'withdrawn', 'audio_replaced')
  )
);

create index acc_publication_events_time
  on public.acc_publication_events (creator_id, occurred_at desc);

alter table public.acc_upload_intents
  add constraint acc_upload_intents_artist_fk
  foreign key (creator_id, artist_id)
  references public.acc_artists (creator_id, id) on delete restrict;

alter table public.acc_upload_intents
  add constraint acc_upload_intents_release_fk
  foreign key (creator_id, release_id)
  references public.acc_releases (creator_id, id) on delete restrict;

alter table public.acc_upload_intents
  add constraint acc_upload_intents_song_fk
  foreign key (creator_id, song_id)
  references public.acc_songs (creator_id, id) on delete restrict;

alter table public.acc_upload_intents
  add constraint acc_upload_intents_recording_fk
  foreign key (creator_id, recording_id)
  references public.acc_recordings (creator_id, id) on delete restrict;

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

create or replace function public.acc_protect_track()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
    and current_setting('acc.track_write', true) is distinct from 'on' then
    raise exception 'tracks are changed through catalogue operations' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id
      or new.release_id is distinct from old.release_id then
      raise exception 'track ownership cannot be reassigned' using errcode = '42501';
    end if;
    if (new.disc_number is distinct from old.disc_number
        or new.track_number is distinct from old.track_number)
      and current_setting('acc.reorder', true) is distinct from 'on'
      and current_setting('acc.track_write', true) is distinct from 'on' then
      raise exception 'track order is server-controlled' using errcode = '42501';
    end if;
    if new.song_id is distinct from old.song_id
      or new.placeholder_title is distinct from old.placeholder_title then
      if current_setting('acc.track_write', true) is distinct from 'on' then
        raise exception 'track assignment is server-controlled' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE'
    and current_setting('acc.track_write', true) is distinct from 'on' then
    raise exception 'track removal is server-controlled' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.acc_protect_media()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('acc.media_finalize', true) is distinct from 'on' then
    raise exception 'media is written by verification' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.creator_id is distinct from old.creator_id
      or new.id is distinct from old.id
      or new.object_key is distinct from old.object_key
      or new.bucket is distinct from old.bucket then
      raise exception 'stored object identity cannot change' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger acc_artists_touch
  before insert or update on public.acc_artists
  for each row execute function public.acc_touch_catalogue_row();
create trigger acc_releases_touch
  before insert or update on public.acc_releases
  for each row execute function public.acc_touch_catalogue_row();
create trigger acc_songs_touch
  before insert or update on public.acc_songs
  for each row execute function public.acc_touch_catalogue_row();
create trigger acc_recordings_protect
  before insert or update on public.acc_recordings
  for each row execute function public.acc_protect_recording();
create trigger acc_tracks_protect
  before insert or update or delete on public.acc_release_tracks
  for each row execute function public.acc_protect_track();
create trigger acc_media_protect
  before insert or update on public.acc_media
  for each row execute function public.acc_protect_media();

create trigger acc_artists_no_hard_delete
  before delete on public.acc_artists
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_releases_no_hard_delete
  before delete on public.acc_releases
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_songs_no_hard_delete
  before delete on public.acc_songs
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_recordings_no_hard_delete
  before delete on public.acc_recordings
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_media_no_hard_delete
  before delete on public.acc_media
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_publication_no_hard_delete
  before delete on public.acc_publication_events
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_audit_no_hard_delete
  before delete on public.acc_audit_events
  for each row execute function public.acc_forbid_hard_delete();
create trigger acc_creators_no_hard_delete
  before delete on public.acc_creators
  for each row execute function public.acc_forbid_hard_delete();

create trigger acc_artists_audit
  after insert or update on public.acc_artists
  for each row execute function public.acc_audit_catalogue_row();
create trigger acc_releases_audit
  after insert or update on public.acc_releases
  for each row execute function public.acc_audit_catalogue_row();
create trigger acc_songs_audit
  after insert or update on public.acc_songs
  for each row execute function public.acc_audit_catalogue_row();
create trigger acc_recordings_audit
  after insert or update on public.acc_recordings
  for each row execute function public.acc_audit_catalogue_row();

alter table public.acc_artists enable row level security;
alter table public.acc_releases enable row level security;
alter table public.acc_songs enable row level security;
alter table public.acc_recordings enable row level security;
alter table public.acc_release_tracks enable row level security;
alter table public.acc_media enable row level security;
alter table public.acc_publication_events enable row level security;

create policy acc_artists_select on public.acc_artists
  for select to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.can_read_own_metadata());
create policy acc_artists_insert on public.acc_artists
  for insert to authenticated
  with check (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
    and visibility = 'draft'
    and deleted_at is null
  );
create policy acc_artists_update on public.acc_artists
  for update to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.is_active_member())
  with check (creator_id = acc_private.current_creator_id() and acc_private.is_active_member());

create policy acc_releases_select on public.acc_releases
  for select to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.can_read_own_metadata());
create policy acc_releases_insert on public.acc_releases
  for insert to authenticated
  with check (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
    and visibility = 'draft'
    and deleted_at is null
  );
create policy acc_releases_update on public.acc_releases
  for update to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.is_active_member())
  with check (creator_id = acc_private.current_creator_id() and acc_private.is_active_member());

create policy acc_songs_select on public.acc_songs
  for select to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.can_read_own_metadata());
create policy acc_songs_insert on public.acc_songs
  for insert to authenticated
  with check (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
    and visibility = 'draft'
    and deleted_at is null
  );
create policy acc_songs_update on public.acc_songs
  for update to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.is_active_member())
  with check (creator_id = acc_private.current_creator_id() and acc_private.is_active_member());

create policy acc_recordings_select on public.acc_recordings
  for select to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.can_read_own_metadata());
create policy acc_recordings_insert on public.acc_recordings
  for insert to authenticated
  with check (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
    and is_current = false
    and retired_at is null
  );
create policy acc_recordings_update on public.acc_recordings
  for update to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.is_active_member())
  with check (creator_id = acc_private.current_creator_id() and acc_private.is_active_member());

create policy acc_tracks_select on public.acc_release_tracks
  for select to authenticated
  using (creator_id = acc_private.current_creator_id() and acc_private.can_read_own_metadata());

create policy acc_media_select on public.acc_media
  for select to authenticated
  using (
    creator_id = acc_private.current_creator_id()
    and acc_private.is_active_member()
  );

create policy acc_publication_select on public.acc_publication_events
  for select to authenticated
  using (
    creator_id = acc_private.current_creator_id()
    and acc_private.can_read_own_metadata()
  );

revoke all on table public.acc_artists from public, anon;
revoke all on table public.acc_releases from public, anon;
revoke all on table public.acc_songs from public, anon;
revoke all on table public.acc_recordings from public, anon;
revoke all on table public.acc_release_tracks from public, anon;
revoke all on table public.acc_media from public, anon;
revoke all on table public.acc_publication_events from public, anon;

grant select, insert, update on table public.acc_artists to authenticated;
grant select, insert, update on table public.acc_releases to authenticated;
grant select, insert, update on table public.acc_songs to authenticated;
grant select, insert, update on table public.acc_recordings to authenticated;
grant select on table public.acc_release_tracks to authenticated;
grant select on table public.acc_media to authenticated;
grant select on table public.acc_publication_events to authenticated;

grant select, insert, update, delete on table public.acc_artists to service_role;
grant select, insert, update, delete on table public.acc_releases to service_role;
grant select, insert, update, delete on table public.acc_songs to service_role;
grant select, insert, update, delete on table public.acc_recordings to service_role;
grant select, insert, update, delete on table public.acc_release_tracks to service_role;
grant select, insert, update, delete on table public.acc_media to service_role;
grant select, insert, update, delete on table public.acc_publication_events to service_role;
