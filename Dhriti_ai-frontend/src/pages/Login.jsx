import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, setUserRole } from '../utils/auth';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // frontend validation
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }
    const emailOk = /.+@.+\..+/.test(email);
    if (!emailOk) {
      setError('Please enter a valid email.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Login failed');
      }

      const data = await response.json();
      setToken(data.access_token);

      const userRole = data.role;
      if (userRole) {
        setUserRole(userRole);

        if (userRole === 'admin') {
          navigate('/dashboard');
        } else if (['user', 'expert', 'vendor'].includes(userRole)) {
          navigate('/tasks');
        } else {
          setError(`Login successful, but role '${userRole}' is not recognized.`);
        }
      } else {
        setError('Login successful, but no role was provided by the server.');
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-xl bg-brand-600 grid place-items-center text-2xl font-bold">D</div>
          <div className="mt-2 text-lg font-semibold">Welcome to Dhriti.AI</div>
          <div className="text-sm text-slate-400">Sign in to your account</div>
        </div>
        <form onSubmit={onSubmit} className="bg-slate-900/60 backdrop-blur rounded-2xl border border-slate-800 p-6 space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 transition font-semibold disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button
            type="button"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition font-semibold"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
