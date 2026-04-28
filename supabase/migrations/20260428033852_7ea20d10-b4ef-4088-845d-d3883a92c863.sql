
-- Loosen leave_requests.type to allow 'on_duty'
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_type_check
  CHECK (type IN ('leave','permission','on_duty'));

-- Holidays: add `name` and `color` columns referenced by UI (keep `title` for backward compat)
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS color text DEFAULT '#ef4444';
UPDATE public.holidays SET name = title WHERE name IS NULL;

-- ===========================================================
-- Projects
-- ===========================================================
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  status text DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.project_teams(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Tasks: link to project & team
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_team_id uuid REFERENCES public.project_teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);

-- Helper: is this user a member of the project (no RLS recursion)
CREATE OR REPLACE FUNCTION public.user_in_project(_project_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _uid
  )
$$;

-- Projects RLS
CREATE POLICY "Admins manage projects" ON public.projects FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Members can read projects" ON public.projects FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR public.user_in_project(id, auth.uid()));

-- Project teams RLS
CREATE POLICY "Admins manage project_teams" ON public.project_teams FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Members can read project_teams" ON public.project_teams FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR public.user_in_project(project_id, auth.uid()));

-- Project members RLS
CREATE POLICY "Admins manage project_members" ON public.project_members FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Members can read project_members of own projects" ON public.project_members FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid() OR public.user_in_project(project_id, auth.uid()));

-- ===========================================================
-- Task assignees: add assignee_role (owner | co_owner)
-- ===========================================================
ALTER TABLE public.task_assignees ADD COLUMN IF NOT EXISTS assignee_role text DEFAULT 'owner' CHECK (assignee_role IN ('owner','co_owner'));

-- ===========================================================
-- Task columns (Kanban) — global + per-user overrides + per-user personal columns
-- ===========================================================
CREATE TABLE public.task_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read task_columns" ON public.task_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage task_columns" ON public.task_columns FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

INSERT INTO public.task_columns (key, label, color, position, is_default) VALUES
  ('todo','To Do','#6366f1',0,true),
  ('in_progress','In Progress','#f59e0b',1,true),
  ('on_hold','On Hold','#ef4444',2,true),
  ('completed','Completed','#10b981',3,true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.user_task_column_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  column_key text NOT NULL,
  custom_label text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, column_key)
);
ALTER TABLE public.user_task_column_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own column prefs" ON public.user_task_column_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.user_task_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);
ALTER TABLE public.user_task_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own personal columns" ON public.user_task_columns FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===========================================================
-- Organisation flow (org chart)
-- ===========================================================
CREATE TABLE public.organisation_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.organisation_flow_nodes(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.organisation_flow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read org flow" ON public.organisation_flow_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage org flow" ON public.organisation_flow_nodes FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER update_org_flow_updated_at BEFORE UPDATE ON public.organisation_flow_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
