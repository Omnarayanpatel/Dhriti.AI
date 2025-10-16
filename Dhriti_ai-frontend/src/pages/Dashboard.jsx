import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import StatCard from '../components/StatCard.jsx'
import { getToken } from '../utils/auth.js'

const API_BASE = 'http://localhost:8000'

function Dashboard() {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadStats() {
      const token = getToken()
      if (!token) {
        setError('You need to log in to view the dashboard.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const response = await fetch(`${API_BASE}/dashboard/summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || 'Unable to load dashboard metrics right now.')
        }

        const data = await response.json()
        setStats(data.stats ?? [])
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    loadStats()

    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="md:flex md:gap-0">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Topbar />
          <div className="p-4 md:p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-slate-500">Overview of your platform metrics</p>
            </div>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            ) : null}
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading metrics…</div>
            ) : stats.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((s) => (
                  <StatCard key={s.id} label={s.label} value={s.value} trend={s.trend} icon={s.icon} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                No metrics available yet.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Dashboard


