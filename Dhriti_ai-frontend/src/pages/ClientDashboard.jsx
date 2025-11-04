import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import FileUpload from '../components/FileUpload.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

function ClientDashboard() {
  const [stats, setStats] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadFeedback, setUploadFeedback] = useState({ message: '', type: '' });

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      const token = getToken();
      if (!token) {
        setError('Authentication token not found. Please log in.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/client/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: 'Failed to fetch dashboard data.' }));
          throw new Error(err.detail);
        }
        const data = await response.json();
        setStats(data.stats || []);
        setProjects(data.projects || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  const handleFileSelected = async (file) => {
    if (!file) return;

    setUploadFeedback({ message: 'Uploading...', type: 'info' });
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/client/upload/file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || 'Upload failed.');
      }
      setUploadFeedback({ message: result.message, type: 'success' });
    } catch (err) {
      setUploadFeedback({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <header>
            <h1 className="text-2xl font-semibold text-slate-800">Client Portal</h1>
            <p className="text-sm text-slate-600">Here's the latest on your projects.</p>
          </header>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Project Progress</h2>
            {loading ? (
              <p className="text-slate-500">Loading stats...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.map((stat) => (
                  <div key={stat.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="text-3xl">{stat.icon}</div>
                      <div>
                        <div className="text-2xl font-bold text-slate-800">{stat.value.toLocaleString()}</div>
                        <div className="text-sm font-medium text-slate-500">{stat.label}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Your Projects</h2>
            {loading ? (
              <p className="text-slate-500">Loading projects...</p>
            ) : projects.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                You are not assigned to any projects yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="p-3 font-medium">Project Name</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                        <td className="p-3 font-medium text-slate-800">{project.name}</td>
                        <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${project.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{project.status}</span></td>
                        <td className="p-3"><div className="w-full bg-slate-200 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${project.progress}%` }}></div></div><span className="text-xs text-slate-500 ml-2">{project.progress}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Upload Data</h2>
            <p className="text-sm text-slate-600">Upload your JSON, Excel, or CSV files here for processing.</p>
            <FileUpload onFileSelected={handleFileSelected} accept=".json,.csv,.xlsx,.xls" />
            {uploadFeedback.message && <div className={`rounded-lg px-3 py-2 text-sm ${uploadFeedback.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>{uploadFeedback.message}</div>}
          </section>
        </div>
      </main>
    </div>
  );
}

export default ClientDashboard;