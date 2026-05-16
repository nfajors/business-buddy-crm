-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'user');
create type public.pipeline_stage as enum ('new', 'contacted', 'responded', 'meeting', 'closed');
create type public.activity_type as enum ('stage_change', 'note', 'call', 'email', 'meeting', 'created');

-- ============ UTILITY: updated_at trigger ============
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- security definer to avoid RLS recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ AUTO-CREATE PROFILE + FIRST-USER-IS-ADMIN ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select not exists(select 1 from public.user_roles) into is_first;

  insert into public.user_roles (user_id, role)
  values (new.id, case when is_first then 'admin'::public.app_role else 'user'::public.app_role end);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ CONTACTS ============
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  title text not null default '',
  company text not null default '',
  email text not null default '',
  email_status text not null default '',
  work_phone text not null default '',
  mobile_phone text not null default '',
  employees integer not null default 0,
  industry text not null default '',
  linkedin text not null default '',
  website text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default '',
  company_city text not null default '',
  annual_revenue numeric not null default 0,
  pipeline_stage public.pipeline_stage not null default 'new',
  tags text[] not null default '{}',
  owner_id uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_pipeline_stage_idx on public.contacts (pipeline_stage);
create index contacts_company_idx on public.contacts (company);
create index contacts_industry_idx on public.contacts (industry);
create index contacts_state_idx on public.contacts (state);
create index contacts_created_at_idx on public.contacts (created_at desc);

alter table public.contacts enable row level security;

create policy "Authenticated users can view contacts"
  on public.contacts for select to authenticated using (true);

create policy "Authenticated users can insert contacts"
  on public.contacts for insert to authenticated with check (auth.uid() is not null);

create policy "Authenticated users can update contacts"
  on public.contacts for update to authenticated using (true);

create policy "Authenticated users can delete contacts"
  on public.contacts for delete to authenticated using (true);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ============ NOTES ============
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index notes_contact_id_idx on public.notes (contact_id, created_at desc);

alter table public.notes enable row level security;

create policy "Authenticated users can view notes"
  on public.notes for select to authenticated using (true);

create policy "Authenticated users can insert notes"
  on public.notes for insert to authenticated with check (auth.uid() = author_id);

create policy "Authors can update their notes"
  on public.notes for update to authenticated using (auth.uid() = author_id);

create policy "Authors or admins can delete notes"
  on public.notes for delete to authenticated
  using (auth.uid() = author_id or public.has_role(auth.uid(), 'admin'));

-- ============ ACTIVITIES ============
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type public.activity_type not null,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activities_contact_id_idx on public.activities (contact_id, created_at desc);

alter table public.activities enable row level security;

create policy "Authenticated users can view activities"
  on public.activities for select to authenticated using (true);

create policy "Authenticated users can insert activities"
  on public.activities for insert to authenticated with check (auth.uid() = actor_id);

-- ============ ACTIVITY AUTOMATION ============
-- log creation
create or replace function public.contacts_after_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.activities (contact_id, actor_id, type, description)
    values (new.id, new.created_by, 'created', 'Contact created');
  end if;
  return new;
end;
$$;

create trigger contacts_log_create
  after insert on public.contacts
  for each row execute function public.contacts_after_insert();

-- log stage changes
create or replace function public.contacts_after_stage_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    insert into public.activities (contact_id, actor_id, type, description, metadata)
    values (
      new.id,
      auth.uid(),
      'stage_change',
      'Stage changed to ' || new.pipeline_stage::text,
      jsonb_build_object('from', old.pipeline_stage, 'to', new.pipeline_stage)
    );
    new.last_activity_at = now();
  end if;
  return new;
end;
$$;

create trigger contacts_log_stage
  before update on public.contacts
  for each row execute function public.contacts_after_stage_change();

-- log notes
create or replace function public.notes_after_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.activities (contact_id, actor_id, type, description)
  values (new.contact_id, new.author_id, 'note', left(new.content, 200));
  update public.contacts set last_activity_at = now() where id = new.contact_id;
  return new;
end;
$$;

create trigger notes_log
  after insert on public.notes
  for each row execute function public.notes_after_insert();