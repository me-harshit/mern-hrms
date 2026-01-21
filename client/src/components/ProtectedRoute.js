import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = ({ isAllowed, redirectPath = '/login', children }) => {
    // If the condition (role or login) isn't met, redirect to login or home
    if (!isAllowed) {
        return <Navigate to={redirectPath} replace />;
    }

    // Otherwise, render the page (children) or the nested route (Outlet)
    return children ? children : <Outlet />;
};

export default ProtectedRoute;