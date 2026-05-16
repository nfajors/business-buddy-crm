-- Block 1: security + data hardening

-- ============================================================
-- Item 2/14: wipe seeded sample contacts (and dependent rows)
-- ============================================================
-- Notes and activities reference contacts; clear them first.
delete from public.notes;
delete from public.activities;
delete from public.contacts;

-- ============================================================
-- Item 3: tighten RLS on contacts + add updated_by audit
-- ============================================================
alter table public.contacts
  add column if not exists updated_by uuid references auth.users(id);

alter table public.notes
  add column if not exists updated_by uuid references auth.users(id);

create or replace function public.set_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_by on public.contacts;
create trigger contacts_set_updated_by
before update on public.contacts
for each row execute function public.set_updated_by();

drop trigger if exists notes_set_updated_by on public.notes;
create trigger notes_set_updated_by
before update on public.notes
for each row execute function public.set_updated_by();

-- Replace permissive contacts UPDATE policy with owner/creator/admin-only
drop policy if exists "Authenticated users can update contacts" on public.contacts;
create policy "Owners creators or admins can update contacts"
on public.contacts
for update
to authenticated
using (
  auth.uid() = owner_id
  or auth.uid() = created_by
  or public.has_role(auth.uid(), 'admin'::public.app_role)
)
with check (
  auth.uid() = owner_id
  or auth.uid() = created_by
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Activities table is intentionally append-only:
-- no UPDATE or DELETE policies, so authenticated users can read and
-- insert (as themselves) but never modify history.

-- ============================================================
-- Item 4: nullable columns, email_status enum, email format check
-- ============================================================

-- Convert empty-string defaults to NULL on optional text columns
alter table public.contacts alter column email           drop default;
alter table public.contacts alter column email           drop not null;
alter table public.contacts alter column work_phone      drop default;
alter table public.contacts alter column work_phone      drop not null;
alter table public.contacts alter column mobile_phone    drop default;
alter table public.contacts alter column mobile_phone    drop not null;
alter table public.contacts alter column linkedin        drop default;
alter table public.contacts alter column linkedin        drop not null;
alter table public.contacts alter column website         drop default;
alter table public.contacts alter column website         drop not null;
alter table public.contacts alter column industry        drop default;
alter table public.contacts alter column industry        drop not null;
alter table public.contacts alter column city            drop default;
alter table public.contacts alter column city            drop not null;
alter table public.contacts alter column state           drop default;
alter table public.contacts alter column state           drop not null;
alter table public.contacts alter column country         drop default;
alter table public.contacts alter column country         drop not null;
alter table public.contacts alter column company_city    drop default;
alter table public.contacts alter column company_city    drop not null;
alter table public.contacts alter column title           drop default;
alter table public.contacts alter column title           drop not null;
alter table public.contacts alter column last_name       drop default;
alter table public.contacts alter column last_name       drop not null;

-- numerics: nullable, no zero default
alter table public.contacts alter column employees       drop default;
alter table public.contacts alter column employees       drop not null;
alter table public.contacts alter column annual_revenue  drop default;
alter table public.contacts alter column annual_revenue  drop not null;

-- email_status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_status') then
    create type public.email_status as enum (
      'unknown','valid','invalid','catchall','accept_all','disposable','role','unverified'
    );
  end if;
end$$;

-- Convert existing email_status column (currently text) to enum
alter table public.contacts alter column email_status drop default;
alter table public.contacts
  alter column email_status type public.email_status
  using (
    case
      when email_status is null or btrim(email_status) = '' then null
      when email_status = any (enum_range(null::public.email_status)::text[]) then email_status::public.email_status
      else 'unknown'::public.email_status
    end
  );
alter table public.contacts alter column email_status drop not null;

-- Email format check (immutable regex, safe as CHECK)
alter table public.contacts drop constraint if exists contacts_email_format_chk;
alter table public.contacts
  add constraint contacts_email_format_chk
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ============================================================
-- Item 2: unique email index (case-insensitive, ignores nulls)
-- ============================================================
create unique index if not exists contacts_email_unique
  on public.contacts (lower(email))
  where email is not null;

-- ============================================================
-- Item 38: ellipsis on truncated note-activity descriptions
-- ============================================================
create or replace function public.notes_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities (contact_id, actor_id, type, description)
  values (
    new.contact_id,
    new.author_id,
    'note',
    case when length(new.content) > 200
         then left(new.content, 200) || '…'
         else new.content end
  );
  update public.contacts set last_activity_at = now() where id = new.contact_id;
  return new;
end;
$$;
