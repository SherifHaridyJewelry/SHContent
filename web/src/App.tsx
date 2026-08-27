import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import { Loading } from "@/components/ui/Loading";

const Products = lazy(() => import("./pages/Products"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));
const Studio = lazy(() => import("./pages/Studio"));
const Outputs = lazy(() => import("./pages/Outputs"));
const Settings = lazy(() => import("./pages/Settings"));

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-4xl font-bold text-muted-foreground mb-4">404</h1>
      <p className="text-lg text-muted-foreground mb-6">Page not found</p>
      <a href="/products" className="text-primary underline-offset-4 hover:underline">
        Go to Products
      </a>
    </div>
  );
}

function RedirectTasksJob() {
  const { jobId } = useParams();
  return <Navigate to={`/studio/jobs/${jobId}`} replace />;
}

function RedirectTasksScenePlate() {
  const { scenePlateJobId } = useParams();
  return <Navigate to={`/studio/jobs/scene-plate/${scenePlateJobId}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route
          path="products"
          element={
            <Suspense fallback={<Loading variant="skeleton" message="Loading products..." />}>
              <Products />
            </Suspense>
          }
        />
        <Route
          path="templates"
          element={
            <Suspense fallback={<Loading variant="skeleton-grid" message="Loading templates..." />}>
              <Templates />
            </Suspense>
          }
        />
        <Route
          path="templates/:name"
          element={
            <Suspense fallback={<Loading variant="skeleton" message="Loading template..." />}>
              <TemplateDetail />
            </Suspense>
          }
        />
        <Route
          path="studio"
          element={
            <Suspense fallback={<Loading variant="skeleton" message="Loading studio..." />}>
              <Studio />
            </Suspense>
          }
        />
        <Route
          path="studio/jobs/:jobId"
          element={
            <Suspense fallback={<Loading variant="spinner" message="Loading job..." />}>
              <Studio />
            </Suspense>
          }
        />
        <Route
          path="studio/jobs/scene-plate/:scenePlateJobId"
          element={
            <Suspense fallback={<Loading variant="spinner" message="Loading job..." />}>
              <Studio />
            </Suspense>
          }
        />
        <Route
          path="outputs"
          element={
            <Suspense fallback={<Loading variant="skeleton-grid" message="Loading outputs..." />}>
              <Outputs />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<Loading variant="skeleton" message="Loading settings..." />}>
              <Settings />
            </Suspense>
          }
        />

        {/* Legacy redirects */}
        <Route path="generate" element={<Navigate to="/studio?tab=batch" replace />} />
        <Route path="tasks" element={<Navigate to="/studio?tab=jobs" replace />} />
        <Route path="tasks/:jobId" element={<RedirectTasksJob />} />
        <Route path="tasks/scene-plate/:scenePlateJobId" element={<RedirectTasksScenePlate />} />
        <Route path="catalog" element={<Navigate to="/outputs" replace />} />
        <Route path="review" element={<Navigate to="/outputs?tab=failed" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
