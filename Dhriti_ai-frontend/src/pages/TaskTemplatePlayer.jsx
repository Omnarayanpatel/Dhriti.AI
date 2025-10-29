import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import NotificationBanner from '../components/NotificationBanner.jsx';
import { getToken } from '../utils/auth.js';
import TaskSuccessModal from '../components/TaskSuccessModal.jsx';

const API_BASE = 'http://localhost:8000';
const PAGE_LIMIT = 40;

const runtimeStyles = {
  shell: {
    // Styles were here, now handled by TailwindCSS
  },
};

function TaskTemplatePlayer() {
  const { templateId } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState(null);
  const [schema, setSchema] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [annotations, setAnnotations] = useState({});
  const [theme, setTheme] = useState('light'); // 'light' or 'dark'
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ message: '', type: '' });
  const pendingAdvanceRef = useRef(false);
  const previousCountRef = useRef(0);

  const fetchPage = useCallback(
    async (offset, append) => {
      const token = getToken();
      if (!token) {
        setError('Session expired. Please log in again.');
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `${API_BASE}/tasks/templates/${templateId}/tasks?limit=${PAGE_LIMIT}&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }

        if (!response.ok) {
          const detail = payload?.detail || 'Unable to load template.';
          throw new Error(detail);
        }

        const fetchedTasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
        const resolvedTemplate = payload?.template || null;
        const resolvedSchema = Array.isArray(payload?.schema) ? payload.schema : [];
        const resolvedTotal = typeof payload?.total === 'number' ? payload.total : fetchedTasks.length;

        if (append) {
          setTasks(prev => [...prev, ...fetchedTasks]);
        } else {
          setTasks(fetchedTasks);
          setIndex(0);
        }

        if (resolvedTemplate) {
          setTemplate(resolvedTemplate);
        }
        setSchema(resolvedSchema);
        setTotal(resolvedTotal);

        if (append && fetchedTasks.length === 0) {
          pendingAdvanceRef.current = false;
        }

        const nextOffset = offset + fetchedTasks.length;
        setHasMore(nextOffset < resolvedTotal);
        setError('');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        pendingAdvanceRef.current = false;
        setError(err instanceof Error ? err.message : 'Unable to load template.');
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [templateId],
  );

  useEffect(() => {
    setTemplate(null);
    setSchema([]);
    setTasks([]);
    setTotal(0);
    setIndex(0);
    setHasMore(false);
    setError('');
    fetchPage(0, false);
  }, [fetchPage]);

  // Reset annotations when the task index changes
  useEffect(() => {
    setAnnotations({});
  }, [index]);

  useEffect(() => {
    if (
      pendingAdvanceRef.current &&
      tasks.length > previousCountRef.current
    ) {
      setIndex(previousCountRef.current);
      pendingAdvanceRef.current = false;
    }
    previousCountRef.current = tasks.length;
  }, [tasks.length]);

  useEffect(() => {
    if (tasks.length === 0) {
      setIndex(0);
      return;
    }
    if (index >= tasks.length) {
      setIndex(tasks.length - 1);
    }
  }, [index, tasks.length]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) {
      return;
    }
    previousCountRef.current = tasks.length;
    fetchPage(tasks.length, true);
  }, [fetchPage, hasMore, loading, loadingMore, tasks.length]);

  const handlePrev = () => {
    setIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    if (index < tasks.length - 1) {
      setIndex(prev => prev + 1);
      return;
    }
    if (hasMore && !loadingMore && !loading) {
      pendingAdvanceRef.current = true;
      previousCountRef.current = tasks.length;
      fetchPage(tasks.length, true);
    }
  };

  const handleAnnotationChange = useCallback((blockId, value) => {
    setAnnotations(prev => ({ ...prev, [blockId]: value }));
  }, []);

  const handleSubmit = async () => {
    if (!currentTask || !template) {
      alert('Cannot submit: task or template data is missing.');
      return;
    }

    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please log in again to submit.');
      return;
    }

    const payload = {
      task_id: currentTask.task_id,
      project_id: template.project_id,
      template_id: template.id,
      annotations: annotations,
    };

    try {
      const response = await fetch(`${API_BASE}/tasks/${currentTask.task_id}/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to submit annotations.');
      }

      // Show the success modal instead of the banner
      setShowSuccessModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setSubmitStatus({ message: `Submission failed: ${message}`, type: 'error' });
    }
  };

  const handleDiscard = async () => {
    setSubmitStatus({ message: '', type: '' }); // Clear any previous messages
    if (!currentTask || !template) {
      alert('Cannot discard: task or template data is missing.');
      return;
    }

    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please log in again to submit.');
      return;
    }

    const payload = {
      task_id: currentTask.task_id,
      project_id: template.project_id,
      template_id: template.id,
      discarded: true,
    };

    try {
      const response = await fetch(`${API_BASE}/tasks/${currentTask.task_id}/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to discard task.');
      }
      handleNext(); // Success, move to the next task
    } catch (err) {
      setSubmitStatus({ message: `Discard failed: ${err instanceof Error ? err.message : 'An unknown error occurred.'}`, type: 'error' });
    }
  };

  // Handler for the "Next Task" button in the success modal
  const handleGoToNext = () => {
    setShowSuccessModal(false);
    handleNext();
  };

  // Handler for the "Go to Home" button in the success modal
  const handleGoHome = () => {
    setShowSuccessModal(false);
    navigate('/tasks'); // Navigate to the main tasks dashboard
  };

  const blocks = template?.layout || [];

  const canvasMinHeight = useMemo(() => {
    const maxBottom = blocks.reduce(
      (acc, block) => Math.max(acc, block.frame.y + block.frame.h),
      0,
    );
    return Math.max(900, maxBottom + 100);
  }, [blocks]);

  const ruleLookup = useMemo(() => {
    const map = new Map();
    if (template?.rules) {
      template.rules.forEach(rule => {
        map.set(`${rule.component_key}::${rule.target_prop}`, rule);
      });
    }
    return map;
  }, [template]);

  const currentTask = tasks[index] || null;

  const resolveValue = useCallback(
    (blockId, targetProp, fallback) => {
      const rule = ruleLookup.get(`${blockId}::${targetProp}`);
      if (!rule) {
        return fallback;
      }
      if (rule.source_kind === 'CONSTANT') {
        return rule.constant ?? fallback;
      }
      if (rule.source_kind === 'EXCEL_COLUMN' && currentTask) {
        const key = rule.source_path;
        if (!key) {
          return fallback;
        }
        const payload = currentTask.payload || {};
        if (payload[key] != null && payload[key] !== '') {
          return payload[key];
        }
        if (currentTask[key] != null && currentTask[key] !== '') {
          return currentTask[key];
        }
        return fallback;
      }
      return fallback;
    },
    [currentTask, ruleLookup],
  );

  return (
    <div className={`min-h-screen md:flex ${theme === 'light' ? 'bg-slate-50' : 'bg-slate-900'}`}>
      <Sidebar />
      <main className="flex-1 min-w-0">
        
        <div className={`mx-auto max-w-6xl p-4 md:p-6 space-y-6 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>
          <div className="space-y-1">
            <h1 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
              {template ? template.name : 'Template preview'}
            </h1>
            <p className="text-sm text-slate-600">
              Start task
            </p>
          </div>

          {/* General page loading error */}
          {error && (
            <NotificationBanner message={error} type="error" onClose={() => setError('')} duration={0} />
          )}

          {/* Submission Status Message */}
          <NotificationBanner
            message={submitStatus.message}
            type={submitStatus.type}
            onClose={() => setSubmitStatus({ message: '', type: '' })}
          />

          <div className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 shadow-sm ${theme === 'light' ? 'border border-slate-200 bg-white' : 'border border-slate-700 bg-slate-800'}`}>
            <div className="text-sm text-slate-500">
              Task {tasks.length === 0 ? 0 : index + 1} of {total || tasks.length}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={index === 0}
                className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${theme === 'light' ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  tasks.length === 0 ||
                  (index === tasks.length - 1 && !hasMore)
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${theme === 'light' ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${theme === 'light' ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
              >
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </button>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={!hasMore || loadingMore || loading}
                className={`rounded-lg px-3 py-2 text-sm font-medium shadow disabled:cursor-not-allowed disabled:opacity-50 ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-600 text-slate-100 hover:bg-slate-500'}`}
              >
                {loadingMore ? 'Loading…' : hasMore ? 'Load more tasks' : 'All tasks loaded'}
              </button>
            </div>
          </div>

          {loading && tasks.length === 0 ? ( // This part remains the same as it's a loading state
            <div className={`rounded-xl p-6 text-sm ${theme === 'light' ? 'border border-slate-200 bg-white text-slate-500' : 'border border-slate-700 bg-slate-800 text-slate-400'}`}>
              Loading template…
            </div>
          ) : null}

          {currentTask ? (
            <div className="space-y-4">
              <div className={`rounded-2xl p-4 shadow-sm ${theme === 'light' ? 'border border-slate-200 bg-white' : 'border border-slate-700 bg-slate-800'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                  <div>
                    <span className={`font-medium ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
                      {currentTask.task_name || 'Untitled task'}
                    </span>
                    {currentTask.file_name ? (
                      <span className="ml-2 text-slate-500">{currentTask.file_name}</span>
                    ) : null}
                  </div>
                  {currentTask.s3_url ? (
                    <a
                      href={currentTask.s3_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-lg border px-3 py-1 text-sm ${theme === 'light' ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Open asset
                    </a>
                  ) : null}
                </div>
              </div>

              <div className={`rounded-2xl p-4 shadow-sm ${theme === 'light' ? 'border border-slate-200 bg-white' : 'border border-slate-700 bg-slate-800'}`} style={{ minHeight: canvasMinHeight }}>
                <div className="relative w-full" style={{ minHeight: canvasMinHeight }}>
                  <div className="relative origin-top-left">
                    {blocks.map(block => (
                      <PerformableBlock
                        key={block.id}
                        block={block}
                        resolve={resolveValue}
                        annotations={annotations}
                        onAnnotationChange={handleAnnotationChange}
                        theme={theme}
                        onSubmit={handleSubmit}
                        onDiscard={handleDiscard}
                      />
                    ))}
                  </div>
                </div>
              </div>

             {/* {schema.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-medium text-slate-700">Excel schema</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {schema.map(field => (
                      <span
                        key={field.key}
                        className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1"
                        title={field.label}
                      >
                        {field.key}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null} */}
            </div>
          ) : null}
        </div>
        {/* Render the success modal */}
        <TaskSuccessModal show={showSuccessModal} onNext={handleGoToNext} onHome={handleGoHome} />
      </main>
    </div>
  );
}

function PerformableBlock({ block, resolve, annotations, onAnnotationChange, onSubmit, onDiscard, theme }) {
  const titleText =
    block.type === 'Title'
      ? resolve(block.id, 'text', block.props?.text ?? '')
      : null;
  const imageSrc =
    block.type === 'Image'
      ? resolve(block.id, 'src', block.props?.src ?? '')
      : null;
  const audioSrc =
    block.type === 'Audio'
      ? resolve(block.id, 'src', block.props?.src ?? '')
      : null;
  const buttonLabel =
    block.type === 'Submit'
      ? resolve(block.id, 'label', block.props?.label ?? 'Submit')
      : null;
  const duration =
    block.type === 'Timer'
      ? Number(resolve(block.id, 'duration', block.props?.duration ?? 60))
      : null;
  const textContent =
    block.type === 'Text'
      ? resolve(block.id, 'content', block.props?.content ?? '')
      : null;
  const questionData =
    block.type === 'Questions'
      ? { question: resolve(block.id, 'question', block.props?.question) } : null;

  let optionsFromBinding = null;
  if (block.type === 'Options4' || block.type === 'Options5') {
    const raw = resolve(block.id, 'source', null);
    if (typeof raw === 'string') {
      optionsFromBinding = raw
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  const currentAnnotation = annotations[block.id];

  return (
    <div
      className={`absolute overflow-hidden rounded-xl shadow-lg ${
        theme === 'light' ? 'border-slate-200 bg-slate-50/50' : 'border-slate-700 bg-slate-800/80'
      }`}
      style={{
        left: block.frame.x,
        top: block.frame.y,
        width: block.frame.w,
        height: block.frame.h,
      }}
    >
      {block.type === 'Title' ? (
        <div
          className={`grid h-full place-items-center p-4 text-center text-xl font-bold ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}
        >
          {titleText}
        </div>
      ) : null}
      {block.type === 'Image' ? (
        <img
          src={imageSrc}
          alt="Task asset"
          className="h-full w-full rounded-xl object-contain"
        />
      ) : null}
      {block.type === 'Audio' ? (
        <div style={{ display: 'grid', alignItems: 'center', height: '100%' }}>
          <audio
            controls
            src={audioSrc}
            style={{ width: '100%' }}
          />
        </div>
      ) : null}
      {block.type === 'Options4' || block.type === 'Options5' ? (
        <div className="grid grid-cols-2 gap-2 p-2">
          {Array.from({
            length: block.type === 'Options4' ? 4 : 5,
          }).map((_, idx) => {
            const fallback =
              (block.props?.options && block.props.options[idx]) ||
              `Option ${idx + 1}`;
            const value =
              optionsFromBinding && optionsFromBinding[idx] !== undefined
                ? optionsFromBinding[idx]
                : fallback;
            return (
              <div
                key={idx}
                onClick={() => onAnnotationChange(block.id, value)}
                className={`cursor-pointer rounded-lg border p-2 text-center text-sm transition-all ${
                  currentAnnotation === value // Selected state
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400 ring-2 ring-blue-500'
                    : theme === 'light' // Unselected light state
                    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600' // Unselected dark state
                }`}
              >
                {value}
              </div>
            );
          })}
        </div>
      ) : null}
      {block.type === 'RadioButtons' ? (
        <div className="grid grid-cols-1 gap-2 p-2">
          {(block.props?.options || []).map((option, idx) => (
            <label
              key={idx}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm transition-all ${
                currentAnnotation === option // Selected state
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400 ring-2 ring-blue-500'
                  : theme === 'light' // Unselected light state
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600' // Unselected dark state
              }`}
            >
              <input
                type="radio"
                name={`radio-${block.id}`}
                checked={currentAnnotation === option}
                onChange={() => onAnnotationChange(block.id, option)}
                className="h-4 w-4 border-slate-400 text-blue-600 focus:ring-blue-500"
              />
              {option}
            </label>
          ))}
        </div>
      ) : null}
      {block.type === 'Checkbox' ? (
        <div className="grid grid-cols-1 gap-2 p-2">
          {(block.props?.options || []).map((option, idx) => {
            const isChecked = Array.isArray(currentAnnotation) && currentAnnotation.includes(option);
            const handleToggle = () => {
              const currentSelection = Array.isArray(currentAnnotation) ? [...currentAnnotation] : [];
              const optionIndex = currentSelection.indexOf(option);
              if (optionIndex > -1) {
                currentSelection.splice(optionIndex, 1);
              } else {
                currentSelection.push(option);
              }
              onAnnotationChange(block.id, currentSelection);
            };
            return (
              <label
                key={idx}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm transition-all ${
                  isChecked // Selected state
                    ? 'border-blue-500 bg-blue-500/20 text-blue-400 ring-2 ring-blue-500'
                    : theme === 'light' // Unselected light state
                    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600' // Unselected dark state
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={handleToggle}
                  className="h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : null}
      {block.type === 'Comments' ? (
        <textarea
          value={currentAnnotation || ''}
          onChange={e => onAnnotationChange(block.id, e.target.value)}
          placeholder={resolve(block.id, 'placeholder', block.props?.placeholder ?? 'Add a comment...')}
          className={`h-full w-full resize-none rounded-xl border-0 p-3 text-sm focus:ring-2 focus:ring-blue-500 ${
            theme === 'light'
              ? 'bg-white text-slate-800 placeholder-slate-400'
              : 'bg-slate-700 text-slate-100 placeholder-slate-400'
          }`}
        />
      ) : null}
      {block.type === 'Text' ? (
        <div
          className={`grid h-full place-items-center p-3 text-center text-sm ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}
        >
          {textContent}
        </div>
      ) : null}
      {block.type === 'Questions' ? (
        <div className="p-2">
          <div className={`rounded-xl p-3 ${theme === 'light' ? 'border border-slate-200 bg-white' : 'border border-slate-700 bg-slate-800'}`}>
            <div className={`font-semibold mb-2 text-sm ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>{questionData.question}</div>
            <div className="grid grid-cols-3 gap-2">
              {['Excellent', 'Good', 'Fair', 'Poor', 'Bad'].map(opt => (
                <label
                  key={opt}
                  className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors text-xs ${
                    currentAnnotation === opt
                      ? (theme === 'light' ? 'bg-indigo-50 border-indigo-400 text-indigo-800' : 'bg-indigo-900/50 border-indigo-600 text-indigo-300')
                      : (theme === 'light' ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-slate-700 border-slate-600 hover:bg-slate-600')
                  }`}
                >
                  <input
                    type="radio"
                    name={`${block.id}-question`}
                    value={opt}
                    checked={currentAnnotation === opt}
                    onChange={() => onAnnotationChange(block.id, opt)}
                    className="sr-only" // Hide the actual radio button
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>

        </div>
      ) : null}
      {block.type === 'Submit' ? (
        <div className={`grid h-full place-items-center rounded-xl p-2 ${theme === 'light' ? 'border border-slate-200 bg-slate-100' : 'border border-slate-700 bg-slate-700'}`}>
          <button
            type="button"
            onClick={onSubmit}
            className="w-full h-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {buttonLabel}
          </button>
        </div>
      ) : null}
      {block.type === 'Timer' ? (
        <div className={`grid h-full place-items-center font-mono text-2xl ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>
          {formatSeconds(duration || 60)}
        </div>
      ) : null}
      {block.type === 'Discard' ? (
        <div className={`grid h-full place-items-center rounded-xl p-2 ${theme === 'light' ? 'border border-slate-200 bg-slate-100' : 'border border-slate-700 bg-slate-700'}`}>
          <div className="w-full space-y-2 text-center">
            <div className={`text-sm font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>
              Discard this task?
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Yes, Discard
              </button>
              <button
                type="button"
                
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                No, Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatSeconds(value) {
  const total = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default TaskTemplatePlayer;
