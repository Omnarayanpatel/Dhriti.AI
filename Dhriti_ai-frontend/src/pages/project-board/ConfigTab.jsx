import React, { useMemo, useState } from 'react'

export default function ConfigTab({ categories, configs }) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '')
  const [rowsToShow, setRowsToShow] = useState(10)

  const entries = useMemo(() => {
    return configs[activeCategory] ?? []
  }, [configs, activeCategory])

  const visibleEntries = entries.slice(0, rowsToShow)

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeCategory === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {tab.label}
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
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-500"
          >
            + Add Config
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-4">Order</th>
              <th className="p-4">Type</th>
              <th className="p-4">Config Type</th>
              <th className="p-4">Required</th>
              <th className="p-4">Value</th>
              <th className="p-4">Config Identifier</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {visibleEntries.map(entry => (
              <tr key={`${activeCategory}-${entry.order}`} className="hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-600">{entry.order}</td>
                <td className="p-4 uppercase text-xs font-semibold text-slate-500">{entry.type}</td>
                <td className="p-4 capitalize text-slate-600">{entry.configType}</td>
                <td className="p-4">
                  {entry.required ? (
                    <span className="text-emerald-500">✓</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-4 text-slate-900">{entry.value}</td>
                <td className="p-4 font-mono text-xs text-slate-500">{entry.identifier}</td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="size-9 rounded-full border border-slate-200 text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
                      aria-label="Reorder config"
                    >
                      ☰
                    </button>
                    <button
                      type="button"
                      className="size-9 rounded-full border border-slate-200 text-red-500 transition hover:border-red-400 hover:text-red-600"
                      aria-label="Delete config"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleEntries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No configs in this category yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {visibleEntries.length} of {entries.length} configs
        </span>
        <span>
          Need another configuration group? Contact project operations.
        </span>
      </footer>
    </>
  )
}
