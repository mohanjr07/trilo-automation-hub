
-- Allow managers to approve/reject leave requests for their direct reports
CREATE OR REPLACE FUNCTION public.is_manager_of(_employee_id uuid, _manager_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _employee_id AND manager_id = _manager_id
  )
$$;

CREATE POLICY "Managers can read their team leave_requests"
ON public.leave_requests FOR SELECT
TO authenticated
USING (public.is_manager_of(employee_id, auth.uid()));

CREATE POLICY "Managers can review their team leave_requests"
ON public.leave_requests FOR UPDATE
TO authenticated
USING (public.is_manager_of(employee_id, auth.uid()))
WITH CHECK (public.is_manager_of(employee_id, auth.uid()));
