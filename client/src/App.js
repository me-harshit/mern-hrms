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
import AddEmployee from './pages/Admin/AddEmployee';
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

        <div className="content-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar onToggleSidebar={toggleSidebar} />

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

  // Helper to check management roles (Now includes ACCOUNTS)
  const isManagement = ['HR', 'ADMIN', 'MANAGER', 'ACCOUNTS'].includes(userRole);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute isAllowed={isAuthenticated} />}>

          {/* ALL PAGES INSIDE HERE GET THE TOPBAR & SIDEBAR */}
          <Route element={<DashboardLayout />}>
            {/* Standard Employee Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/my-inventory" element={<MyInventory />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/leaves" element={<Leaves />} />
            <Route path="/wfh" element={<WorkFromHome />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/add-expense" element={<AddExpense />} />
            <Route path="/edit-expense/:id" element={<EditExpense />} />
            <Route path="/reimbursements" element={<Reimbursements />} />

            {/* 👇 Management Routes (Admin, HR, Manager, Accounts) */}
            <Route path="/employees" element={isManagement ? <Employees /> : <Navigate to="/dashboard" />} />
            <Route path="/add-employee" element={isManagement ? <AddEmployee /> : <Navigate to="/dashboard" />} />
            <Route path="/employee/:id" element={isManagement ? <EmployeeProfile /> : <Navigate to="/dashboard" />} />
            <Route path="/edit-employee/:id" element={isManagement ? <EditEmployee /> : <Navigate to="/dashboard" />} />
            <Route path="/attendance-logs" element={isManagement ? <AttendanceLogs /> : <Navigate to="/dashboard" />} />
            <Route path="/raw-punches" element={isManagement ? <RawPunches /> : <Navigate to="/dashboard" />} />
            <Route path="/absent-employees" element={isManagement ? <AbsentEmployees /> : <Navigate to="/dashboard" />} />
            <Route path="/Employee-requests" element={isManagement ? <EmployeeRequests /> : <Navigate to="/dashboard" />} />
            <Route path="/projects" element={isManagement ? <Projects /> : <Navigate to="/dashboard" />} />
            
            {/* Expense & Inventory Management */}
            <Route path="/admin-expenses" element={isManagement ? <AdminExpenses /> : <Navigate to="/dashboard" />} />
            <Route path="/all-expenses" element={isManagement ? <AllExpenses /> : <Navigate to="/dashboard" />} />
            <Route path="/inventory" element={isManagement ? <Inventory /> : <Navigate to="/dashboard" />} />
            <Route path="/add-inventory" element={isManagement ? <AddInventory /> : <Navigate to="/dashboard" />} />
            <Route path="/edit-inventory/:id" element={isManagement ? <EditInventory /> : <Navigate to="/dashboard" />} />

            {/* LOCKED TO ADMIN ONLY */}
            <Route path="/admin-settings" element={userRole === 'ADMIN' ? <AdminSettings /> : <Navigate to="/dashboard" />} />

            {/* LOCKED TO HR & ADMIN */}
            <Route path="/admin-chat" element={(userRole === 'HR' || userRole === 'ADMIN') ? <AdminChat /> : <Navigate to="/dashboard" />} />

          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;