import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import { getToken } from '../utils/auth.js'

const API_BASE = 'http://localhost:8000'

const initialForm = {
  name: '',
  description: '',
  status: 'Active',
  dataCategory: '',
  projectType: '',
  taskType: '',
  taskTime: '',
  reviewTime: '',
  maxUsers: '',
  association: 'Admin',
  autoSubmit: false,
  reviewerEdit: true,
  reviewerPushBack: true,
  reviewerFeedback: true,
  screenMode: 'full',
  guidelines: '',
}

function AddProject() {
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = field => event => {
    const { type, checked, value } = event.target
    setForm(prev => ({
      ...prev,
      [field]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async event => {
    event.preventDefault()
    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setError('Project name is required.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const token = getToken()
      if (!token) {
        throw new Error('You need to log in again.')
      }

      const payload = {
        name: trimmedName,
        status: form.status,
        description: form.description.trim() ? form.description.trim() : null,
        data_category: form.dataCategory || null,
        project_type: form.projectType || null,
        task_type: form.taskType.trim() ? form.taskType.trim() : null,
        default_avg_task_time_minutes: form.taskTime ? Number(form.taskTime) : null,
        review_time_minutes: form.reviewTime ? Number(form.reviewTime) : null,
        max_users_per_task: form.maxUsers ? Number(form.maxUsers) : null,
        association: form.association.trim() ? form.association.trim() : null,
        auto_submit_task: form.autoSubmit,
        allow_reviewer_edit: form.reviewerEdit,
        allow_reviewer_push_back: form.reviewerPushBack,
        allow_reviewer_feedback: form.reviewerFeedback,
        reviewer_screen_mode: form.screenMode,
        reviewer_guidelines: form.guidelines.trim() ? form.guidelines.trim() : null,
      }

      const response = await fetch(`${API_BASE}/tasks/admin/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = await response.json().catch(() => ({}))
        throw new Error(payloadErr.detail || 'Unable to create project.')
      }

      await response.json()
      navigate('/projects')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
            >
              <span className="text-lg">←</span>
              Back to Projects
            </button>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Add Project</h1>
            <p className="text-slate-500">Configure a new project with reviewer controls and timing defaults.</p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">Project Details</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Project Name</label>
                  <input
                    value={form.name}
                    onChange={handleChange('name')}
                    placeholder="Enter project name"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Project Description</label>
                  <input
                    value={form.description}
                    onChange={handleChange('description')}
                    placeholder="Enter project description"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Project Status</label>
                  <select
                    value={form.status}
                    onChange={handleChange('status')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Data Category</label>
                  <select
                    value={form.dataCategory}
                    onChange={handleChange('dataCategory')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="">Select data category</option>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="audio">Audio</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Project Type</label>
                  <select
                    value={form.projectType}
                    onChange={handleChange('projectType')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="">Select project type</option>
                    <option value="annotation">Annotation</option>
                    <option value="review">Review</option>
                    <option value="collection">Collection</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Association</label>
                  <input
                    value={form.association}
                    onChange={handleChange('association')}
                    placeholder="e.g. Admin, Client, Internal"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Task Type</label>
                  <input
                    value={form.taskType}
                    onChange={handleChange('taskType')}
                    placeholder="Enter task type"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Task Time (in mins)</label>
                  <input
                    value={form.taskTime}
                    onChange={handleChange('taskTime')}
                    type="number"
                    min="1"
                    placeholder="Enter task time"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Review Time (in mins)</label>
                  <input
                    value={form.reviewTime}
                    onChange={handleChange('reviewTime')}
                    type="number"
                    min="1"
                    placeholder="Enter review time"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Max User Per Task</label>
                  <input
                    value={form.maxUsers}
                    onChange={handleChange('maxUsers')}
                    type="number"
                    min="1"
                    placeholder="Enter max users"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Task Automation</h2>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.autoSubmit}
                    onChange={handleChange('autoSubmit')}
                    className="size-4 rounded border-slate-300"
                  />
                  Auto submit task
                </label>
              </div>
              <p className="text-xs text-slate-500">Automatically submits tasks upon completion when enabled.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Reviewer Control</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="inline-flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.reviewerEdit}
                    onChange={handleChange('reviewerEdit')}
                    className="mt-1 size-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium">Reviewer edit</span>
                    <span className="text-xs text-slate-500">Reviewer can edit task responses.</span>
                  </span>
                </label>
                <label className="inline-flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.reviewerPushBack}
                    onChange={handleChange('reviewerPushBack')}
                    className="mt-1 size-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium">Reviewer push back</span>
                    <span className="text-xs text-slate-500">Allow reviewers to request rework.</span>
                  </span>
                </label>
                <label className="inline-flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.reviewerFeedback}
                    onChange={handleChange('reviewerFeedback')}
                    className="mt-1 size-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-medium">Reviewer feedback</span>
                    <span className="text-xs text-slate-500">Collect qualitative feedback from reviewers.</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">User Screen</h2>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="screen-mode"
                    value="split"
                    checked={form.screenMode === 'split'}
                    onChange={() => setForm(prev => ({ ...prev, screenMode: 'split' }))}
                    className="size-4 border-slate-300"
                  />
                  Split screen
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="screen-mode"
                    value="full"
                    checked={form.screenMode === 'full'}
                    onChange={() => setForm(prev => ({ ...prev, screenMode: 'full' }))}
                    className="size-4 border-slate-300"
                  />
                  Full screen
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">Reviewer Guidelines</h2>
              <textarea
                value={form.guidelines}
                onChange={handleChange('guidelines')}
                rows={4}
                placeholder="Add reviewer guidelines or helpful context."
                className="mt-4 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
              />
            </section>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Save Project'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default AddProject
