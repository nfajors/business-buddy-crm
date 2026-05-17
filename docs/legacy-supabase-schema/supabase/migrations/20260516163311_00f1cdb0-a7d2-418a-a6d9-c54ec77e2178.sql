
-- Restrict signups to the four authorized staff emails and assign roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  allowed_emails text[] := ARRAY[
    'nf@winning.careers',
    'mf@winning.careers',
    'caleb@winning.careers',
    'scott@inspiration-labs.com'
  ];
  admin_emails text[] := ARRAY['nf@winning.careers'];
  email_lower text := lower(new.email);
begin
  if not (email_lower = ANY(allowed_emails)) then
    raise exception 'Signups are restricted to authorized Winning.Careers staff.';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when email_lower = ANY(admin_emails) then 'admin'::public.app_role
         else 'user'::public.app_role end
  );

  return new;
end;
$function$;
