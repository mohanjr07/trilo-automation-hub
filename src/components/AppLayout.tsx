import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, CheckSquare, Users, Calendar, BarChart3,
  Settings, User, Bell, LogOut, Menu, X, Video, StickyNote, ClipboardList, FolderKanban, Network, Boxes, Target, FileText, Workflow, Route as RouteIcon, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "@/components/UserAvatar";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

type NavItem = { label: string; path: string; icon: typeof LayoutDashboard };

const adminNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Organisation Flow", path: "/organisation-flow", icon: Network },
  { label: "Assets", path: "/assets", icon: Boxes },
  { label: "KRA & KPI", path: "/kra-kpi", icon: Target },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Users", path: "/users", icon: Users },
  { label: "Team Members", path: "/team-members", icon: Workflow },
  { label: "Sales Tracker", path: "/sales-tracker", icon: RouteIcon },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "Leave", path: "/leave", icon: Calendar },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Notes", path: "/notes", icon: StickyNote },
  { label: "Settings", path: "/settings", icon: Settings },
];

const superAdminNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Organisation Flow", path: "/organisation-flow", icon: Network },
  { label: "Assets", path: "/assets", icon: Boxes },
  { label: "KRA & KPI", path: "/kra-kpi", icon: Target },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Users", path: "/users", icon: Users },
  { label: "Team Members", path: "/team-members", icon: Workflow },
  { label: "Sales Tracker", path: "/sales-tracker", icon: RouteIcon },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "All Leaves", path: "/leave", icon: Calendar },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Notes", path: "/notes", icon: StickyNote },
  { label: "Settings", path: "/settings", icon: Settings },
];

const managerNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Organisation Flow", path: "/organisation-flow", icon: Network },
  { label: "My Tasks", path: "/my-tasks", icon: ClipboardList },
  { label: "Assets", path: "/assets", icon: Boxes },
  { label: "KRA & KPI", path: "/kra-kpi", icon: Target },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Team Members", path: "/team-members", icon: Workflow },
  { label: "Sales Tracker", path: "/sales-tracker", icon: RouteIcon },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "All Leaves", path: "/leave", icon: Calendar },
  { label: "My Leave", path: "/my-leave", icon: Calendar },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Notes", path: "/notes", icon: StickyNote },
  { label: "Settings", path: "/settings", icon: Settings },
];

const employeeNav: NavItem[] = [
  { label: "Dashboard", path: "/my-dashboard", icon: LayoutDashboard },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "My Tasks", path: "/my-tasks", icon: ClipboardList },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Organisation Flow", path: "/organisation-flow", icon: Network },
  { label: "KRA & KPI", path: "/kra-kpi", icon: Target },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Team Members", path: "/team-members", icon: Workflow },
  { label: "Sales Tracker", path: "/sales-tracker", icon: RouteIcon },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Calendar", path: "/calendar", icon: Calendar },
  { label: "Leave", path: "/my-leave", icon: Calendar },
  { label: "Notes", path: "/notes", icon: StickyNote },
  { label: "Profile", path: "/profile", icon: User },
];

