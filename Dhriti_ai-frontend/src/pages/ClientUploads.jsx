import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Make sure useNavigate is imported
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

function ClientUploads() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate(); // Initialize useNavigate

  async function fetchUploads() {
    setLoading(true);
    setError('');
    const token = getToken();
    if (!token) {
      setError('Authentication token not found. Please log in.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/client-uploads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Failed to fetch uploaded files.' }));
        throw new Error(err.detail);
      }
      const data = await response.json();
      setUploads(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUploads();
  }, []);

  const handleDownload = async (filename) => {
    const token = getToken();
    const url = `${API_BASE}/admin/client-uploads/download/${filename}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Download failed.');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUseData = (upload) => {
    const params = new URLSearchParams();
    params.set('client_upload_file', upload.filename);
    params.set('client_id', upload.client_id);
    navigate(`/tools/json-to-excel?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <header>
            <h1 className="text-2xl font-semibold text-slate-800">Client Uploads</h1>
            <p className="text-sm text-slate-600">View and download files provided by clients.</p>
          </header>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-3 font-medium">Filename</th>
                  <th className="p-3 font-medium">Client</th>
                  <th className="p-3 font-medium">Uploaded At</th>
                  <th className="p-3 font-medium">Size</th>
                  <th className="p-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-500">Loading files...</td></tr>
                ) : uploads.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-500">No files have been uploaded by clients yet.</td></tr>
                ) : (
                  uploads.map((upload) => (
                    <tr key={upload.filename} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                      <td className="p-3 font-medium text-slate-800">{upload.filename}</td>
                      <td className="p-3 text-slate-600">{upload.client_email}</td>
                      <td className="p-3 text-slate-600">{new Date(upload.uploaded_at).toLocaleString()}</td>
                      <td className="p-3 text-slate-600">{upload.size_kb.toFixed(2)} KB</td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleDownload(upload.filename)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-50">Download</button>
                        <button
                          onClick={() => handleUseData(upload)}
                          className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
                          title="Use this file in the Task Import Pipeline"
                        >Use Data</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ClientUploads;