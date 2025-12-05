import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import { getToken } from '../utils/auth.js'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'

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

const imageProjectTypes = [
  { value: 'Object Detection', description: 'Object Detection-Detect objects with bounding boxes' },
  { value: 'Instance Segmentation', description: 'Instance Segmentation-Outline objects with polygons/masks' },
  { value: 'Semantic Segmentation', description: 'Semantic Segmentation-Classify every pixel in the image' },
  { value: 'Keypoint Detection', description: 'Keypoint Detection-Mark specific points or skeleton structures' },
  { value: '3D Cuboid Annotation', description: '3D Cuboid Annotation-Create 3D bounding boxes for spatial understanding' },
  { value: 'Image Classification', description: 'Image Classification-Assign labels to full images' },
];

const textProjectTypes = [
  { value: 'NER-Name Entity Recognition', description: '(Name Entity Recognition) Highlight text spans and assign labels like PERSON, LOCATION, EMAIL, DATE.' },
  { value: 'Text Classification', description: 'Assign one or more labels to the entire text.' },
  { value: 'Sentiment Analysis', description: 'Label the sentiment of the text (Positive, Negative, Neutral).' },
  { value: 'Emotion Classification', description: 'Label emotional tone (Happy, Sad, Angry, Fear, Surprise).' },
  
  { value: 'Relationship Annotation', description: 'Define relation between two annotated entities.' },
  { value: 'Grammar Correction', description: 'Mark errors and add corrected versions of sentences.' },
];

function AddProject() {
  const [form, setForm] = useState(initialForm)
  const [clients, setClients] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchClients = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE}/tasks/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Could not fetch client list.');
        }
        const allUsers = await response.json();
        setClients(allUsers.filter(user => user.role === 'client'));
      } catch (err) {
        setError(err.message);
      }
    };
    fetchClients();
  }, []);

  const handleChange = field => event => {
    const { type, checked, value } = event.target
    setForm(prev => {
      const newState = {
        ...prev,
        [field]: type === 'checkbox' ? checked : value
      };
      // If projectType is being changed and it's not 'annotation', reset taskType.
      if (field === 'projectType' && value !== 'annotation' && prev.dataCategory !== 'image') {
        newState.taskType = '';
      }
      return newState;
    });
  };

  useEffect(() => {
    setForm(prev => ({ ...prev, projectType: '', taskType: '' }));
  }, [form.dataCategory]);

  // Reset client_id if association changes from 'Client'
  useEffect(() => {
    if (form.association !== 'Client') {
      setForm(prev => ({ ...prev, clientId: '' }));
    }
  }, [form.association]);

  const handleSubmit = async event => {
    event.preventDefault()
    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setError('Project name is required.')
      return
    }

    // If association is 'Client', ensure a client is selected.
    if (form.association === 'Client' && !form.clientId) {
      setError('Please select a client for the project.');
      return;
    }

    // If project type is 'Annotation', ensure a task type is selected.
    if (form.projectType === 'annotation' && !form.taskType) {
      setError('Please select a Task Type for Annotation projects.');
      return;
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
        client_id: form.association === 'Client' && form.clientId ? Number(form.clientId) : null,
        association: form.association,
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
            <h1 className="text-2xl font-semibold">Let's create a new project!</h1>
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
                <div className="md:col-span-1 relative">
                  <label className="block text-sm font-medium text-slate-600">Project Type</label>
                  <Listbox value={form.projectType} onChange={(value) => setForm(prev => ({ ...prev, projectType: value }))}>
                    <ListboxButton className="relative mt-1 w-full cursor-default rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                      <span className="block truncate">{form.projectType || 'Select project type'}</span>
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      </span>
                    </ListboxButton>
                    <ListboxOptions
                      anchor="bottom"
                      // transition
                      className="w-[var(--button-width)] rounded-xl border border-slate-200 bg-white p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none z-20"
                    >
                      {form.dataCategory === 'image' ? (
                        imageProjectTypes.map(type => (
                          <ListboxOption
                            key={type.value}
                            value={type.value}
                            className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-slate-100 min-h-[36px]"
                          >
                            <div className="text-sm text-slate-900 group-data-[focus]:hidden">{type.value}</div>
                            <div className="hidden text-sm text-slate-600 group-data-[focus]:block">{type.description}</div>
                          </ListboxOption>
                        ))
                      ) : form.dataCategory === 'text' ? (
                        textProjectTypes.map(type => (
                          <ListboxOption
                            key={type.value}
                            value={type.value}
                            className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-slate-100 min-h-[36px]"
                          >
                            <div className="text-sm text-slate-900 group-data-[focus]:hidden">{type.value}</div>
                            <div className="hidden text-sm text-slate-600 group-data-[focus]:block">{type.description}</div>
                          </ListboxOption>
                        ))
                      ) : (
                        <>
                          <ListboxOption value="annotation" className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-slate-100 min-h-[36px]">
                            <div className="text-sm text-slate-900">Annotation</div>
                          </ListboxOption>
                          <ListboxOption value="review" className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-slate-100 min-h-[36px]">
                            <div className="text-sm text-slate-900">Review</div>
                          </ListboxOption>
                        </>
                      )}
                    </ListboxOptions>
                  </Listbox>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Association</label>
                  <select
                    value={form.association}
                    onChange={handleChange('association')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="Admin">Admin (Internal)</option>
                    <option value="Client">Client</option>
                  </select>
                </div>
                <div className={`md:col-span-1 transition-opacity duration-300 ${form.association === 'Client' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <label className="block text-sm font-medium text-slate-600">Client</label>
                  <select
                    value={form.clientId}
                    onChange={handleChange('clientId')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    disabled={form.association !== 'Client'}
                  >
                    <option value="">Select a client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.email}
                      </option>
                    ))}
                  </select>
                </div>
                {/* <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-600">Task Type</label>
                  {form.projectType === 'annotation' ? (
                    <select
                      value={form.taskType}
                      onChange={handleChange('taskType')}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    >
                      <option value="">Select task type</option>
                      <option value="Text Annotation">Text Annotation</option>
                      <option value="Image Annotation">Image Annotation</option>
                      <option value="Audio Annotation">Audio Annotation</option>
                      <option value="Video Annotation">Video Annotation</option>
                    </select>
                  ) : (
                    <input
                      value={form.taskType}
                      onChange={handleChange('taskType')}
                      placeholder="Enter task type"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-slate-400 focus:outline-none"
                    />
                  )}
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
                </div>*/}
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
