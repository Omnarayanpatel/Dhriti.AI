import React from 'react'

function StatCard({ label, value, trend, icon }) {
  const hasTrend = typeof trend === 'string' && trend.trim() !== '' && trend !== '—'
  const trendLabel = hasTrend ? `${trend} from last period` : 'No change data'
  const trendClass = hasTrend
    ? trend.trim().startsWith('-')
      ? 'text-rose-600'
      : 'text-emerald-600'
    : 'text-slate-400'
  const displayIcon = icon ?? '📊'

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className="text-2xl">{displayIcon}</div>
      </div>
      <div className={`mt-3 text-xs ${trendClass}`}>{trendLabel}</div>
    </div>
  )
}

export default StatCard


