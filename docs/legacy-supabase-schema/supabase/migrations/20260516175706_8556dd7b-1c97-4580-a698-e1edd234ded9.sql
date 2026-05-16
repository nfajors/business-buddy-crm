-- Task status + priority enums
do $$ begin
  create type public.task_status as enum ('open', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'normal', 'high');
exception when duplicate_object then null; end $$;

-- Extend activity type enum if needed
do $$ begin
  alter type public.activity_type add value if not exists 'task_created';
exception when undefined_object then null; end $$;
do $$ begin
  alter type public.activity_type add value if not exists 'task_completed';
exception when undefined_object then null; end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  assignee_id uuid,
  created_by uuid,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_contact_idx on public.tasks(contact_id);
create index if not exists tasks_assignee_status_due_idx on public.tasks(assignee_id, status, due_at);
create index if not exists tasks_status_due_idx on public.tasks(status, due_at);

alter table public.tasks enable row level security;

drop policy if exists "Authenticated users can view tasks" on public.tasks;
create policy "Authenticated users can view tasks"
  on public.tasks for select to authenticated using (true);

drop policy if exists "Authenticated users can create tasks" on public.tasks;
create policy "Authenticated users can create tasks"
  on public.tasks for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Assignee creator or admin can update tasks" on public.tasks;
create policy "Assignee creator or admin can update tasks"
  on public.tasks for update to authenticated
  using (auth.uid() = assignee_id or auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role))
  with check (auth.uid() = assignee_id or auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Assignee creator or admin can delete tasks" on public.tasks;
create policy "Assignee creator or admin can delete tasks"
  on public.tasks for delete to authenticated
  using (auth.uid() = assignee_id or auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Activity logging
create or replace function public.tasks_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    insert into public.activities (contact_id, actor_id, type, description, metadata)
    values (new.contact_id, new.created_by, 'task_created',
            'Task created: ' || new.title,
            jsonb_build_object('task_id', new.id, 'due_at', new.due_at));
    update public.contacts set last_activity_at = now() where id = new.contact_id;
  end if;
  return new;
end; $$;

create or replace function public.tasks_after_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') and new.contact_id is not null then
    insert into public.activities (contact_id, actor_id, type, description, metadata)
    values (new.contact_id, coalesce(new.completed_by, auth.uid()), 'task_completed',
            'Task completed: ' || new.title,
            jsonb_build_object('task_id', new.id));
    update public.contacts set last_activity_at = now() where id = new.contact_id;
  end if;
  return new;
end; $$;

drop trigger if exists tasks_after_insert_trg on public.tasks;
create trigger tasks_after_insert_trg
  after insert on public.tasks
  for each row execute function public.tasks_after_insert();

drop trigger if exists tasks_after_complete_trg on public.tasks;
create trigger tasks_after_complete_trg
  after update of status on public.tasks
  for each row execute function public.tasks_after_complete();
