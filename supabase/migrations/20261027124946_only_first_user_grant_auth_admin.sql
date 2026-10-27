-- The auth service runs the trigger, so its role needs EXECUTE (it was revoked from everyone before).
grant execute on function public.only_first_user() to supabase_auth_admin;
