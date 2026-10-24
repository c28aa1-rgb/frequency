-- Frequency — Stage 1 schema: the directory of signed-in users.
-- Run this in Supabase → SQL Editor. Chat/calls tables come in later stages.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null,        -- locked, from Google
  avatar_url  text,                 -- from Google
  color       text,                 -- user-chosen icon color (own only)
  is_dalton   boolean not null default false,  -- email ends in @dalton.org
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Stage-1 read policy: any signed-in user can read the directory.
-- TODO (connections stage): tighten so externals only see their accepted
-- connections, and Dalton users see the Dalton directory + their connections.
-- Will use a SECURITY DEFINER helper or a JWT claim to avoid recursive RLS.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may update only their own row (e.g. their icon color, last_seen).
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row the first time a user signs in via Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, is_dalton)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    lower(new.email) like '%@dalton.org'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
