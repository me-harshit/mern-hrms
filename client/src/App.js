import './styles/App.css';
import './styles/Navigation.css';
import CalendarPage from './pages/CalendarPage';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Attendance from './pages/Attendance';


// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';

// Layout Component 
// The <Outlet /> is a placeholder that renders whatever child route is currently active
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
  const user = JSON.parse(localStorage.getItem('user'));
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/leaves" element={<Leaves />} />

            {/* Role-Based Routes can be added here */}
            {userRole === 'ADMIN' && (
              <Route path="/employees" element={<h1>Employee Management</h1>} />
            )}
          </Route>
        </Route>

        {/* Fallback - Redirect any unknown route to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;