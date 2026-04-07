import './styles/App.css';
import './styles/Navigation.css';
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/User/Profile';
import Attendance from './pages/User/Attendance';
import Employees from './pages/Admin/Employees';
import Leaves from './pages/User/Leaves';
import EmployeeRequests from './pages/Admin/EmployeeRequests';
import WorkFromHome from './pages/User/WorkFromHome';
import CalendarPage from './pages/CalendarPage';
import AdminSettings from './pages/Admin/AdminSettings';
import AttendanceLogs from './pages/Admin/AttendanceLogs';
import AbsentEmployees from './pages/Admin/AbsentEmployees';
import EmployeeProfile from './pages/Admin/EmployeeProfile';
import EditEmployee from './pages/Admin/EditEmployee'; 
import Expenses from './pages/User/Expenses';
import AdminExpenses from './pages/Admin/AdminExpenses';
import AllExpenses from './pages/Admin/AllExpenses';
import RawPunches from './pages/Admin/RawPunches';
import AddExpense from './pages/User/AddExpense';
import EditExpense from './pages/User/EditExpense';
import AdminChat from './pages/Admin/AdminChat'
import Projects from './pages/Admin/Projects';
import Inventory from './pages/Admin/Inventory';
import MyInventory from './pages/User/MyInventory';
import AddInventory from './pages/Admin/AddInventory';
import EditInventory from './pages/Admin/EditInventory';
import Reimbursements from './pages/Admin/Reimbursements';

// Components
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';

// 👇 NEW: Impersonation Banner Component
const ImpersonationBanner = () => {
  const isImpersonating = localStorage.getItem('is_impersonating') === 'true';
  const currentUser = JSON.parse(localStorage.getItem('user'));

  if (!isImpersonating) return null;

  const handleReturnToAdmin = () => {
    // 1. Restore the Admin credentials
    const adminToken = localStorage.getItem('admin_token_backup');
    const adminUser = localStorage.getItem('admin_user_backup');

    if (adminToken && adminUser) {
      localStorage.setItem('token', adminToken);
      localStorage.setItem('user', adminUser);
    }

    // 2. Clean up the backups
    localStorage.removeItem('admin_token_backup');
    localStorage.removeItem('admin_user_backup');
    localStorage.removeItem('is_impersonating');

    // 3. Hard reload back to the Admin Employee list
    window.location.href = '/employees';
  };

  return (
    <div style={{
      background: '#dc2626', 
      color: 'white',
      padding: '10px 20px',
      textAlign: 'center',
      zIndex: 9999,
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '15px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }}>
      <span style={{ fontSize: '14px' }}>
        ⚠️ You are currently viewing the system as <strong>{currentUser?.name}</strong>.
      </span>
      <button 
        onClick={handleReturnToAdmin} 
        style={{
          padding: '6px 12px', background: 'white', color: '#dc2626', 
          border: 'none', borderRadius: '4px', cursor: 'pointer', 
          fontWeight: 'bold', fontSize: '13px', transition: '0.2s'
        }}
      >
        Return to Admin
      </button>
    </div>
  );
};

// Layout Component manages the mobile sidebar state
const DashboardLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      <ImpersonationBanner />

      <div className="app-container" style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Background overlay for mobile drawer */}
        <div
          className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`}
          onClick={closeSidebar}
        />

        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        {/* 👇 FIXED: Made the wrapper a flex column that hides overflow */}
        <div className="content-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar onToggleSidebar={toggleSidebar} />
          
          {/* 👇 FIXED: Forced the main content area to handle the vertical scrolling */}
          <div className="main-content" style={{ flex: 1, overflowY: 'auto', paddingBottom: '30px' }}>
            <Outlet />
          </div>
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
            <Route path="/wfh" element={<WorkFromHome />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/add-expense" element={<AddExpense />} />
            <Route path="/edit-expense/:id" element={<EditExpense />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/reimbursements" element={<Reimbursements />} />
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
              path="/edit-employee/:id"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <EditEmployee /> : <Navigate to="/dashboard" />}
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
              path="/Employee-requests"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <EmployeeRequests /> : <Navigate to="/dashboard" />}
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
            <Route
              path="/all-expenses"
              element={(userRole === 'HR' || userRole === 'ADMIN' || userRole === 'MANAGER') ? <AllExpenses /> : <Navigate to="/dashboard" />}
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