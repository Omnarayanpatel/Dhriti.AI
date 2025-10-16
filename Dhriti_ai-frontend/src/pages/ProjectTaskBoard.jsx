import React, { useEffect } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import TaskTab from './project-board/TaskTab.jsx'
import ConfigTab from './project-board/ConfigTab.jsx'
import {
  CONFIG_SUBTABS,
  MOCK_CONFIGS,
  MOCK_TASKS,
  NAV_TABS,
  STATUS_FILTERS,
} from './project-board/data.js'

function formatProjectName(slug) {
  if (!slug) return 'Untitled Project'
  const replaced = slug.replace(/[-_]+/g, ' ')
  return replaced
    .split(' ')
    .map(token => (token.length <= 3 ? token.toUpperCase() : token[0].toUpperCase() + token.slice(1)))
    .join(' ')
}

export default function ProjectTaskBoard() {
  const { projectId, tabId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const preservedState = location.state
  const projectFromState = preservedState?.project
  const projectName = projectFromState?.name || formatProjectName(projectId)
  const projectStatus = projectFromState?.status || 'Active'

  useEffect(() => {
    const tabExists = NAV_TABS.some(tab => tab.id === tabId)
    if (!tabId || !tabExists) {
      navigate(`/projects/${projectId}/board/task`, {
        replace: true,
        state: preservedState,
      })
    }
  }, [tabId, projectId, navigate, preservedState])

  const activeTabId = NAV_TABS.some(tab => tab.id === tabId) ? tabId : 'task'
  const activeTab = NAV_TABS.find(tab => tab.id === activeTabId) ?? NAV_TABS[0]

  const renderActiveTab = () => {
    if (activeTabId === 'task') {
      return <TaskTab tasks={MOCK_TASKS} statusFilters={STATUS_FILTERS} />
    }
    if (activeTabId === 'config') {
      return <ConfigTab categories={CONFIG_SUBTABS} configs={MOCK_CONFIGS} />
    }
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
        {activeTab.label} view coming soon.
      </div>
    )
  }

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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm space-y-6">
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

              <nav className="flex flex-wrap gap-2 text-sm">
                {NAV_TABS.map(tab => (
                  <NavLink
                    key={tab.id}
                    to={`/projects/${projectId}/board/${tab.id}`}
                    state={preservedState}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1.5 transition ${
                        isActive
                          ? 'bg-blue-600 text-white shadow'
                          : 'border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </header>

            {renderActiveTab()}
          </section>
        </div>
      </main>
    </div>
  )
}
