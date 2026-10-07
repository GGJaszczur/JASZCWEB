-- JASZCWEB ADMIN FUNCTIONAL MIGRATION
-- Run once in the existing Supabase project.
-- Safe for existing users/messages/communities.

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.communities add column if not exists is_locked boolean not null default false;

create table if not exists public.platform_announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','danger')),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_announcements enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true and is_banned=false);
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- Admin read policies for data used by the dashboard.
drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "admins read communities" on public.communities;
create policy "admins read communities" on public.communities for select to authenticated using (public.is_platform_admin() or public.is_community_member(id));

drop policy if exists "admins read messages" on public.messages;
create policy "admins read messages" on public.messages for select to authenticated using (public.is_platform_admin() or exists(select 1 from public.channels c where c.id=messages.channel_id and public.is_community_member(c.community_id)));

drop policy if exists "admins read announcements" on public.platform_announcements;
create policy "admins read announcements" on public.platform_announcements for select to authenticated using (active=true or public.is_platform_admin());

-- User moderation.
create or replace function public.admin_manage_user(p_user_id uuid,p_action text)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  if p_user_id=auth.uid() and p_action in ('ban','suspend','demote') then raise exception 'You cannot lock your own admin account'; end if;
  case p_action
    when 'promote' then update public.profiles set is_admin=true where id=p_user_id;
    when 'demote' then update public.profiles set is_admin=false where id=p_user_id;
    when 'suspend' then update public.profiles set suspended_until=now()+interval '24 hours' where id=p_user_id;
    when 'unsuspend' then update public.profiles set suspended_until=null where id=p_user_id;
    when 'ban' then update public.profiles set is_banned=true,is_admin=false where id=p_user_id;
    when 'unban' then update public.profiles set is_banned=false where id=p_user_id;
    else raise exception 'Unknown user action';
  end case;
  return jsonb_build_object('success',true,'action',p_action,'user_id',p_user_id);
end; $$;

grant execute on function public.admin_manage_user(uuid,text) to authenticated;

-- Community moderation.
create or replace function public.admin_manage_community(p_community_id uuid,p_action text)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  case p_action
    when 'lock' then update public.communities set is_locked=true where id=p_community_id;
    when 'unlock' then update public.communities set is_locked=false where id=p_community_id;
    when 'delete' then delete from public.communities where id=p_community_id;
    else raise exception 'Unknown community action';
  end case;
  return jsonb_build_object('success',true,'action',p_action,'community_id',p_community_id);
end; $$;

grant execute on function public.admin_manage_community(uuid,text) to authenticated;

-- Message moderation.
create or replace function public.admin_delete_message(p_message_id bigint)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  delete from public.messages where id=p_message_id;
  return jsonb_build_object('success',true,'message_id',p_message_id);
end; $$;

grant execute on function public.admin_delete_message(bigint) to authenticated;

-- Announcements.
create or replace function public.admin_publish_announcement(p_title text,p_body text,p_severity text)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
declare new_id bigint;
begin
  if not public.is_platform_admin() then raise exception 'Admin access required'; end if;
  insert into public.platform_announcements(title,body,severity,created_by) values(trim(p_title),trim(p_body),p_severity,auth.uid()) returning id into new_id;
  return jsonb_build_object('success',true,'announcement_id',new_id);
end; $$;

grant execute on function public.admin_publish_announcement(text,text,text) to authenticated;
