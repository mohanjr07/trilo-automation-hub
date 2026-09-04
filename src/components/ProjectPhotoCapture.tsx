import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, X, MapPin, Loader2, ImageOff, RefreshCw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ProjectPhoto = {
  id: string;
  project_id: string;
  user_id: string;
  image_url: string;
  note: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  user?: { full_name: string; avatar_url: string | null } | null;
};

/**
 * "Site Photos" section for a project — lets any project member snap a
 * live, GPS/time-stamped photo (à la GPS Map Camera) and attach it to the
 * project, and shows the gallery of everything already captured.
 */
export default function ProjectPhotosSection({ projectId }: { projectId: string }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<ProjectPhoto | null>(null);
  const { user, isAdmin } = useAuth();

  const { data: photos = [], isLoading } = useQuery<ProjectPhoto[]>({
    queryKey: ["project-photos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_photos")
        .select("*, user:profiles(full_name, avatar_url)")
        .eq("project_id", projectId)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectPhoto[];
    },
  });

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-ink-muted" />
          <span className="text-sm font-semibold text-ink-primary">Site Photos</span>
          <span className="text-xs text-ink-muted">({photos.length})</span>
        </div>
        <Button size="sm" onClick={() => setCaptureOpen(true)} className="gap-1.5">
          <Camera className="h-3.5 w-3.5" /> Capture Photo
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <ImageOff className="h-7 w-7 text-ink-muted mb-1.5" />
          <p className="text-xs text-ink-muted">No site photos yet — capture one to log progress with location & time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setViewPhoto(p)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img src={p.image_url} alt={p.address ?? "Site photo"} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-primary/70 to-transparent px-1.5 py-1">
                <p className="text-[10px] font-medium text-white truncate">{format(new Date(p.captured_at), "MMM d, h:mm a")}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {captureOpen && (
        <CaptureModal projectId={projectId} onClose={() => setCaptureOpen(false)} />
      )}
      {viewPhoto && (
        <PhotoViewerModal
          photo={viewPhoto}
          canDelete={isAdmin || viewPhoto.user_id === user?.id}
          onClose={() => setViewPhoto(null)}
        />
      )}
    </div>
  );
}

