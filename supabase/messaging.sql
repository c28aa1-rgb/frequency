-- Frequency — Messaging schema. Run in Supabase → SQL Editor (after schema.sql).
-- 1:1 conversations now, modeled so groups slot in later. Includes the
-- connections table so DM permission rules are ready for the external stage.

-- ── Connections (friend graph for non-Dalton links) ──────────────────
create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'blocked')),
  created_at    timestamptz not null default now(),
  unique (requester_id, addressee_id)
);
alter table public.connections enable row level security;

drop policy if exists "see own connections" on public.connections;
create policy "see own connections" on public.connections for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "create own requests" on public.connections;
create policy "create own requests" on public.connections for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "respond to requests" on public.connections;
create policy "respond to requests" on public.connections for update to authenticated
  using (addressee_id = auth.uid() or requester_id = auth.uid());

-- ── Conversations + membership + messages ────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations (id) on delete cascade,
  user_id         uuid references public.profiles (id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null default 'text' check (kind in ('text', 'image')),
  body            text,
  image_path      text,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_time on public.messages (conversation_id, created_at);

-- Non-recursive membership check used by the policies below.
create or replace function public.is_member(conv uuid, uid uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = uid
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "see own conversations" on public.conversations;
create policy "see own conversations" on public.conversations for select to authenticated
  using (public.is_member(id, auth.uid()));

drop policy if exists "see members of own conversations" on public.conversation_members;
create policy "see members of own conversations" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id, auth.uid()));

drop policy if exists "read messages in own conversations" on public.messages;
create policy "read messages in own conversations" on public.messages for select to authenticated
  using (public.is_member(conversation_id, auth.uid()));

drop policy if exists "send to own conversations" on public.messages;
create policy "send to own conversations" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id, auth.uid()));

-- ── Get-or-create a 1:1 conversation ─────────────────────────────────
create or replace function public.get_or_create_dm(other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
  me_dalton boolean;
  other_dalton boolean;
begin
  if other = auth.uid() then
    raise exception 'cannot DM yourself';
  end if;

  select is_dalton into me_dalton from public.profiles where id = auth.uid();
  select is_dalton into other_dalton from public.profiles where id = other;

  -- DEV: permissive for now so any two accounts can be tested. To enforce the
  -- real rules (both Dalton, or an accepted connection), uncomment this block
  -- when the invite UI ships:
  --
  -- if not (coalesce(me_dalton, false) and coalesce(other_dalton, false)) then
  --   if not exists (
  --     select 1 from public.connections c
  --     where c.status = 'accepted'
  --       and ((c.requester_id = auth.uid() and c.addressee_id = other)
  --         or (c.requester_id = other and c.addressee_id = auth.uid()))
  --   ) then
  --     raise exception 'not connected';
  --   end if;
  -- end if;

  -- Reuse an existing 1:1 if there is one.
  select m1.conversation_id into conv
  from public.conversation_members m1
  join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
  join public.conversations co on co.id = m1.conversation_id
  where m1.user_id = auth.uid() and m2.user_id = other and co.is_group = false
  limit 1;

  if conv is null then
    insert into public.conversations (is_group) values (false) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id)
      values (conv, auth.uid()), (conv, other);
  end if;

  return conv;
end;
$$;

-- Let Realtime stream new messages to subscribed clients.
alter publication supabase_realtime add table public.messages;
