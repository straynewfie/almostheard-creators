-- Almost Heard Creators: identity, membership, and tenant helpers.
-- Issues #16 and #2. Do not apply to production without owner approval.
-- Forward-only. Roll back by restoring a backup taken before migrate.

create schema if not exists acc_private;
revoke all on schema acc_private from public, anon;
grant usage on schema public to authenticated, service_role;
grant usage on schema acc_private to authenticated, service_role;

create table public.acc_creators (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  display_name text not null,
  handle text,
  membership_state text not null default 'inactive',
  cancelled_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint acc_creators_display_name check (
    char_length(btrim(display_name)) between 1 and 120
  ),
  constraint acc_creators_handle check (
    handle is null
    or (
      char_length(handle) between 1 and 40
      and handle ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ),
  constraint acc_creators_membership check (
    membership_state in ('active', 'inactive', 'cancelled')
  ),
  constraint acc_creators_cancellation check (
    (
      membership_state = 'cancelled'
      and cancelled_at is not null
      and retention_until is not null
    )
    or (
      membership_state <> 'cancelled'
      and cancelled_at is null
      and retention_until is null
    )
  )
);

create unique index acc_creators_handle_unique
  on public.acc_creators (handle)
  where handle is not null;

create or replace function acc_private.current_creator_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id from public.acc_creators where auth_user_id = auth.uid()
$$;

create or replace function acc_private.membership_state()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select membership_state
  from public.acc_creators
  where auth_user_id = auth.uid()
$$;

create or replace function acc_private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(acc_private.membership_state() = 'active', false)
$$;

create or replace function acc_private.can_read_own_metadata()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.acc_creators as creator
    where creator.auth_user_id = auth.uid()
      and (
        creator.membership_state in ('active', 'inactive')
        or (
          creator.membership_state = 'cancelled'
          and creator.retention_until is not null
          and creator.retention_until > now()
        )
      )
  )
$$;

revoke all on function acc_private.current_creator_id() from public, anon, authenticated;
revoke all on function acc_private.membership_state() from public, anon, authenticated;
revoke all on function acc_private.is_active_member() from public, anon, authenticated;
revoke all on function acc_private.can_read_own_metadata() from public, anon, authenticated;
grant execute on function acc_private.current_creator_id() to authenticated;
grant execute on function acc_private.membership_state() to authenticated;
grant execute on function acc_private.is_active_member() to authenticated;
grant execute on function acc_private.can_read_own_metadata() to authenticated;

create or replace function public.acc_protect_creator_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' and new.membership_state is distinct from 'inactive' then
    if current_setting('acc.lifecycle_write', true) is distinct from 'on' then
      raise exception 'new creators start inactive' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if new.id is distinct from old.id
      or new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'protected creator fields cannot change' using errcode = '42501';
    end if;
    if new.membership_state is distinct from old.membership_state
      or new.cancelled_at is distinct from old.cancelled_at
      or new.retention_until is distinct from old.retention_until then
      if current_setting('acc.lifecycle_write', true) is distinct from 'on' then
        raise exception 'membership changes are server-controlled' using errcode = '42501';
      end if;
    end if;
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.created_at := pg_catalog.now();
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.acc_protect_creator_row() from public, anon, authenticated;
grant execute on function public.acc_protect_creator_row() to authenticated, service_role;

create trigger acc_creators_protect
  before insert or update on public.acc_creators
  for each row execute function public.acc_protect_creator_row();

create or replace function public.acc_ensure_creator_profile(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id into v_id
  from public.acc_creators
  where auth_user_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  v_name := left(btrim(coalesce(p_display_name, '')), 120);
  if v_name = '' then
    v_name := 'Creator';
  end if;

  insert into public.acc_creators (
    auth_user_id,
    display_name,
    membership_state,
    created_by,
    updated_by
  )
  values (v_uid, v_name, 'inactive', v_uid, v_uid)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.acc_ensure_creator_profile(text) from public, anon, authenticated;
grant execute on function public.acc_ensure_creator_profile(text) to authenticated;

create or replace function public.acc_set_membership_state(
  p_creator_id uuid,
  p_state text,
  p_test_reactivation boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'membership changes are operator-only' using errcode = '42501';
  end if;
  if p_state not in ('active', 'inactive', 'cancelled') then
    raise exception 'invalid membership state';
  end if;

  select membership_state into v_old
  from public.acc_creators
  where id = p_creator_id
  for update;
  if v_old is null then
    raise exception 'creator not found';
  end if;
  if v_old = 'cancelled' and p_state = 'active' and p_test_reactivation is distinct from true then
    raise exception 'reactivation requires the unresolved billing policy';
  end if;

  perform set_config('acc.lifecycle_write', 'on', true);

  if p_state = 'cancelled' then
    update public.acc_creators
    set membership_state = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        retention_until = coalesce(retention_until, now() + interval '60 days')
    where id = p_creator_id;
  else
    update public.acc_creators
    set membership_state = p_state,
        cancelled_at = null,
        retention_until = null
    where id = p_creator_id;
  end if;
end;
$$;

revoke all on function public.acc_set_membership_state(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.acc_set_membership_state(uuid, text, boolean) to service_role;

alter table public.acc_creators enable row level security;
alter table public.acc_creators force row level security;

create policy acc_creators_select
  on public.acc_creators
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    and acc_private.can_read_own_metadata()
  );

create policy acc_creators_update
  on public.acc_creators
  for update
  to authenticated
  using (auth_user_id = auth.uid() and acc_private.is_active_member())
  with check (auth_user_id = auth.uid() and acc_private.is_active_member());

revoke all on table public.acc_creators from public, anon, authenticated;
grant select on table public.acc_creators to authenticated;
grant update (display_name, handle) on table public.acc_creators to authenticated;
grant select, insert, update, delete on table public.acc_creators to service_role;