const internNav: NavItem[] = [
  { label: "Dashboard", path: "/intern-dashboard", icon: LayoutDashboard },
  { label: "My Tasks", path: "/intern-tasks", icon: CheckSquare },
  { label: "Projects", path: "/projects", icon: FolderKanban },
  { label: "Organisation Flow", path: "/organisation-flow", icon: Network },
  { label: "KRA & KPI", path: "/kra-kpi", icon: Target },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Sales Tracker", path: "/sales-tracker", icon: RouteIcon },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Notes", path: "/notes", icon: StickyNote },
  { label: "Profile", path: "/profile", icon: User },
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  usePushNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark")
  );
  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";
  const isIntern = profile?.role === "intern";
  const baseNav = isSuperAdmin ? superAdminNav : isAdmin ? adminNav : isManager ? managerNav : isIntern ? internNav : employeeNav;
  // Sales Tracker is only useful to people the admin has put in the "Sales"
  // department, plus team heads (admin/super_admin/manager) who need it to
  // see their team's status and site visits.
  const isSalesDept = (profile?.department ?? "").trim().toLowerCase() === "sales";
  const canSeeSalesTracker = isSuperAdmin || isAdmin || isManager || isSalesDept;
  const nav = canSeeSalesTracker ? baseNav : baseNav.filter((item) => item.path !== "/sales-tracker");

  const primaryTabs = isIntern
    ? [
        { label: "Dashboard", path: "/intern-dashboard", icon: LayoutDashboard },
        { label: "Tasks", path: "/intern-tasks", icon: CheckSquare },
        { label: "Projects", path: "/projects", icon: FolderKanban },
        { label: "Notes", path: "/notes", icon: StickyNote },
      ]
    : isSuperAdmin || isAdmin
    ? [
        { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { label: "Tasks", path: "/tasks", icon: CheckSquare },
        { label: "Projects", path: "/projects", icon: FolderKanban },
        { label: "Users", path: "/users", icon: Users },
      ]
    : isManager
    ? [
        { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { label: "Tasks", path: "/tasks", icon: CheckSquare },
        { label: "My Tasks", path: "/my-tasks", icon: ClipboardList },
        { label: "Projects", path: "/projects", icon: FolderKanban },
      ]
    : [
        { label: "Dashboard", path: "/my-dashboard", icon: LayoutDashboard },
        { label: "My Tasks", path: "/my-tasks", icon: ClipboardList },
        { label: "Projects", path: "/projects", icon: FolderKanban },
        { label: "Calendar", path: "/calendar", icon: Calendar },
      ];

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card z-30">
        <div className="flex h-[60px] items-center border-b border-border px-3">
          {/* Both logos are always mounted — we just toggle visibility via CSS
              so the browser never has to re-fetch/decode on theme switch. */}
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Magic Aisles"
            style={{ width: "140px", height: "auto" }}
            className={cn("object-contain transition-opacity duration-150", isDark ? "opacity-0 absolute" : "opacity-100")}
            fetchPriority="high"
            decoding="sync"
          />
          <img
            src={`${import.meta.env.BASE_URL}logo-dark.png`}
            alt="Magic Aisles"
            style={{ width: "140px", height: "auto" }}
            className={cn("object-contain transition-opacity duration-150", isDark ? "opacity-100" : "opacity-0 absolute")}
            fetchPriority="high"
            decoding="sync"
          />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "text-primary" : "text-ink-secondary hover:bg-muted hover:text-ink-primary"
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-lg bg-accent-light"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <item.icon className="relative z-10 h-[18px] w-[18px]" />
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <UserAvatar name={profile?.full_name ?? ""} avatarUrl={profile?.avatar_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-primary">{profile?.full_name}</p>
              <p className="truncate text-xs text-ink-muted capitalize">{profile?.role}</p>
            </div>
            <button onClick={handleSignOut} className="text-ink-muted hover:text-destructive transition-colors" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink-primary/30 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-card border-r border-border z-50 flex flex-col md:hidden pt-safe pb-safe shadow-2xl"
          >
            <div className="flex h-[60px] items-center justify-between px-3 border-b border-border">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Magic Aisles"
                style={{ width: "140px", height: "auto" }}
                className={cn("object-contain transition-opacity duration-150", isDark ? "opacity-0 absolute" : "opacity-100")}
                fetchPriority="high"
                decoding="sync"
              />
              <img
                src={`${import.meta.env.BASE_URL}logo-dark.png`}
                alt="Magic Aisles"
                style={{ width: "140px", height: "auto" }}
                className={cn("object-contain transition-opacity duration-150", isDark ? "opacity-100" : "opacity-0 absolute")}
                fetchPriority="high"
                decoding="sync"
              />
              <button
                onClick={() => setSidebarOpen(false)}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary active:bg-muted transition-colors z-10"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {nav.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]",
                          active ? "bg-accent-light text-primary" : "text-ink-secondary hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                <UserAvatar name={profile?.full_name ?? ""} avatarUrl={profile?.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-primary">{profile?.full_name}</p>
                  <p className="truncate text-xs text-ink-muted capitalize">{profile?.role}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="h-8 w-8 flex items-center justify-center text-ink-muted hover:text-destructive active:scale-95 transition-colors"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-20 flex pt-safe h-[calc(56px+env(safe-area-inset-top,0px))] md:h-[60px] items-center gap-2 sm:gap-3 border-b border-border bg-card/90 backdrop-blur-md px-3 sm:px-4 md:px-8">
          <button
            className="md:hidden text-ink-secondary h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted active:scale-95 transition-transform"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-heading text-base sm:text-lg font-semibold text-ink-primary truncate flex-1 md:flex-none">
            {nav.find((n) => n.path === location.pathname)?.label ?? "Task Flow"}
          </h1>
          <div className="hidden md:flex flex-1" />
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />
            <Link to="/profile" className="ml-1 active:scale-95 transition-transform">
              <UserAvatar name={profile?.full_name ?? ""} avatarUrl={profile?.avatar_url} size="sm" />
            </Link>
          </div>
        </header>

        <main className="flex-1 px-3 sm:px-4 py-4 sm:py-6 md:px-8 md:py-8 max-w-[1280px] mx-auto w-full min-w-0 overflow-x-hidden pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 flex md:hidden border-t border-border bg-card/95 backdrop-blur-md z-30 pb-safe shadow-lg">
        {primaryTabs.map((item) => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] sm:text-[11px] font-medium transition-colors active:scale-95",
                active ? "text-primary" : "text-ink-muted hover:text-ink-primary"
              )}
            >
              <div className={cn("p-1 rounded-full transition-colors", active ? "bg-accent-light text-primary" : "")}>
                <item.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <span className="truncate max-w-[56px] sm:max-w-[70px]">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] sm:text-[11px] font-medium transition-colors active:scale-95 text-ink-muted hover:text-ink-primary"
        >
          <div className="p-1 rounded-full">
            <Menu className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </div>
          <span>More</span>
        </button>
      </div>

    </div>
  );
}
