import './styles/App.css';
import './styles/Navigation.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'; // Added Outlet here

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
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
  // Mocking auth and role for now
  const isAuthenticated = !!localStorage.getItem('token'); 
  const userRole = 'ADMIN'; 

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Dashboard Section (Requires Login) */}
        <Route element={<ProtectedRoute isAllowed={isAuthenticated} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/attendance" element={<Attendance />} />
            
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