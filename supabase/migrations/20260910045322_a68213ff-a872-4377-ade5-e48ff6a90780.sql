CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint site_visits_user_id_fkey references public.profiles(id) on delete cascade,
  visit_date date not null default current_date,
  site_name text not null,
  location text not null,
  contact_person text,
  contact_phone text,
  purpose text,
  notes text,
  trip_status text not null default 'planned',
  km_start numeric,
  km_end numeric,
  started_at timestamptz,
  ended_at timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz,
  start_latitude numeric, start_longitude numeric,
  end_latitude numeric, end_longitude numeric,
  arrived_latitude numeric, arrived_longitude numeric,
  departed_latitude numeric, departed_longitude numeric,
  trip_group_id uuid not null default gen_random_uuid(),
  stop_order integer not null default 1,
  request_id uuid,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.site_visit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint site_visit_requests_user_id_fkey references public.profiles(id) on delete cascade,
  trip_group_id uuid not null default gen_random_uuid(),
  stop_order integer not null default 1,
  site_name text not null,
  location text not null,
  contact_person text,
  contact_phone text,
  purpose text,
  notes text,
  planned_at timestamptz not null default now(),
  status text not null default 'pending',
  decision_note text,
  site_visit_id uuid references public.site_visits(id) on delete set null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visits TO authenticated;
GRANT ALL ON public.site_visits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_visit_requests TO authenticated;
GRANT ALL ON public.site_visit_requests TO service_role;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or team site visits readable" ON public.site_visits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));
CREATE POLICY "users insert own site visits" ON public.site_visits FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own or team site visits updatable" ON public.site_visits FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));
CREATE POLICY "own or team site visits deletable" ON public.site_visits FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));

CREATE POLICY "own or team requests readable" ON public.site_visit_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));
CREATE POLICY "users insert own requests" ON public.site_visit_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own or team requests updatable" ON public.site_visit_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));
CREATE POLICY "own or team requests deletable" ON public.site_visit_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_view_sales_tracker_of(auth.uid(), user_id));

CREATE INDEX IF NOT EXISTS site_visits_user_idx ON public.site_visits(user_id);
CREATE INDEX IF NOT EXISTS site_visits_group_idx ON public.site_visits(trip_group_id);
CREATE INDEX IF NOT EXISTS site_visit_requests_user_idx ON public.site_visit_requests(user_id);
CREATE INDEX IF NOT EXISTS site_visit_requests_group_idx ON public.site_visit_requests(trip_group_id);