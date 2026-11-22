-- Morse Chat schema. Run this in the Supabase SQL Editor before enabling the UI.

create table if not exists public.morse_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Morse user',
  created_at timestamptz not null default now()
);

create table if not exists public.morse_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null check (char_length(room_name) between 1 and 40),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.morse_room_members (
  room_id uuid not null references public.morse_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists morse_room_members_user_idx on public.morse_room_members (user_id, room_id);

create table if not exists public.morse_chat_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  incoming_format text not null default 'text' check (incoming_format in ('text', 'morse')),
  updated_at timestamptz not null default now()
);

create table if not exists public.morse_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.morse_rooms (id) on delete cascade,
  sender_id uuid not null references public.morse_profiles (user_id) on delete cascade,
  morse text not null check (char_length(morse) between 1 and 4000 and morse ~ '^[. /-]+$'),
  created_at timestamptz not null default now()
);
create index if not exists morse_messages_room_created_idx on public.morse_messages (room_id, created_at);
create index if not exists morse_messages_created_at_idx on public.morse_messages (created_at);

create or replace function public.is_morse_room_member(target_room uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.morse_room_members
    where room_id = target_room and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_morse_room(p_name text)
returns table (id uuid, room_name text, invite_code text)
language plpgsql security definer
set search_path = ''
as $$
declare created public.morse_rooms;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  insert into public.morse_rooms (room_name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Morse room'), (select auth.uid()))
  returning * into created;
  insert into public.morse_room_members (room_id, user_id)
  values (created.id, (select auth.uid()));
  return query select created.id, created.room_name, created.invite_code;
end;
$$;

create or replace function public.join_morse_room(p_code text)
returns table (id uuid, room_name text, invite_code text)
language plpgsql security definer
set search_path = ''
as $$
declare found_room public.morse_rooms;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  select * into found_room from public.morse_rooms as rooms
  where rooms.invite_code = upper(trim(p_code));
  if found_room.id is null then raise exception 'Room code not found'; end if;
  insert into public.morse_room_members (room_id, user_id)
  values (found_room.id, (select auth.uid())) on conflict do nothing;
  return query select found_room.id, found_room.room_name, found_room.invite_code;
end;
$$;

create or replace function public.rename_morse_room(p_room_id uuid, p_room_name text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare renamed_name text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required'; end if;
  if char_length(trim(coalesce(p_room_name, ''))) not between 1 and 40 then
    raise exception 'Room name must contain between 1 and 40 characters';
  end if;
  update public.morse_rooms as rooms
  set room_name = trim(p_room_name)
  where rooms.id = p_room_id and rooms.created_by = (select auth.uid())
  returning rooms.room_name into renamed_name;
  if renamed_name is null then raise exception 'Only the room creator can rename this room'; end if;
  return renamed_name;
end;
$$;

alter table public.morse_profiles enable row level security;
alter table public.morse_rooms enable row level security;
alter table public.morse_room_members enable row level security;
alter table public.morse_chat_settings enable row level security;
alter table public.morse_messages enable row level security;

revoke all on public.morse_profiles, public.morse_rooms, public.morse_room_members, public.morse_chat_settings, public.morse_messages from anon, authenticated;
grant select, insert, update on public.morse_profiles to authenticated;
grant select on public.morse_rooms, public.morse_room_members to authenticated;
grant select, insert, update on public.morse_chat_settings to authenticated;
grant select, insert on public.morse_messages to authenticated;
revoke all on function public.is_morse_room_member(uuid), public.create_morse_room(text), public.join_morse_room(text), public.rename_morse_room(uuid, text) from public, anon;
grant execute on function public.is_morse_room_member(uuid) to authenticated;
grant execute on function public.create_morse_room(text), public.join_morse_room(text) to authenticated;
grant execute on function public.rename_morse_room(uuid, text) to authenticated;

drop policy if exists "Users read profiles" on public.morse_profiles;
create policy "Users read profiles" on public.morse_profiles for select to authenticated using (true);
drop policy if exists "Users insert own profile" on public.morse_profiles;
create policy "Users insert own profile" on public.morse_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own profile" on public.morse_profiles;
create policy "Users update own profile" on public.morse_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Members read their rooms" on public.morse_rooms;
create policy "Members read their rooms" on public.morse_rooms for select to authenticated using (public.is_morse_room_member(id));
drop policy if exists "Members read room members" on public.morse_room_members;
create policy "Members read room members" on public.morse_room_members for select to authenticated using (public.is_morse_room_member(room_id));

drop policy if exists "Users read own chat settings" on public.morse_chat_settings;
create policy "Users read own chat settings" on public.morse_chat_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own chat settings" on public.morse_chat_settings;
create policy "Users insert own chat settings" on public.morse_chat_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own chat settings" on public.morse_chat_settings;
create policy "Users update own chat settings" on public.morse_chat_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Members read room messages" on public.morse_messages;
create policy "Members read room messages" on public.morse_messages for select to authenticated using (public.is_morse_room_member(room_id));
drop policy if exists "Members send Morse as themselves" on public.morse_messages;
create policy "Members send Morse as themselves" on public.morse_messages for insert to authenticated with check ((select auth.uid()) = sender_id and public.is_morse_room_member(room_id));

do $$ begin
  alter publication supabase_realtime add table public.morse_messages;
exception when duplicate_object then null;
end $$;

-- Remove messages as soon as they are more than 24 hours old (scheduled every minute).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'morse-chat-message-retention';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;
select cron.schedule(
  'morse-chat-message-retention',
  '* * * * *',
  $$delete from public.morse_messages where created_at < now() - interval '24 hours'$$
);

notify pgrst, 'reload schema';
