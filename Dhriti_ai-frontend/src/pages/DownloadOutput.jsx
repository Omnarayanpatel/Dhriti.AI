import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

function DownloadOutput() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError('Session expired. Please log in again.');
      return;
    }

    const loadProjects = async () => {
      try {
        const response = await fetch(`${API_BASE}/tasks/admin/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Unable to load projects.');
        }
        const payload = await response.json();
        setProjects(Array.isArray(payload) ? payload : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load projects.');
      }
    };

    loadProjects();
  }, []);

  const handleDownload = async () => {
    if (!projectId) {
      setError('Please select a project first.');
      return;
    }

    const token = getToken();
    if (!token) {
      setError('Session expired. Please log in again.');
      return;
    }

    setLoading(true);
    setError('');
    setFeedback('');

    try {
      const response = await fetch(`${API_BASE}/tasks/admin/projects/${projectId}/export-outputs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to export outputs.');
      }

      const blob = await response.blob();
      let filename = `project-${projectId}-outputs.json`;
      const disposition = response.headers.get('Content-Disposition');
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback('Download started successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-800">Download Task Outputs</h1>
            <p className="text-sm text-slate-600">Export all annotations for a selected project as a single JSON file.</p>
          </header>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {feedback && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</div>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Select Project</h2>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none">
              <option value="">Select a project</option>
              {projects.map(project => (<option key={project.id} value={project.id}>{project.name}</option>))}
            </select>
            <button type="button" onClick={handleDownload} disabled={loading || !projectId} className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {loading ? 'Exporting…' : 'Download Outputs'}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DownloadOutput;