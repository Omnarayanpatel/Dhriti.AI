import React, { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import FileUpload from '../components/FileUpload.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

function TaskImport() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const formDisabled = useMemo(() => loading, [loading]);

  const handleFileSelected = nextFile => {
    setFile(nextFile ?? null);
    setError('');
    setResult(null);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!file) {
      setError('Please choose an Excel file first.');
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setError('Only .xlsx or .xls files are supported.');
      return;
    }

    const token = getToken();
    if (!token) {
      setError('Session expired. Please log in again.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/batches/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let detail = 'Import failed.';
        try {
          const payload = await response.json();
          detail = payload.detail || detail;
        } catch (parseError) {
          // ignore parsing failure and fall back to default detail
        }
        throw new Error(detail);
      }

      const payload = await response.json();
      setResult(payload);
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
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-800">Import Tasks</h1>
            <p className="text-sm text-slate-600">
              Upload the standard Excel template and the backend will normalize the tasks, questions, and options.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <section className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Excel file</label>
                <FileUpload onFileSelected={handleFileSelected} accept=".xlsx,.xls" disabled={formDisabled} />
                <p className="text-xs text-slate-500">
                  Expected columns: task_id, task_name, file_name, s3_url, questions, options.
                </p>
              </div>
            </section>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {result ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 space-y-1">
                <div className="font-medium">Import succeeded</div>
                <div>Batch ID: {result.batch_id}</div>
                <div>Rows imported: {result.rows_imported}</div>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={formDisabled}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? 'Uploading…' : 'Upload Excel'}
              </button>
              {file ? <span className="text-xs text-slate-500">Selected: {file.name}</span> : null}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default TaskImport;

