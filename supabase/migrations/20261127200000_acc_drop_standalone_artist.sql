-- Creators artists are independent catalogue entities.
-- Band or group is stored in artist_kind. There is no band roster.
-- Do not apply to the shared project until the owner runs this file.
-- The earlier four migrations are already applied and must not be edited.

alter table public.acc_artists
  drop constraint if exists acc_artists_individual_standalone;

alter table public.acc_artists
  drop column if exists standalone_artist;
