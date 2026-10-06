-- JASZCWEB V2 UPGRADE
-- Run this AFTER the original supabase.sql.
-- Adds: join-by-invite frontend support, profiles, reactions/replies,
-- moderation roles, DMs, notifications, private files, realtime presence,
-- community themes, and voice-channel signaling authorization.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILE CUSTOMIZATION
-- ------------------------------------------------------------
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists pronouns text not null default '';
alter table public.profiles add column if not exists status text not null default '';
alter table public.profiles add column if not exists accent_color text not null default '#c8ff38';
alter table public.profiles add column if not exists banner_color text not null default '#111318';
alter table public.profiles add column if not exists theme text not null default 'dark';
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check(theme in ('dark','light'));

alter table public.communities add column if not exists banner_color text not null default '#111318';

-- ------------------------------------------------------------
-- MEMBERSHIP / ROLES
-- ------------------------------------------------------------
alter table public.community_members add column if not exists banned boolean not null default false;

create or replace function public.is_community_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.community_members
    where community_id=cid and user_id=auth.uid() and banned=false
  );
$$;

create or replace function public.is_community_staff(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.community_members
    where community_id=cid and user_id=auth.uid()
      and role in ('owner','admin','moderator') and banned=false
  );
$$;

create or replace function public.member_role(cid uuid, uid uuid)
returns text
language sql stable security definer set search_path = public
as $$ select role from public.community_members where community_id=cid and user_id=uid and banned=false limit 1 $$;

-- Prevent arbitrary self-inserts into arbitrary communities.
drop policy if exists "users can join their own membership" on public.community_members;

-- Staff may manage membership through RPCs, not direct updates.
drop policy if exists "owners update members" on public.community_members;
create policy "staff read members" on public.community_members
for select to authenticated
using (user_id=auth.uid() or public.is_community_member(community_id));

-- ------------------------------------------------------------
-- CHANNELS: staff can create/manage; members can read
-- ------------------------------------------------------------
drop policy if exists "owners create channels" on public.channels;
drop policy if exists "owners update channels" on public.channels;
drop policy if exists "owners delete channels" on public.channels;
create policy "staff create channels" on public.channels for insert to authenticated
with check (public.is_community_staff(community_id));
create policy "staff update channels" on public.channels for update to authenticated
using (public.is_community_staff(community_id)) with check (public.is_community_staff(community_id));
create policy "staff delete channels" on public.channels for delete to authenticated
using (public.is_community_staff(community_id));

-- ------------------------------------------------------------
-- MESSAGES: replies, attachments, moderation
-- ------------------------------------------------------------
alter table public.messages add column if not exists reply_to bigint references public.messages(id) on delete set null;
alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_size bigint;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted boolean not null default false;

create index if not exists messages_reply_idx on public.messages(reply_to);

create policy "authors delete own messages" on public.messages for delete to authenticated
using (user_id=auth.uid());
create policy "staff delete messages" on public.messages for delete to authenticated
using (exists(select 1 from public.channels c where c.id=messages.channel_id and public.is_community_staff(c.community_id)));

-- ------------------------------------------------------------
-- REACTIONS
-- ------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key(message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;

drop policy if exists "members read reactions" on public.message_reactions;
drop policy if exists "users add reactions" on public.message_reactions;
drop policy if exists "users delete reactions" on public.message_reactions;
create policy "members read reactions" on public.message_reactions for select to authenticated
using (exists(select 1 from public.messages m join public.channels c on c.id=m.channel_id where m.id=message_id and public.is_community_member(c.community_id)));
create policy "users add reactions" on public.message_reactions for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.messages m join public.channels c on c.id=m.channel_id where m.id=message_id and public.is_community_member(c.community_id)));
create policy "users delete reactions" on public.message_reactions for delete to authenticated
using (user_id=auth.uid());

