CREATE OR REPLACE FUNCTION public.update_app_user(p_user_id uuid, p_full_name text, p_role text, p_department text DEFAULT NULL::text, p_position text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  target_current_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'Only admins can update users';
  END IF;

  SELECT role INTO target_current_role FROM public.profiles WHERE id = p_user_id;

  -- Only super_admins can assign super_admin or change a super_admin's role
  IF (p_role = 'super_admin' OR target_current_role = 'super_admin') AND caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super admins can assign or change the super admin role';
  END IF;

  UPDATE public.profiles SET
    full_name  = p_full_name,
    role       = p_role,
    department = p_department,
    "position" = p_position,
    phone      = p_phone
  WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_app_user(p_email text, p_password text, p_full_name text, p_role text, p_department text DEFAULT NULL::text, p_position text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  caller_role text;
  new_id uuid := gen_random_uuid();
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'Only admins can create users';
  END IF;

  IF p_role = 'super_admin' AND caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Only super admins can create super admin users';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'A user with email % already exists', p_email;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf'::text)),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id, new_id::text,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', now(), now(), now()
  );

  UPDATE public.profiles SET
    full_name  = p_full_name,
    role       = p_role,
    department = p_department,
    "position" = p_position,
    phone      = p_phone,
    is_active  = true,
    created_by = auth.uid()
  WHERE id = new_id;

  RETURN new_id;
END;
$function$;