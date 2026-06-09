import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import { HotstarLogo } from '../components/HotstarLogo';
import { ThemeToggle } from '../components/ThemeToggle';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, error, clearError, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    if (!email || !password) {
      setValidationError('All fields are required');
      return;
    }

    try {
      await login({ email, password });
      navigate('/chat');
    } catch {
      // Handled by store state
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-y-auto overflow-x-hidden hs-app font-sans">
      <div className="absolute top-[-15%] left-[-10%] h-[55%] w-[55%] hs-bg-glow-1 glow-bg" />
      <div className="absolute bottom-[-15%] right-[-10%] h-[55%] w-[55%] hs-bg-glow-2 glow-bg" />

      <header className="hs-topbar relative z-10">
        <HotstarLogo size="sm" />
        <ThemeToggle />
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="hs-card p-6 sm:p-8">
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="text-2xl font-extrabold tracking-tight hs-gradient-text sm:text-3xl">
                Welcome back
              </h1>
              <p className="mt-2 text-sm hs-text-muted">
                Sign in to continue your premium chat experience
              </p>
            </div>

            {(validationError || error) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-500 dark:text-red-400"
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{validationError || error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider hs-text-secondary">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 hs-text-muted">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="hs-input py-2.5 pl-10 pr-4 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider hs-text-secondary">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 hs-text-muted">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="hs-input py-2.5 pl-10 pr-4 text-sm"
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="hs-btn-primary mt-2 w-full py-3">
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm hs-text-muted">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                onClick={clearError}
                className="font-semibold hs-gradient-text hover:opacity-80"
              >
                Sign up
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
