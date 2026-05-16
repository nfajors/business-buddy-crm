-- Wipe all user accounts and dependent rows
DELETE FROM public.activities;
DELETE FROM public.notes;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.users;
-- Keep contacts but null out user references so they remain accessible
UPDATE public.contacts SET owner_id = NULL, created_by = NULL;