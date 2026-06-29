import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Loading } from "@/components/ui/Loading";

const Catalog = lazy(() => import("./pages/Catalog"));
const Generate = lazy(() => import("./pages/Generate"));
const Products = lazy(() => import("./pages/Products"));
const Review = lazy(() => import("./pages/Review"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-4xl font-bold text-muted-foreground mb-4">404</h1>
      <p className="text-lg text-muted-foreground mb-6">Page not found</p>
      <a href="/" className="text-primary underline-offset-4 hover:underline">Go to Products</a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={
          <Suspense fallback={<Loading variant="skeleton" message="Loading products..." />}>
            <Products />
          </Suspense>
        } />
        <Route path="templates" element={
          <Suspense fallback={<Loading variant="skeleton-grid" message="Loading templates..." />}>
            <Templates />
          </Suspense>
        } />
        <Route path="templates/:name" element={
          <Suspense fallback={<Loading variant="skeleton" message="Loading template..." />}>
            <TemplateDetail />
          </Suspense>
        } />
        <Route path="generate" element={
          <Suspense fallback={<Loading variant="skeleton" message="Loading generator..." />}>
            <Generate />
          </Suspense>
        } />
        <Route path="tasks" element={
          <Suspense fallback={<Loading variant="spinner" message="Loading tasks..." />}>
            <Tasks />
          </Suspense>
        } />
        <Route path="tasks/scene-plate/:scenePlateJobId" element={
          <Suspense fallback={<Loading variant="spinner" message="Loading..." />}>
            <Tasks />
          </Suspense>
        } />
        <Route path="tasks/:jobId" element={
          <Suspense fallback={<Loading variant="spinner" message="Loading..." />}>
            <Tasks />
          </Suspense>
        } />
        <Route path="catalog" element={
          <Suspense fallback={<Loading variant="skeleton-grid" message="Loading catalog..." />}>
            <Catalog />
          </Suspense>
        } />
        <Route path="review" element={
          <Suspense fallback={<Loading variant="skeleton-list" message="Loading reviews..." />}>
            <Review />
          </Suspense>
        } />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}