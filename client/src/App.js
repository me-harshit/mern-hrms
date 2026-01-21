import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login'; 

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
        
        {/* Protected UI Routes */}
        <Route path="/dashboard" element={
            <DashboardLayout>
                <h1>Welcome to Dashboard</h1>
            </DashboardLayout>
        } />
        
        <Route path="/" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;