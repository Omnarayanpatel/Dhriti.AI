import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function RatingBadge({ rating }) {
  if (rating == null) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">No reviews</span>;
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      ★ {rating.toFixed(1)}
    </span>
  );
}

function StatusDot({ status }) {
  const styles =
    status === 'Active'
      ? 'bg-emerald-500'
      : status === 'Paused'
      ? 'bg-amber-500'
      : 'bg-slate-400';
  return <span className={`inline-block size-2 rounded-full ${styles}`} />;
}

export default function Tasks() {
  const navigate = useNavigate(); // Initialize navigate
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('last7');
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState(null);
  const [recentReviews, setRecentReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startError, setStartError] = useState(''); // For errors when starting a task
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 100;

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      const token = getToken();
      if (!token) {
        setError('You need to log in to view your tasks.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(''); setStartError('');
        const response = await fetch('http://localhost:8000/tasks/dashboard', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || 'Unable to load tasks right now.');
        }

        const data = await response.json();
        setAssignments(data.assignments || []);
        setStats(data.stats || null);
        setRecentReviews(data.recent_reviews || []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((p) => p.project_name.toLowerCase().includes(q));
  }, [assignments, query]);

  useEffect(() => {
    setPage(1);
  }, [query, assignments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedAssignments = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const assignedProjectsCount = Math.max(0, stats?.assigned_projects ?? assignments.length);
  const tasksCompleted = Math.max(0, stats?.tasks_completed ?? assignments.reduce((acc, p) => acc + Math.max(0, p.completed_tasks || 0), 0));
  const tasksPending = Math.max(0, stats?.tasks_pending ?? assignments.reduce((acc, p) => acc + Math.max(0, p.pending_tasks || 0), 0));
  const avgRatingDisplay = stats?.avg_rating != null ? stats.avg_rating.toFixed(2) : '—';

  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = filtered.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filtered.length);

  const handleStart = async (assignment) => {
    setStartError(''); // Clear previous errors

    // If the task type is Image Annotation, fetch the next task and go to the specialized tool.
    if (assignment.task_type === 'Image Annotation') {
      const token = getToken();
      try {
        const response = await fetch(`${API_BASE}/tasks/projects/${assignment.project_id}/next-task`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 404) {
          setStartError('No available tasks for this project right now. Please try again later.');
          return;
        }
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Could not get the next task.');
        }

        const task = await response.json();
        if (task && task.id) {
          // We got a specific task ID, navigate to the image annotator.
          navigate(`/tools/image-annotator/${task.id}`);
        } else {
          throw new Error('Received an invalid response from the server.');
        }
      } catch (err) {
        setStartError(err.message);
      }
    } else if (assignment.task_type === 'Text Annotation' || assignment.data_category === 'text') {
      const token = getToken();
      try {
        const response = await fetch(`${API_BASE}/text/projects/${assignment.project_id}/next-task`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 404) {
          setStartError('No available tasks for this project right now. Please try again later.');
          return;
        }
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Could not get the next task.');
        }

        const task = await response.json();
        if (task && task.id) {
          // We got a specific task ID, navigate to the text annotator.
          navigate(`/tools/text-annotator/${task.id}`);
        } else {
          throw new Error('Received an invalid response from the server.');
        }
      } catch (err) {
        setStartError(err.message);
      }
    } else {
      // For all other task types, use the generic template player.
      navigate(`/templates/${assignment.template_id}/play`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="md:flex md:gap-0">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Topbar />
          <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl">🙏</span>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
              <span className="text-slate-500">Let’s get some tasks done.</span>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            
            {startError && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                {startError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Assigned Projects" value={assignedProjectsCount} />
              <StatCard label="Tasks Completed" value={tasksCompleted} sub="All-time" />
              <StatCard label="Pending Tasks" value={tasksPending} />
              <StatCard label="Avg Rating" value={avgRatingDisplay} />
            </div>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="p-3 font-medium">Project</th>
                      <th className="p-3 font-medium">Avg task time</th>
                      <th className="p-3 font-medium">Rating</th>
                      <th className="p-3 font-medium">Completed</th>
                      <th className="p-3 font-medium">Pending</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAssignments.map((p) => (
                      <tr
                        key={p.assignment_id}
                        className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                              {p.assignment_id}
                            </span>
                            <div className="font-medium">{p.project_name}</div>
                          </div>
                        </td>
                        <td className="p-3">
                          {p.avg_task_time_label ||
                            (p.avg_task_time_minutes
                              ? `${p.avg_task_time_minutes} minutes`
                              : '—')}
                        </td>
                        <td className="p-3">
                          <RatingBadge rating={p.rating} />
                        </td>
                        <td className="p-3">{Math.max(0, p.completed_tasks ?? 0).toLocaleString()}</td>
                        <td className="p-3">{Math.max(0, p.pending_tasks ?? 0).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StatusDot status={p.status} />
                            <span className="text-slate-700">{p.status}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleStart(p)}
                            className="rounded-lg px-3 py-1.5 text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            Start &gt;
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-500">
                          {loading
                            ? 'Loading your assignments…'
                            : query
                            ? `No projects match “${query}”.`
                            : 'No assignments yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}