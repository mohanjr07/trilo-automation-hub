-- ═══════════════════════════════════════════════════════════════════════════
--  MAPL Task Flow — features brought over from Trilo TaskFlow (Oct 2026)
--  Part 1: basics, Workflow people, Forms & Formats + approvals, Overtime, live updates
--  Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Small column additions used by the new pages ─────────────────────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;              -- Completed Tasks page
ALTER TABLE public.organisation_flow_nodes
  ADD COLUMN IF NOT EXISTS extra_parent_ids uuid[] NOT NULL DEFAULT '{}';                -- Org flow: extra connector lines
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;                  -- Birthdays / People
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS joined_at date;                      -- People
ALTER TABLE public.assets   ADD COLUMN IF NOT EXISTS asset_category text NOT NULL DEFAULT 'IT';  -- Assets: IT / Machines / …

-- Task creators can always read the tasks they created (managers see tasks they gave to anyone)
DROP POLICY IF EXISTS "Creators can read their tasks" ON public.tasks;
CREATE POLICY "Creators can read their tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assigned_by = auth.uid());

-- Notes: drawings / images stored in a private bucket, each person in their own folder (<user id>/...)
INSERT INTO storage.buckets (id, name, public) VALUES ('note-images', 'note-images', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS note_images_own_read ON storage.objects;
CREATE POLICY note_images_own_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'note-images' AND split_part(name, '/', 1) = auth.uid()::text);
DROP POLICY IF EXISTS note_images_own_insert ON storage.objects;
CREATE POLICY note_images_own_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-images' AND split_part(name, '/', 1) = auth.uid()::text);
DROP POLICY IF EXISTS note_images_own_update ON storage.objects;
CREATE POLICY note_images_own_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'note-images' AND split_part(name, '/', 1) = auth.uid()::text);
DROP POLICY IF EXISTS note_images_own_delete ON storage.objects;
CREATE POLICY note_images_own_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'note-images' AND split_part(name, '/', 1) = auth.uid()::text);

-- Notification types used by forms / payments / overtime (keeps every type already in use)
DO $$
DECLARE v_types text; c record;
BEGIN
  -- keep: types already used + types the current check allows (e.g. 'sales') + the new ones
  SELECT string_agg(DISTINCT quote_literal(t), ',') INTO v_types
  FROM (SELECT type AS t FROM public.notifications WHERE type IS NOT NULL
        UNION SELECT (regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g'))[1]
                FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass AND contype = 'c'
                 AND pg_get_constraintdef(oid) ~* '\mtype\M'
        UNION SELECT unnest(ARRAY['task','leave','system','payment','sales','form','overtime'])) x;
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.notifications'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ~* '\mtype\M' LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (' || v_types || '))';
END $$;

-- ── 1. Workflow people (Settings → Workflow people) ─────────────────────────
--  form_approver : approves forms first          authorizer  : final sign-off (requester picks)
--  qc_approver   : Quality Check / Design forms  accounts    : asset/expense/vendor forms, pays, gets approved OT
--  ot_approver   : approves overtime
CREATE TABLE IF NOT EXISTS public.workflow_people (
  role_key   text NOT NULL CHECK (role_key IN ('form_approver','accounts','qc_approver','authorizer','ot_approver')),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, user_id)
);
ALTER TABLE public.workflow_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wfp_read ON public.workflow_people;
CREATE POLICY wfp_read ON public.workflow_people FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wfp_admin_insert ON public.workflow_people;
CREATE POLICY wfp_admin_insert ON public.workflow_people FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
DROP POLICY IF EXISTS wfp_admin_delete ON public.workflow_people;
CREATE POLICY wfp_admin_delete ON public.workflow_people FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));
GRANT SELECT, INSERT, DELETE ON public.workflow_people TO authenticated;
GRANT ALL ON public.workflow_people TO service_role;

