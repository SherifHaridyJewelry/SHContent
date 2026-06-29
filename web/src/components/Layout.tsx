import { NavLink, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import JobPolling from "./JobPolling";
import { useActiveTaskCount } from "../stores/jobStore";

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "active" : undefined;
}

function SidebarNav() {
  const activeCount = useActiveTaskCount();

  return (
    <nav>
      <NavLink to="/" end className={navClass}>
        Products
      </NavLink>
      <NavLink to="/templates" className={navClass}>
        Templates
      </NavLink>
      <NavLink to="/generate" className={navClass}>
        Generate
      </NavLink>
      <NavLink to="/tasks" className={navClass}>
        Tasks
        {activeCount > 0 && (
          <span className="nav-badge">{activeCount} running</span>
        )}
      </NavLink>
      <NavLink to="/catalog" className={navClass}>
        Catalog
      </NavLink>
      <NavLink to="/review" className={navClass}>
        Review
      </NavLink>
    </nav>
  );
}

export default function Layout() {
  return (
    <div className="layout">
      <JobPolling />
      <aside className="sidebar">
        <h1>Jewelry Workflow</h1>
        <SidebarNav />
      </aside>
      <main className="main">
        <Outlet />
        <Toaster position="top-right" richColors />
      </main>
    </div>
  );
}
