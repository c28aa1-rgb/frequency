-- Frequency — Stage 3: outside connections, blocking, image messages,
-- moderation, and 3-day retention. Run in Supabase → SQL Editor after
-- schema.sql and messaging.sql. Safe to re-run.

-- ── Profile flags ────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists disabled boolean not null default false;

-- Users may change only their own icon color / last_seen — never is_admin,
-- disabled, is_dalton, or their Google name.
revoke update on public.profiles from anon, authenticated;
grant update (color, last_seen) on public.profiles to authenticated;

update public.profiles set is_admin = true where lower(email) = 'c28aa1@dalton.org';

-- ── Blocks ───────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid references public.profiles (id) on delete cascade,
  blocked_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists "see own blocks" on public.blocks;
create policy "see own blocks" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
drop policy if exists "block others" on public.blocks;
create policy "block others" on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
drop policy if exists "unblock others" on public.blocks;
create policy "unblock others" on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ── Permission helpers (security definer = no recursive RLS) ─────────
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

-- Both Dalton, or an accepted connection.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select (
    coalesce((select p.is_dalton from public.profiles p where p.id = a), false)
    and coalesce((select p.is_dalton from public.profiles p where p.id = b), false)
  ) or exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.addressee_id = b)
        or (c.requester_id = b and c.addressee_id = a))
  );
$$;

