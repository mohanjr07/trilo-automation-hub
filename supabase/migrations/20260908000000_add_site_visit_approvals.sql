-- Site Visit Approvals: sales reps must request approval from their team
-- lead before a site visit, at least 24 hours ahead of the planned visit.
-- Only once approved does the visit become startable (via the existing
-- site_visits table, linked back with request_id).

-- 1. Requests table.
CREATE TABLE public.site_visit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  site_name text NOT NULL,
  location text NOT NULL,
  contact_person text,
  contact_phone text,
  purpose text,
  notes text,
  planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  site_visit_id uuid REFERENCES public.site_visits(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_visit_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_site_visit_requests_user ON public.site_visit_requests(user_id);
CREATE INDEX idx_site_visit_requests_status ON public.site_visit_requests(status);

CREATE TRIGGER update_site_visit_requests_updated_at BEFORE UPDATE ON public.site_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Link site_visits back to the request that authorized it (nullable —
-- older visits predate this feature and have none).
ALTER TABLE public.site_visits ADD COLUMN request_id uuid REFERENCES public.site_visit_requests(id);

-- 3. Enforce the 24-hour-ahead rule server-side (client also validates, but
-- this is the real guard — now()/current time can't go in a CHECK
-- constraint, so it's a BEFORE INSERT trigger instead).
CREATE OR REPLACE FUNCTION public.validate_site_visit_request_timing()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.planned_at < now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Site visits must be requested at least 24 hours in advance';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_site_visit_request_timing BEFORE INSERT ON public.site_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_site_visit_request_timing();

-- 4. RLS.
CREATE POLICY "Users can read own site_visit_requests" ON public.site_visit_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Managers can read team site_visit_requests" ON public.site_visit_requests
  FOR SELECT TO authenticated USING (public.can_view_sales_tracker_of(auth.uid(), user_id));
CREATE POLICY "Users can insert own site_visit_requests" ON public.site_visit_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Only managers (of the requester) or admins can change status — reps
-- cannot self-approve. can_view_sales_tracker_of already covers admins.
CREATE POLICY "Managers can update team site_visit_requests" ON public.site_visit_requests
  FOR UPDATE TO authenticated
  USING (public.can_view_sales_tracker_of(auth.uid(), user_id))
  WITH CHECK (public.can_view_sales_tracker_of(auth.uid(), user_id));
-- Reps can withdraw their own request while it's still pending.
CREATE POLICY "Users can delete own pending site_visit_requests" ON public.site_visit_requests
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND status = 'pending');

-- 5. Notify the manager when a new request comes in — reuses the existing
-- notify_sales_tracker_event() helper from the sales tracker migration.
CREATE OR REPLACE FUNCTION public.notify_site_visit_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
  PERFORM public.notify_sales_tracker_event(
    NEW.user_id,
    coalesce(v_name, 'A team member') || ' requested a site visit',
    coalesce(v_name, 'A team member') || ' wants to visit ' || NEW.site_name || ' (' || NEW.location || ') on ' ||
      to_char(NEW.planned_at, 'DD Mon, HH12:MI AM') || '. Approval needed.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_site_visit_request AFTER INSERT ON public.site_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_site_visit_request();

-- 6. Notify the rep when their request is approved or rejected.
CREATE OR REPLACE FUNCTION public.notify_site_visit_request_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_decider_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    SELECT full_name INTO v_decider_name FROM public.profiles WHERE id = NEW.decided_by;
    INSERT INTO public.notifications (user_id, title, body, type, reference_id)
    VALUES (
      NEW.user_id,
      CASE NEW.status
        WHEN 'approved' THEN 'Your site visit was approved'
        ELSE 'Your site visit was rejected'
      END,
      CASE NEW.status
        WHEN 'approved' THEN coalesce(v_decider_name, 'Your team lead') || ' approved your visit to ' || NEW.site_name ||
          ' on ' || to_char(NEW.planned_at, 'DD Mon, HH12:MI AM') || '.'
        ELSE coalesce(v_decider_name, 'Your team lead') || ' rejected your visit to ' || NEW.site_name ||
          coalesce('. Reason: ' || NEW.decision_note, '.')
      END,
      'sales',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_site_visit_request_decision AFTER UPDATE ON public.site_visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_site_visit_request_decision();
