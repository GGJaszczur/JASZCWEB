-- JASZCWEB DM + VOICE SIGNALING ADD-ON
-- Run this AFTER your existing supabase.sql.

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint dm_different_users check (user_a <> user_b),
  constraint dm_sorted_pair check (user_a < user_b),
  constraint dm_unique_pair unique (user_a, user_b)
);

alter table public.dm_conversations enable row level security;

create or replace function public.is_dm_participant(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_conversations d
    where d.id = cid
      and (d.user_a = auth.uid() or d.user_b = auth.uid())
  );
$$;

create policy "participants read dm conversations"
on public.dm_conversations for select
to authenticated
using (user_a = auth.uid() or user_b = auth.uid());

create table if not exists public.direct_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.direct_messages enable row level security;

create policy "participants read direct messages"
on public.direct_messages for select
to authenticated
using (public.is_dm_participant(conversation_id));

create policy "participants send direct messages"
on public.direct_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_dm_participant(conversation_id)
);

create index if not exists direct_messages_conversation_created_idx
on public.direct_messages(conversation_id, created_at);

create or replace function public.get_or_create_dm(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
  first_user uuid;
  second_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user is null or p_other_user = auth.uid() then
    raise exception 'Invalid user';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'User not found';
  end if;

  if auth.uid() < p_other_user then
    first_user := auth.uid();
    second_user := p_other_user;
  else
    first_user := p_other_user;
    second_user := auth.uid();
  end if;

  insert into public.dm_conversations(user_a, user_b)
  values (first_user, second_user)
  on conflict (user_a, user_b)
  do nothing
  returning id into result_id;

  if result_id is null then
    select id into result_id
    from public.dm_conversations
    where user_a = first_user
      and user_b = second_user;
  end if;

  return result_id;
end;
$$;

grant usage on schema public to authenticated;
grant select, insert on public.dm_conversations to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- Realtime for DM messages.
do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
end $$;