-- first active person in a role (NULL when nobody is set)
CREATE OR REPLACE FUNCTION public.wf_first(p_role text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.user_id FROM workflow_people w JOIN profiles p ON p.id = w.user_id
   WHERE w.role_key = p_role AND coalesce(p.is_active, true)
   ORDER BY w.created_at LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.wf_has(p_role text, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM workflow_people WHERE role_key = p_role AND user_id = p_user)
$$;
CREATE OR REPLACE FUNCTION public.wf_label(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role WHEN 'form_approver' THEN 'Form approver' WHEN 'accounts' THEN 'Accounts'
                     WHEN 'qc_approver' THEN 'Quality check approver' WHEN 'authorizer' THEN 'Form authorizer'
                     WHEN 'ot_approver' THEN 'Overtime approver' ELSE p_role END
$$;
GRANT EXECUTE ON FUNCTION public.wf_first(text), public.wf_has(text, uuid), public.wf_label(text) TO authenticated;

-- ── 2. Forms and Formats (Word / Excel templates with running reference numbers) ──
CREATE TABLE IF NOT EXISTS public.production_forms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  description        text,
  file_type          text NOT NULL CHECK (file_type IN ('word','excel')),
  storage_path       text NOT NULL,
  original_filename  text NOT NULL,
  field_locator      jsonb,
  ref_number_enabled boolean NOT NULL DEFAULT false,
  ref_prefix         text NOT NULL DEFAULT '',
  ref_padding        integer NOT NULL DEFAULT 3,
  current_number     integer NOT NULL DEFAULT 0,
  created_by         uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pf_read ON public.production_forms;
CREATE POLICY pf_read ON public.production_forms FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pf_admin_insert ON public.production_forms;
CREATE POLICY pf_admin_insert ON public.production_forms FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS pf_admin_update ON public.production_forms;
CREATE POLICY pf_admin_update ON public.production_forms FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS pf_admin_delete ON public.production_forms;
CREATE POLICY pf_admin_delete ON public.production_forms FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_forms TO authenticated;
GRANT ALL ON public.production_forms TO service_role;

-- every reference number issued ("Use This" or a digital request)
CREATE TABLE IF NOT EXISTS public.production_form_opens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid NOT NULL REFERENCES public.production_forms(id) ON DELETE CASCADE,
  opened_by       uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference_value text NOT NULL DEFAULT '',
  opened_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_form_opens_form_idx ON public.production_form_opens (form_id, opened_at DESC);
ALTER TABLE public.production_form_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pfo_read ON public.production_form_opens;
CREATE POLICY pfo_read ON public.production_form_opens FOR SELECT TO authenticated
  USING (opened_by = auth.uid() OR public.is_admin(auth.uid()));
GRANT SELECT ON public.production_form_opens TO authenticated;
GRANT ALL ON public.production_form_opens TO service_role;

-- "Use This": reserve the next reference number and return what's needed to fill the template
CREATE OR REPLACE FUNCTION public.open_production_form(p_form_id uuid)
RETURNS TABLE(title text, file_type text, storage_path text, field_locator jsonb, ref_prefix text,
              ref_padding integer, current_number integer, reference_value text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE f production_forms%ROWTYPE; v_ref text := '';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO f FROM production_forms WHERE id = p_form_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form not found'; END IF;
  IF f.ref_number_enabled THEN
    UPDATE production_forms SET current_number = current_number + 1, updated_at = now()
     WHERE id = p_form_id RETURNING * INTO f;
    v_ref := f.ref_prefix || lpad(f.current_number::text, f.ref_padding, '0');
    INSERT INTO production_form_opens (form_id, opened_by, reference_value) VALUES (p_form_id, auth.uid(), v_ref);
  END IF;
  RETURN QUERY SELECT f.title, f.file_type, f.storage_path, f.field_locator, f.ref_prefix,
                      f.ref_padding, f.current_number, v_ref;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_production_form(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.open_production_form(uuid) TO authenticated;

-- Storage: templates (everyone reads, admins upload/delete), filled copies, request attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('production-forms', 'production-forms', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('form-copies', 'form-copies', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('form-attachments', 'form-attachments', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS production_forms_read ON storage.objects;
CREATE POLICY production_forms_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'production-forms');
DROP POLICY IF EXISTS production_forms_admin_insert ON storage.objects;
CREATE POLICY production_forms_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'production-forms' AND public.is_admin(auth.uid()));
DROP POLICY IF EXISTS production_forms_admin_update ON storage.objects;
CREATE POLICY production_forms_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'production-forms' AND public.is_admin(auth.uid()));
DROP POLICY IF EXISTS production_forms_admin_delete ON storage.objects;
CREATE POLICY production_forms_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'production-forms' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "form_copies_rw" ON storage.objects;
CREATE POLICY "form_copies_rw" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'form-copies') WITH CHECK (bucket_id = 'form-copies');

-- ── 3. Digital forms with approval ──────────────────────────────────────────
--  requester → Form approver (or QC approver / Accounts by form) → chosen authorizer.
--  Managers' forms skip the approval step. Vendor Registration goes only to Accounts.
CREATE TABLE IF NOT EXISTS public.form_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          uuid NOT NULL REFERENCES public.production_forms(id) ON DELETE CASCADE,
  form_title       text NOT NULL,
  reference_value  text,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by     uuid NOT NULL REFERENCES public.profiles(id),
  approver_id      uuid REFERENCES public.profiles(id),
  authorizer_id    uuid NOT NULL REFERENCES public.profiles(id),
  status           text NOT NULL DEFAULT 'pending_approval'
                   CHECK (status IN ('pending_approval','pending_authorization','authorized','rejected')),
  revision         integer NOT NULL DEFAULT 0,
  approved_at      timestamptz,
  authorized_at    timestamptz,
  rejected_by      uuid REFERENCES public.profiles(id),
  rejected_at      timestamptz,
  reject_reason    text,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_requests_requested_by_idx ON public.form_requests (requested_by);
CREATE INDEX IF NOT EXISTS form_requests_approver_idx     ON public.form_requests (approver_id, status);
CREATE INDEX IF NOT EXISTS form_requests_authorizer_idx   ON public.form_requests (authorizer_id, status);
ALTER TABLE public.form_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_requests_read ON public.form_requests;
CREATE POLICY form_requests_read ON public.form_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR approver_id = auth.uid() OR authorizer_id = auth.uid() OR public.is_admin(auth.uid()));
-- no direct insert/update/delete — everything goes through the functions below
GRANT SELECT ON public.form_requests TO authenticated;
GRANT ALL ON public.form_requests TO service_role;

-- attachments: upload into your own folder; read if you can see the request
DROP POLICY IF EXISTS form_attachments_insert ON storage.objects;
CREATE POLICY form_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'form-attachments' AND split_part(name, '/', 1) = auth.uid()::text);
DROP POLICY IF EXISTS form_attachments_read ON storage.objects;
CREATE POLICY form_attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'form-attachments'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.form_requests fr
        WHERE fr.data->'attachments' @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
          AND (fr.requested_by = auth.uid() OR fr.approver_id = auth.uid() OR fr.authorizer_id = auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS form_attachments_delete ON storage.objects;
CREATE POLICY form_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'form-attachments' AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_admin(auth.uid())));

