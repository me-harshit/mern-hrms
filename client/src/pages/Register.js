import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Swal from 'sweetalert2';
import '../styles/Auth.css';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', role: 'EMPLOYEE'
    });
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:5000/api/auth/register', formData);
            
            Swal.fire({
                title: 'Success!',
                text: 'Registration successful. You can now login.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                iconColor: '#A6477F'
            });
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Registration Failed',
                text: err.response?.data?.message || 'Email already exists',
                confirmButtonColor: '#215D7B'
            });
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card" style={{ borderTopColor: 'var(--secondary)' }}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <img src="/GTS.png" alt="GTS Logo" style={{ height: '50px' }} />
                </div>
                <h2>Create Account</h2>
                <p className="auth-subtitle">Join the GTS HR Management System.</p>

                <form onSubmit={handleRegister}>
                    <div className="form-group">
                        <label>Full Name</label>
                        <input type="text" className="auth-input" placeholder="Full Name" required 
                            onChange={(e) => setFormData({...formData, name: e.target.value})} />
                    </div>
                    
                    <div className="form-group">
                        <label>Work Email</label>
                        <input type="email" className="auth-input" placeholder="email@gts.com" required 
                            onChange={(e) => setFormData({...formData, email: e.target.value})} />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" className="auth-input" placeholder="Create Password" required 
                            onChange={(e) => setFormData({...formData, password: e.target.value})} />
                    </div>

                    <div className="form-group">
                        <label>Select Role</label>
                        <select className="auth-select" required onChange={(e) => setFormData({...formData, role: e.target.value})}>
                            <option value="EMPLOYEE">Employee</option>
                            <option value="HR">HR Manager</option>
                            <option value="ADMIN">Administrator</option>
                        </select>
                    </div>

                    <button className="auth-btn" style={{ background: 'var(--secondary)' }} type="submit">Register Now</button>
                </form>

                <div className="auth-footer">
                    Already have an account? <Link to="/login" className="auth-link">Login here</Link>
                </div>
            </div>
        </div>
    );
};

export default Register;