import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Components from "./pages/Components";
import Stocks from "./pages/Stocks";
import Quotas from "./pages/Quotas";
import Departments from "./pages/Departments";
import Courses from "./pages/Courses";
import Sections from "./pages/Sections";
import Labs from "./pages/Labs";
import RoutineSlots from "./pages/RoutineSlots";
import Experiments from "./pages/Experiments";
import ClassSessions from "./pages/ClassSessions";
import PeakClasses from "./pages/PeakClasses";
import Requisitions from "./pages/Requisitions";
import PurchaseRequests from "./pages/PurchaseRequests";
import BorrowRequests from "./pages/BorrowRequests";
import Users from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/stocks"
        element={
          <ProtectedRoute>
            <Layout>
              <Stocks />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/quotas"
        element={
          <ProtectedRoute>
            <Layout>
              <Quotas />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/components"
        element={
          <ProtectedRoute>
            <Layout>
              <Components />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/departments"
        element={
          <ProtectedRoute>
            <Layout>
              <Departments />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/courses"
        element={
          <ProtectedRoute>
            <Layout>
              <Courses />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sections"
        element={
          <ProtectedRoute>
            <Layout>
              <Sections />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/labs"
        element={
          <ProtectedRoute>
            <Layout>
              <Labs />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/routine-slots"
        element={
          <ProtectedRoute>
            <Layout>
              <RoutineSlots />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/experiments"
        element={
          <ProtectedRoute>
            <Layout>
              <Experiments />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sessions"
        element={
          <ProtectedRoute>
            <Layout>
              <ClassSessions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/peak-classes"
        element={
          <ProtectedRoute>
            <Layout>
              <PeakClasses />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/requisitions"
        element={
          <ProtectedRoute>
            <Layout>
              <Requisitions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/purchase-requests"
        element={
          <ProtectedRoute>
            <Layout>
              <PurchaseRequests />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/borrow-requests"
        element={
          <ProtectedRoute>
            <Layout>
              <BorrowRequests />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