CREATE OR REPLACE FUNCTION public._form_notify(p_user uuid, p_title text, p_body text, p_req uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, title, body, type, reference_id)
  SELECT p_user, p_title, p_body, 'form', p_req WHERE p_user IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public._form_notify(uuid, text, text, uuid) FROM anon, authenticated, public;

-- which role approves a form, by its title (keep in sync with approverRoleFor in src/lib/formSchemas.ts)
CREATE OR REPLACE FUNCTION public._form_approver_role(p_title text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_title ~* '(asset|expense)' THEN 'accounts'
              WHEN p_title ~* '(quality\s*check|design\s*validation)' THEN 'qc_approver'
              ELSE 'form_approver' END
$$;
-- may this person be picked in the "Approved by" dropdown (Quality Check / Design Validation)?
CREATE OR REPLACE FUNCTION public._form_approver_allowed(p_title text, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._form_approver_role(p_title) = 'qc_approver' AND public.wf_has('qc_approver', p_user)
$$;
REVOKE EXECUTE ON FUNCTION public._form_approver_allowed(text, uuid) FROM anon, public;

DROP FUNCTION IF EXISTS public.submit_form_request(uuid, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.submit_form_request(p_form_id uuid, p_data jsonb, p_authorizer uuid, p_approver uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_form public.production_forms%ROWTYPE; v_approver uuid; v_role text; v_ref text; v_id uuid; v_name text;
  v_direct boolean; v_auth uuid; v_mgr boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_form FROM public.production_forms WHERE id = p_form_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form not found'; END IF;

  v_direct := v_form.title ~* 'vendor\s*registration';
  -- managers skip the "Approved by" step: straight to the chosen authorizer
  v_mgr := EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager');
  v_auth := p_authorizer;
  IF v_direct THEN
    v_auth := public.wf_first('accounts');
    IF v_auth IS NULL THEN RAISE EXCEPTION 'No Accounts person set — ask an admin (Settings → Workflow people)'; END IF;
  ELSE
    IF NOT v_mgr THEN
      IF p_approver IS NOT NULL THEN
        IF NOT public._form_approver_allowed(v_form.title, p_approver) THEN
          RAISE EXCEPTION 'That person cannot approve this form';
        END IF;
        v_approver := p_approver;
      ELSE
        v_role := public._form_approver_role(v_form.title);
        v_approver := public.wf_first(v_role);
        IF v_approver IS NULL THEN
          RAISE EXCEPTION 'No % set — ask an admin (Settings → Workflow people)', public.wf_label(v_role);
        END IF;
      END IF;
    END IF;
    IF v_auth IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_auth) THEN
      RAISE EXCEPTION 'Pick who authorizes this form';
    END IF;
  END IF;

  IF v_form.ref_number_enabled THEN
    UPDATE public.production_forms SET current_number = current_number + 1, updated_at = now()
     WHERE id = p_form_id RETURNING ref_prefix || lpad(current_number::text, ref_padding, '0') INTO v_ref;
    INSERT INTO public.production_form_opens (form_id, opened_by, reference_value) VALUES (p_form_id, auth.uid(), v_ref);
  END IF;

  INSERT INTO public.form_requests (form_id, form_title, reference_value, data, requested_by, approver_id, authorizer_id, status)
  VALUES (p_form_id, v_form.title, v_ref, coalesce(p_data, '{}'::jsonb), auth.uid(), v_approver, v_auth,
          CASE WHEN v_direct OR v_mgr THEN 'pending_authorization' ELSE 'pending_approval' END)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public._form_notify(CASE WHEN v_direct OR v_mgr THEN v_auth ELSE v_approver END,
    CASE WHEN v_mgr AND NOT v_direct THEN 'Form waiting for your authorization' ELSE 'Form waiting for your approval' END,
    coalesce(v_name, 'Someone') || ' submitted ' || v_form.title || coalesce(' (' || v_ref || ')', ''), v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_form_request(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.form_requests%ROWTYPE; v_me text; v_lbl text;
BEGIN
  SELECT * INTO r FROM public.form_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  v_lbl := r.form_title || coalesce(' (' || r.reference_value || ')', '');
  SELECT full_name INTO v_me FROM public.profiles WHERE id = auth.uid();

  IF r.status = 'pending_approval' AND r.approver_id = auth.uid() THEN
    IF p_approve THEN
      UPDATE public.form_requests SET status = 'pending_authorization', approved_at = now(), updated_at = now() WHERE id = p_id;
      PERFORM public._form_notify(r.authorizer_id, 'Form waiting for your authorization',
        v_lbl || ' — approved by ' || coalesce(v_me, 'approver'), p_id);
      PERFORM public._form_notify(r.requested_by, 'Form approved by ' || coalesce(v_me, 'approver'),
        v_lbl || ' — now waiting for authorization', p_id);
    END IF;
  ELSIF r.status = 'pending_authorization' AND r.authorizer_id = auth.uid() THEN
    IF p_approve THEN
      UPDATE public.form_requests SET status = 'authorized', authorized_at = now(), updated_at = now() WHERE id = p_id;
      PERFORM public._form_notify(r.requested_by, 'Form authorized ✓', v_lbl || ' — authorized by ' || coalesce(v_me, 'authorizer'), p_id);
      PERFORM public._form_notify(r.approver_id, 'Form authorized ✓', v_lbl || ' — authorized by ' || coalesce(v_me, 'authorizer'), p_id);
    END IF;
  ELSE
    RAISE EXCEPTION 'This request is not waiting for your decision';
  END IF;

  IF NOT p_approve THEN
    IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Please give a reason for rejecting'; END IF;
    UPDATE public.form_requests
       SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), reject_reason = trim(p_reason), updated_at = now()
     WHERE id = p_id;
    PERFORM public._form_notify(r.requested_by, 'Form rejected', v_lbl || ' — ' || coalesce(v_me, '') || ': ' || trim(p_reason), p_id);
  END IF;
END;
$$;

-- Edit (any time before it is authorized): new revision number, approvals start again
DROP FUNCTION IF EXISTS public.resubmit_form_request(uuid, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.resubmit_form_request(p_id uuid, p_data jsonb, p_authorizer uuid, p_approver uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.form_requests%ROWTYPE; v_name text; v_auth uuid; v_appr uuid; v_rev integer; v_lbl text; v_role text;
BEGIN
  SELECT * INTO r FROM public.form_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.requested_by <> auth.uid() THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status = 'authorized' THEN RAISE EXCEPTION 'This form is already authorized and can no longer be edited'; END IF;

  IF r.form_title ~* 'vendor\s*registration' THEN
    v_auth := coalesce(public.wf_first('accounts'), r.authorizer_id);
    v_appr := NULL;
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager') THEN
    v_auth := coalesce(p_authorizer, r.authorizer_id);
    v_appr := NULL;                        -- managers: straight to authorization
  ELSE
    v_auth := coalesce(p_authorizer, r.authorizer_id);
    v_appr := r.approver_id;
    IF p_approver IS NOT NULL AND p_approver IS DISTINCT FROM r.approver_id THEN
      IF NOT public._form_approver_allowed(r.form_title, p_approver) THEN
        RAISE EXCEPTION 'That person cannot approve this form';
      END IF;
      v_appr := p_approver;
    END IF;
    IF v_appr IS NULL THEN
      v_role := public._form_approver_role(r.form_title);
      v_appr := public.wf_first(v_role);
      IF v_appr IS NULL THEN RAISE EXCEPTION 'No % set — ask an admin (Settings → Workflow people)', public.wf_label(v_role); END IF;
    END IF;
  END IF;
  v_rev := coalesce(r.revision, 0) + 1;

  UPDATE public.form_requests
     SET data = coalesce(p_data, data), authorizer_id = v_auth, approver_id = v_appr, revision = v_rev,
         status = CASE WHEN v_appr IS NULL THEN 'pending_authorization' ELSE 'pending_approval' END,
         approved_at = NULL, authorized_at = NULL, rejected_by = NULL, rejected_at = NULL, reject_reason = NULL,
         submitted_at = now(), updated_at = now()
   WHERE id = p_id;

  v_lbl := r.form_title || coalesce(' (' || r.reference_value || ')', '') || ' — Rev ' || lpad(v_rev::text, 2, '0');
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public._form_notify(coalesce(v_appr, v_auth),
    CASE WHEN v_appr IS NULL AND r.form_title !~* 'vendor\s*registration' THEN 'Revised form waiting for your authorization'
         ELSE 'Revised form waiting for your approval' END,
    coalesce(v_name, 'Someone') || ' edited ' || v_lbl, p_id);
  IF v_auth IS DISTINCT FROM v_appr AND r.status IN ('pending_authorization','rejected') AND v_appr IS NOT NULL THEN
    PERFORM public._form_notify(v_auth, 'Form revised — will come back for authorization',
      v_lbl || ' was edited and has gone back for approval first.', p_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_form_request(uuid, jsonb, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decide_form_request(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.resubmit_form_request(uuid, jsonb, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_form_request(uuid, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_form_request(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_form_request(uuid, jsonb, uuid, uuid) TO authenticated;

-- Reference-number pickers: every running number issued, newest first
CREATE OR REPLACE FUNCTION public.form_refs()
RETURNS TABLE(reference_value text, form_title text, project text, issued_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.reference_value, f.title,
         (SELECT coalesce(fr.data->'fields'->>'project', fr.data->'fields'->>'project_name', fr.data->'fields'->>'project_title')
            FROM public.form_requests fr
           WHERE fr.form_id = f.id AND fr.reference_value = o.reference_value LIMIT 1) AS project,
         o.opened_at
  FROM public.production_form_opens o
  JOIN public.production_forms f ON f.id = o.form_id
  WHERE coalesce(o.reference_value, '') <> ''
  ORDER BY o.opened_at DESC
  LIMIT 1000;
$$;
REVOKE EXECUTE ON FUNCTION public.form_refs() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.form_refs() TO authenticated;

-- Deleting the latest form / log entry gives its running number back
CREATE OR REPLACE FUNCTION public._ref_num(p_ref text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(substring(coalesce(p_ref, '') FROM '(\d+)\D*$'), '')::integer
$$;
CREATE OR REPLACE FUNCTION public._renumber_after_log_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur integer; v_del integer;
BEGIN
  SELECT current_number INTO v_cur FROM production_forms WHERE id = OLD.form_id FOR UPDATE;
  IF NOT FOUND THEN RETURN OLD; END IF;
  v_del := public._ref_num(OLD.reference_value);
  IF v_del IS NULL OR v_del <> v_cur THEN RETURN OLD; END IF;   -- not the latest number → leave a gap
  UPDATE production_forms SET current_number = greatest(v_cur - 1, 0), updated_at = now() WHERE id = OLD.form_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_renumber_after_log_delete ON public.production_form_opens;
CREATE TRIGGER trg_renumber_after_log_delete AFTER DELETE ON public.production_form_opens
  FOR EACH ROW EXECUTE FUNCTION public._renumber_after_log_delete();

CREATE OR REPLACE FUNCTION public.delete_form_request(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r form_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM form_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form not found'; END IF;
  IF NOT (public.is_admin(auth.uid()) OR (r.requested_by = auth.uid() AND r.status <> 'authorized')) THEN
    RAISE EXCEPTION 'You cannot delete this form';
  END IF;
  DELETE FROM notifications WHERE type = 'form' AND reference_id = p_id;
  DELETE FROM form_requests WHERE id = p_id;
  IF r.reference_value IS NOT NULL THEN
    DELETE FROM production_form_opens WHERE form_id = r.form_id AND reference_value = r.reference_value;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.delete_form_log(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o production_form_opens%ROWTYPE;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can delete log entries'; END IF;
  SELECT * INTO o FROM production_form_opens WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  DELETE FROM notifications WHERE type = 'form' AND reference_id IN
    (SELECT id FROM form_requests WHERE form_id = o.form_id AND reference_value = o.reference_value);
  DELETE FROM form_requests WHERE form_id = o.form_id AND reference_value = o.reference_value;
  DELETE FROM production_form_opens WHERE id = p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_form_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_form_log(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_form_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_form_log(uuid) TO authenticated;

-- ── 4. Overtime ─────────────────────────────────────────────────────────────
--  Admins keep the OT members list; managers/admins enter overtime (Full day = 9 h, or start–end);
--  the Overtime approver approves entries by others; approved entries go to Accounts.
CREATE OR REPLACE FUNCTION public.can_see_overtime(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role IN ('admin','super_admin','manager'))
      OR public.wf_has('accounts', uid) OR public.wf_has('ot_approver', uid)
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_overtime(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_see_overtime(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.overtime_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date      date NOT NULL DEFAULT current_date,
  employee_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  half           text NOT NULL,
  start_time     time,
  end_time       time,
  duration_hours numeric(4,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 24),
  note           text,
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  verified_by    uuid REFERENCES public.profiles(id),
  verified_at    timestamptz
);
ALTER TABLE public.overtime_entries DROP CONSTRAINT IF EXISTS overtime_entries_half_check;
ALTER TABLE public.overtime_entries ADD CONSTRAINT overtime_entries_half_check CHECK (half IN ('full','other','first','second'));
CREATE INDEX IF NOT EXISTS overtime_entries_date_idx ON public.overtime_entries (work_date DESC);
ALTER TABLE public.overtime_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ot_read ON public.overtime_entries;
CREATE POLICY ot_read ON public.overtime_entries FOR SELECT TO authenticated USING (public.can_see_overtime(auth.uid()));
DROP POLICY IF EXISTS ot_admin_delete ON public.overtime_entries;
CREATE POLICY ot_admin_delete ON public.overtime_entries FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
GRANT SELECT, DELETE ON public.overtime_entries TO authenticated;
GRANT ALL ON public.overtime_entries TO service_role;

CREATE TABLE IF NOT EXISTS public.overtime_members (
  employee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  added_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overtime_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS otm_read ON public.overtime_members;
CREATE POLICY otm_read ON public.overtime_members FOR SELECT TO authenticated USING (public.can_see_overtime(auth.uid()));
DROP POLICY IF EXISTS otm_admin_insert ON public.overtime_members;
CREATE POLICY otm_admin_insert ON public.overtime_members FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS otm_admin_delete ON public.overtime_members;
CREATE POLICY otm_admin_delete ON public.overtime_members FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.overtime_members TO authenticated;
GRANT ALL ON public.overtime_members TO service_role;

CREATE OR REPLACE FUNCTION public.add_overtime_entries(p_date date, p_entries jsonb, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e jsonb; v_emp uuid; v_half text; v_start time; v_end time; v_mins integer;
  v_me text; v_acc uuid; v_appr uuid; v_is_appr boolean; v_lines text := ''; v_count integer := 0; v_name text; v_when text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','manager')) THEN
    RAISE EXCEPTION 'Only managers and admins can enter overtime';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'Select at least one name';
  END IF;
  v_appr := public.wf_first('ot_approver');
  v_is_appr := v_appr IS NULL OR v_appr = auth.uid();      -- no approver set → straight to Accounts

  FOR e IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_emp  := (e->>'employee_id')::uuid;
    v_half := e->>'half';
    IF NOT EXISTS (SELECT 1 FROM overtime_members m WHERE m.employee_id = v_emp) THEN
      RAISE EXCEPTION 'Only people on the OT members list can be selected';
    END IF;
    IF v_half = 'full' THEN
      v_start := NULL; v_end := NULL; v_mins := 540;   -- full day = 9 hours
      v_when := 'Full day';
    ELSIF v_half IN ('other','first','second') THEN
      v_start := nullif(e->>'start_time', '')::time;
      v_end   := nullif(e->>'end_time', '')::time;
      IF v_start IS NULL OR v_end IS NULL THEN RAISE EXCEPTION 'Enter the start and end time'; END IF;
      v_mins := (extract(epoch FROM (v_end - v_start)) / 60)::int;
      IF v_mins <= 0 THEN v_mins := v_mins + 1440; END IF;
      IF v_mins > 960 THEN RAISE EXCEPTION 'Overtime of more than 16 hours — please check the times'; END IF;
      v_when := to_char(v_start, 'HH12:MI AM') || ' to ' || to_char(v_end, 'HH12:MI AM');
    ELSE
      RAISE EXCEPTION 'Choose Full day or Other time';
    END IF;

    INSERT INTO overtime_entries (work_date, employee_id, half, start_time, end_time, duration_hours, note,
                                  created_by, verified_by, verified_at)
    VALUES (coalesce(p_date, current_date), v_emp, v_half, v_start, v_end, round(v_mins / 60.0, 2),
            nullif(trim(p_note), ''), auth.uid(),
            CASE WHEN v_is_appr THEN auth.uid() END, CASE WHEN v_is_appr THEN now() END);

    SELECT full_name INTO v_name FROM profiles WHERE id = v_emp;
    v_lines := v_lines || E'\n• ' || coalesce(v_name, '?') || ' — ' || v_when || ' (' ||
               (v_mins / 60) || 'h ' || lpad((v_mins % 60)::text, 2, '0') || 'm)';
    v_count := v_count + 1;
  END LOOP;

  SELECT full_name INTO v_me FROM profiles WHERE id = auth.uid();
  IF v_is_appr THEN
    v_acc := public.wf_first('accounts');
    IF v_acc IS NOT NULL AND v_acc <> auth.uid() THEN
      INSERT INTO notifications (user_id, title, body, type)
      VALUES (v_acc, 'Overtime entered — ' || to_char(coalesce(p_date, current_date), 'DD Mon YYYY'),
        coalesce(v_me, 'A manager') || ' entered overtime for ' || v_count || ' ' ||
          CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END ||
          coalesce(' (' || nullif(trim(p_note), '') || ')', '') || ':' || v_lines, 'overtime');
    END IF;
  ELSE
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (v_appr, 'Overtime waiting for your approval — ' || to_char(coalesce(p_date, current_date), 'DD Mon YYYY'),
      coalesce(v_me, 'A manager') || ' entered overtime for ' || v_count || ' ' ||
        CASE WHEN v_count = 1 THEN 'person' ELSE 'people' END ||
        coalesce(' (' || nullif(trim(p_note), '') || ')', '') || ':' || v_lines, 'overtime');
  END IF;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_overtime_entries(date, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_overtime_entries(date, jsonb, text) TO authenticated;

-- Overtime approver approves → Accounts gets one message listing the approved entries
CREATE OR REPLACE FUNCTION public.verify_overtime(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me text; v_acc uuid; v_lines text; v_count integer;
BEGIN
  IF NOT public.wf_has('ot_approver', auth.uid()) THEN
    RAISE EXCEPTION 'Only the Overtime approver can approve overtime';
  END IF;
  WITH upd AS (
    UPDATE overtime_entries SET verified_by = auth.uid(), verified_at = now()
     WHERE id = ANY(p_ids) AND verified_at IS NULL
    RETURNING employee_id, work_date, half, start_time, end_time, duration_hours
  )
  SELECT count(*),
         string_agg('• ' || coalesce(p.full_name, '?') || ' — ' || to_char(u.work_date, 'DD Mon') || ', ' ||
                    CASE WHEN u.half = 'full' THEN 'Full day'
                         WHEN u.start_time IS NOT NULL THEN to_char(u.start_time, 'HH12:MI AM') || ' to ' || to_char(u.end_time, 'HH12:MI AM')
                         ELSE initcap(u.half) || ' half' END || ' (' ||
                    trim(trailing '.' FROM trim(trailing '0' FROM u.duration_hours::text)) || ' h)',
                    E'\n' ORDER BY u.work_date, p.full_name)
    INTO v_count, v_lines
    FROM upd u LEFT JOIN profiles p ON p.id = u.employee_id;
  IF v_count = 0 THEN RETURN 0; END IF;
  SELECT full_name INTO v_me FROM profiles WHERE id = auth.uid();
  v_acc := public.wf_first('accounts');
  IF v_acc IS NOT NULL AND v_acc <> auth.uid() THEN
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (v_acc, 'Overtime approved by ' || coalesce(v_me, 'the approver') || ' (' || v_count || ' ' ||
                   CASE WHEN v_count = 1 THEN 'entry' ELSE 'entries' END || ')', v_lines, 'overtime');
  END IF;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_overtime(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.verify_overtime(uuid[]) TO authenticated;
-- ── Documents (admins share files with each person) and KRA & KPI ──────────
--    These pages were in the app but their tables were missing in the MAPL database.
CREATE OR REPLACE FUNCTION public._is_strict_admin(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role IN ('admin','super_admin'))
$$;
GRANT EXECUTE ON FUNCTION public._is_strict_admin(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text,
  file_path   text NOT NULL,
  file_size   bigint,
  mime_type   text,
  uploaded_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS udoc_read ON public.user_documents;
CREATE POLICY udoc_read ON public.user_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public._is_strict_admin(auth.uid()));
DROP POLICY IF EXISTS udoc_admin_insert ON public.user_documents;
CREATE POLICY udoc_admin_insert ON public.user_documents FOR INSERT TO authenticated WITH CHECK (public._is_strict_admin(auth.uid()));
DROP POLICY IF EXISTS udoc_admin_delete ON public.user_documents;
CREATE POLICY udoc_admin_delete ON public.user_documents FOR DELETE TO authenticated USING (public._is_strict_admin(auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.user_documents TO authenticated;
GRANT ALL ON public.user_documents TO service_role;

INSERT INTO storage.buckets (id, name, public) VALUES ('user-documents', 'user-documents', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS user_documents_read ON storage.objects;
CREATE POLICY user_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-documents' AND (split_part(name, '/', 1) = auth.uid()::text OR public._is_strict_admin(auth.uid())));
DROP POLICY IF EXISTS user_documents_admin_insert ON storage.objects;
CREATE POLICY user_documents_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-documents' AND public._is_strict_admin(auth.uid()));
DROP POLICY IF EXISTS user_documents_admin_delete ON storage.objects;
CREATE POLICY user_documents_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-documents' AND public._is_strict_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.kra_kpi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_year          integer NOT NULL DEFAULT extract(year FROM now())::int,
  focus_area          text NOT NULL,
  goal                text NOT NULL,
  kpi                 text,
  weightage           numeric,
  q1_progress text, q1_manager_feedback text, q1_admin_feedback text, q1_rating numeric,
  q2_progress text, q2_manager_feedback text, q2_admin_feedback text, q2_rating numeric,
  q3_progress text, q3_manager_feedback text, q3_admin_feedback text, q3_rating numeric,
  q4_progress text, q4_manager_feedback text, q4_admin_feedback text, q4_rating numeric,
  final_feedback      text,
  final_rating        numeric,
  created_by          uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kra_kpi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kra_read ON public.kra_kpi;
CREATE POLICY kra_read ON public.kra_kpi FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public._is_strict_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = kra_kpi.user_id AND p.manager_id = auth.uid()));
DROP POLICY IF EXISTS kra_admin_insert ON public.kra_kpi;
CREATE POLICY kra_admin_insert ON public.kra_kpi FOR INSERT TO authenticated WITH CHECK (public._is_strict_admin(auth.uid()));
DROP POLICY IF EXISTS kra_update ON public.kra_kpi;
CREATE POLICY kra_update ON public.kra_kpi FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public._is_strict_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = kra_kpi.user_id AND p.manager_id = auth.uid()));
DROP POLICY IF EXISTS kra_admin_delete ON public.kra_kpi;
CREATE POLICY kra_admin_delete ON public.kra_kpi FOR DELETE TO authenticated USING (public._is_strict_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kra_kpi TO authenticated;
GRANT ALL ON public.kra_kpi TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
--  Part 2: Payments — manager verification, comments, receipt + "Payment done"
--  (keeps MAPL's expense categories, tier limits and existing approve / paid flow)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS verifier_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS verify_note  text,
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS receipt_name text;

-- allow the new "pending_verification" status (replaces any old status check)
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.payment_requests'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
    EXECUTE format('ALTER TABLE public.payment_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check
    CHECK (status IN ('pending_verification','pending','approved','rejected','paid'));
END $$;

-- notify helper (type 'payment', links to the request)
CREATE OR REPLACE FUNCTION public._pay_notify(p_user uuid, p_title text, p_body text, p_req uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, title, body, type, reference_id)
  SELECT p_user, p_title, p_body, 'payment', p_req WHERE p_user IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public._pay_notify(uuid, text, text, uuid) FROM anon, authenticated, public;

-- 1. New request: employees/interns pick a manager → it waits for that manager first.
--    Managers / admins skip the check (their requests go straight to the admins as before).
CREATE OR REPLACE FUNCTION public._payment_route_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verifier_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.requester_id AND role IN ('manager','admin','super_admin'))
     AND NEW.verifier_id <> NEW.requester_id
     AND EXISTS (SELECT 1 FROM profiles WHERE id = NEW.verifier_id AND coalesce(is_active, true)) THEN
    NEW.status := 'pending_verification';
  ELSE
    NEW.verifier_id := NULL;
    IF NEW.status = 'pending_verification' THEN NEW.status := 'pending'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_payment_route_verification ON public.payment_requests;
CREATE TRIGGER trg_payment_route_verification BEFORE INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public._payment_route_verification();

-- After insert (runs after MAPL's own triggers — name starts with "zz"): while the bill waits for
-- the manager, the admins shouldn't be told yet; only the manager is.
CREATE OR REPLACE FUNCTION public._payment_after_insert_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NEW.status = 'pending_verification' THEN
    -- notifications created by this same insert (same transaction time) for anyone but the requester
    DELETE FROM notifications WHERE created_at = now() AND user_id <> NEW.requester_id;
    SELECT full_name INTO v_name FROM profiles WHERE id = NEW.requester_id;
    PERFORM public._pay_notify(NEW.verifier_id, 'Bill waiting for your verification',
      coalesce(v_name, 'Someone') || ' — ₹' || NEW.amount || ' · ' || NEW.purpose, NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS zz_payment_after_insert_verification ON public.payment_requests;
CREATE TRIGGER zz_payment_after_insert_verification AFTER INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public._payment_after_insert_verification();

-- the requester may insert a request that waits for verification (alongside MAPL's own insert policy)
DROP POLICY IF EXISTS pr_insert_own_for_verification ON public.payment_requests;
CREATE POLICY pr_insert_own_for_verification ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND status = 'pending_verification');
-- the chosen manager can see the requests sent to them
DROP POLICY IF EXISTS pr_verifier_select ON public.payment_requests;
CREATE POLICY pr_verifier_select ON public.payment_requests FOR SELECT TO authenticated
  USING (verifier_id = auth.uid());

-- 2. The manager verifies (optional comment) or rejects (reason required)
CREATE OR REPLACE FUNCTION public.verify_payment_request(p_id uuid, p_ok boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_requests%ROWTYPE; v_me text; v_lbl text;
BEGIN
  SELECT * INTO r FROM payment_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.verifier_id IS DISTINCT FROM auth.uid() OR r.status <> 'pending_verification' THEN
    RAISE EXCEPTION 'This request is not waiting for your verification';
  END IF;
  SELECT full_name INTO v_me FROM profiles WHERE id = auth.uid();
  v_lbl := '₹' || r.amount || ' · ' || r.purpose;
  IF p_ok THEN
    UPDATE payment_requests
       SET status = 'pending', verified_at = now(), verify_note = nullif(trim(coalesce(p_note, '')), '')
     WHERE id = p_id;
    -- now the admins approve
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    SELECT p.id, 'Payment request waiting for approval',
           coalesce(r.requester_name, 'A team member') || ' — ' || v_lbl || ' (verified by ' || coalesce(v_me, 'manager') || ')',
           'payment', p_id
      FROM profiles p
     WHERE p.role IN ('admin','super_admin') AND coalesce(p.is_active, true) AND p.id <> auth.uid();
    PERFORM public._pay_notify(r.requester_id, 'Bill verified by ' || coalesce(v_me, 'your manager'),
      v_lbl || ' — now waiting for approval', p_id);
  ELSE
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Please give a reason for rejecting'; END IF;
    UPDATE payment_requests
       SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
     WHERE id = p_id;
    IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = r.requester_id AND created_at = now()) THEN
      PERFORM public._pay_notify(r.requester_id, 'Payment request rejected',
        v_lbl || ' — ' || coalesce(v_me, '') || ': ' || trim(p_note), p_id);
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_payment_request(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.verify_payment_request(uuid, boolean, text) TO authenticated;

-- 3. Accounts marks an approved request as paid — receipt required; requester, verifier and approver are told
CREATE OR REPLACE FUNCTION public.mark_payment_paid(p_id uuid, p_receipt_path text, p_receipt_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_requests%ROWTYPE; v_me text; v_lbl text;
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                   AND (lower(trim(coalesce(department, ''))) = 'accountant' OR role IN ('admin','super_admin')))
          OR public.wf_has('accounts', auth.uid())) THEN
    RAISE EXCEPTION 'Only Accounts can mark payments as paid';
  END IF;
  IF coalesce(trim(p_receipt_path), '') = '' THEN RAISE EXCEPTION 'Upload the payment receipt'; END IF;
  SELECT * INTO r FROM payment_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Only approved requests can be marked as paid'; END IF;

  UPDATE payment_requests
     SET status = 'paid', paid_by = auth.uid(), paid_at = now(),
         receipt_path = p_receipt_path, receipt_name = nullif(trim(coalesce(p_receipt_name, '')), '')
   WHERE id = p_id;

  SELECT full_name INTO v_me FROM profiles WHERE id = auth.uid();
  v_lbl := '₹' || r.amount || ' · ' || r.purpose || ' — paid by ' || coalesce(v_me, 'Accounts') || '. Open it to view the receipt.';
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = r.requester_id AND created_at = now()) THEN
    PERFORM public._pay_notify(r.requester_id, 'Payment done ✓', v_lbl, p_id);
  END IF;
  IF r.verifier_id IS NOT NULL AND r.verifier_id <> r.requester_id THEN
    PERFORM public._pay_notify(r.verifier_id, 'Payment done ✓', coalesce(r.requester_name, 'Request') || ': ' || v_lbl, p_id);
  END IF;
  IF r.decided_by IS NOT NULL AND r.decided_by NOT IN (r.requester_id, coalesce(r.verifier_id, r.requester_id), auth.uid()) THEN
    PERFORM public._pay_notify(r.decided_by, 'Payment done ✓', coalesce(r.requester_name, 'Request') || ': ' || v_lbl, p_id);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_payment_paid(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_payment_paid(uuid, text, text) TO authenticated;

-- 3b. Tell people when an admin approves / rejects (MAPL had no payment notifications):
--     approved → requester + Accounts ("to pay");  rejected by an admin → requester
CREATE OR REPLACE FUNCTION public._payment_status_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lbl text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  v_lbl := '₹' || NEW.amount || ' · ' || NEW.purpose;
  IF NEW.status = 'approved' THEN
    PERFORM public._pay_notify(NEW.requester_id, 'Payment request approved',
      v_lbl || coalesce(' — approved by ' || NEW.decided_by_name, '') || coalesce(': ' || nullif(NEW.decision_note, ''), ''), NEW.id);
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    SELECT p.id, 'Approved payment to pay', coalesce(NEW.requester_name, 'A team member') || ' — ' || v_lbl, 'payment', NEW.id
      FROM profiles p
     WHERE coalesce(p.is_active, true) AND p.id <> NEW.requester_id
       AND (lower(trim(coalesce(p.department, ''))) = 'accountant' OR public.wf_has('accounts', p.id));
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    PERFORM public._pay_notify(NEW.requester_id, 'Payment request rejected',
      v_lbl || coalesce(' — ' || NEW.decided_by_name, '') || coalesce(': ' || nullif(NEW.decision_note, ''), ''), NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS zz_payment_status_notify ON public.payment_requests;
CREATE TRIGGER zz_payment_status_notify AFTER UPDATE OF status ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public._payment_status_notify();

-- 4. Receipt / bill files: the verifier can open the bill; requester, verifier and approver can open the receipt
DROP POLICY IF EXISTS payment_files_related_read ON storage.objects;
CREATE POLICY payment_files_related_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1 FROM public.payment_requests pr
       WHERE (pr.bill_file_path = storage.objects.name OR pr.receipt_path = storage.objects.name)
         AND (pr.requester_id = auth.uid() OR pr.verifier_id = auth.uid() OR pr.decided_by = auth.uid())
    )
  );
-- Accounts uploads the receipt into their own folder
DROP POLICY IF EXISTS payment_receipts_accounts_insert ON storage.objects;
CREATE POLICY payment_receipts_accounts_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND split_part(name, '/', 1) = auth.uid()::text);
-- ── Live updates: every table the app shows is broadcast over realtime, so screens
--    refresh the moment something changes. Row-level security still decides who sees what.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks','task_assignees','task_comments','task_attachments','task_columns',
    'form_requests','production_forms','production_form_opens',
    'payment_requests','leave_requests','overtime_entries','overtime_members',
    'notifications','projects','project_members','project_teams',
    'assets','user_documents','holidays','team_meetings','team_meeting_participants',
    'kra_kpi','profiles','workflow_people',
    'site_visit_requests','site_visits','daily_status','project_photos'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
