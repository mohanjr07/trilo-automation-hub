-- Moved off Lovable: point the e-mail trigger at THIS project (dxlpwnmoohkddkkqoxzt).
-- It still called the old Lovable project (bkbqicxhkdlgamdmjjrt), so emails were never sent.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.send_email_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://dxlpwnmoohkddkkqoxzt.supabase.co/functions/v1/send-email-notification',
    body := jsonb_build_object('record', jsonb_build_object(
      'id', NEW.id, 'user_id', NEW.user_id, 'title', NEW.title,
      'body', NEW.body, 'type', NEW.type, 'reference_id', NEW.reference_id)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4bHB3bm1vb2hrZGRra3FveHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTUyNTYsImV4cCI6MjEwNDU5MTI1Nn0.Sq6nveQkc2WVw9iKki2Jgjk2X43ZarrWBmq0U2_z-p8'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Email notification failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_send_email_on_notification ON public.notifications;
CREATE TRIGGER trigger_send_email_on_notification
  AFTER INSERT ON public.notifications FOR EACH ROW
  EXECUTE FUNCTION public.send_email_on_notification();

-- Check: lists the triggers on notifications
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.notifications'::regclass AND NOT tgisinternal;