-- ------------------------------------------------------------
-- DIRECT MESSAGES
-- ------------------------------------------------------------
create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.direct_participants (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.direct_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check(char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.direct_conversations enable row level security;
alter table public.direct_participants enable row level security;
alter table public.direct_messages enable row level security;

create or replace function public.is_dm_participant(cid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.direct_participants where conversation_id=cid and user_id=auth.uid());
$$;

create policy "participants read conversations" on public.direct_conversations for select to authenticated using (public.is_dm_participant(id));
create policy "participants read dm members" on public.direct_participants for select to authenticated using (public.is_dm_participant(conversation_id));
create policy "participants read dms" on public.direct_messages for select to authenticated using (public.is_dm_participant(conversation_id));
create policy "participants send dms" on public.direct_messages for insert to authenticated
with check (user_id=auth.uid() and public.is_dm_participant(conversation_id));

create or replace function public.create_direct_conversation(p_username text)
returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; existing uuid; new_id uuid;
begin
  select id into target from public.profiles where lower(username)=lower(trim(p_username)) limit 1;
  if target is null then raise exception 'User not found'; end if;
  if target=auth.uid() then raise exception 'You cannot DM yourself'; end if;

  select dp1.conversation_id into existing
  from public.direct_participants dp1
  where dp1.user_id=auth.uid()
    and exists(select 1 from public.direct_participants dp2 where dp2.conversation_id=dp1.conversation_id and dp2.user_id=target)
    and (select count(*) from public.direct_participants x where x.conversation_id=dp1.conversation_id)=2
  limit 1;
  if existing is not null then return existing; end if;

  insert into public.direct_conversations default values returning id into new_id;
  insert into public.direct_participants(conversation_id,user_id) values(new_id,auth.uid()),(new_id,target);
  return new_id;
end;
$$;

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  community_id uuid references public.communities(id) on delete cascade,
  message_id bigint references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);

create or replace function public.notify_reply()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent_user uuid; cname text; comm uuid;
begin
  if NEW.reply_to is null then return NEW; end if;
  select m.user_id,c.name,c.id into parent_user,cname,comm
  from public.messages m join public.channels ch on ch.id=m.channel_id join public.communities c on c.id=ch.community_id
  where m.id=NEW.reply_to;
  if parent_user is not null and parent_user<>NEW.user_id then
    insert into public.notifications(user_id,type,title,body,community_id,message_id)
    values(parent_user,'reply',coalesce(cname,'Community'), 'Someone replied to your message.',comm,NEW.id);
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_reply on public.messages;
create trigger trg_notify_reply after insert on public.messages for each row execute function public.notify_reply();

create or replace function public.notify_reaction()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid; comm uuid;
begin
  select m.user_id,ch.community_id into owner_id,comm from public.messages m join public.channels ch on ch.id=m.channel_id where m.id=NEW.message_id;
  if owner_id is not null and owner_id<>NEW.user_id then
    insert into public.notifications(user_id,type,title,body,community_id,message_id)
    values(owner_id,'reaction','New reaction', 'Someone reacted to your message with '||NEW.emoji, comm, NEW.message_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_reaction on public.message_reactions;
create trigger trg_notify_reaction after insert on public.message_reactions for each row execute function public.notify_reaction();

create or replace function public.notify_dm()
returns trigger language plpgsql security definer set search_path=public as $$
declare other_id uuid; sender_name text;
begin
  select display_name into sender_name from public.profiles where id=NEW.user_id;
  for other_id in select user_id from public.direct_participants where conversation_id=NEW.conversation_id and user_id<>NEW.user_id loop
    insert into public.notifications(user_id,type,title,body)
    values(other_id,'dm',coalesce(sender_name,'New message'),'You received a direct message.');
  end loop;
  return NEW;
end; $$;

drop trigger if exists trg_notify_dm on public.direct_messages;
create trigger trg_notify_dm after insert on public.direct_messages for each row execute function public.notify_dm();

-- ------------------------------------------------------------
-- MODERATION RPCs
-- ------------------------------------------------------------
create or replace function public.set_member_role(p_community_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; target_role text;
begin
  select role into actor_role from public.community_members where community_id=p_community_id and user_id=auth.uid() and banned=false;
  if actor_role<>'owner' then raise exception 'Only the owner can change roles'; end if;
  if p_role not in ('member','moderator','admin') then raise exception 'Invalid role'; end if;
  select role into target_role from public.community_members where community_id=p_community_id and user_id=p_user_id;
  if target_role='owner' then raise exception 'Cannot change the owner'; end if;
  update public.community_members set role=p_role where community_id=p_community_id and user_id=p_user_id;
  insert into public.notifications(user_id,type,title,body,community_id)
  values(p_user_id,'moderation','Role updated','Your community role is now '||p_role||'.',p_community_id);
end; $$;

create or replace function public.remove_member(p_community_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; target_role text;
begin
  select role into actor_role from public.community_members where community_id=p_community_id and user_id=auth.uid() and banned=false;
  select role into target_role from public.community_members where community_id=p_community_id and user_id=p_user_id;
  if actor_role not in ('owner','admin','moderator') then raise exception 'Not allowed'; end if;
  if target_role='owner' then raise exception 'Cannot remove owner'; end if;
  if actor_role='moderator' and target_role in ('admin','moderator') then raise exception 'Not allowed'; end if;
  delete from public.community_members where community_id=p_community_id and user_id=p_user_id;
end; $$;

create or replace function public.ban_member(p_community_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; target_role text;
begin
  select role into actor_role from public.community_members where community_id=p_community_id and user_id=auth.uid() and banned=false;
  select role into target_role from public.community_members where community_id=p_community_id and user_id=p_user_id;
  if actor_role not in ('owner','admin','moderator') then raise exception 'Not allowed'; end if;
  if target_role='owner' then raise exception 'Cannot ban owner'; end if;
  if actor_role='moderator' and target_role in ('admin','moderator') then raise exception 'Not allowed'; end if;
  update public.community_members set banned=true where community_id=p_community_id and user_id=p_user_id;
  insert into public.notifications(user_id,type,title,body,community_id) values(p_user_id,'moderation','Community moderation','You were banned from a community.',p_community_id);
end; $$;

-- ------------------------------------------------------------
-- STORAGE BUCKETS + POLICIES
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit)
values('avatars','avatars',true,5242880)
on conflict(id) do update set public=true,file_size_limit=5242880;

insert into storage.buckets(id,name,public,file_size_limit)
values('community-files','community-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

drop policy if exists "avatar uploads own folder" on storage.objects;
drop policy if exists "avatar updates own folder" on storage.objects;
drop policy if exists "avatar deletes own folder" on storage.objects;
create policy "avatar uploads own folder" on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "avatar updates own folder" on storage.objects for update to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid()::text))
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "avatar deletes own folder" on storage.objects for delete to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid()::text));

drop policy if exists "community files upload" on storage.objects;
drop policy if exists "community files read" on storage.objects;
drop policy if exists "community files delete" on storage.objects;
create policy "community files upload" on storage.objects for insert to authenticated
with check(bucket_id='community-files' and public.is_community_member(((storage.foldername(name))[1])::uuid));
create policy "community files read" on storage.objects for select to authenticated
using(bucket_id='community-files' and public.is_community_member(((storage.foldername(name))[1])::uuid));
create policy "community files delete" on storage.objects for delete to authenticated
using(bucket_id='community-files' and ((storage.foldername(name))[2]=(select auth.uid()::text) or public.is_community_staff(((storage.foldername(name))[1])::uuid)));

-- ------------------------------------------------------------
-- REALTIME PUBLICATION + PRIVATE VOICE AUTHORIZATION
-- ------------------------------------------------------------
do $$begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;
do $$begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
do $$begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;

create or replace function public.is_community_presence_topic_member(topic text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare cid uuid;
begin
  begin cid := split_part(topic,':',3)::uuid; exception when others then return false; end;
  return exists(select 1 from public.communities c where c.id=cid and public.is_community_member(cid));
end; $$;

drop policy if exists "community presence receive" on realtime.messages;
drop policy if exists "community presence send" on realtime.messages;
create policy "community presence receive" on realtime.messages for select to authenticated
using (public.is_community_presence_topic_member(realtime.topic()) and extension='presence');
create policy "community presence send" on realtime.messages for insert to authenticated
with check (public.is_community_presence_topic_member(realtime.topic()) and extension='presence');

create or replace function public.is_voice_topic_member(topic text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare cid uuid;
begin
  begin cid := split_part(topic,':',2)::uuid; exception when others then return false; end;
  return exists(
    select 1 from public.channels ch
    where ch.id=cid and ch.type='voice' and public.is_community_member(ch.community_id)
  );
end; $$;

drop policy if exists "voice receive" on realtime.messages;
drop policy if exists "voice send" on realtime.messages;
create policy "voice receive" on realtime.messages for select to authenticated
using (public.is_voice_topic_member(realtime.topic()) and extension in ('broadcast','presence'));
create policy "voice send" on realtime.messages for insert to authenticated
with check (public.is_voice_topic_member(realtime.topic()) and extension in ('broadcast','presence'));

-- ------------------------------------------------------------
-- VOICE JOIN PRIVACY: the current Realtime client uses private=true.
-- ------------------------------------------------------------
