import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getUserRole } from '../utils/auth';

function Sidebar() {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth >= 768; // Default to open on desktop
  });
  const userRole = getUserRole();

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setOpen(false);
    }
  };

  const handleLogoutClick = () => {
    // This should be expanded to call your logout utility
    // For now, it just handles the navigation click
    handleNavClick();
  };

  const navItem = ({ to, label, isLogout = false }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2 rounded-lg transition hover:bg-slate-100 ${isActive ? 'bg-slate-100 text-brand-700' : 'text-slate-700'}`
      }
      onClick={isLogout ? handleLogoutClick : handleNavClick}
    >
      <span>{label}</span>
    </NavLink>
  );

  return (
    <aside className="">
      {/* Mobile header */}
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">D</div>
          <span className="font-semibold">Dhritii.AI</span>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="p-2 rounded-lg hover:bg-slate-100">☰</button>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex sticky top-0 z-20 items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">D</div>
          <span className="font-semibold">Dhritii.AI</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-lg"
          type="button"
        >
          {open ? '⏴' : '⏵'}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className={`transition-all duration-200 bg-white md:min-h-screen md:sticky md:top-[64px] ${
          open
            ? 'w-full md:w-64 border-r border-slate-200 p-4 space-y-4 block'
            : 'hidden md:hidden w-full md:w-0 border-r border-transparent p-0 space-y-0'
        }`}
      >
        <nav className="space-y-1">
          {navItem({ to: '/dashboard', label: 'Dashboard' })}
          {userRole === 'admin' && (
            <details className="group">
              <summary className="list-none cursor-pointer">
                <div className="flex items-center gap-3 px-4 py-2 rounded-lg text-slate-700 hover:bg-slate-100">Users</div>
              </summary>
              <div className="mt-1 ml-4 space-y-1">
                {navItem({ to: '/users/admins', label: 'Admins' })}
                {navItem({ to: '/users/experts', label: 'Experts' })}
                {navItem({ to: '/users/vendors', label: 'Vendors' })}
                {navItem({ to: '/users/clients', label: 'Clients' })}
              </div>
            </details>
          )}
          {userRole === 'admin' && (
            <details className="group">
              <summary className="list-none cursor-pointer">
                <div className="flex items-center gap-3 px-4 py-2 rounded-lg text-slate-700 hover:bg-slate-100">Tools</div>
              </summary>
              <div className="mt-1 ml-4 space-y-1">
                {navItem({ to: '/tools/template-builder', label: 'Template Builder' })}
                {navItem({ to: '/tools/json-to-excel', label: 'Task Import Pipeline' })}
                {navItem({ to: '/tools/client-uploads', label: 'Client Uploads' })}
                {navItem({ to: '/tools/image-annotator', label: 'Image Annotator' })}
                {navItem({ to: '/tools/text-annotator', label: 'Text Annotator' })}
                {navItem({ to: '/tools/download-outputs', label: 'Download Outputs' })}
              </div>
            </details>
          )}
          {navItem({ to: '/projects', label: 'Projects' })}
          {navItem({ to: '/login', label: 'Logout', isLogout: true })}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
