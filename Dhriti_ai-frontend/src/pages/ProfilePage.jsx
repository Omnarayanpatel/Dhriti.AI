import React from "react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaStore, FaUserTie, FaUsers, FaPlus } from "react-icons/fa";

function ProfilePage() {
  const navigate = useNavigate();

  const roles = [
    {
      id: "user",
      label: "User",
      desc: "Access your account, track activities and manage profile",
      icon: <FaUser size={28} />,
      path: "/users/admins",
      color: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
    },
    {
      id: "vendor",
      label: "Vendor",
      desc: "Manage products, orders and business operations",
      icon: <FaStore size={28} />,
      path: "/users/vendors",
      color: "from-green-500 to-green-600",
      bg: "bg-green-50",
    },
    {
      id: "expert",
      label: "Expert",
      desc: "Provide guidance, consultations and expert services",
      icon: <FaUserTie size={28} />,
      path: "/users/experts",
      color: "from-purple-500 to-purple-600",
      bg: "bg-purple-50",
    },
    {
      id: "client",
      label: "Client",
      desc: "Hire experts, connect with vendors and manage work",
      icon: <FaUsers size={28} />,
      path: "/users/clients",
      color: "from-orange-500 to-orange-600",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8 flex flex-col justify-between">
      <div className="max-w-6xl mx-auto w-full">

        {/* Heading */}
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Choose Your Profile
        </h1>
        <p className="text-gray-600 mb-10">
          Select how you want to continue in the platform
        </p>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => navigate(role.path)}
              className={`cursor-pointer rounded-2xl p-6
              shadow-md hover:shadow-2xl transition-all duration-300
              hover:-translate-y-2 border ${role.bg}`}
            >
              {/* Icon */}
              <div
                className={`w-14 h-14 flex items-center justify-center
                rounded-xl bg-gradient-to-r ${role.color}
                text-white mb-4 shadow-lg`}
              >
                {role.icon}
              </div>

              {/* Title */}
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                {role.label}
              </h2>

              {/* Description */}
              <p className="text-gray-600 text-sm leading-relaxed">
                {role.desc}
              </p>
            </div>
          ))}
        </div>

        {/* 🔽 Bottom Action Section */}
        <div className="mt-14 bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            Quick Actions
          </h3>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => navigate("/users/create")}
              className="flex items-center gap-2 px-5 py-2.5
              rounded-xl bg-blue-600 text-white hover:bg-blue-700
              transition shadow-md"
            >
              <FaPlus /> Add User
            </button>

            <button
              onClick={() => navigate("/vendors/create")}
              className="flex items-center gap-2 px-5 py-2.5
              rounded-xl bg-green-600 text-white hover:bg-green-700
              transition shadow-md"
            >
              <FaPlus /> Add Vendor
            </button>

            <button
              onClick={() => navigate("/experts/create")}
              className="flex items-center gap-2 px-5 py-2.5
              rounded-xl bg-purple-600 text-white hover:bg-purple-700
              transition shadow-md"
            >
              <FaPlus /> Add Expert
            </button>

            <button
              onClick={() => navigate("/clients/create")}
              className="flex items-center gap-2 px-5 py-2.5
              rounded-xl bg-orange-600 text-white hover:bg-orange-700
              transition shadow-md"
            >
              <FaPlus /> Add Client
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} Dhritii.AI • All rights reserved
      </footer>
    </div>
  );
}

export default ProfilePage;