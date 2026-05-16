
-- Restrict DELETE on contacts to owner or admin
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON public.contacts;
CREATE POLICY "Owners or admins can delete contacts"
ON public.contacts
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- Revoke execute on trigger-only SECURITY DEFINER functions from public roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notes_after_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.contacts_after_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.contacts_after_stage_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

-- has_role must remain callable by authenticated users (used inside RLS), but revoke from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