// ─── Live capture modal ─────────────────────────────────────────────────────
function CaptureModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null); // stamped image data URL
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("Locating…");
  const [saving, setSaving] = useState(false);

  // Start the camera as soon as the modal opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setCameraError("Couldn't access the camera. Check your browser's camera permission and try again.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Grab GPS location and reverse-geocode it to a readable address.
  useEffect(() => {
    if (!navigator.geolocation) { setAddress("Location unavailable"); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { Accept: "application/json" } }
          );
          const json = await res.json();
          setAddress(json?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } catch {
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } finally {
          setLocating(false);
        }
      },
      () => { setAddress("Location permission denied"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  const drawStamp = (ctx: CanvasRenderingContext2D, w: number, h: number, logoImg: HTMLImageElement | null) => {
    const now = new Date();
    const placeLine = address.split(",")[0]?.trim() || "Current Location";
    const addressLines = wrapText(ctx, address, w * 0.6, 15);
    const dateLine = format(now, "EEEE, d MMM yyyy  h:mm a");
    const noteLine = note.trim() ? `Note : ${note.trim()}` : null;

    const boxPadding = Math.round(w * 0.03);
    const lineHeight = Math.round(h * 0.028);
    const lines = [placeLine, ...addressLines, dateLine, ...(noteLine ? [noteLine] : [])];
    const boxHeight = boxPadding * 2 + lineHeight * lines.length + 6;
    const boxY = h - boxHeight - Math.round(h * 0.015);
    const boxWidth = Math.round(w * 0.66);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, boxY, boxWidth, boxHeight);

    let ty = boxY + boxPadding + lineHeight * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(lineHeight * 1.05)}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(placeLine, boxPadding, ty);
    ty += lineHeight * 1.2;

    ctx.font = `${Math.round(lineHeight * 0.85)}px Arial`;
    for (const line of addressLines) { ctx.fillText(line, boxPadding, ty); ty += lineHeight; }

    ctx.font = `${Math.round(lineHeight * 0.85)}px Arial`;
    ctx.fillText(dateLine, boxPadding, ty);
    ty += lineHeight;

    if (noteLine) {
      ctx.font = `italic ${Math.round(lineHeight * 0.85)}px Arial`;
      ctx.fillText(noteLine, boxPadding, ty);
    }

    // GPS badge, top-left of the stamp box
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const badgeW = Math.round(w * 0.16), badgeH = Math.round(lineHeight * 1.1);
    ctx.fillRect(boxPadding * 0.4, boxY - badgeH - 4, badgeW, badgeH);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(lineHeight * 0.65)}px Arial`;
    ctx.fillText("📍 GPS Photo", boxPadding * 0.4 + 6, boxY - badgeH - 4 + badgeH * 0.2);

    // Logo badge, bottom-right
    const logoSize = Math.round(boxHeight * 0.92);
    const logoX = w - logoSize - Math.round(w * 0.02);
    const logoY = boxY + (boxHeight - logoSize) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.strokeStyle = "#f5b400";
    ctx.lineWidth = 3;
    ctx.strokeRect(logoX, logoY, logoSize, logoSize);
    if (logoImg) {
      const pad = logoSize * 0.08;
      ctx.drawImage(logoImg, logoX + pad, logoY + pad, logoSize - pad * 2, logoSize - pad * 2);
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { toast.error("Camera isn't ready yet"); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.onload = () => {
      drawStamp(ctx, canvas.width, canvas.height, logoImg);
      setCaptured(canvas.toDataURL("image/jpeg", 0.92));
    };
    logoImg.onerror = () => {
      drawStamp(ctx, canvas.width, canvas.height, null);
      setCaptured(canvas.toDataURL("image/jpeg", 0.92));
    };
    logoImg.src = `${import.meta.env.BASE_URL}logo.png`;
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!captured || !user) throw new Error("Nothing captured yet");
      const blob = await (await fetch(captured)).blob();
      const path = `${projectId}/${user.id}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("project-photos").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(path);

      const { error } = await supabase.from("project_photos").insert({
        project_id: projectId,
        user_id: user.id,
        image_url: urlData.publicUrl,
        note: note.trim() || null,
        address,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-photos", projectId] });
      toast.success("Photo saved to the project");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't save the photo"),
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-ink-primary/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-xl bg-card shadow-xl mx-4"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="font-heading text-lg font-bold text-ink-primary">Capture Site Photo</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 pt-3 space-y-3">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
            {cameraError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <ImageOff className="h-8 w-8 text-white/60" />
                <p className="text-sm text-white/80">{cameraError}</p>
              </div>
            ) : captured ? (
              <img src={captured} alt="Captured" className="h-full w-full object-cover" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            {locating ? (
              <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Getting your location…</span>
            ) : (
              <span className="truncate">{address}</span>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-primary">Note (optional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Elevated structure support" />
          </div>

          <div className="flex gap-3 pt-1">
            {captured ? (
              <>
                <Button variant="outline" onClick={() => setCaptured(null)} className="flex-1 gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Retake
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
                  {save.isPending ? "Saving..." : "Save Photo"}
                </Button>
              </>
            ) : (
              <Button onClick={handleCapture} disabled={!!cameraError} className="flex-1 gap-1.5">
                <Camera className="h-4 w-4" /> Capture
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxCharsFallback: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
    if (lines.length === 2) break; // cap the address block at 3 lines total
  }
  if (line && lines.length < 3) lines.push(line);
  return lines.length ? lines : [text.slice(0, maxCharsFallback)];
}

// ─── Full-size viewer ────────────────────────────────────────────────────────
function PhotoViewerModal({
  photo, canDelete, onClose,
}: { photo: ProjectPhoto; canDelete: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("project_photos").delete().eq("id", photo.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["project-photos", photo.project_id] });
      toast.success("Photo deleted");
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't delete the photo");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center">
        <div className="absolute inset-0 bg-ink-primary/70" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative w-full max-w-[520px] max-h-[92vh] overflow-y-auto rounded-xl bg-card shadow-xl mx-4"
        >
          <div className="flex items-center justify-between px-5 pt-5">
            <p className="text-sm font-medium text-ink-primary">
              {photo.user?.full_name ?? "Team member"} · {format(new Date(photo.captured_at), "MMM d, yyyy h:mm a")}
            </p>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-primary"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-5 pt-3 space-y-3">
            <img src={photo.image_url} alt={photo.address ?? "Site photo"} className="w-full rounded-lg" />
            {photo.address && (
              <div className="flex items-start gap-1.5 text-sm text-ink-secondary">
                <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-ink-muted" />
                <span>{photo.address}</span>
              </div>
            )}
            {photo.note && <p className="text-sm text-ink-muted">Note: {photo.note}</p>}
            {canDelete && (
              <Button variant="outline" onClick={handleDelete} disabled={deleting} className="w-full gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting..." : "Delete Photo"}
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
