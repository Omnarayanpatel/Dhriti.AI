import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';
const PAGE_LIMIT = 40;

const runtimeStyles = {
  shell: {
    borderRadius: 24,
    border: '1px solid #1f2a44',
    background: 'linear-gradient(180deg,#0e162a,#0b1528)',
    padding: 24,
    overflow: 'auto',
    minHeight: 600,
  },
  canvas: {
    position: 'relative',
    width: '100%',
    minHeight: 900,
    margin: '0 auto',
  },
  layer: {
    position: 'relative',
    transformOrigin: '0 0',
  },
  block: {
    position: 'absolute',
    border: '1px solid #1f2a44',
    borderRadius: 14,
    background: 'rgba(14,22,42,.92)',
    boxShadow: '0 6px 16px rgba(0,0,0,.25)',
    color: '#eaf1ff',
    overflow: 'hidden',
  },
  options: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: 10,
  },
  opt: {
    padding: 10,
    border: '1px solid #1f2a44',
    borderRadius: 10,
    background: '#0d1830',
    textAlign: 'center',
  },
};

function TaskTemplatePlayer() {
  const { templateId } = useParams();

  const [template, setTemplate] = useState(null);
  const [schema, setSchema] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
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

  const blocks = template?.layout || [];

  const canvasMinHeight = useMemo(() => {
    const maxBottom = blocks.reduce(
      (acc, block) => Math.max(acc, block.frame.y + block.frame.h),
      0,
    );
    return Math.max(900, maxBottom + 400);
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
      if (!currentTask) {
        return fallback;
      }
      if (rule.source_kind === 'EXCEL_COLUMN') {
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
      if (rule.source_kind === 'CONSTANT') {
        return rule.constant ?? fallback;
      }
      return fallback;
    },
    [currentTask, ruleLookup],
  );

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-800">
              {template ? template.name : 'Template preview'}
            </h1>
            <p className="text-sm text-slate-600">
              Preview the imported tasks rendered with this template. Use the controls
              below to move between tasks.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">
              Task {tasks.length === 0 ? 0 : index + 1} of {total || tasks.length}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={index === 0}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={!hasMore || loadingMore || loading}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : hasMore ? 'Load more tasks' : 'All tasks loaded'}
              </button>
            </div>
          </div>

          {loading && tasks.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Loading template…
            </div>
          ) : null}

          {currentTask ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                  <div>
                    <span className="font-medium text-slate-800">
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
                      className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Open asset
                    </a>
                  ) : null}
                </div>
              </div>

              <div style={{ ...runtimeStyles.shell, minHeight: canvasMinHeight }}>
                <div style={{ ...runtimeStyles.canvas, minHeight: canvasMinHeight }}>
                  <div style={runtimeStyles.layer}>
                    {blocks.map(block => (
                      <ReadonlyBlock
                        key={block.id}
                        block={block}
                        resolve={resolveValue}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {schema.length > 0 ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ReadonlyBlock({ block, resolve }) {
  const baseStyle = {
    ...runtimeStyles.block,
    left: block.frame.x,
    top: block.frame.y,
    width: block.frame.w,
    height: block.frame.h,
  };

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

  return (
    <div style={baseStyle}>
      {block.type === 'Title' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontWeight: 800,
            fontSize: 20,
            textAlign: 'center',
            padding: '0 16px',
          }}
        >
          {titleText}
        </div>
      ) : null}
      {block.type === 'Image' ? (
        <img
          src={imageSrc}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: 12,
          }}
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
        <div style={runtimeStyles.options}>
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
              <div key={idx} style={runtimeStyles.opt}>
                {value}
              </div>
            );
          })}
        </div>
      ) : null}
      {block.type === 'Submit' ? (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            borderRadius: 12,
            background: 'linear-gradient(180deg,#1a2b55,#152546)',
            border: '1px solid #1f2a44',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              border: '1px solid #31426a',
              borderRadius: 10,
              background: '#0b1428',
            }}
          >
            {buttonLabel}
          </div>
        </div>
      ) : null}
      {block.type === 'Timer' ? (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 26,
          }}
        >
          {formatSeconds(duration || 60)}
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
