import React, { useMemo, useState } from 'react'

function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status.className}`}>
      {status.label}
    </span>
  )
}

function TaskActions({ isOpenView }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {isOpenView ? null : (
        <button
          type="button"
          className="size-9 rounded-full border border-slate-200 text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
          aria-label="Edit task"
        >
          ✏️
        </button>
      )}
      <button
        type="button"
        className="size-9 rounded-full border border-slate-200 text-red-500 transition hover:border-red-400 hover:text-red-600"
        aria-label="Delete task"
      >
        🗑️
      </button>
    </div>
  )
}

export default function TaskTab({ tasks, statusFilters }) {
  const [activeStatus, setActiveStatus] = useState('ready')
  const [rowsToShow, setRowsToShow] = useState(10)
  const [search, setSearch] = useState('')

  const statusCounts = useMemo(() => {
    return statusFilters.reduce((acc, filter) => {
      acc[filter.id] = tasks.filter(task => task.statusBucket === filter.id).length
      return acc
    }, {})
  }, [statusFilters, tasks])

  const filteredTasks = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase()
    return tasks.filter(task => {
      const matchesStatus = activeStatus ? task.statusBucket === activeStatus : true
      const matchesSearch = trimmedSearch
        ? task.displayId.toLowerCase().includes(trimmedSearch) ||
          (task.taskerAllocation || '').toLowerCase().includes(trimmedSearch) ||
          (task.reviewerPseudo || '').toLowerCase().includes(trimmedSearch)
        : true
      return matchesStatus && matchesSearch
    })
  }, [activeStatus, search, tasks])

  const visibleTasks = filteredTasks.slice(0, rowsToShow)
  const isOpenView = activeStatus === 'open'

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map(filter => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveStatus(filter.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeStatus === filter.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {filter.label}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {statusCounts[filter.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2">
            <span className="text-slate-500">Show rows</span>
            <select
              value={rowsToShow}
              onChange={event => setRowsToShow(Number(event.target.value))}
              className="bg-transparent focus:outline-none"
            >
              {[5, 10, 20, 50].map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="relative">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search task or assignee"
              className="w-56 rounded-full border border-slate-200 px-4 py-2 pr-9 text-sm focus:border-blue-400 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">⌘K</span>
          </div>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
            aria-label="Open filters"
          >
            ☰
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-4">Task Name</th>
              <th className="p-4">Task Status</th>
              <th className="p-4">Tasker Pseudo Name</th>
              <th className="p-4">Tasker Allocation</th>
              <th className="p-4">Reviewer Pseudo Name</th>
              <th className="p-4">Review Allocation</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {visibleTasks.map(task => {
              const statusLabel = isOpenView ? 'NOT ALLOCATED' : task.taskStatus
              const statusClass = isOpenView
                ? 'bg-slate-100 text-slate-500'
                : task.taskStatus === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-600'
                : task.taskStatus === 'IN_PROGRESS'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-500'

              return (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-slate-100 px-3 py-1 font-mono text-xs text-slate-600">
                        {task.displayId}
                      </span>
                      <button
                        type="button"
                        className="text-blue-600 hover:text-blue-500"
                        aria-label="View task details"
                      >
                        ›
                      </button>
                    </div>
                  </td>
                  <td className="p-4">
                    <StatusBadge status={{ label: statusLabel, className: statusClass }} />
                  </td>
                  <td className="p-4">{task.taskerPseudo || '—'}</td>
                  <td className="p-4">
                    {isOpenView ? (
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
                        aria-label="Allocate tasker"
                      >
                        +
                      </button>
                    ) : (
                      <span className="text-slate-900">{task.taskerAllocation || '—'}</span>
                    )}
                  </td>
                  <td className="p-4">{task.reviewerPseudo || '—'}</td>
                  <td className="p-4">
                    {isOpenView ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="text-slate-900">{task.reviewAllocation || '—'}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <TaskActions isOpenView={isOpenView} />
                  </td>
                </tr>
              )
            })}
            {visibleTasks.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No tasks match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {visibleTasks.length} of {filteredTasks.length} tasks
        </span>
        <span>
          Need a different dataset? Contact operations to update task allocations.
        </span>
      </footer>
    </>
  )
}
