import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Components = lazy(() => import("./pages/Components"));
const Stocks = lazy(() => import("./pages/Stocks"));
const Quotas = lazy(() => import("./pages/Quotas"));
const Departments = lazy(() => import("./pages/Departments"));
const Courses = lazy(() => import("./pages/Courses"));
const Sections = lazy(() => import("./pages/Sections"));
const Labs = lazy(() => import("./pages/Labs"));
const RoutineSlots = lazy(() => import("./pages/RoutineSlots"));
const Experiments = lazy(() => import("./pages/Experiments"));
const ClassSessions = lazy(() => import("./pages/ClassSessions"));
const PeakClasses = lazy(() => import("./pages/PeakClasses"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Requisitions = lazy(() => import("./pages/Requisitions"));
const DamageReports = lazy(() => import("./pages/DamageReports"));
const Suggestions = lazy(() => import("./pages/Suggestions"));
const Penalties = lazy(() => import("./pages/Penalties"));
const PurchaseRequests = lazy(() => import("./pages/PurchaseRequests"));
const BorrowRequests = lazy(() => import("./pages/BorrowRequests"));
const Users = lazy(() => import("./pages/Users"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));

function page(Page: LazyExoticComponent<ComponentType>) {
  return <Suspense fallback={<div className="space-y-4" aria-label="Loading page"><div className="h-9 w-64 animate-pulse rounded-xl bg-slate-200" /><div className="h-52 animate-pulse rounded-2xl bg-slate-200" /></div>}><Page /></Suspense>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
      <Route path="/dashboard" element={page(Dashboard)} />
      <Route path="/components" element={page(Components)} />
      <Route path="/stocks" element={page(Stocks)} />
      <Route path="/quotas" element={page(Quotas)} />
      <Route path="/departments" element={page(Departments)} />
      <Route path="/courses" element={page(Courses)} />
      <Route path="/sections" element={page(Sections)} />
      <Route path="/labs" element={page(Labs)} />
      <Route path="/routine-slots" element={page(RoutineSlots)} />
      <Route path="/experiments" element={page(Experiments)} />
      <Route path="/sessions" element={page(ClassSessions)} />
      <Route path="/peak-classes" element={page(PeakClasses)} />
      <Route path="/analytics" element={page(Analytics)} />
      <Route path="/requisitions" element={page(Requisitions)} />
      <Route path="/penalties" element={page(Penalties)} />
      <Route path="/suggestions" element={page(Suggestions)} />
      <Route path="/damage-reports" element={page(DamageReports)} />
      <Route path="/purchase-requests" element={page(PurchaseRequests)} />
      <Route path="/borrow-requests" element={page(BorrowRequests)} />
      <Route path="/users" element={page(Users)} />
      <Route path="/audit-logs" element={page(AuditLogs)} />
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
