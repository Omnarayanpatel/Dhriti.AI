// src/pages/Tasks.jsx
import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import { getToken } from '../utils/auth.js'

// why: small, reusable stat card with consistent styling
function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

function RatingBadge({ rating }) {
  if (rating == null) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">No reviews</span>
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      ★ {rating.toFixed(1)}
    </span>
  )
}

function StatusDot({ status }) {
  const styles =
    status === 'Active'
      ? 'bg-emerald-500'
      : status === 'Paused'
      ? 'bg-amber-500'
      : 'bg-slate-400'
  return <span className={`inline-block size-2 rounded-full ${styles}`} />
}

export default function Tasks() {
  const [query, setQuery] = useState('')
  const [range, setRange] = useState('last7')
  const [assignments, setAssignments] = useState([])
  const [stats, setStats] = useState(null)
  const [recentReviews, setRecentReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 10

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      const token = getToken()
      if (!token) {
        setError('You need to log in to view your tasks.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const response = await fetch('http://localhost:8000/tasks/dashboard', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || 'Unable to load tasks right now.')
        }

        const data = await response.json()
        setAssignments(data.assignments || [])
        setStats(data.stats || null)
        setRecentReviews(data.recent_reviews || [])
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()

    return () => controller.abort()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assignments
    return assignments.filter(p => p.project_name.toLowerCase().includes(q))
  }, [assignments, query])

  useEffect(() => {
    setPage(1)
  }, [query, assignments])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const paginatedAssignments = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const assignedProjectsCount = stats?.assigned_projects ?? assignments.length
  const tasksCompleted = stats?.tasks_completed ?? assignments.reduce((acc, p) => acc + (p.completed_tasks || 0), 0)
  const tasksPending = stats?.tasks_pending ?? assignments.reduce((acc, p) => acc + (p.pending_tasks || 0), 0)
  const avgRatingDisplay = stats?.avg_rating != null ? stats.avg_rating.toFixed(2) : '—'

  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = filtered.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filtered.length)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="md:flex md:gap-0">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Topbar />
          <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
            {/* Greeting */}
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

            {/* KPI row */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Assigned Projects" value={assignedProjectsCount} />
              <StatCard label="Tasks Completed" value={tasksCompleted} sub="All-time" />
              <StatCard label="Pending Tasks" value={tasksPending} />
              <StatCard
                label="Avg Rating"
                value={avgRatingDisplay}
              />
            </div>

            {/* Assigned Projects */}
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 text-xl">📦</span>
                  <h2 className="text-lg font-semibold">Assigned Projects</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search projects…"
                      className="w-64 rounded-xl border bg-slate-50 px-3 py-2 text-sm outline-none ring-0 focus:border-slate-300"
                      aria-label="Search projects"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">⌘K</span>
                  </div>
                  <select
                    value={range}
                    onChange={e => setRange(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                    aria-label="Time filter"
                  >
                    <option value="today">Today</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="all">All time</option>
                  </select>
                  <button
                    type="button"
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Start Tasking
                  </button>
                </div>
              </div>

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
                    {paginatedAssignments.map(p => (
                      <tr key={p.assignment_id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">{p.assignment_id}</span>
                            <div className="font-medium">{p.project_name}</div>
                          </div>
                        </td>
                        <td className="p-3">{p.avg_task_time_label || (p.avg_task_time_minutes ? `${p.avg_task_time_minutes} minutes` : '—')}</td>
                        <td className="p-3"><RatingBadge rating={p.rating} /></td>
                        <td className="p-3">{(p.completed_tasks ?? 0).toLocaleString()}</td>
                        <td className="p-3">{(p.pending_tasks ?? 0).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StatusDot status={p.status} />
                            <span className="text-slate-700">{p.status}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <a
                            href="#"
                            className="rounded-lg px-3 py-1.5 text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            Start &gt;
                          </a>
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

              {/* Pagination stub */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Showing {filtered.length === 0 ? 0 : `${showingFrom}-${showingTo}`} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg border px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Previous page"
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                  >
                    Prev
                  </button>
                  <button
                    className="rounded-lg border px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Next page"
                    onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages || filtered.length === 0}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>

            {/* Recent Task Reviews */}
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">⭐</span>
                <h2 className="text-lg font-semibold">Recent Task Reviews</h2>
              </div>

              {recentReviews.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed bg-slate-50 p-10 text-center">
                  <svg className="mx-auto h-16 w-16 text-slate-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V4h14v16zM11 10H9v6h2v-6zm4 0h-2v6h2v-6z" />
                  </svg>
                  <p className="mt-3 max-w-md text-sm text-slate-600">
                    You’ll see reviews here once your submitted tasks get rated. Check them later in “Completed Tasks”.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                      View Completed
                    </button>
                    <button className="rounded-xl border px-3 py-2 text-sm hover:bg-white">
                      Learn about ratings
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-3">
                  {recentReviews.map(review => (
                    <li key={review.id} className="rounded-xl border px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{review.project_name}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(review.created_at).toLocaleString()}
                          </div>
                        </div>
                        <RatingBadge rating={review.rating} />
                      </div>
                      {review.comment ? (
                        <p className="mt-2 text-sm text-slate-600">{review.comment}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
