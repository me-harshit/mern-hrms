import React, { useState } from 'react';
import api from '../utils/api'; 
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // Import Component
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'; // Import Icons
import '../styles/Auth.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    const [showPassword, setShowPassword] = useState(false);
    
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/auth/login', { email, password });
            
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));

            Swal.fire({
                icon: 'success',
                title: 'Welcome Back!',
                text: `Logged in as ${res.data.user.name}`,
                timer: 1500,
                showConfirmButton: false,
                iconColor: '#215D7B'
            });

            setTimeout(() => {
                navigate('/dashboard');
                window.location.reload();
            }, 1500);

        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: err.response?.data?.message || 'Invalid Credentials',
                confirmButtonColor: '#215D7B'
            });
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <img src="/GTS.png" alt="GTS Logo" style={{ height: '50px' }} />
                </div>
                <h2>Portal Login</h2>
                <p className="auth-subtitle">Welcome back! Please enter your details.</p>
                
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Email Address</label>
                        <input 
                            type="email" 
                            className="auth-input"
                            placeholder="e.g. employee@gts.com"
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type={showPassword ? "text" : "password"} 
                                className="auth-input"
                                placeholder="••••••••"
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                                style={{ paddingRight: '40px' }} 
                            />
                            
                            {/* Eye Icon */}
                            <span 
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '15px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    cursor: 'pointer',
                                    color: '#666'
                                }}
                            >
                                <FontAwesomeIcon icon={showPassword ? faEye : faEyeSlash} />
                            </span>
                        </div>
                    </div>

                    <button type="submit" className="auth-btn">Sign In</button>
                </form>
            </div>
        </div>
    );
};

export default Login;