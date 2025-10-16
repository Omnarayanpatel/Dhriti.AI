import React, { useEffect, useState } from 'react';
import { getToken, getUserRole } from '../utils/auth.js';

function Topbar() {
  const [userEmail, setUserEmail] = useState('');
  const [role, setRole] = useState(getUserRole() || '');
  const firstLetter = userEmail ? userEmail[0].toUpperCase() : '';

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let cancelled = false;

    fetch('http://localhost:8000/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.detail || 'Unable to fetch profile');
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUserEmail(data.email || '');
        if (data.role) {
          setRole(data.role);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Topbar fetch failed:', err);
        setUserEmail('');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="px-4 py-3 flex items-center justify-end gap-4">
        <button
          className="relative p-2 rounded-lg hover:bg-slate-100 transition"
          
          aria-label="Notifications"
        >
          🔔
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600 to-brand-800 text-white grid place-items-center font-semibold">
            {firstLetter || '?'}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold capitalize">{role || 'User'}</div>
            <div className="text-xs text-slate-500">
              {userEmail || 'Loading...'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
