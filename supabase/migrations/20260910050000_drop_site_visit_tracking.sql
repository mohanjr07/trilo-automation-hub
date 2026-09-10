-- Simplify Sales Tracker: remove GPS-based site-visit "trip" tracking
-- (site_visits + site_visit_requests) while leaving daily_status and
-- sales_tracker_settings completely untouched.
--
-- Written to be safe/idempotent on a database that may or may not have
-- these objects (IF EXISTS everywhere). Drops site_visit_requests first
-- since it FKs to site_visits.

-- 1. Triggers on site_visit_requests.
DROP TRIGGER IF EXISTS update_site_visit_requests_updated_at ON public.site_visit_requests;
DROP TRIGGER IF EXISTS trg_validate_site_visit_request_timing ON public.site_visit_requests;
DROP TRIGGER IF EXISTS trg_notify_site_visit_request ON public.site_visit_requests;
DROP TRIGGER IF EXISTS trg_notify_site_visit_request_decision ON public.site_visit_requests;

-- 2. RLS policies on site_visit_requests.
DROP POLICY IF EXISTS "Users can read own site_visit_requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "Managers can read team site_visit_requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "Users can insert own site_visit_requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "Managers can update team site_visit_requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "Users can delete own pending site_visit_requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "own or team requests readable" ON public.site_visit_requests;
DROP POLICY IF EXISTS "users insert own requests" ON public.site_visit_requests;
DROP POLICY IF EXISTS "own or team requests updatable" ON public.site_visit_requests;
DROP POLICY IF EXISTS "own or team requests deletable" ON public.site_visit_requests;

-- 3. RLS policies on site_visits.
DROP POLICY IF EXISTS "own or team site visits readable" ON public.site_visits;
DROP POLICY IF EXISTS "users insert own site visits" ON public.site_visits;
DROP POLICY IF EXISTS "own or team site visits updatable" ON public.site_visits;
DROP POLICY IF EXISTS "own or team site visits deletable" ON public.site_visits;

-- 4. Functions used only by site-visit trip tracking / approvals.
DROP FUNCTION IF EXISTS public.validate_site_visit_request_timing() CASCADE;
DROP FUNCTION IF EXISTS public.notify_site_visit_request() CASCADE;
DROP FUNCTION IF EXISTS public.notify_site_visit_request_decision() CASCADE;

-- 5. Tables — requests first (FKs to site_visits).
DROP TABLE IF EXISTS public.site_visit_requests CASCADE;
DROP TABLE IF EXISTS public.site_visits CASCADE;
