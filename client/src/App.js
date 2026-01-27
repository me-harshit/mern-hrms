import './styles/App.css';
import './styles/Navigation.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Attendance from './pages/Attendance';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import LeaveRequests from './pages/LeaveRequests';
import CalendarPage from './pages/CalendarPage';
import AdminSettings from './pages/AdminSettings';
import AttendanceLogs from './pages/AttendanceLogs';

// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';

// Layout Component 
const DashboardLayout = () => (
  <div className="app-container">
    <Sidebar />
    <div className="content-wrapper">
      <Topbar />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  </div>
);

function App() {
  const isAuthenticated = !!localStorage.getItem('token');
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch (e) {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }
  const userRole = user?.role;

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Dashboard Section (Requires Login) */}
        <Route element={<ProtectedRoute isAllowed={isAuthenticated} />}>
          <Route element={<DashboardLayout />}>

            {/* Common Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/leaves" element={<Leaves />} />

            {/* HR & Admin Only Route */}
            <Route
              path="/employees"
              element={
                (userRole === 'HR' || userRole === 'ADMIN')
                  ? <Employees />
                  : <Navigate to="/dashboard" />
              }
            />
            <Route
              path="/attendance-logs"
              element={
                (userRole === 'HR' || userRole === 'ADMIN')
                  ? <AttendanceLogs />
                  : <Navigate to="/dashboard" />
              }
            />
            <Route
              path="/admin-settings"
              element={
                userRole === 'ADMIN'
                  ? <AdminSettings />
                  : <Navigate to="/dashboard" />
              }
            />
            <Route
              path="/leave-requests"
              element={
                (userRole === 'HR' || userRole === 'ADMIN')
                  ? <LeaveRequests />
                  : <Navigate to="/dashboard" />
              }
            />

          </Route>
        </Route>

        {/* Fallback - Redirect any unknown route to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;