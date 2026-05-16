import { ReactNode, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Kanban, CheckSquare, Settings, LogOut, Menu, X, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/settings", label: "Settings", icon: Settings },
];
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleSignOut = async () => { await signOut(); navigate("/auth", { replace: true }); };
  return (
    <div className="min-h-screen flex bg-background">
      <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-ink text-primary shadow-elegant" aria-label="Toggle menu">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <aside className={cn("fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-ink text-sidebar-foreground flex flex-col transition-transform", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="px-6 py-6 border-b border-sidebar-border">
          <Link to="/dashboard" onClick={() => setMobileOpen(false)}><Brand className="h-10 w-auto max-w-[180px] object-contain invert brightness-0" /></Link>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-smooth", isActive ? "bg-gold text-ink" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
              <item.icon className="h-4 w-4" />{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          <div className="px-2">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">{user?.email}</div>
            {isAdmin && <div className="inline-flex items-center gap-1 text-xs text-gold mt-1"><ShieldCheck className="h-3 w-3" /> Admin</div>}
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-gold">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />}
      <main className="flex-1 min-w-0">
        <div className="lg:hidden h-16" />
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
