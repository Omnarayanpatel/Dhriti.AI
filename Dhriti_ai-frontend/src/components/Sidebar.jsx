import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { getUserRole } from "../utils/auth";

// lucide icons
import {
  Bell,
  Home,
  BarChart2,
  ClipboardList,
  PlayCircle,
  LogOut,
  User
} from "lucide-react";

function Sidebar() {
  const [isHovering, setIsHovering] = useState(false);
  const userRole = getUserRole();

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      // mobile behaviour
    }
  };

  const navItem = ({ to, icon, label }) => (
    <NavLink
      to={to}
      className="flex items-center gap-3 w-full px-4 h-12 rounded-xl transition-all 
                 duration-300 text-white hover:bg-white/20"
      onClick={handleNavClick}
    >
      {/* ICON ALWAYS VISIBLE */}
      <span className="w-6 flex justify-center">{icon}</span>

      {/* TEXT ONLY VISIBLE ON HOVER */}
      <span
        className={`text-sm font-medium whitespace-nowrap transition-all duration-300
          ${isHovering ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}
        `}
      >
        {label}
      </span>
    </NavLink>
  );

  return (
    <aside
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`h-[42rem]  mt-6 ml-6 bg-green-800 rounded-3xl py-6 flex flex-col justify-between shadow-xl hover:bg-green-600
        transition-all duration-300
        ${isHovering ? "w-56" : "w-20"}`}
    >
      {/* Top Bell Section */}
      <div className="flex flex-col gap-6 mt-2 w-full">
        <div className="flex items-center gap-3 w-full px-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/20 text-white">
            <Bell size={22} />
          </div>

          <span
            className={`text-sm font-medium text-white transition-all duration-300
              ${isHovering ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}
            `}
          >
            Notifications
          </span>
        </div>

        {/* Navigation */}
        <div className="flex flex-col items-start gap-3 mt-3 w-full">
          {navItem({ to: "/dashboard", icon: <Home size={22} />, label: "Dashboard" })}

          {userRole === "admin" && (
            <>
              {navItem({ to: "/projects", icon: <BarChart2 size={22} />, label: "Projects" })}
              {navItem({ to: "/tools", icon: <ClipboardList size={22} />, label: "Tools" })}
              {navItem({
                to: "/tools/download-outputs",
                icon: <PlayCircle size={22} />,
                label: "Reports"
              })}
            </>
          )}

          {userRole !== "admin" && (
            <>
              {navItem({ to: "/projects", icon: <BarChart2 size={22} />, label: "Projects" })}
              {navItem({ to: "/projects", icon: <PlayCircle size={22} />, label: "Tasks" })}
            </>
          )}

          {navItem({ to: "/profile-selection", icon: <User size={22} />, label: "Profile" })}
        </div>
      </div>

      {/* Logout */}
      <div className="mb-3 w-full">
        <NavLink
          to="/login"
          className="flex items-center gap-3 w-full px-4 h-12 rounded-xl bg-white/20 text-white
                     hover:bg-white/30 transition-all duration-300"
        >
          <span className="w-6 flex justify-center"><LogOut size={22} /></span>
          <span
            className={`text-sm font-medium transition-all duration-300
              ${isHovering ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}
            `}
          >
            Logout
          </span>
        </NavLink>
      </div>
    </aside>
  );
}

export default Sidebar;