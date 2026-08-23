import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Components from "./pages/Components";
import Departments from "./pages/Departments";
import Courses from "./pages/Courses";
import Sections from "./pages/Sections";
import Labs from "./pages/Labs";
import RoutineSlots from "./pages/RoutineSlots";

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

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
