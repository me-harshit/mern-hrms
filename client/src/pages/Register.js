import '../styles/Auth.css';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';

const Register = () => {
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', email: '', password: '', department: ''
    });
    const navigate = useNavigate();

    const handleRegister = (e) => {
        e.preventDefault();
        // UI simulation
        Swal.fire({
            title: 'Success!',
            text: 'Registration successful (UI Mode). Redirecting to Login...',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });
        setTimeout(() => navigate('/login'), 2000);
    };

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Employee Registration</h2>
                <form onSubmit={handleRegister} style={formStyle}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="text" placeholder="First Name" style={inputStyle} required 
                            onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
                        <input type="text" placeholder="Last Name" style={inputStyle} required 
                            onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
                    </div>
                    <input type="email" placeholder="Work Email" style={inputStyle} required 
                        onChange={(e) => setFormData({...formData, email: e.target.value})} />
                    <input type="password" placeholder="Password" style={inputStyle} required 
                        onChange={(e) => setFormData({...formData, password: e.target.value})} />
                    <select style={inputStyle} required onChange={(e) => setFormData({...formData, department: e.target.value})}>
                        <option value="">Select Department</option>
                        <option value="IT">IT</option>
                        <option value="HR">HR</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Sales">Sales</option>
                    </select>
                    <button style={btnStyle} type="submit">Register Now</button>
                </form>
                <p style={{ textAlign: 'center', marginTop: '15px' }}>
                    Already have an account? <Link to="/login" style={{color: '#007bff'}}>Login here</Link>
                </p>
            </div>
        </div>
    );
};

// Internal styles for now
const containerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f4f7f6' };
const cardStyle = { background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', width: '450px' };
const formStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const inputStyle = { padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px' };
const btnStyle = { background: '#007bff', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };

export default Register;