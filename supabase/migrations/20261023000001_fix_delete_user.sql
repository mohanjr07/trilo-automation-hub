-- ─────────────────────────────────────────────────────────────────────────────
-- MAPL Task Flow (Magic Aisles) — make "Delete User" work.
-- Run ONLY in the MAPL Supabase project (dxlpwnmoohkddkkqoxzt). Never in Trilo.
--
-- Deleting a user failed silently because rows in other tables (tasks, payments,
-- forms, comments …) still point at that person. This replaces delete_app_user_by_id:
--   • links that may be empty (approved by, verified by, reviewed by …) are cleared,
--     so the record stays and just shows no name;
--   • rows that belong to the person and can't exist without them (their notifications,
--     their own tasks, comments, leave, KRA …) are deleted, including rows hanging off those;
--   • then the profile and the login are removed.
-- Only admins can do it, and nobody can delete themselves.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.projects WHERE name = 'Coldstar_PUNE - G+2 Spiral Chute') THEN
      RAISE EXCEPTION 'This is the Trilo database — run this in the MAPL (Magic Aisles) project';
    END IF;
  END IF;
END $$;

-- Delete rows of p_table whose p_col is in p_vals; anything still pointing at those rows
-- is cleared (nullable column) or deleted the same way (required column).
CREATE OR REPLACE FUNCTION public._force_delete(p_table regclass, p_col text, p_vals text[], p_depth int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k record; v_keys text[]; v_null boolean; v_tries int := 0; v_con text;
BEGIN
  IF p_vals IS NULL OR cardinality(p_vals) = 0 THEN RETURN; END IF;
  IF p_depth > 8 THEN RAISE EXCEPTION 'Too many linked records under %', p_table; END IF;

  -- first deal with every single-column foreign key that points at p_table
  FOR k IN
    SELECT c.conrelid::regclass AS ref_table, a.attname AS ref_col, fa.attname AS key_col, a.attnotnull AS not_null, c.confdeltype
      FROM pg_constraint c
      JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
      JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND c.confrelid = p_table AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('SELECT array_agg(%I::text) FROM %s WHERE %I::text = ANY($1)', k.key_col, p_table, p_col) INTO v_keys USING p_vals;
    CONTINUE WHEN v_keys IS NULL;
    IF k.confdeltype IN ('c') THEN
      -- ON DELETE CASCADE: the database deletes these, but clear what hangs off them first
      PERFORM public._force_delete(k.ref_table, k.ref_col, v_keys, p_depth + 1);
    ELSIF k.confdeltype IN ('n', 'd') THEN
      CONTINUE;                                   -- SET NULL / SET DEFAULT: handled by the database
    ELSIF k.ref_table = p_table THEN
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I::text = ANY($1)', k.ref_table, k.ref_col, k.ref_col) USING v_keys;
    ELSIF NOT k.not_null THEN
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I::text = ANY($1)', k.ref_table, k.ref_col, k.ref_col) USING v_keys;
    ELSE
      PERFORM public._force_delete(k.ref_table, k.ref_col, v_keys, p_depth + 1);
    END IF;
  END LOOP;

  EXECUTE format('DELETE FROM %s WHERE %I::text = ANY($1)', p_table, p_col) USING p_vals;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._force_delete(regclass, text, text[], int) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.delete_app_user_by_id(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  PERFORM public._force_delete('public.profiles'::regclass, 'id', ARRAY[p_user_id::text]);
  PERFORM public._force_delete('auth.users'::regclass, 'id', ARRAY[p_user_id::text]);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_app_user_by_id(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_app_user_by_id(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
