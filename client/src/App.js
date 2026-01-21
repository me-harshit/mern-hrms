import './styles/App.css';
import './styles/Navigation.css';
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Attendance from './pages/Attendance';

const DashboardLayout = ({ children }) => (
    <div className="app-container">
        <Sidebar />
        <div className="content-wrapper">
            <Topbar />
            <div className="main-content">
                {children}
            </div>
        </div>
    </div>
);

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected UI Routes */}
        <Route path="/dashboard" element={
          <DashboardLayout>
            <h1>Welcome to Dashboard</h1>
          </DashboardLayout>
        } />
        <Route path="/profile" element={
          <DashboardLayout>
            <Profile />
          </DashboardLayout>
        } />
        <Route path="/attendance" element={
          <DashboardLayout>
            <Attendance />
          </DashboardLayout>
        } />

        <Route path="/" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;