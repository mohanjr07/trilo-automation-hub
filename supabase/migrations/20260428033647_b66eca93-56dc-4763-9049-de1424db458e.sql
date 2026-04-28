
-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text CHECK (role IN ('super_admin','admin','employee')) DEFAULT 'employee',
  department text,
  position text,
  avatar_url text,
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) NOT NULL,
  priority text CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  status text CHECK (status IN ('todo','in_progress','on_hold','completed')) DEFAULT 'todo',
  progress integer CHECK (progress >= 0 AND progress <= 100) DEFAULT 0,
  deadline date,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  body text NOT NULL,
  parent_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_task_comments_parent_id ON public.task_comments(parent_id);

CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) NOT NULL,
  type text CHECK (type IN ('leave','permission')) NOT NULL,
  leave_category text,
  start_date date NOT NULL,
  end_date date,
  start_time time,
  end_time time,
  reason text NOT NULL,
  status text CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  admin_note text,
  is_half_day boolean NOT NULL DEFAULT false,
  half_day_period text CHECK (half_day_period IS NULL OR half_day_period IN ('AM','PM')),
  reverted_at timestamptz,
  reverted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text CHECK (type IN ('task','leave','system','meeting')),
  reference_id uuid,
  is_read boolean DEFAULT false,
  email_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = uid
$$;

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role IN ('admin','manager','super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_strict_admin(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role IN ('admin','super_admin')
  )
$$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','manager','employee','super_admin'));

-- Profiles policies
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update profiles" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Notification_preferences
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  pref_key text NOT NULL,
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, pref_key)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own prefs" ON notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prefs" ON notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prefs" ON notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Leave policy
CREATE TABLE public.leave_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type text NOT NULL UNIQUE,
  allowed_days numeric DEFAULT 0,
  is_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.leave_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read leave policy" ON leave_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage leave policy" ON leave_policy FOR ALL TO authenticated USING (is_admin(auth.uid()));
INSERT INTO leave_policy (leave_type, allowed_days, is_enabled) VALUES
  ('annual', 12, true),('sick', 10, true),('emergency', 3, true),('unpaid', 0, true),('permission_hours', 24, true)
ON CONFLICT (leave_type) DO NOTHING;

-- Holidays
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date date NOT NULL,
  type text NOT NULL DEFAULT 'government' CHECK (type IN ('government','company','optional')),
  description text,
  is_recurring boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage holidays" ON public.holidays FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- Team meetings
CREATE TABLE public.team_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  meeting_link text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 30,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'scheduled'
);
CREATE TABLE public.team_meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.team_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);
ALTER TABLE public.team_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meetings" ON public.team_meetings FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Users can read their meetings" ON public.team_meetings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_meeting_participants WHERE meeting_id = team_meetings.id AND user_id = auth.uid()));
CREATE POLICY "Admins can manage participants" ON public.team_meeting_participants FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Users can read own participations" ON public.team_meeting_participants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own participation" ON public.team_meeting_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Task assignees
CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage task_assignees" ON public.task_assignees FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Users can read own task_assignees" ON public.task_assignees FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Task creators can insert task_assignees" ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_assignees.task_id AND t.assigned_by = auth.uid()));

-- User notes
CREATE TABLE public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notes" ON public.user_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON public.user_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.user_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.user_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Tasks policies (final, non-recursive)
CREATE POLICY "Admins can do all on tasks" ON public.tasks FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Employees can read assigned tasks" ON public.tasks FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR auth.uid() = assigned_to OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()));
CREATE POLICY "Employees can update assigned tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR auth.uid() = assigned_to OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()));

-- user_can_access_task helper
CREATE OR REPLACE FUNCTION public.user_can_access_task(task_id uuid, uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = uid
        OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = uid)
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role IN ('admin','super_admin','manager')))
  )
$$;

CREATE POLICY "Users can read comments on visible tasks" ON public.task_comments FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_comments.task_id AND (t.assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))));
CREATE POLICY "Users can insert comments on accessible tasks" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_can_access_task(task_id, auth.uid()));

CREATE POLICY "Users can read attachments on accessible tasks" ON public.task_attachments FOR SELECT TO authenticated
  USING (public.user_can_access_task(task_id, auth.uid()));
