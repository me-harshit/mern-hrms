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
import AbsentEmployees from './pages/AbsentEmployees';
import EmployeeProfile from './pages/EmployeeProfile';
import Expenses from './pages/Expenses';
import AdminExpenses from './pages/AdminExpenses';
import RawPunches from './pages/RawPunches';
import AddExpense from './pages/AddExpense';
import EditExpense from './pages/EditExpense';
import AdminChat from './pages/AdminChat'
import Projects from './pages/Projects';
import Inventory from './pages/Inventory';
import MyInventory from './pages/MyInventory';
import AddInventory from './pages/AddInventory';
import EditInventory from './pages/EditInventory';

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

          {/* ALL PAGES INSIDE HERE GET THE TOPBAR & SIDEBAR */}
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/my-inventory" element={<MyInventory />} />
            <Route path="/absent-employees" element={<AbsentEmployees />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/leaves" element={<Leaves />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/add-expense" element={<AddExpense />} />
            <Route path="/edit-expense/:id" element={<EditExpense />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/add-inventory" element={<AddInventory />} />
            <Route path="/edit-inventory/:id" element={<EditInventory />} />

            {/* ADDED MANAGER TO THE ALLOWED ROLES BELOW */}
            <Route
              path="/employees"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <Employees /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/employee/:id"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <EmployeeProfile /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/attendance-logs"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <AttendanceLogs /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/raw-punches"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <RawPunches /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/leave-requests"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <LeaveRequests /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/projects"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <Projects /> : <Navigate to="/dashboard" />}
            />
            <Route
              path="/admin-expenses"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <AdminExpenses /> : <Navigate to="/dashboard" />}
            />

            {/* LOCKED TO ADMIN ONLY */}
            <Route
              path="/admin-settings"
              element={userRole === 'ADMIN' ? <AdminSettings /> : <Navigate to="/dashboard" />}
            />

            {/* LOCKED TO HR & ADMIN */}
            <Route
              path="/admin-chat"
              element={(userRole === 'HR' || userRole === 'ADMIN') ? <AdminChat /> : <Navigate to="/dashboard" />}
            />

          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;