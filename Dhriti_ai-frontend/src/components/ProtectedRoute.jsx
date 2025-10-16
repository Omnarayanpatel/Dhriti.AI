import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getUserRole } from '../utils/auth';

const ProtectedRoute = ({ allowedRoles = [], children }) => {
  const location = useLocation();
  const token = getToken();
  const role = getUserRole();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const roleAllowed = allowedRoles.length === 0 || (role && allowedRoles.includes(role));
  if (!roleAllowed) {
    if (role === 'admin') {
      return <Navigate to="/dashboard" replace />;
    }
    if (['user', 'expert', 'vendor'].includes(role)) {
      return <Navigate to="/tasks" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
