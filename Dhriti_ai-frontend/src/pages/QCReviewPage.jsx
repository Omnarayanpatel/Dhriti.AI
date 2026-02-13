import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/auth';
import toast from 'react-hot-toast'; // For success/error messages

const API_BASE = 'http://localhost:8000';

export default function QCReviewPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false); // For full data preview
  const [previewTaskData, setPreviewTaskData] = useState(null); // Data for preview modal
  const [feedback, setFeedback] = useState('');

  // Loading states for individual actions and bulk actions
  const [isAccepting, setIsAccepting] = useState({}); // { taskId: true/false }
  const [isRejecting, setIsRejecting] = useState({});
  const [isBulkAccepting, setIsBulkAccepting] = useState(false);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);

  // Filter states
  const [annotators, setAnnotators] = useState([]);
  const [selectedAnnotator, setSelectedAnnotator] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(''); // Assuming project has a data_category

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default items per page
  const [totalTasks, setTotalTasks] = useState(0);

  // Available statuses for filter dropdown (from backend enums)
  const taskStatuses = [
    { value: '', label: 'All Statuses' },
    { value: 'submitted', label: 'Submitted (Pending QC)' },
    { value: 'qc_rejected', label: 'QC Rejected' },
    { value: 'qc_accepted', label: 'QC Accepted' },
    { value: 'rework', label: 'Rework' },
    { value: 'NEW', label: 'New (Not Started)' }, // Though not typically in QC review
  ];

  // Available categories for filter dropdown (can be fetched from project details or hardcoded)
  const dataCategories = [
    { value: '', label: 'All Categories' },
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'audio', label: 'Audio' },
    { value: 'video', label: 'Video' },
  ];

  const fetchReviewTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    if (!token) {
      setError('Authentication required. Please log in.');
      setLoading(false);
      return;
    }

    const queryParams = new URLSearchParams();
    if (selectedAnnotator) queryParams.append('annotator_id', selectedAnnotator);
    if (selectedCategory) queryParams.append('data_category_filter', selectedCategory);
    if (selectedStatus) queryParams.append('status_filter', selectedStatus);
    queryParams.append('page', currentPage);
    queryParams.append('limit', itemsPerPage);

    try {
      const response = await fetch(`${API_BASE}/tasks/admin/projects/${projectId}/review-tasks?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to fetch tasks for review (HTTP status: ${response.status})`);
      }

      const data = await response.json();
      setTasks(data.tasks || []);
      setTotalTasks(data.total_count || 0);
    } catch (err) {
      setError(err.message);
      toast.error(`Error fetching tasks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedAnnotator, selectedCategory, selectedStatus, currentPage, itemsPerPage]);

  const fetchAnnotators = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      // Fetch all users to populate the annotator filter dropdown
      const response = await fetch(`${API_BASE}/tasks/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to fetch users (HTTP status: ${response.status})`);
      }
      const usersData = await response.json();
      // You might want to filter this list to only include users with annotator-like roles
      const annotatorUsers = usersData.filter(u => ['user', 'expert', 'vendor'].includes(u.role));
      setAnnotators(annotatorUsers);
    } catch (err) {
      // Don't set a page-level error, just log it, as the main functionality can still work
      console.error("Failed to fetch annotators:", err.message);
    }
  }, []);

  useEffect(() => {
    fetchReviewTasks();
    fetchAnnotators();
  }, [fetchReviewTasks, fetchAnnotators]);

  const handleAccept = async (taskId) => {
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/qc/tasks/${taskId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to accept task.');
      }
      toast.success('Task accepted successfully!');
      fetchReviewTasks(); // Refresh list after action
    } catch (err) {
      toast.error(`Error accepting task: ${err.message}`);
    } finally {
      setIsAccepting(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const handleOpenRejectModal = (task) => {
    setSelectedTask(task);
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedTask) return;
    setIsRejecting(prev => ({ ...prev, [selectedTask.id]: true }));
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/qc/tasks/${selectedTask.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ feedback }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to reject task.');
      }

      // As per requirement 4: After rejecting, automatically send for rework
      const reworkResponse = await fetch(`${API_BASE}/qc/tasks/${selectedTask.id}/rework`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!reworkResponse.ok) {
        const errData = await reworkResponse.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to send task for rework after rejection.');
      }

      toast.success('Task rejected and sent for rework!');
      setShowRejectModal(false);
      setFeedback('');
      setSelectedTask(null);
      fetchReviewTasks(); // Refresh list
    } catch (err) {
      toast.error(`Error rejecting task: ${err.message}`);
    } finally {
      setIsRejecting(prev => ({ ...prev, [selectedTask.id]: false }));
    }
  };

  const handleBulkAccept = async () => {
    const tasksToAccept = tasks.filter(task => task.status === 'submitted').map(task => task.id);
    if (tasksToAccept.length === 0) {
      toast('No tasks pending review to accept.', { icon: 'ℹ️' });
      return;
    }

    setIsBulkAccepting(true);
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/qc/tasks/bulk-accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ task_ids: tasksToAccept }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to bulk accept tasks.');
      }
      toast.success(`${tasksToAccept.length} tasks accepted!`);
      fetchReviewTasks();
    } catch (err) {
      toast.error(`Error bulk accepting tasks: ${err.message}`);
    } finally {
      setIsBulkAccepting(false);
    }
  };

  const handleBulkReject = async () => {
    const tasksToReject = tasks.filter(task => task.status === 'submitted').map(task => task.id);
    if (tasksToReject.length === 0) {
      toast('No tasks pending review to reject.', { icon: 'ℹ️' });
      return;
    }

    // For bulk reject, we can ask for a single feedback for all
    const bulkFeedback = prompt("Provide feedback for all rejected tasks (optional):");

    setIsBulkRejecting(true);
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/qc/tasks/bulk-reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ task_ids: tasksToReject, feedback: bulkFeedback }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to bulk reject tasks.');
      }

      // After bulk rejection, automatically send them for rework
      // The backend /qc/tasks/bulk-reject endpoint already handles setting to QC_REJECTED
      // and then to REWORK. So no separate call needed here.

      toast.success(`${tasksToReject.length} tasks rejected and sent for rework!`);
      fetchReviewTasks();
    } catch (err) {
      toast.error(`Error bulk rejecting tasks: ${err.message}`);
    } finally {
      setIsBulkRejecting(false);
    }
  };

  const handleOpenPreviewModal = (task) => {
    setPreviewTaskData(task);
    setShowPreviewModal(true);
  };

  const totalPages = Math.ceil(totalTasks / itemsPerPage);
  const getAnnotatorName = (id) => {
    const annotator = annotators.find(a => a.id === id);
    return annotator ? annotator.email : 'Unknown';
  };

  const getTaskCategoryLabel = (value) => {
    const category = dataCategories.find(c => c.value === value);
    return category ? category.label : value;
  };

  const getTaskStatusLabel = (value) => {
    const status = taskStatuses.find(s => s.value === value);
    return status ? status.label : value;
  };

  if (loading) {
    return <div className="p-8">Loading tasks for review...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Quality Control Review</h1>
            <p className="text-sm text-gray-500 mt-1">Project ID: {projectId} ({totalTasks} tasks total)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/admin/dashboard')} className="px-4 py-2 rounded bg-white border text-sm">
              Back to Dashboard
            </button>
            <button
              onClick={handleBulkAccept}
              disabled={isBulkAccepting || tasks.filter(task => task.status === 'submitted').length === 0}
              className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:bg-green-300"
            >
              {isBulkAccepting ? 'Accepting All...' : 'Accept All Pending'}
            </button>
            <button
              onClick={handleBulkReject}
              disabled={isBulkRejecting || tasks.filter(task => task.status === 'submitted').length === 0}
              className="px-4 py-2 rounded bg-red-600 text-white text-sm disabled:bg-red-300"
            >
              {isBulkRejecting ? 'Rejecting All...' : 'Reject All Pending'}
            </button>
          </div>
        </header>

        {/* Filters */}
        <header className="flex items-center justify-between mb-6 p-4 bg-white rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
          <div className="flex gap-4">
            <select
              value={selectedAnnotator}
              onChange={(e) => { setSelectedAnnotator(e.target.value); setCurrentPage(1); }}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">Filter by Annotator</option>
              {annotators.map(user => (
                <option key={user.id} value={user.id}>{user.email}</option>
              ))}
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
              className="border rounded px-3 py-2 text-sm"
            >
              {dataCategories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
              className="border rounded px-3 py-2 text-sm"
            >
              {taskStatuses.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Annotator</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No tasks match the current filters.</td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{task.task_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getAnnotatorName(task.annotator_id)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(task.submitted_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        task.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                        task.status === 'qc_rejected' ? 'bg-red-100 text-red-800' :
                        task.status === 'qc_accepted' ? 'bg-green-100 text-green-800' :
                        task.status === 'rework' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getTaskStatusLabel(task.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {task.status === 'submitted' && (
                        <>
                          <button
                            onClick={() => handleAccept(task.id)}
                            disabled={isAccepting[task.id]}
                            className="px-3 py-1 bg-green-100 text-green-800 rounded-md hover:bg-green-200 disabled:opacity-50"
                          >
                            {isAccepting[task.id] ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => handleOpenRejectModal(task)}
                            disabled={isRejecting[task.id]}
                            className="px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200 disabled:opacity-50"
                          >
                            {isRejecting[task.id] ? 'Rejecting...' : 'Reject'}
                          </button>
                        </>
                      )}
                      {(task.status === 'qc_rejected' || task.status === 'rework') && (
                        <button
                          onClick={() => navigate(`/qc/tasks/${task.id}/rework`)} // This will be a new endpoint for sending back to rework
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                        >
                          Send for Rework
                        </button>
                      )}
                      <button onClick={() => handleOpenPreviewModal(task)} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200">
                        Preview
                      </button>
                      {task.data_category && task.status !== 'qc_accepted' && ( // Allow editing if not accepted
                        <button onClick={() => {
                          // New routing logic based on data_category
                          const category = task.data_category;
                          let reviewPath;

                          // Map data_category to the specific review page
                          if (['image', 'bounding-box', 'polygon', 'segmentation'].includes(category)) {
                            reviewPath = `/qc/image-review/${task.id}`;
                          } else if (['text', 'ner', 'classification'].includes(category)) {
                            reviewPath = `/qc/text-review/${task.id}`;
                          } else if (category === 'audio') {
                            reviewPath = `/qc/audio-review/${task.id}`;
                          } else if (category === 'video') {
                            reviewPath = `/qc/video-review/${task.id}`;
                          }
                          if (reviewPath) navigate(reviewPath, { state: { task } }); // Pass the full task object in the navigation state
                          else toast.error(`No QC review page configured for category: ${category}`);
                        }} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200">View/Edit</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-4 space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-2">Reject Task</h3>
            <p className="text-sm text-gray-600 mb-4">
              Provide feedback for the annotator on why this task is being rejected.
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full border rounded p-2 text-sm"
              rows="4"
              placeholder="e.g., 'The PERSON label was missed for Barack Obama...'"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 border rounded text-sm">
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={isRejecting[selectedTask?.id]}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm disabled:bg-red-300"
              >
                {isRejecting[selectedTask?.id] ? 'Rejecting...' : 'Submit Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewTaskData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Task Data Preview: {previewTaskData.task_name}</h3>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium">Input Data (Payload):</h4>
                <pre className="bg-gray-100 p-3 rounded overflow-x-auto">
                  {JSON.stringify(previewTaskData.payload, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-medium">Submitted Annotations:</h4>
                <pre className="bg-gray-100 p-3 rounded overflow-x-auto">
                  {JSON.stringify(previewTaskData.annotations, null, 2)}
                </pre>
              </div>
              {previewTaskData.annotations?.qc_feedback && (
                <div>
                  <h4 className="font-medium text-red-700">QC Feedback:</h4>
                  <p className="bg-red-50 p-3 rounded border border-red-200">
                    {previewTaskData.annotations.qc_feedback}
                  </p>
                </div>
              )}
              <div>
                <h4 className="font-medium">Other Task Details:</h4>
                <p><strong>ID:</strong> {previewTaskData.id}</p>
                <p><strong>Original Task ID:</strong> {previewTaskData.task_id}</p>
                <p><strong>Status:</strong> {getTaskStatusLabel(previewTaskData.status)}</p>
                <p><strong>Category:</strong> {getTaskCategoryLabel(previewTaskData.data_category)}</p>
                <p><strong>Annotator:</strong> {previewTaskData.annotator_email}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 border rounded text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
