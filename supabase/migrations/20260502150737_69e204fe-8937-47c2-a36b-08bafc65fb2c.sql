-- pin search_path on set_updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke direct execution; triggers still run because they execute as the table owner.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.contacts_after_insert() from public, anon, authenticated;
revoke execute on function public.contacts_after_stage_change() from public, anon, authenticated;
revoke execute on function public.notes_after_insert() from public, anon, authenticated;

-- has_role is meant to be callable by signed-in users (used in client-side checks too)
grant execute on function public.has_role(uuid, public.app_role) to authenticated;