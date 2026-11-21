-- ─────────────────────────────────────────────────────────────────────────────
--  Task deadline reminders (app + phone notification)
--  The day before a task's deadline, everyone on the task gets
--  "Task due tomorrow ⏰" if the task is not completed and its status has not
--  been updated in the last 24 hours. Sent once per person per task (again if
--  the deadline changes). Checked every hour, 9 AM – 7 PM India time.
-- ─────────────────────────────────────────────────────────────────────────────
--  Run ONLY in the MAPL (Magic Aisles) Supabase project.
DO $$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.projects WHERE name = 'Coldstar_PUNE - G+2 Spiral Chute') THEN
      RAISE EXCEPTION 'This is the Trilo database — run this in the MAPL (Magic Aisles) project';
    END IF;
  END IF;
END $$;

-- 1. let notifications be of type 'task' (keeps every type already in use)
DO $$
DECLARE v_types text;
BEGIN
  SELECT string_agg(DISTINCT quote_literal(t), ',') INTO v_types
  FROM (SELECT type AS t FROM public.notifications WHERE type IS NOT NULL
        UNION SELECT unnest(ARRAY['task','leave','system','payment','form'])) x;
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  EXECUTE 'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (' || v_types || '))';
END $$;

-- 2. remember which reminders went out, so each person gets it once per task (and again if the deadline moves)
CREATE TABLE IF NOT EXISTS public.task_deadline_reminders (
  task_id   uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deadline  date NOT NULL,
  kind      text NOT NULL DEFAULT 'day_before',
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id, deadline, kind)
);
ALTER TABLE public.task_deadline_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_deadline_reminders FROM anon, authenticated;

-- 3. the reminder job: tasks due TOMORROW (India time), not completed, status not touched for 24 h
CREATE OR REPLACE FUNCTION public.send_task_deadline_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tomorrow date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.deadline::date AS due, coalesce(t.status, 'todo') AS status, coalesce(t.progress, 0) AS progress, u.user_id
      FROM tasks t
      CROSS JOIN LATERAL (
        SELECT a.user_id FROM task_assignees a WHERE a.task_id = t.id
        UNION
        SELECT t.assigned_to WHERE t.assigned_to IS NOT NULL
      ) u
     WHERE t.deadline IS NOT NULL
       AND t.deadline::date = v_tomorrow
       AND coalesce(t.status, 'todo') NOT IN ('completed', 'done', 'cancelled')
       AND coalesce(t.updated_at, t.created_at, now() - interval '2 days') < now() - interval '24 hours'
       AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.user_id AND coalesce(p.is_active, true))
       AND NOT EXISTS (SELECT 1 FROM task_deadline_reminders d
                        WHERE d.task_id = t.id AND d.user_id = u.user_id AND d.deadline = t.deadline::date AND d.kind = 'day_before')
  LOOP
    INSERT INTO task_deadline_reminders (task_id, user_id, deadline, kind) VALUES (r.id, r.user_id, r.due, 'day_before')
      ON CONFLICT DO NOTHING;
    INSERT INTO notifications (user_id, title, body, type, reference_id)
    VALUES (r.user_id, 'Task due tomorrow ⏰',
            '"' || r.title || '" is due tomorrow (' || to_char(r.due, 'DD Mon') || ') and is still ' ||
            replace(initcap(replace(r.status, '_', ' ')), 'Todo', 'To Do') || ' (' || r.progress || '%). Please update its status.',
            'task', r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_task_deadline_reminders() FROM anon, authenticated, public;

-- 4. run it every hour from 9 AM to 7 PM India time (each reminder is still sent only once)
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-deadline-reminders') THEN
    PERFORM cron.unschedule('task-deadline-reminders');
  END IF;
END $$;
SELECT cron.schedule('task-deadline-reminders', '30 3-13 * * *', $$SELECT public.send_task_deadline_reminders()$$);

-- Check: the job is scheduled
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'task-deadline-reminders';
