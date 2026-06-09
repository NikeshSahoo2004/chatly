import React from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { ChatDashboard } from '../pages/ChatDashboard';

// Route wrapper for pages restricted to logged-in users only
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-sky-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Route wrapper for pages restricted to guests/unauthenticated users only
export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-sky-500"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
};

// Application Client Router mapping
export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        <Login />
      </PublicRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicRoute>
        <Register />
      </PublicRoute>
    ),
  },
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/chat" replace />,
  },
]);