-- Who shows up in your directory: yourself, people you're connected to, and
-- anyone with a pending request either way. Disabled accounts are hidden from
-- everyone but admins.
create or replace function public.can_see_profile(target uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select target = auth.uid()
    or public.is_admin(auth.uid())
    or (
      not coalesce((select p.disabled from public.profiles p where p.id = target), true)
      and (
        public.are_connected(auth.uid(), target)
        or exists (
          select 1 from public.connections c
          where c.status = 'pending'
            and ((c.requester_id = auth.uid() and c.addressee_id = target)
              or (c.requester_id = target and c.addressee_id = auth.uid()))
        )
      )
    );
$$;

-- Can the signed-in user post into this conversation right now?
create or replace function public.can_send(conv uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select public.is_member(conv, auth.uid())
    and not coalesce((select p.disabled from public.profiles p where p.id = auth.uid()), true)
    and not exists (
      select 1
      from public.conversation_members m
      join public.profiles p on p.id = m.user_id
      where m.conversation_id = conv
        and m.user_id <> auth.uid()
        and (p.disabled
          or public.is_blocked_between(auth.uid(), m.user_id)
          or not public.are_connected(auth.uid(), m.user_id))
    );
$$;

-- ── Directory visibility ─────────────────────────────────────────────
drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "profiles visible to connections" on public.profiles;
create policy "profiles visible to connections" on public.profiles for select to authenticated
  using (public.can_see_profile(id));

-- ── Connections: changes go through the functions below only ─────────
drop policy if exists "create own requests" on public.connections;
drop policy if exists "respond to requests" on public.connections;

create or replace function public.request_connection(target_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  existing public.connections;
begin
  select id into target from public.profiles
  where lower(email) = lower(trim(target_email)) and not disabled;

  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  if public.are_connected(auth.uid(), target) then return 'already'; end if;
  if public.is_blocked_between(auth.uid(), target) then return 'not_found'; end if;

  select * into existing from public.connections
  where (requester_id = auth.uid() and addressee_id = target)
     or (requester_id = target and addressee_id = auth.uid())
  limit 1;

  if existing.id is not null then
    -- They already asked us: sending one back accepts it.
    if existing.addressee_id = auth.uid() and existing.status = 'pending' then
      update public.connections set status = 'accepted' where id = existing.id;
      return 'accepted';
    end if;
    return 'pending';
  end if;

  if (select count(*) from public.connections
      where requester_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many requests today';
  end if;

  insert into public.connections (requester_id, addressee_id) values (auth.uid(), target);
  return 'sent';
end;
$$;

create or replace function public.respond_connection(request uuid, accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if accept then
    update public.connections set status = 'accepted'
    where id = request and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.connections
    where id = request and addressee_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Withdraw a request you sent, or remove an accepted connection.
create or replace function public.remove_connection(other uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connections
  where (requester_id = auth.uid() and addressee_id = other)
     or (requester_id = other and addressee_id = auth.uid());
end;
$$;

-- ── DMs now enforce the real rules ───────────────────────────────────
create or replace function public.get_or_create_dm(other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
begin
  if other = auth.uid() then
    raise exception 'cannot DM yourself';
  end if;
  if not public.are_connected(auth.uid(), other) then
    raise exception 'not connected';
  end if;
  if public.is_blocked_between(auth.uid(), other) then
    raise exception 'blocked';
  end if;

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

-- ── Messages: 3-day visibility, send rules, content shape ────────────
drop policy if exists "read messages in own conversations" on public.messages;
create policy "read messages in own conversations" on public.messages for select to authenticated
  using (public.is_member(conversation_id, auth.uid())
         and created_at > now() - interval '72 hours');

drop policy if exists "send to own conversations" on public.messages;
create policy "send to own conversations" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_send(conversation_id)
    and (
      (kind = 'text' and body is not null and length(body) between 1 and 4000 and image_path is null)
      or (kind = 'image' and image_path like conversation_id::text || '/%')
    )
  );

-- Sidebar previews: one row per 1:1 with its latest (still-visible) message.
create or replace function public.my_threads()
returns table (other_id uuid, conversation_id uuid, last_kind text, last_body text,
               last_sender uuid, last_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select other.user_id, c.id, lm.kind, lm.body, lm.sender_id, lm.created_at
  from public.conversation_members mine
  join public.conversations c on c.id = mine.conversation_id and not c.is_group
  join public.conversation_members other
    on other.conversation_id = c.id and other.user_id <> mine.user_id
  left join lateral (
    select m.kind, m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where mine.user_id = auth.uid();
$$;

-- ── Image storage ────────────────────────────────────────────────────
-- Private bucket; files live at <conversation_id>/<uuid>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat images: members upload" on storage.objects;
create policy "chat images: members upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.can_send(((storage.foldername(name))[1])::uuid)
  );

-- Readable only while the message that carries it is still alive (3 days).
drop policy if exists "chat images: members read live images" on storage.objects;
create policy "chat images: members read live images" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.messages m
        where m.image_path = objects.name
          and m.created_at > now() - interval '72 hours'
          and public.is_member(m.conversation_id, auth.uid())
      )
    )
  );

-- Used by the server-side cleanup (service role only) to find expired files.
create or replace function public.expired_chat_images()
returns setof text language sql security definer set search_path = '' stable as $$
  select o.name from storage.objects o
  where o.bucket_id = 'chat-images' and o.created_at < now() - interval '72 hours'
  limit 1000;
$$;
revoke execute on function public.expired_chat_images() from public, anon, authenticated;
grant execute on function public.expired_chat_images() to service_role;

-- ── Moderation ───────────────────────────────────────────────────────
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('user', 'auto-text', 'auto-image')),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_id       uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason          text not null,
  detail          text,
  evidence        jsonb not null default '[]'::jsonb,  -- message snapshot; outlives the 3-day purge
  status          text not null default 'open' check (status in ('open', 'resolved')),
  resolution      text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null
);
create index if not exists reports_open on public.reports (status, created_at desc);
alter table public.reports enable row level security;

drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports" on public.reports for select to authenticated
  using (public.is_admin(auth.uid()));

-- Words/phrases that auto-flag a text message. Letters, digits, spaces and
-- apostrophes only, matched as whole words, case-insensitive.
create table if not exists public.moderation_terms (
  term       text primary key check (term ~ '^[a-z0-9'' ]+$'),
  category   text not null default 'harassment',
  created_at timestamptz not null default now()
);
alter table public.moderation_terms enable row level security;

drop policy if exists "admins manage terms" on public.moderation_terms;
create policy "admins manage terms" on public.moderation_terms for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.moderation_terms (term, category) values
  ('kys', 'self-harm'),
  ('kill yourself', 'self-harm'),
  ('kill urself', 'self-harm'),
  ('go die', 'harassment'),
  ('nobody likes you', 'harassment'),
  ('send nudes', 'sexual'),
  ('nudes', 'sexual')
on conflict (term) do nothing;

create or replace function public.flag_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  hit public.moderation_terms;
begin
  if new.kind <> 'text' or new.body is null then return new; end if;

  select * into hit from public.moderation_terms t
  where new.body ~* ('\m' || t.term || '\M')
  limit 1;

  if hit.term is not null then
    insert into public.reports (source, target_id, conversation_id, reason, detail, evidence)
    values (
      'auto-text', new.sender_id, new.conversation_id,
      'Auto-flag: ' || hit.category,
      'Matched “' || hit.term || '”',
      jsonb_build_array(jsonb_build_object(
        'id', new.id, 'sender_id', new.sender_id, 'kind', new.kind,
        'body', new.body, 'created_at', new.created_at))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_message_flag on public.messages;
create trigger on_message_flag after insert on public.messages
  for each row execute function public.flag_message();

-- A user reports someone they chat with; the last 20 messages are snapshotted.
create or replace function public.report_user(target uuid, reason text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  conv uuid;
  snap jsonb;
begin
  if target = auth.uid() then raise exception 'cannot report yourself'; end if;
  if not public.can_see_profile(target) then raise exception 'unknown user'; end if;
  if (select count(*) from public.reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many reports, try again later';
  end if;

  select m1.conversation_id into conv
  from public.conversation_members m1
  join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
  join public.conversations co on co.id = m1.conversation_id
  where m1.user_id = auth.uid() and m2.user_id = target and co.is_group = false
  limit 1;

  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) into snap
  from (
    select m.id, m.sender_id, m.kind, m.body, m.image_path, m.created_at
    from public.messages m
    where m.conversation_id = conv
    order by m.created_at desc
    limit 20
  ) x;

  insert into public.reports (source, reporter_id, target_id, conversation_id, reason, detail, evidence)
  values ('user', auth.uid(), target, conv, 'User report: ' || left(reason, 60), left(note, 1000), snap);
end;
$$;

-- Admin actions.
create or replace function public.admin_resolve_report(report uuid, outcome text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admins only'; end if;
  update public.reports
  set status = 'resolved', resolution = left(outcome, 200),
      resolved_at = now(), resolved_by = auth.uid()
  where id = report;
end;
$$;

create or replace function public.admin_set_disabled(target uuid, value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admins only'; end if;
  if target = auth.uid() then raise exception 'cannot disable yourself'; end if;
  update public.profiles set disabled = value where id = target;
end;
$$;

create or replace function public.admin_reset_color(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admins only'; end if;
  update public.profiles set color = null where id = target;
end;
$$;

-- ── 3-day retention ──────────────────────────────────────────────────
-- Messages are already hidden after 72h by the read policy above; this job
-- deletes them for real. Resolved reports are kept 30 days for reference.
create extension if not exists pg_cron;

select cron.schedule(
  'frequency-purge',
  '*/10 * * * *',
  $$
    delete from public.messages where created_at < now() - interval '72 hours';
    delete from public.reports where status = 'resolved' and resolved_at < now() - interval '30 days';
  $$
);

-- ── Realtime: stream connection changes (new requests, accepts) ──────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connections'
  ) then
    alter publication supabase_realtime add table public.connections;
  end if;
end;
$$;
