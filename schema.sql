-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- TABLE: documents
create table public.documents (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  prefix text,
  start_number integer not null default 1,
  current_number integer not null default 1,
  yearly_reset boolean default false,
  last_reset_year integer,
  enabled boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLE: users
create table public.users (
  id uuid default uuid_generate_v4() primary key,
  username text not null unique,
  password text not null, -- Storing plain text as per current app implementation (should be hashed in prod)
  name text not null,
  cargo text,
  setor text,
  secretaria text,
  role text not null check (role in ('admin', 'user_full', 'user_restricted', 'user_readonly')),
  allowed_documents jsonb default '[]'::jsonb, -- Array of document IDs
  approved boolean default false, -- Approval status
  email text, -- Contact email
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLE: reservations
create table public.reservations (
  id uuid default uuid_generate_v4() primary key,
  doc_id uuid references public.documents(id),
  doc_name text, -- De-normalized for easier display
  number integer not null,
  formatted_number text not null,
  subject text,
  ementa text,
  user_id uuid references public.users(id),
  user_name text,
  user_cargo text,
  user_setor text,
  user_secretaria text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLE: logs
create table public.logs (
  id uuid default uuid_generate_v4() primary key,
  type text not null,
  action text not null,
  details text,
  user_id uuid references public.users(id),
  user_name text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLE: app_config (Store key-value settings like secretariat permissions)
create table public.app_config (
  key text primary key,
  value jsonb
);

-- Row Level Security (RLS)
-- For this simple migration, we will enable public access to simplify connection
-- In a real production app, we would configure strict policies.
alter table public.documents enable row level security;
alter table public.users enable row level security;
alter table public.reservations enable row level security;
alter table public.logs enable row level security;
alter table public.app_config enable row level security;

-- Policies (Allow ALL for everyone for now - "Public API")
create policy "Enable all access for all users" on public.documents for all using (true) with check (true);
create policy "Enable all access for all users" on public.users for all using (true) with check (true);
create policy "Enable all access for all users" on public.reservations for all using (true) with check (true);
create policy "Enable all access for all users" on public.logs for all using (true) with check (true);
create policy "Enable all access for all users" on public.app_config for all using (true) with check (true);
