create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,username text not null unique,display_name text not null default 'User',avatar_url text,created_at timestamptz not null default now());
create table if not exists public.communities(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,description text default '',owner_id uuid not null references public.profiles(id) on delete cascade,accent_color text not null default '#c8ff38',created_at timestamptz not null default now());
create table if not exists public.community_members(community_id uuid not null references public.communities(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role text not null default 'member' check(role in('owner','admin','moderator','member')),joined_at timestamptz not null default now(),primary key(community_id,user_id));
create table if not exists public.channels(id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities(id) on delete cascade,name text not null,type text not null default 'text',position integer not null default 0,created_at timestamptz not null default now());
create table if not exists public.messages(id bigint generated always as identity primary key,channel_id uuid not null references public.channels(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,content text not null check(char_length(content) between 1 and 2000),created_at timestamptz not null default now());
create table if not exists public.community_invites(id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities(id) on delete cascade,code text not null unique,created_by uuid not null references public.profiles(id) on delete cascade,active boolean not null default true,created_at timestamptz not null default now());

alter table public.profiles enable row level security;alter table public.communities enable row level security;alter table public.community_members enable row level security;alter table public.channels enable row level security;alter table public.messages enable row level security;alter table public.community_invites enable row level security;

create or replace function public.is_member(cid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.community_members where community_id=cid and user_id=auth.uid())$$;
create or replace function public.is_owner(cid uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.community_members where community_id=cid and user_id=auth.uid() and role='owner')$$;

create policy "profile read" on public.profiles for select to authenticated using(true);
create policy "profile own update" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "community member read" on public.communities for select to authenticated using(public.is_member(id));
create policy "community owner update" on public.communities for update to authenticated using(public.is_owner(id)) with check(public.is_owner(id));
create policy "member read" on public.community_members for select to authenticated using(user_id=auth.uid() or public.is_member(community_id));
create policy "owner add member" on public.community_members for insert to authenticated with check(public.is_owner(community_id));
create policy "owner update member" on public.community_members for update to authenticated using(public.is_owner(community_id)) with check(public.is_owner(community_id));
create policy "channel read" on public.channels for select to authenticated using(public.is_member(community_id));
create policy "owner channel create" on public.channels for insert to authenticated with check(public.is_owner(community_id));
create policy "owner channel update" on public.channels for update to authenticated using(public.is_owner(community_id)) with check(public.is_owner(community_id));
create policy "owner channel delete" on public.channels for delete to authenticated using(public.is_owner(community_id));
create policy "message read" on public.messages for select to authenticated using(exists(select 1 from public.channels c where c.id=channel_id and public.is_member(c.community_id)));
create policy "message send" on public.messages for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.channels c where c.id=channel_id and public.is_member(c.community_id)));
create policy "invite member read" on public.community_invites for select to authenticated using(public.is_member(community_id) and active=true);


create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare u text; begin u:=lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)));u:=regexp_replace(u,'[^a-z0-9_]','','g');if u='' then u:='user_'||substr(replace(new.id::text,'-',''),1,8);end if;begin insert into public.profiles(id,username,display_name) values(new.id,u,coalesce(new.raw_user_meta_data->>'display_name',u));exception when unique_violation then insert into public.profiles(id,username,display_name) values(new.id,u||'_'||substr(replace(new.id::text,'-',''),1,6),coalesce(new.raw_user_meta_data->>'display_name',u));end;return new;end;$$;
drop trigger if exists on_auth_user_created on auth.users;create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.create_community(p_name text,p_slug text,p_description text default '') returns uuid language plpgsql security definer set search_path=public as $$declare cid uuid; code text; begin insert into public.communities(name,slug,description,owner_id) values(trim(p_name),lower(trim(p_slug)),trim(coalesce(p_description,'')),auth.uid()) returning id into cid;insert into public.community_members(community_id,user_id,role) values(cid,auth.uid(),'owner');insert into public.channels(community_id,name,position,type) values(cid,'general',0,'text');code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));insert into public.community_invites(community_id,code,created_by) values(cid,code,auth.uid());return cid;end;$$;
create or replace function public.join_community(p_code text) returns uuid language plpgsql security definer set search_path=public as $$declare cid uuid;begin select community_id into cid from public.community_invites where code=upper(trim(p_code)) and active=true limit 1;if cid is null then raise exception 'Invalid invite code';end if;insert into public.community_members(community_id,user_id,role) values(cid,auth.uid(),'member') on conflict do nothing;return cid;end;$$;
grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;grant execute on function public.create_community(text,text,text) to authenticated;grant execute on function public.join_community(text) to authenticated;
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
