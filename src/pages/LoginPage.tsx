import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Settings, User, Star, CheckCircle2, Smartphone } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
type FormData = z.infer<typeof schema>;

/** Small floating decorative shape — a looping, slightly randomized
 * up/down + rotate drift so the whole panel feels alive without any
 * external image/animation assets. */
function Float({
  children,
  className,
  duration = 4,
  delay = 0,
  y = 14,
  rotate = 0,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  y?: number;
  rotate?: number;
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -y, 0], rotate: rotate ? [0, rotate, 0] : undefined }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Left-hand illustration panel: soft gradient background + a few
 * floating icons/shapes around a simple "phone with lock" mockup, plus a
 * person silhouette. Pure CSS/SVG/lucide-icons, no external images. */
function LoginIllustration() {
  return (
    <div className="relative hidden lg:flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-background to-accent/20">
      {/* soft glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />
        <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />
      </div>

      {/* scattered dots */}
      <Float className="absolute left-[18%] top-[22%]" duration={5} y={10}>
        <div className="h-3 w-3 rounded-full bg-primary/40" />
      </Float>
      <Float className="absolute right-[22%] top-[30%]" duration={4.5} delay={0.4} y={8}>
        <div className="h-2 w-2 rounded-full bg-accent/60" />
      </Float>
      <Float className="absolute left-[24%] bottom-[26%]" duration={6} delay={0.8} y={12}>
        <div className="h-2.5 w-2.5 rounded-full bg-primary/30" />
      </Float>
      <Float className="absolute right-[16%] bottom-[32%]" duration={5.5} delay={0.2} y={10}>
        <div className="h-2 w-2 rounded-full bg-accent/40" />
      </Float>

      {/* lock badge, top-left */}
      <Float className="absolute left-[16%] top-[30%]" duration={4} y={14}>
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">
          <Lock className="h-6 w-6 text-primary-foreground" />
        </div>
      </Float>

      {/* gear badge, top-right */}
      <Float className="absolute right-[18%] top-[20%]" duration={5} delay={0.5} y={12} rotate={20}>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-md border border-border">
          <Settings className="h-5 w-5 text-ink-muted" />
        </div>
      </Float>

      {/* star, bottom-right */}
      <Float className="absolute right-[20%] bottom-[22%]" duration={4.5} delay={0.3} y={10} rotate={-15}>
        <Star className="h-6 w-6 fill-accent text-accent" />
      </Float>

      {/* checkmark, mid-right */}
      <Float className="absolute right-[10%] top-[48%]" duration={5} delay={0.6} y={9}>
        <CheckCircle2 className="h-6 w-6 text-primary/70" />
      </Float>

      {/* person silhouette, bottom-left */}
      <Float className="absolute left-[14%] bottom-[16%]" duration={6} delay={0.2} y={8}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
          <User className="h-8 w-8 text-primary" />
        </div>
      </Float>

      {/* central phone mockup */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex h-[300px] w-[170px] flex-col items-center justify-center gap-3 rounded-[28px] border-4 border-card bg-card shadow-2xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="h-2.5 w-16 rounded-full bg-muted" />
        <div className="h-2.5 w-20 rounded-full bg-muted" />
        <div className="mt-2 h-2.5 w-24 rounded-full bg-primary/70" />
      </motion.div>

      <div className="absolute bottom-10 left-1/2 w-[80%] -translate-x-1/2 text-center">
        <p className="font-heading text-lg font-semibold text-ink-primary">Welcome back</p>
        <p className="mt-1 text-sm text-ink-muted">Sign in to keep track of everything, together.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { signIn, profile, session } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (session && profile) {
      if (profile.role === "employee") navigate("/my-dashboard", { replace: true });
      else if (profile.role === "intern") navigate("/intern-dashboard", { replace: true });
      else navigate("/dashboard", { replace: true });
    }
  }, [session, profile, navigate]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { error } = await signIn(data.email, data.password);
    if (error) {
      setLoading(false);
      toast.error("Invalid email or password");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <LoginIllustration />

      <div className="flex flex-1 flex-col justify-center px-4 py-8 pt-safe pb-safe sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-[420px] mx-auto rounded-2xl sm:rounded-modal bg-card p-6 sm:p-8 shadow-card sm:shadow-modal border border-border/50"
        >
          <div className="mb-6 sm:mb-8 text-center">
            <img
              src={`${import.meta.env.BASE_URL}favicon.png`}
              alt="Trilo Automation"
              className="mx-auto mb-4 object-contain"
              style={{ width: "72px", height: "72px" }}
            />
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink-primary">Task Flow</h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-muted">Organize work. Track everything.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs sm:text-sm font-medium text-ink-primary">Email</label>
              <Input
                {...register("email")}
                type="email"
                placeholder="you@company.com"
                autoFocus
                className="h-12 text-base rounded-xl"
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs sm:text-sm font-medium text-ink-primary">Password</label>
              <div className="relative">
                <Input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-12 text-base rounded-xl pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-ink-muted hover:text-ink-secondary active:scale-95 transition-transform"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full text-base font-semibold rounded-xl active:scale-[0.98] transition-transform shadow-md"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <Link
              to="/forgot-password"
              className="inline-block py-1 text-sm font-medium text-primary hover:underline active:opacity-70"
            >
              Forgot password?
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
