import React from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUserRole } from '../utils/auth';

const HomeRedirect = () => {
    const token = getToken();
    const role = getUserRole();

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    // Redirect user to their designated starting page
    if (['user', 'expert', 'vendor'].includes(role)) {
        return <Navigate to="/tasks" replace />;
    }

    if (role === 'admin') {
        return <Navigate to="/dashboard" replace />;
    }

    // Fallback for any other roles or if role is not set
    return <Navigate to="/login" replace />;
};

export default HomeRedirect;
