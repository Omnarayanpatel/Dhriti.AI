import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function QCReviewLayout({
  task,
  loading,
  error,
  children, // This will be the specific viewer (e.g., QCImageReview)
  onAccept,
  onReject,
  onSaveEdits,
  isSubmitting,
  onEditToggle,
  editMode,
}) {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  if (loading) {
    return <div className="p-8 text-center">Loading task details...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  if (!task) {
    return <div className="p-8 text-center">Task not found.</div>;
  }

  const handleRejectClick = () => {
    setShowRejectModal(true);
  };

  const handleRejectSubmit = () => {
    onReject(feedback);
    setShowRejectModal(false);
    setFeedback('');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-white border-b">
        <h1 className="text-xl font-semibold">QC Review: {task.task_name}</h1>
        <button onClick={() => navigate(`/qc/project/${task.project_id}`)} className="px-4 py-2 text-sm border rounded">
          Back to Task List
        </button>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Task Metadata */}
        <aside className="w-64 bg-white p-4 border-r overflow-y-auto">
          <h2 className="font-semibold mb-4">Task Details</h2>
          <div className="space-y-2 text-sm">
            <p><strong>Project ID:</strong> {task.project_id}</p>
            <p><strong>Annotator:</strong> {task.annotator_email || 'N/A'}</p>
            <p><strong>Submitted:</strong> {new Date(task.submitted_at).toLocaleString()}</p>
            <p><strong>Status:</strong> <span className="font-mono">{task.status}</span></p>
            <p><strong>Category:</strong> {task.data_category}</p>
          </div>

          {/* Feedback history */}
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Feedback History</h3>
            <div className="text-sm text-gray-500 p-2 border rounded bg-gray-50">
              {/* This would be populated by a loop over task.feedback_history */}
              <p>No previous feedback.</p>
            </div>
          </div>
        </aside>

        {/* Center: Annotation Viewer */}
        <main className="flex-1 p-4 bg-gray-200 overflow-auto">
          {children}
        </main>

        {/* Right Sidebar: Annotation Controls (can be passed from child) */}
        <aside className="w-72 bg-white p-4 border-l overflow-y-auto">
          <h2 className="font-semibold mb-4">Annotations & Labels</h2>
          {/* The specific component can render its controls here if needed */}
        </aside>
      </div>

      {/* Footer: Actions */}
      <footer className="sticky bottom-0 flex items-center justify-center p-4 bg-white border-t gap-4 shadow-up z-10">
        <button onClick={onAccept} disabled={isSubmitting} className="px-6 py-2 bg-green-600 text-white rounded disabled:bg-green-300">
          {isSubmitting ? 'Submitting...' : 'Accept'}
        </button>
        <button onClick={handleRejectClick} disabled={isSubmitting} className="px-6 py-2 bg-red-600 text-white rounded disabled:bg-red-300">
          {isSubmitting ? 'Submitting...' : 'Reject'}
        </button>
        <button onClick={onEditToggle} className={`px-6 py-2 rounded ${editMode ? 'bg-gray-600 text-white' : 'bg-yellow-500 text-white'}`}>
          {editMode ? 'Cancel Edit' : 'Edit'}
        </button>
        <button onClick={onSaveEdits} disabled={isSubmitting || !editMode} className="px-6 py-2 bg-blue-600 text-white rounded disabled:bg-blue-300 disabled:cursor-not-allowed">
          {isSubmitting ? 'Submitting...' : 'Save Edits'}
        </button>
      </footer>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Provide Rejection Feedback</h3>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-full border rounded p-2" rows="4" placeholder="Explain why the task is being rejected..."></textarea>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={handleRejectSubmit} className="px-4 py-2 bg-red-600 text-white rounded">Submit Rejection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}