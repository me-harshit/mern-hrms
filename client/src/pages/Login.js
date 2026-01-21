import '../styles/Auth.css';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const Login = () => {
    const navigate = useNavigate();

    const handleLoginStub = (e) => {
        e.preventDefault();
        Swal.fire('Success', 'Logged in (UI Mode)', 'success');
        navigate('/dashboard');
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '90vh' }}>
            <div style={{ background: '#fff', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '350px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Login</h2>
                <form onSubmit={handleLoginStub} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <input type="email" placeholder="Email" style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ddd' }} required />
                    <input type="password" placeholder="Password" style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ddd' }} required />
                    <button style={{ background: '#007bff', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' }} type="submit">
                        Enter Dashboard
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;