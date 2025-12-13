import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getToken } from '../utils/auth';

const API_BASE = 'http://localhost:8000';

/**
 * A custom hook to manage the state and logic for a single QC review task.
 * It fetches the task, and provides methods to accept, reject, and save edits.
 * @returns {object} The state and handlers for the QC review.
 */
export function useQCReview() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // Get location to access navigation state

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false); // New state for edit mode

  const fetchTask = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    if (!token) {
      setError('Authentication required.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/tasks/admin/${taskId}`, { // Use the admin endpoint to fetch a single task
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to fetch task (HTTP status: ${response.status})`);
      }

      const data = await response.json();
      setTask(data);
    } catch (err) {
      setError(err.message);
      toast.error(`Error fetching task: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]); // This will still run, but we can optimize it.

  // New effect to prioritize navigation state
  useEffect(() => {
    if (location.state?.task) {
      setTask(location.state.task);
      setLoading(false);
    } else {
      fetchTask();
    }
  }, [taskId, location.state, fetchTask]);

  const onAccept = async () => {
    setIsSubmitting(true);
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/qc/tasks/${taskId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to accept task.');
      toast.success('Task accepted successfully!');
      navigate(`/qc/project/${task.project_id}`); // Corrected navigation path
    } catch (err) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onReject = async (feedback) => {
    if (!feedback) {
      toast.error('Feedback is required to reject a task.');
      return;
    }
    setIsSubmitting(true);
    const token = getToken();
    try {
      // Reject and send for rework in one flow
      await fetch(`${API_BASE}/qc/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feedback }),
      });
      await fetch(`${API_BASE}/qc/tasks/${taskId}/rework`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Task rejected and sent for rework!');
      navigate(`/qc/project/${task.project_id}`); // Corrected navigation path
    } catch (err) {
      toast.error(`Error rejecting task: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Placeholder for saving edits, can be expanded later
  const onSaveEdits = async (newAnnotations) => {
    toast.success('Edits saved (simulation)!');
    console.log('Saving new annotations:', newAnnotations);
    // Here you would have an API call to PATCH the task with new annotations
  };

  const onEditToggle = () => {
    setEditMode(prev => !prev);
  };

  return {
    task,
    loading,
    error,
    isSubmitting,
    editMode,
    onAccept,
    onReject,
    onSaveEdits,
    onEditToggle,
  };
}