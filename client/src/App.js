import './styles/App.css';
import './styles/Navigation.css';
import React, { useState } from 'react';
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
import EmployeeProfile from './pages/EmployeeProfile';
import Purchases from './pages/Purchases';
import AdminPurchases from './pages/AdminPurchases';
import RawPunches from './pages/RawPunches';
import AddPurchase from './pages/AddPurchase';

// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';

// Layout Component manages the mobile sidebar state
const DashboardLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-container">
      {/* Background overlay for mobile drawer */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} 
        onClick={closeSidebar}
      />
      
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      
      <div className="content-wrapper">
        <Topbar onToggleSidebar={toggleSidebar} />
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

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
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute isAllowed={isAuthenticated} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/leaves" element={<Leaves />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/add-purchase" element={<AddPurchase />} />

            <Route
              path="/employees"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <Employees /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/employee/:id"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <EmployeeProfile /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/attendance-logs"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <AttendanceLogs /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/raw-punches"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <RawPunches /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/leave-requests"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <LeaveRequests /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/admin-settings"
              element={userRole === 'ADMIN' ? <AdminSettings /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/admin-purchases"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <AdminPurchases /> : <Navigate to="/dashboard" />}
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;