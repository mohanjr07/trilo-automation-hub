-- Odometer photo capture: reps must attach a photo of the odometer reading
-- when they start and end a site visit trip, alongside the existing KM
-- number fields.

-- 1. New columns on site_visits (nullable — old rows predate this).
ALTER TABLE public.site_visits ADD COLUMN km_start_photo_url text;
ALTER TABLE public.site_visits ADD COLUMN km_end_photo_url text;

-- 2. Storage bucket for the photos (public read, like avatars/task-attachments).
INSERT INTO storage.buckets (id, name, public)
VALUES ('odometer-photos', 'odometer-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Uploads are keyed by <user_id>/<trip_group_id>-start.jpg /
-- <user_id>/<trip_group_id>-end.jpg, so "own folder" RLS (same pattern as
-- avatars) is enough to ensure a rep can only upload/overwrite their own
-- odometer photos.
CREATE POLICY "Users can upload own odometer photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'odometer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own odometer photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'odometer-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Team heads/admins need to be able to view a rep's odometer photos when
-- reviewing a trip, and the bucket is public anyway (like avatars), so read
-- access is open to any authenticated user rather than folder-restricted.
CREATE POLICY "Authenticated users can read odometer photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'odometer-photos');
