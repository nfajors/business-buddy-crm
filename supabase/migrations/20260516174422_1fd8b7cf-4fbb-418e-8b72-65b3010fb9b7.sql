-- Revoke direct EXECUTE on SECURITY DEFINER trigger helpers.
-- They are only ever invoked from triggers (which run as the table owner),
-- so callers do not need direct execute rights.
revoke execute on function public.set_updated_by()        from public, anon, authenticated;
revoke execute on function public.set_updated_at()        from public, anon, authenticated;
revoke execute on function public.notes_after_insert()    from public, anon, authenticated;
revoke execute on function public.contacts_after_insert() from public, anon, authenticated;
revoke execute on function public.contacts_after_stage_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
