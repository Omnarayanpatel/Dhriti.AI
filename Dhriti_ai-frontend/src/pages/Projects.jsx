import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import Modal from '../components/Modal.jsx'
import FileUpload from '../components/FileUpload.jsx'
import { getToken } from '../utils/auth.js'

const API_BASE = 'http://localhost:8000'

function Projects() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function loadProjects() {
      try {
        setLoading(true)
        setError('')
        const token = getToken()
        if (!token) {
          throw new Error('You need to log in again.')
        }
        const response = await fetch(`${API_BASE}/tasks/admin/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || 'Unable to load projects right now.')
        }
        const data = await response.json()
        const mapped = data.map(p => ({
          ...p,
          id: p.id,
          name: p.name,
          status: p.status,
        }))
        setRows(mapped)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  const openAssignModal = async project => {
    setSelectedProject(project)
    setAssignError('')
    setUsersError('')
    setAssignOpen(true)

    if (users.length === 0 && !usersLoading) {
      try {
        setUsersLoading(true)
        setUsersError('')
        const token = getToken()
        if (!token) {
          throw new Error('You need to log in again.')
        }
        const response = await fetch(`${API_BASE}/tasks/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || 'Unable to fetch users.')
        }
        const data = await response.json()
        setUsers(data)
      } catch (err) {
        setUsersError(err.message)
      } finally {
        setUsersLoading(false)
      }
    }
  }

  const onAssignSubmit = async e => {
    e.preventDefault()
    if (!selectedProject) return
    setAssignError('')
    const f = new FormData(e.currentTarget)
    const payload = {
      user_id: Number(f.get('user_id')),
      project_id: selectedProject.id,
      status: f.get('status') || undefined,
      avg_task_time_minutes: f.get('avg_time') ? Number(f.get('avg_time')) : undefined,
      completed_tasks: f.get('completed') ? Number(f.get('completed')) : undefined,
      pending_tasks: f.get('pending') ? Number(f.get('pending')) : undefined,
    }

    try {
      const token = getToken()
      if (!token) {
        throw new Error('You need to log in again.')
      }

      const response = await fetch(`${API_BASE}/tasks/admin/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = await response.json().catch(() => ({}))
        throw new Error(payloadErr.detail || 'Unable to assign project.')
      }

      setAssignOpen(false)
      setSelectedProject(null)
      e.currentTarget.reset()
    } catch (err) {
      setAssignError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Projects</h1>
              <p className="text-slate-500">Manage and track project progress</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setUploadOpen(true)} className="px-3 py-2 rounded-lg border hover:bg-slate-50">Upload Data</button>
              <button onClick={() => navigate('/projects/new')} className="px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">Add Project</button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-slate-500">Loading projects…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-slate-500">No projects yet. Add one to get started.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full border-collapse">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Project Status</th>
                    <th className="p-4">Total Tasks Added</th>
                    <th className="p-4">Total Tasks Completed</th>
                    <th className="p-4">Association</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {rows.map(project => (
                    <tr key={project.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openAssignModal(project)}
                            className="flex size-8 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-400 transition hover:border-brand-500 hover:text-brand-600"
                            aria-label={`Assign ${project.name}`}
                          >
                            ›
                          </button>
                          <div>
                            <div className="font-medium text-slate-900">{project.name}</div>
                            {project.task_type ? (
                              <div className="text-xs uppercase text-slate-400">{project.task_type}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {project.status}
                        </span>
                      </td>
                      <td className="p-4 align-middle font-medium">{(project.total_tasks_added ?? 0).toLocaleString()}</td>
                      <td className="p-4 align-middle font-medium text-emerald-600">{(project.total_tasks_completed ?? 0).toLocaleString()}</td>
                      <td className="p-4 align-middle text-slate-600">{project.association ? project.association.toUpperCase() : '—'}</td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/projects/${project.id}/board/task`, {
                                state: { project },
                              })
                            }
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
                          >
                            View board
                          </button>
                          <button
                            type="button"
                            onClick={() => openAssignModal(project)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-600"
                          >
                            Assign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Modal
            title={selectedProject ? `Assign ${selectedProject.name}` : 'Assign Project'}
            isOpen={assignOpen}
            onClose={() => {
              setAssignOpen(false)
              setSelectedProject(null)
              setAssignError('')
            }}
          >
            <form onSubmit={onAssignSubmit} className="space-y-3" key={selectedProject?.id ?? 'assign'}>
              {assignError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{assignError}</div>}
              <div>
                <label className="block text-sm mb-1">Select User</label>
                <select
                  name="user_id"
                  required
                  className="w-full px-3 py-2 rounded-lg border"
                  defaultValue=""
                  disabled={usersLoading || (!!usersError && users.length === 0)}
                >
                  <option value="" disabled>
                    {usersLoading ? 'Loading users…' : usersError ? usersError : 'Choose user'}
                  </option>
                  {!usersLoading && !usersError &&
                    users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.email} ({user.role})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Status</label>
                  <select name="status" className="w-full px-3 py-2 rounded-lg border">
                    <option value="">Use project default</option>
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Avg Task Time (minutes)</label>
                  <input name="avg_time" type="number" min="1" className="w-full px-3 py-2 rounded-lg border" placeholder={selectedProject?.default_avg_task_time_minutes || 'Optional'} />
                </div>
                <div>
                  <label className="block text-sm mb-1">Completed Tasks</label>
                  <input name="completed" type="number" min="0" className="w-full px-3 py-2 rounded-lg border" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Pending Tasks</label>
                  <input name="pending" type="number" min="0" className="w-full px-3 py-2 rounded-lg border" placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false)
                    setSelectedProject(null)
                    setAssignError('')
                  }}
                  className="px-3 py-2 rounded-lg border"
                >
                  Cancel
                </button>
                <button type="submit" className="px-3 py-2 rounded-lg bg-brand-600 text-white">Assign</button>
              </div>
            </form>
          </Modal>

          <Modal title="Upload Data" isOpen={uploadOpen} onClose={() => setUploadOpen(false)} size="lg">
            <FileUpload onFileSelected={() => {}} />
          </Modal>
        </div>
      </main>
    </div>
  )
}

export default Projects


