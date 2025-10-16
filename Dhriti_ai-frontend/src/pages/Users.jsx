import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Topbar from '../components/Topbar.jsx'
import DataTable from '../components/DataTable.jsx'
import Modal from '../components/Modal.jsx'
import { getToken } from '../utils/auth.js'

const API_BASE = 'http://localhost:8000'

function Users() {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold">Users</h1>
              <p className="text-slate-500">Manage admins, experts and vendors</p>
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <TabLink to="admins" label="Admins" />
            <TabLink to="experts" label="Experts" />
            <TabLink to="vendors" label="Vendors" />
          </div>

          <Routes>
            <Route path="" element={<Navigate to="admins" replace />} />
            <Route path="admins" element={<UsersTable role="admin" roleLabel="Admin" />} />
            <Route path="experts" element={<UsersTable role="expert" roleLabel="Expert" />} />
            <Route path="vendors" element={<UsersTable role="vendor" roleLabel="Vendor" />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function TabLink({ to, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `px-3 py-1.5 rounded-lg border text-sm ${isActive ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{label}</NavLink>
  )
}

function UsersTable({ role, roleLabel }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setActionError('')
      const token = getToken()
      if (!token) {
        throw new Error('You need to log in again.')
      }

      const response = await fetch(`${API_BASE}/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Unable to load users right now.')
      }

      const data = await response.json()
      const filtered = data.filter((user) => user.role === role)
      const mapped = filtered.map((user) => ({
        id: user.id,
        name: user.name || '',
        email: user.email,
        phone: user.phone || '',
        status: user.status || 'Active',
        role: user.role,
      }))
      setRows(mapped)
    } catch (err) {
      setError(err.message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const columns = useMemo(() => ([
    { Header: 'Name', accessor: 'name' },
    { Header: 'Email', accessor: 'email' },
    {
      Header: 'Phone',
      accessor: 'phone',
      Cell: (value) => value || '—',
    },
    {
      Header: 'Status',
      accessor: 'status',
      Cell: (value) => (
        <span className={`px-2 py-1 rounded-full text-xs ${value === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {value || 'Unknown'}
        </span>
      ),
    },
  ]), [])

  const onDelete = async (row) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${row.email}?`)) {
      return
    }

    try {
      setActionError('')
      const token = getToken()
      if (!token) {
        throw new Error('You need to log in again.')
      }

      const response = await fetch(`${API_BASE}/users/${row.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.status !== 204) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Unable to delete user.')
      }

      setRows((r) => r.filter((x) => x.id !== row.id))
    } catch (err) {
      setActionError(err.message)
    }
  }

  const onEdit = (row) => {
    setActionError('')
    setEditing({ ...row, password: '' })
    setModalOpen(true)
  }

  const onAdd = () => {
    setActionError('')
    setEditing({
      id: null,
      name: '',
      email: '',
      phone: '',
      status: 'Active',
      role: role,
      password: '',
    })
    setModalOpen(true)
  }

  const onSave = async (e) => {
    e.preventDefault()
    if (!editing) return

    try {
      setSaving(true)
      setActionError('')

      const form = new FormData(e.currentTarget)
      const token = getToken()
      if (!token) {
        throw new Error('You need to log in again.')
      }

      const isEdit = Boolean(editing.id)
      const url = isEdit ? `${API_BASE}/users/${editing.id}` : `${API_BASE}/users`
      const name = (form.get('name') || '').toString().trim()
      const phoneRaw = (form.get('phone') || '').toString().trim()
      const status = (form.get('status') || 'Active').toString().trim()
      const email = (form.get('email') || '').toString().trim()
      const passwordRaw = (form.get('password') || '').toString()

      const payload = isEdit
        ? {
            name,
            phone: phoneRaw || null,
            status: status || 'Active',
            role: role,
          }
        : {
            name,
            email,
            phone: phoneRaw || null,
            status: status || 'Active',
            role: role,
            password: passwordRaw.trim(),
          }

      if (isEdit && passwordRaw.trim()) {
        payload.password = passwordRaw.trim()
      }

      if (!isEdit && !payload.password) {
        throw new Error('Password is required for new users.')
      }

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payloadErr = await response.json().catch(() => ({}))
        throw new Error(payloadErr.detail || 'Unable to save user.')
      }

      await loadUsers()
      setModalOpen(false)
      setEditing(null)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onAdd} className="px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">Add {roleLabel}</button>
      </div>
      {error && <div className="px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>}
      {actionError && !error && <div className="px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg">{actionError}</div>}
      {loading ? (
        <div className="px-3 py-6 text-center text-slate-500">Loading users...</div>
      ) : (
        <DataTable columns={columns} data={rows} onEdit={onEdit} onDelete={onDelete} />
      )}

      <Modal title={`${editing?.id ? 'Edit' : 'Add'} ${roleLabel}`} isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={onSave} className="space-y-3">
          <input type="hidden" name="id" defaultValue={editing?.id ?? ''} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input name="name" defaultValue={editing?.name} required className="w-full px-3 py-2 rounded-lg border" />
            </div>
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input name="email" type="email" defaultValue={editing?.email} required={!editing?.id} disabled={Boolean(editing?.id)} className="w-full px-3 py-2 rounded-lg border disabled:bg-slate-100" />
            </div>
            <div>
              <label className="block text-sm mb-1">Phone</label>
              <input name="phone" defaultValue={editing?.phone} required className="w-full px-3 py-2 rounded-lg border" />
            </div>
            <div>
              <label className="block text-sm mb-1">Status</label>
              <select name="status" defaultValue={editing?.status} className="w-full px-3 py-2 rounded-lg border">
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Password {editing?.id ? '(leave blank to keep)' : ''}</label>
              <input name="password" type="password" placeholder={editing?.id ? '******' : ''} className="w-full px-3 py-2 rounded-lg border" required={!editing?.id} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-2 rounded-lg border">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Users


