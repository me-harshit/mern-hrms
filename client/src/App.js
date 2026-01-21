import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';

// A simple wrapper to add Sidebar to certain pages
const DashboardLayout = ({ children }) => (
  <div style={{ display: 'flex' }}>
    <Sidebar />
    <div style={{ marginLeft: '250px', padding: '20px', width: '100%' }}>
      {children}
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
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

        <Route path="/" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;