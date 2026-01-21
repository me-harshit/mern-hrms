import React from 'react';

const Profile = () => {
    // Hardcoded for UI Phase
    const user = {
        name: "John Doe",
        email: "john.doe@office.com",
        role: "Software Engineer",
        dept: "IT",
        joined: "January 15, 2024"
    };

    return (
        <div>
            <h1>My Profile</h1>
            <div style={profileCard}>
                <div style={avatarStyle}>{user.name.charAt(0)}</div>
                <div style={{ flexGrow: 1 }}>
                    <h2 style={{ margin: '0 0 10px 0' }}>{user.name}</h2>
                    <p><strong>Role:</strong> {user.role}</p>
                    <p><strong>Department:</strong> {user.dept}</p>
                    <p><strong>Email:</strong> {user.email}</p>
                    <p><strong>Joined Date:</strong> {user.joined}</p>
                </div>
                <button style={editBtn}>Edit Profile</button>
            </div>
        </div>
    );
};

const profileCard = { display: 'flex', gap: '30px', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', alignItems: 'center', marginTop: '20px' };
const avatarStyle = { width: '100px', height: '100px', background: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '40px', borderRadius: '50%' };
const editBtn = { alignSelf: 'flex-start', background: '#f1f2f6', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' };

export default Profile;