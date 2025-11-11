import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import { getToken } from '../utils/auth.js'

const API_BASE = 'http://localhost:8000'

function formatProjectName(slug) {
  if (!slug) return 'Untitled Project'
  const replaced = slug.replace(/[-_]+/g, ' ')
  return replaced
    .split(' ')
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

export default function ProjectTaskBoard() {
  const { projectId, tabId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const preservedState = location.state
  const projectFromState = preservedState?.project
  const projectName = projectFromState?.name || formatProjectName(projectId)
  const taskType = projectFromState?.task_type
  const projectStatus = projectFromState?.status || 'Active'

  useEffect(() => {
    async function fetchProjectTasks() {
      setLoading(true)
      setError('')
      const token = getToken()
      if (!token) {
        setError('You need to log in to view project tasks.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/tasks/admin/projects/${projectId}/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || 'Unable to load project tasks.')
        }

        const data = await response.json()
        setTasks(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchProjectTasks()
  }, [projectId])

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500"
          >
            <span aria-hidden>←</span>
            Back to Projects
          </button>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <button
                  type="button"
                  onClick={() => navigate('/projects')}
                  className="font-medium text-slate-600 hover:text-blue-600"
                >
                  Projects
                </button>
                <span aria-hidden>›</span>
                <span className="font-semibold text-slate-800">{projectName}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">{projectName}</h1>
                </div>
                <span className="rounded-full bg-emerald-50 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {projectStatus}
                </span>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Tasks ({loading ? '...' : tasks.length})</h2>
                <button
                  type="button"
                  onClick={() => navigate(`/tools/json-to-excel?project_id=${projectId}`)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
                >
                  Import Tasks
                </button>
              </div>
            </header>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3">Task ID</th>
                    <th className="p-3">Task Name</th>
                    <th className="p-3">File Name</th>
                    <th className="p-3">Allocated To</th>
                    <th className="p-3">Actions</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr><td colSpan="4" className="p-6 text-center text-slate-500">Loading tasks…</td></tr>
                  ) : error ? (
                    <tr><td colSpan="4" className="p-6 text-center text-red-600">{error}</td></tr>
                  ) : tasks.length === 0 ? (
                    <tr><td colSpan="4" className="p-6 text-center text-slate-500">No tasks found for this project.</td></tr>
                  ) : (
                    tasks.map(task => (
                      <tr key={task.task_id || task.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs">{task.task_id || 'N/A'}</td>
                        <td className="p-3 font-medium">{task.task_name || 'N/A'}</td>
                        <td className="p-3">{task.file_name || 'N/A'}</td>
                        <td className="p-3">{task.email || <span className="text-slate-400">Not Allocated</span>}</td>
                        <td className="p-3">
                          {taskType === 'Image Annotation' && (
                            <button
                              type="button"
                              onClick={() => navigate(`/tools/image-annotator/${task.id}`)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
                            >
                              Start
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {task.status || 'NEW'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
