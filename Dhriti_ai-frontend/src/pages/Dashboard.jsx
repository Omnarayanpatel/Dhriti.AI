import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import StatCard from "../components/StatCard.jsx";
import { getToken } from "../utils/auth.js";

const API_BASE = "http://localhost:8000";

function Dashboard() {
  const [stats, setStats] = useState({
    totalProjects: 0,
    endedProjects: 0,
    runningProjects: 0,
    pendingProjects: 0,
    tasksForReview: 0, // New state for QC tasks
  });
  const [teamMembers, setTeamMembers] = useState([]);
  const [recentProjects, setRecentProjects] = useState([]);
  // New state for tasks that need review
  const [reviewTasks, setReviewTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStats() {
      const token = getToken();
      if (!token) {
        setError("You need to log in to view the dashboard.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/dashboard/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        setStats({
          totalProjects: data.active_projects ?? 0,
          endedProjects: data.ended_projects ?? 0,
          runningProjects: data.running_projects ?? 0,
          pendingProjects: data.pending_projects ?? 0,
          tasksForReview: data.tasks_for_review ?? 0, // Assuming API provides this
        });
        setTeamMembers(data.team_members || []);
        setRecentProjects(data.recent_projects || []);
        // Assuming API provides a list of tasks for review
        setReviewTasks(data.review_tasks || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  return (
    <div className="min-h-screen  bg-[#F6F7F9] flex gap-0">
      {/* Sidebar */}
      <Sidebar />

      {/* Main */}
      <div className="flex-1 min-w-0">
        <Topbar />

        <div className="p-6 space-y-6">

          {/* Heading */}
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-gray-500">
              Plan, prioritize, and manage your tasks with ease.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 text-red-700 shadow">
              {error}
            </div>
          )}

          {/* Loader */}
          {loading ? (
            <div className="bg-white border rounded-xl p-4 shadow">
              Loading dashboard…
            </div>
          ) : (
            <>
              {/* ---- New Premium Stat Boxes ---- */}
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">

                <div className="rounded-2xl p-6 bg-gradient-to-br from-green-500 to-green-700 shadow-lg text-white hover:scale-[1.03] cursor-pointer transition-all">
                  <p className="text-lg font-medium">Total Projects</p>
                  <h2 className="text-4xl font-bold mt-1">{stats.totalProjects}</h2>
                  <p className="opacity-80 text-sm mt-1">+6% from last month</p>
                </div>

                <div className="rounded-2xl p-6 bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg text-white hover:scale-[1.03] cursor-pointer transition-all">
                  <p className="text-lg font-medium">Ended Projects</p>
                  <h2 className="text-4xl font-bold mt-1">{stats.endedProjects}</h2>
                  <p className="opacity-80 text-sm mt-1">+4% from last month</p>
                </div>

                <div className="rounded-2xl p-6 bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg text-white hover:scale-[1.03] cursor-pointer transition-all">
                  <p className="text-lg font-medium">Running Projects</p>
                  <h2 className="text-4xl font-bold mt-1">{stats.runningProjects}</h2>
                  <p className="opacity-80 text-sm mt-1">Progressing</p>
                </div>

                <div className="rounded-2xl p-6 bg-gradient-to-br from-yellow-500 to-yellow-600 shadow-lg text-white hover:scale-[1.03] cursor-pointer transition-all">
                  <p className="text-lg font-medium">Pending Projects</p>
                  <h2 className="text-4xl font-bold mt-1">{stats.pendingProjects}</h2>
                  <p className="opacity-80 text-sm mt-1">On Discussion</p>
                </div>

                <div className="rounded-2xl p-6 bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg text-white hover:scale-[1.03] cursor-pointer transition-all">
                  <p className="text-lg font-medium">Tasks for Review</p>
                  <h2 className="text-4xl font-bold mt-1">{stats.tasksForReview}</h2>
                  <p className="opacity-80 text-sm mt-1">Awaiting your approval</p>
                </div>

              </div>

      
              {/* ---- Team + Projects List ---- */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Team */}
                <div className="  bg-blue-100  rounded-2xl h-fit border shadow p-6 hover:shadow-lg transition">
  <div className="flex justify-between items-center mb-4">
    <h2 className="font-semibold text-lg">👥 Team Collaboration</h2>
    <button className="px-3 py-1 rounded-md bg-gradient-to-br from-green-500 to-green-700 text-white text-sm hover:bg-gray-800">
      + Add Member
    </button>
  </div>

  {teamMembers.length > 0 ? (
    <div className="space-y-3 TeamCollabScroller max-h-48 overflow-y-auto pr-2 pb-4">
      {teamMembers.map((member) => (
        <div key={member.id} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">
            {member.name.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-sm">{member.name}</div>
            <div className="text-xs text-gray-500 capitalize">{member.role}</div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-gray-400 text-sm">No team members found.</div>
  )}
</div>


                {/* Project List */}
                <div className="bg-white h-fit rounded-2xl border shadow p-6 xl:col-span-2 hover:shadow-lg transition">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-semibold text-lg">📁 Projects</h2>
                    <button className="px-3 py-1 rounded-md bg-gradient-to-br from-green-500 to-green-700 text-white text-sm hover:bg-gray-800">
                      + New
                    </button>
                  </div>
                  {recentProjects.length > 0 ? (
                    <div className="space-y-2">
                      {recentProjects.map((project) => (
                        <div key={project.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-50">
                          <div>
                            <div className="font-medium text-sm">{project.name}</div>
                            <div className="text-xs text-gray-400">Updated: {new Date(project.updated_at).toLocaleDateString()}</div>
                          </div>
                          <span className="text-xs font-semibold capitalize px-2 py-1 rounded-full bg-blue-100 text-blue-700">{project.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-400 text-sm">No recent projects found.</div>
                  )}
                </div>

              </div>

              {/* ---- Quality Check / For Review Block ---- */}
              <div className="bg-white rounded-2xl border shadow p-6 hover:shadow-lg transition">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-lg">🔍 For Review</h2>
                  <button className="px-3 py-1 rounded-md text-blue-600 text-sm hover:bg-blue-50">
                    View All
                  </button>
                </div>
                {reviewTasks.length > 0 ? (
                  <div className="space-y-2">
                    {reviewTasks.map((task) => (
                      <div key={task.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-gray-50">
                        <div className="font-medium text-sm">{task.name} (from: {task.assignee_name})</div>
                        <button className="px-3 py-1 text-sm font-semibold rounded-md bg-blue-500 text-white hover:bg-blue-600">Review</button>
                      </div>
                    ))}
                  </div>
                ) : (<div className="text-gray-400 text-sm">No tasks are currently waiting for review.</div>)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