CREATE POLICY "Users can insert attachments on accessible tasks" ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by AND public.user_can_access_task(task_id, auth.uid()));
CREATE POLICY "Admins can delete attachments" ON public.task_attachments FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Leave requests policies
CREATE POLICY "Admins can do all on leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Employees can read own leave_requests" ON public.leave_requests FOR SELECT TO authenticated USING (auth.uid() = employee_id);
CREATE POLICY "Employees can insert own leave_requests" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = employee_id);
CREATE POLICY "Employees can update own pending leave_requests" ON public.leave_requests FOR UPDATE TO authenticated USING (auth.uid() = employee_id AND status = 'pending');
CREATE POLICY "Admins can delete leave_requests" ON public.leave_requests FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Notifications policies
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_notes_updated_at BEFORE UPDATE ON public.user_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_deadline ON public.tasks(deadline);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX idx_leave_requests_half_day ON public.leave_requests(is_half_day);
CREATE INDEX idx_leave_requests_reverted_at ON public.leave_requests(reverted_at);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(is_read);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

-- Notification triggers
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, title, body, type, reference_id)
  VALUES (NEW.assigned_to, 'New task assigned', 'You have been assigned: ' || NEW.title, 'task', NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_task_assigned AFTER INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

CREATE OR REPLACE FUNCTION public.notify_task_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp_name text;
BEGIN
  IF OLD.progress IS DISTINCT FROM NEW.progress THEN
    SELECT full_name INTO emp_name FROM profiles WHERE id = NEW.assigned_to;
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    VALUES (NEW.assigned_by, emp_name || ' updated progress', NEW.title || ' is now ' || NEW.progress || '% complete', 'task', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_task_progress AFTER UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_progress();

CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp_name text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    SELECT full_name INTO emp_name FROM profiles WHERE id = NEW.assigned_to;
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    VALUES (NEW.assigned_by, 'Task completed', emp_name || ' completed: ' || NEW.title, 'task', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_task_completed AFTER UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION notify_task_completed();

CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp_name text; admin_id uuid;
BEGIN
  SELECT full_name INTO emp_name FROM profiles WHERE id = NEW.employee_id;
  FOR admin_id IN SELECT id FROM profiles WHERE role IN ('admin','super_admin') AND id != NEW.employee_id
  LOOP
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    VALUES (admin_id, 'New ' || NEW.type || ' request', emp_name || ' requested ' || NEW.type || ': ' || NEW.start_date, 'leave', NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_leave_submitted AFTER INSERT ON leave_requests FOR EACH ROW EXECUTE FUNCTION notify_leave_submitted();

CREATE OR REPLACE FUNCTION public.notify_leave_reviewed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    VALUES (NEW.employee_id,
      CASE WHEN NEW.status = 'approved' THEN 'Request approved' ELSE 'Request rejected' END,
      'Your ' || NEW.type || ' request for ' || NEW.start_date ||
        CASE WHEN NEW.status = 'approved' THEN ' was approved' ELSE ' was rejected' || COALESCE('. ' || NEW.admin_note, '') END,
      'leave', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_leave_reviewed AFTER UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION notify_leave_reviewed();

CREATE OR REPLACE FUNCTION public.notify_meeting_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE meeting_title text;
BEGIN
  SELECT title INTO meeting_title FROM team_meetings WHERE id = NEW.meeting_id;
  INSERT INTO notifications (user_id, title, body, type, reference_id)
  VALUES (NEW.user_id, 'New team meeting', 'You are invited to: ' || meeting_title, 'meeting', NEW.meeting_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_meeting_participant_added AFTER INSERT ON public.team_meeting_participants FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_participants();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_meetings;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments','task-attachments',true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Anyone can read avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated users can upload task attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated users can read task attachments" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');
CREATE POLICY "Admins can delete task attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND public.is_admin(auth.uid()));

-- Migrate tasks.assigned_to → task_assignees (no-op on empty db)
INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, assigned_to FROM public.tasks
ON CONFLICT (task_id, user_id) DO NOTHING;

-- Email-on-notification via pg_net (points to THIS project)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.send_email_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://bkbqicxhkdlgamdmjjrt.supabase.co/functions/v1/send-email-notification',
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id, 'user_id', NEW.user_id, 'title', NEW.title,
        'body', NEW.body, 'type', NEW.type, 'reference_id', NEW.reference_id
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYnFpY3hoa2RsZ2FtZG1qanJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjY5NDUsImV4cCI6MjA5MjkwMjk0NX0.9HpjYWbmQiOqiyInQPJSWGn4Cz36gusDfDU5Vq5oNdQ'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Email notification failed: %', SQLERRM;
  RETURN NEW;
END; $$;

CREATE TRIGGER trigger_send_email_on_notification
AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.send_email_on_notification();
