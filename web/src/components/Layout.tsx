import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import JobPolling from "./JobPolling";
import { useActiveTaskCount } from "../stores/jobStore";
import { usePendingReviewCount } from "../hooks/usePendingReviewCount";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : undefined;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const activeCount = useActiveTaskCount();
  const pendingReview = usePendingReviewCount();

  return (
    <nav aria-label="Main">
      <p className="nav-section">Library</p>
      <NavLink to="/products" className={navClass} onClick={onNavigate}>
        Products
      </NavLink>

      <p className="nav-section">Style</p>
      <NavLink to="/templates" className={navClass} onClick={onNavigate}>
        Templates
      </NavLink>

      <p className="nav-section">Produce</p>
      <NavLink to="/studio" className={navClass} onClick={onNavigate}>
        Studio
        {activeCount > 0 && (
          <span className="nav-badge">{activeCount}</span>
        )}
      </NavLink>

      <p className="nav-section">Curate</p>
      <NavLink to="/outputs" className={navClass} onClick={onNavigate}>
        Outputs
        {pendingReview > 0 && (
          <span className="nav-badge">{pendingReview}</span>
        )}
      </NavLink>
    </nav>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="layout">
      <JobPolling />
      <header className="mobile-topbar">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <span className="mobile-topbar-title">Jewelry Workflow</span>
      </header>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar${mobileOpen ? " sidebar-open" : ""}`}>
        <h1>Jewelry Workflow</h1>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
      </aside>
      <main className="main">
        <Outlet />
        <Toaster position="top-right" richColors />
      </main>
    </div>
  );
}
