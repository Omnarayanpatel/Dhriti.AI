import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';

const PRESETS = {
  Title: { w: 320, h: 80, props: { text: 'Task Title' } },
  Image: {
    w: 420,
    h: 260,
    props: { src: 'https://via.placeholder.com/800x500' },
  },
  Audio: {
    w: 380,
    h: 80,
    props: {
      src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    },
  },
  Options4: {
    w: 460,
    h: 180,
    props: { options: ['A', 'B', 'C', 'D'], selected: null },
  },
  Options5: {
    w: 460,
    h: 220,
    props: { options: ['A', 'B', 'C', 'D', 'E'], selected: null },
  },
  Timer: { w: 200, h: 80, props: { duration: 60 } },
  Submit: { w: 200, h: 70, props: { label: 'Submit' } },
  RadioButtons: {
    w: 460,
    h: 120,
    props: { options: ['Option 1', 'Option 2'], selected: null },
  },
  Checkbox: {
    w: 460,
    h: 120,
    props: { options: ['Check 1', 'Check 2'], selected: [] },
  },
  WorkingTimer: {
    w: 200,
    h: 80,
    props: { duration: 60, running: false },
  },
  Text: {
    w: 400,
    h: 100,
    props: { content: 'Enter your text here' },
  },
  Questions: {
    w: 580,
    h: 150,
    props: { question: 'Rate the quality of the response', selected: null },
  },
  Comments: {
    w: 460,
    h: 120,
    props: { placeholder: 'Add your comment here...', value: '' },
  },
  Discard: {
    w: 300,
    h: 100,
    props: {},
  },
};

const DATA_MODES = Object.freeze({
  BATCH: 'batch',
  PROJECT: 'project',
});

const DEFAULT_SAMPLE_ROW = `{
  "task_id":"T-101",
  "task_name":"Label Vehicle",
  "file_name":"img_001.jpg",
  "S3 bucket links":"https://via.placeholder.com/640x360",
  "input.options":"Car|Bike|Bus|Truck|Van",
  "input.timer":"75"
}`;

const styles = {
  app: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr 380px',
    gridTemplateRows: 'auto 1fr',
    minHeight: '100vh',
    color: '#eaf1ff',
  },
  top: {
    gridColumn: '1 / 4',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid #1f2a44',
    background: 'rgba(14,22,42,.65)',
    backdropFilter: 'blur(6px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  paneTitle: {
    padding: '12px 14px',
    borderBottom: '1px solid #1f2a44',
    fontWeight: 800,
    color: '#cfe0ff',
    background: '#0c162c',
    position: 'sticky',
    top: 0,
    zIndex: 5,
  },
  left: {
    borderRight: '1px solid #1f2a44',
    background: 'linear-gradient(180deg,#0e162a,#0b1528)',
    position: 'sticky',
    top: 56,
    height: 'calc(100vh - 56px)',
    overflow: 'auto',
  },
  right: {
    borderLeft: '1px solid #1f2a44',
    background: 'linear-gradient(180deg,#0e162a,#0b1528)',
    position: 'sticky',
    top: 56,
    height: 'calc(100vh - 56px)',
    overflow: 'auto',
  },
  pad: { padding: 12 },
  center: { position: 'relative', overflow: 'hidden' },
  stage: { position: 'relative', height: 'calc(100vh - 56px)', overflow: 'auto' },
  viewport: { position: 'relative', width: '100%', minHeight: 1400, margin: '24px auto' },
  canvas: {
    position: 'relative',
    width: '100vw',
    minHeight: 900,
    margin: 0,
    paddingBottom: 1200,
    background: 'transparent',
    border: 'none',
  },
  layer: { position: 'relative', inset: 0, transformOrigin: '0 0' },
  block: {
    position: 'absolute',
    border: '1px solid #1f2a44',
    borderRadius: 14,
    background: 'rgba(14,22,42,.92)',
    userSelect: 'none',
    boxShadow: '0 6px 16px rgba(0,0,0,.25)',
  },
  handle: {
    position: 'absolute',
    width: 12,
    height: 12,
    background: 'linear-gradient(180deg,#7aa2ff,#5b8cff)',
    borderRadius: '50%',
    boxShadow: '0 0 0 2px #0a1326',
  },
  options: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 10 },
  opt: {
    padding: 10,
    border: '1px solid #1f2a44',
    borderRadius: 10,
    background: '#0d1830',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'transform .06s ease',
  },
};

const buttonStyle = Object.freeze({
  border: '1px solid #1f2a44',
  background: '#0b1428',
  color: '#eaf1ff',
  padding: '8px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
});

const primaryButtonStyle = Object.freeze({
  borderColor: '#2a3f74',
  background: 'linear-gradient(180deg,#253a6c,#1e305c)',
});

const mutedStyle = { color: '#9fb0d8', fontSize: 12 };
const successStyle = { color: '#34d399', fontSize: 12 };
const errorStyle = { color: '#fca5a5', fontSize: 12 };
const topInputStyle = {
  padding: '6px 10px',
  background: '#0b1428',
  border: '1px solid #1f2a44',
  borderRadius: 10,
  color: '#eaf1ff',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function TemplateBuilderApp() {
  const [dataMode, setDataMode] = useState(DATA_MODES.PROJECT);
  const [batchSources, setBatchSources] = useState([]);
  const [projectSources, setProjectSources] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [availableFields, setAvailableFields] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [templateName, setTemplateName] = useState('New Template');
  const [saveBanner, setSaveBanner] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [blocks, setBlocks] = useState(() => [
    {
      id: uid(),
      type: 'Title',
      frame: { x: 60, y: 60, w: PRESETS.Title.w, h: PRESETS.Title.h },
      props: { ...PRESETS.Title.props },
    },
    {
      id: uid(),
      type: 'Image',
      frame: { x: 60, y: 160, w: PRESETS.Image.w, h: PRESETS.Image.h },
      props: { ...PRESETS.Image.props },
    },
    {
      id: uid(),
      type: 'Options4',
      frame: { x: 520, y: 160, w: PRESETS.Options4.w, h: PRESETS.Options4.h },
      props: { ...PRESETS.Options4.props },
    },
    {
      id: uid(),
      type: 'Audio',
      frame: { x: 60, y: 460, w: PRESETS.Audio.w, h: PRESETS.Audio.h },
      props: { ...PRESETS.Audio.props },
    },
  ]);
  const [selected, setSelected] = useState(null);
  const [scale, setScale] = useState(1);
  const [canvasOnly, setCanvasOnly] = useState(true);
  const [adminRules, setAdminRules] = useState([]);
  const [sampleRow, setSampleRow] = useState(DEFAULT_SAMPLE_ROW);
  const [admComp, setAdmComp] = useState('');
  const [admProp, setAdmProp] = useState('');
  const [admSrcKind, setAdmSrcKind] = useState('EXCEL_COLUMN');
  const [admExcelCol, setAdmExcelCol] = useState('');
  const [admConstVal, setAdmConstVal] = useState('');

  const historyRef = useRef([]);
  const redoStackRef = useRef([]);

  const refreshBatchSources = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setSourceError('Session expired. Please log in again.');
      setBatchSources([]);
      setSelectedBatchId('');
      setAvailableFields([]);
      setSampleRow(DEFAULT_SAMPLE_ROW);
      return;
    }

    setSourceLoading(true);
    setSourceError('');

    try {
      const response = await fetch(`${API_BASE}/tasks/admin/template-sources`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const detail = payload?.detail || 'Failed to load template sources.';
        throw new Error(detail);
      }
      const list = Array.isArray(payload) ? payload : [];
      setBatchSources(list);
      setSelectedBatchId(prev => {
        if (prev && list.some(item => item.batch_id === prev)) {
          return prev;
        }
        return list.length > 0 ? list[0].batch_id : '';
      });
      if (list.length === 0) {
        setAvailableFields([]);
        setSampleRow(DEFAULT_SAMPLE_ROW);
      }
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Unable to load template sources.');
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const refreshProjectSources = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setSourceError('Session expired. Please log in again.');
      setProjectSources([]);
      setSelectedProjectId('');
      setAvailableFields([]);
      setSampleRow(DEFAULT_SAMPLE_ROW);
      return;
    }

    setSourceLoading(true);
    setSourceError('');

    try {
      const response = await fetch(`${API_BASE}/tasks/admin/project-template-sources`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok) {
        const detail = payload?.detail || 'Failed to load project template sources.';
        throw new Error(detail);
      }
      const list = Array.isArray(payload) ? payload : [];
      setProjectSources(list);
      setSelectedProjectId(prev => {
        if (prev && list.some(item => String(item.project_id) === String(prev))) {
          return prev;
        }
        return list.length > 0 ? String(list[0].project_id) : '';
      });
      if (list.length === 0) {
        setAvailableFields([]);
        setSampleRow(DEFAULT_SAMPLE_ROW);
      }
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Unable to load project template sources.');
    } finally {
      setSourceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dataMode === DATA_MODES.BATCH) {
      refreshBatchSources();
    } else {
      refreshProjectSources();
    }
  }, [dataMode, refreshBatchSources, refreshProjectSources]);

  useEffect(() => {
    const selection = dataMode === DATA_MODES.BATCH ? selectedBatchId : selectedProjectId;
    if (!selection) {
      setAvailableFields([]);
      setSampleRow(DEFAULT_SAMPLE_ROW);
      return;
    }

    const controller = new AbortController();
    const token = getToken();
    if (!token) {
      setSourceError('Session expired. Please log in again.');
      setDetailLoading(false);
      return;
    }

    async function fetchDetail() {
      setDetailLoading(true);
      setSourceError('');
      try {
        const endpoint =
          dataMode === DATA_MODES.BATCH
            ? `${API_BASE}/tasks/admin/template-sources/${selection}`
            : `${API_BASE}/tasks/admin/project-template-sources/${selection}`;
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        let payload = null;
        try {
          payload = await response.json();
        } catch (error) {
          payload = null;
        }
        if (!response.ok) {
          const detail = payload?.detail || 'Failed to load template source.';
          throw new Error(detail);
        }
        const schemaList = Array.isArray(payload?.schema) ? payload.schema : [];
        setAvailableFields(schemaList.map(item => item.key));
        if (Array.isArray(payload?.preview_rows) && payload.preview_rows.length > 0) {
          setSampleRow(JSON.stringify(payload.preview_rows[0], null, 2));
        } else {
          setSampleRow(DEFAULT_SAMPLE_ROW);
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          return;
        }
        setSourceError(error instanceof Error ? error.message : 'Unable to load template source.');
      } finally {
        setDetailLoading(false);
      }
    }

    fetchDetail();

    return () => controller.abort();
  }, [dataMode, selectedBatchId, selectedProjectId]);

  const snapshot = useCallback(
    () =>
      JSON.stringify({
        blocks,
        selected,
        adminRules,
        canvasOnly,
        scale,
      }),
    [blocks, selected, adminRules, canvasOnly, scale],
  );

  const restore = useCallback(
    snapshotString => {
      try {
        const state = JSON.parse(snapshotString);
        setBlocks(state.blocks || []);
        setSelected(state.selected ?? null);
        setAdminRules(state.adminRules || []);
        setCanvasOnly(Boolean(state.canvasOnly));
        setScale(state.scale || 1);
      } catch (error) {
        // Ignore malformed snapshots.
      }
    },
    [],
  );

  const saveHistory = useCallback(() => {
    historyRef.current.push(snapshot());
    if (historyRef.current.length > 200) {
      historyRef.current.shift();
    }
    redoStackRef.current.length = 0;
  }, [snapshot]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) {
      return;
    }
    const current = snapshot();
    const previous = historyRef.current.pop();
    redoStackRef.current.push(current);
    restore(previous);
  }, [restore, snapshot]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) {
      return;
    }
    const current = snapshot();
    const next = redoStackRef.current.pop();
    historyRef.current.push(current);
    restore(next);
  }, [restore, snapshot]);

  useEffect(() => {
    saveHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canvasOnly) {
      document.body.classList.add('canvas-only');
    } else {
      document.body.classList.remove('canvas-only');
    }
    return () => {
      document.body.classList.remove('canvas-only');
    };
  }, [canvasOnly]);

  const dragState = useRef(null);
  const resizeState = useRef(null);

  const stageRef = useRef(null);

  const addBlock = type => {
    const preset = PRESETS[type];
    if (!preset) {
      return;
    }
    const block = {
      id: uid(),
      type,
      frame: { x: 60, y: 60, w: preset.w, h: preset.h },
      props: { ...preset.props },
    };
    setBlocks(prev => [...prev, block]);
    setSelected(block.id);
    saveHistory();
  };

  const propertiesFor = useCallback(type => {
    if (type === 'Title') return ['text'];
    if (type === 'Image') return ['src'];
    if (type === 'Audio') return ['src'];
    if (type === 'Submit') return ['label'];
    if (type === 'Timer') return ['duration'];
    if (type === 'Options4' || type === 'Options5') return ['source'];
    if (type === 'RadioButtons' || type === 'Checkbox') return ['options'];
    if (type === 'WorkingTimer') return ['duration', 'running'];
    if (type === 'Text') return ['content'];
    if (type === 'Questions') return ['question'];
    if (type === 'Comments') return ['placeholder', 'value'];
    return [];
  }, []);

  useEffect(() => {
    if (!admComp && blocks.length > 0) {
      setAdmComp(blocks[0].id);
    }
  }, [admComp, blocks]);

  useEffect(() => {
    if (availableFields.length === 0) {
      setAdmExcelCol('');
      return;
    }
    setAdmExcelCol(prev => (prev && availableFields.includes(prev) ? prev : availableFields[0]));
  }, [availableFields]);

  useEffect(() => {
    setSaveBanner(null);
  }, [dataMode, selectedBatchId, selectedProjectId]);

  useEffect(() => {
    const block = blocks.find(item => item.id === admComp);
    if (!block) {
      setAdmProp('');
      return;
    }
    const props = propertiesFor(block.type);
    if (props.length > 0) {
      setAdmProp(props[0]);
    } else {
      setAdmProp('');
    }
  }, [admComp, blocks, propertiesFor]);

  const parseRow = useCallback(() => {
    try {
      return JSON.parse(sampleRow || '{}');
    } catch (error) {
      return {};
    }
  }, [sampleRow]);

  const getBound = useCallback(
    (blockId, targetProp, fallback) => {
      const rule = adminRules.find(
        item => item.component_key === blockId && item.target_prop === targetProp,
      );
      if (!rule) {
        return fallback;
      }
      const row = parseRow();
      if (rule.source_kind === 'EXCEL_COLUMN') {
        const value = row[rule.source_path];
        return value ?? fallback;
      }
      if (rule.source_kind === 'CONSTANT') {
        return rule.constant ?? fallback;
      }
      return fallback;
    },
    [adminRules, parseRow],
  );

  const onBlockMouseDown = (event, id) => {
    if (event.target?.dataset?.role === 'option' || event.target?.dataset?.role === 'media') {
      return;
    }
    setSelected(id);
    const block = blocks.find(item => item.id === id);
    if (!block) {
      return;
    }
    dragState.current = {
      id,
      x0: event.clientX,
      y0: event.clientY,
      bx: block.frame.x,
      by: block.frame.y,
      moved: false,
    };
  };

  useEffect(() => {
    const handleMove = event => {
      if (!dragState.current) {
        return;
      }
      dragState.current.moved = true;
      setBlocks(prev =>
        prev.map(block => {
          if (block.id !== dragState.current.id) {
            return block;
          }
          const x = Math.round(dragState.current.bx + (event.clientX - dragState.current.x0));
          const y = Math.round(dragState.current.by + (event.clientY - dragState.current.y0));
          return { ...block, frame: { ...block.frame, x, y } };
        }),
      );
    };

    const handleUp = () => {
      if (dragState.current?.moved) {
        saveHistory();
      }
      dragState.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [saveHistory]);

  const onHandleMouseDown = (event, id, direction) => {
    event.stopPropagation();
    const block = blocks.find(item => item.id === id);
    if (!block) {
      return;
    }
    resizeState.current = {
      id,
      dir: direction,
      x0: event.clientX,
      y0: event.clientY,
      start: { ...block.frame },
      resized: false,
    };
  };

  useEffect(() => {
    const handleResize = event => {
      if (!resizeState.current) {
        return;
      }
      resizeState.current.resized = true;
      setBlocks(prev =>
        prev.map(block => {
          if (block.id !== resizeState.current.id) {
            return block;
          }
          const { dir, start, x0, y0 } = resizeState.current;
          const dx = event.clientX - x0;
          const dy = event.clientY - y0;
          let { x, y, w, h } = start;

          if (dir === 'se') {
            w = Math.max(60, w + dx);
            h = Math.max(40, h + dy);
          }
          if (dir === 'sw') {
            x = x + dx;
            w = Math.max(60, w - dx);
            h = Math.max(40, h + dy);
          }
          if (dir === 'ne') {
            y = y + dy;
            h = Math.max(40, h - dy);
            w = Math.max(60, w + dx);
          }
          if (dir === 'nw') {
            x = x + dx;
            y = y + dy;
            w = Math.max(60, w - dx);
            h = Math.max(40, h - dy);
          }

          return {
            ...block,
            frame: {
              x: Math.round(x),
              y: Math.round(y),
              w: Math.round(w),
              h: Math.round(h),
            },
          };
        }),
      );
    };

    const handleUp = () => {
      if (resizeState.current?.resized) {
        saveHistory();
      }
      resizeState.current = null;
    };

    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [saveHistory]);

  useEffect(() => {
    const handleKey = event => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Delete' && selected) {
        event.preventDefault();
        saveHistory();
        setBlocks(prev => prev.filter(block => block.id !== selected));
        setSelected(null);
        setAdminRules(prev =>
          prev.filter(rule => rule.component_key !== selected),
        );
        return;
      }
      if (
        selected &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        setBlocks(prev =>
          prev.map(block => {
            if (block.id !== selected) {
              return block;
            }
            const frame = { ...block.frame };
            if (event.key === 'ArrowLeft') frame.x -= step;
            if (event.key === 'ArrowRight') frame.x += step;
            if (event.key === 'ArrowUp') frame.y -= step;
            if (event.key === 'ArrowDown') frame.y += step;
            return { ...block, frame };
          }),
        );
        saveHistory();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [redo, saveHistory, selected, undo]);

  const zoomIn = () => setScale(prev => Math.min(3, prev * 1.1));
  const zoomOut = () => setScale(prev => Math.max(0.5, prev / 1.1));
  const zoomReset = () => setScale(1);

  const toggleFull = async () => {
    const element = stageRef.current;
    if (!element) {
      return;
    }
    if (!document.fullscreenElement) {
      await element.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  const toggleOption = useCallback(
    (id, index) => {
      setBlocks(prev =>
        prev.map(block => {
          if (block.id !== id) {
            return block;
          }
          if (block.type === 'Checkbox') {
            const selected = block.props.selected.includes(index)
              ? block.props.selected.filter(i => i !== index)
              : [...block.props.selected, index];
            return { ...block, props: { ...block.props, selected } };
          }
          const current = block.props.selected;
          const next = current === index ? null : index;
          return { ...block, props: { ...block.props, selected: next } };
        }),
      );
      saveHistory();
    },
    [saveHistory],
  );

  const canvasMinHeight = useMemo(() => {
    const maxBottom = blocks.reduce(
      (acc, block) => Math.max(acc, block.frame.y + block.frame.h),
      0,
    );
    return Math.max(900, maxBottom + 800);
  }, [blocks]);

  const activeBatch = useMemo(
    () => batchSources.find(item => item.batch_id === selectedBatchId) || null,
    [batchSources, selectedBatchId],
  );

  const activeProject = useMemo(
    () =>
      projectSources.find(item => String(item.project_id) === String(selectedProjectId)) || null,
    [projectSources, selectedProjectId],
  );

  const addRule = () => {
    if (!admComp || !admProp) {
      return;
    }
    const kind = admSrcKind;
    const payload = {
      component_key: admComp,
      target_prop: admProp,
      source_kind: kind,
      source_path: null,
      constant: null,
    };
    if (kind === 'EXCEL_COLUMN') {
      const column = admExcelCol || (availableFields.length > 0 ? availableFields[0] : '');
      if (!column) {
        setSaveBanner({
          type: 'error',
          message: 'No data fields available. Import or select a dataset before binding.',
          templateId: null,
        });
        return;
      }
      payload.source_path = column;
    } else {
      payload.constant = admConstVal;
    }
    setAdminRules(prev => {
      const index = prev.findIndex(
        item =>
          item.component_key === admComp && item.target_prop === admProp,
      );
      const next = [...prev];
      if (index >= 0) {
        next[index] = payload;
      } else {
        next.push(payload);
      }
      return next;
    });
    saveHistory();
  };

  const clearRules = () => {
    setAdminRules([]);
    saveHistory();
  };

  const handleSaveTemplate = useCallback(async () => {
    if (savingTemplate) {
      return;
    }
    if (!selectedProjectId) {
      setSaveBanner({
        type: 'error',
        message: 'Select a project before saving the template.',
        templateId: null,
      });
      return;
    }
    const token = getToken();
    if (!token) {
      setSaveBanner({
        type: 'error',
        message: 'Session expired. Please log in again.',
        templateId: null,
      });
      return;
    }

    setSavingTemplate(true);
    setSaveBanner(null);
    try {
      const layoutPayload = JSON.parse(JSON.stringify(blocks));
      const rulesPayload = JSON.parse(JSON.stringify(adminRules));
      const response = await fetch(`${API_BASE}/tasks/admin/templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: Number(selectedProjectId),
          name: templateName.trim() || 'Untitled Template',
          layout: layoutPayload,
          rules: rulesPayload,
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        const detail = payload?.detail || 'Failed to save template.';
        throw new Error(detail);
      }

      const templateId = payload?.id ?? null;
      setSaveBanner({
        type: 'success',
        message: templateId
          ? `Template saved successfully (ID: ${templateId}).`
          : 'Template saved successfully.',
        templateId,
      });
    } catch (error) {
      setSaveBanner({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save template.',
        templateId: null,
      });
    } finally {
      setSavingTemplate(false);
    }
  }, [adminRules, blocks, savingTemplate, selectedProjectId, templateName]);

  const exportProfile = () => {
    const data = JSON.stringify({ blocks, rules: adminRules }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_react_with_bindings_v2.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };

  const inputProps = inputStyle();
  const canSaveTemplate = Boolean(selectedProjectId);
  const saveButtonDisabled = savingTemplate || !canSaveTemplate;
  const saveButtonTitle = (() => {
    if (!selectedProjectId) {
      return 'Select a project to enable saving';
    }
    return 'Save template to backend';
  })();

  return (
    <div style={styles.app} className="app">
      <div style={styles.top}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={mutedStyle}>Template name</span>
          <input
            value={templateName}
            onChange={event => setTemplateName(event.target.value)}
            placeholder="Untitled template"
            style={{ ...topInputStyle, width: 240 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={buttonStyle} onClick={zoomOut} type="button">
            -
          </button>
          <button style={buttonStyle} onClick={zoomReset} type="button">
            {Math.round(scale * 100)}%
          </button>
          <button style={buttonStyle} onClick={zoomIn} type="button">
            +
          </button>
          <button
            style={buttonStyle}
            onClick={() => setCanvasOnly(value => !value)}
            type="button"
          >
            {canvasOnly ? 'Show Sidebars' : 'Hide Sidebars'}
          </button>
          <button style={buttonStyle} onClick={toggleFull} type="button">
            Fullscreen
          </button>
          <button
            style={{ ...buttonStyle, ...primaryButtonStyle }}
            onClick={exportProfile}
            type="button"
            title="Layout + Rules"
          >
            Export
          </button>
          <button
            style={{
              ...buttonStyle,
              ...primaryButtonStyle,
              opacity: saveButtonDisabled ? 0.6 : 1,
              cursor: saveButtonDisabled ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSaveTemplate}
            type="button"
            disabled={saveButtonDisabled}
            title={saveButtonTitle}
          >
            {savingTemplate ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      <div className="left" style={styles.left}>
        <div style={styles.paneTitle}>Add Blocks</div>
        <div style={styles.pad}>
          <div style={{ display: 'grid', gap: 8 }}>
            <button style={buttonStyle} onClick={() => addBlock('Title')} type="button">
              + Title
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Image')} type="button">
              + Image
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Audio')} type="button">
              + Audio
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Options4')} type="button">
              + 4 Options
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Options5')} type="button">
              + 5 Options
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Timer')} type="button">
              + Timer
            </button>
            <button style={buttonStyle} onClick={() => addBlock('Submit')} type="button">
              + Submit
            </button>
            <button style={{ ...buttonStyle, background: '#4ade80' }} onClick={() => addBlock('RadioButtons')} type="button">
              + Radio Buttons
            </button>
            <button style={{ ...buttonStyle, background: '#60a5fa' }} onClick={() => addBlock('Checkbox')} type="button">
              + Checkbox
            </button>
            <button style={{ ...buttonStyle, background: '#f87171' }} onClick={() => addBlock('WorkingTimer')} type="button">
              + Working Timer
            </button>
            <button style={{ ...buttonStyle, background: '#fbbf24' }} onClick={() => addBlock('Text')} type="button">
              + Text
            </button>
            <button style={{ ...buttonStyle, background: '#a78bfa' }} onClick={() => addBlock('Questions')} type="button">
              + Questions
            </button>
            <button style={{ ...buttonStyle, background: '#fca5a5' }} onClick={() => addBlock('Comments')} type="button">
              + Comments
            </button>
            <button
              style={{ ...buttonStyle, background: '#f87171' }}
              onClick={() => addBlock('Discard')}
              type="button"
            >
              + Discard
            </button>
          </div>
          <div style={{ ...mutedStyle, marginTop: 8 }}>
            Tips: Select → Delete, Arrow keys to nudge, Shift+Arrow = 10px
          </div>
        </div>
        <div style={styles.paneTitle}>Inspector</div>
        <div style={styles.pad}>
          {!selected ? (
            <div style={mutedStyle}>Select a block to edit.</div>
          ) : (
            <Inspector
              block={blocks.find(item => item.id === selected)}
              onChange={next => {
                if (!next) {
                  return;
                }
                saveHistory();
                setBlocks(prev =>
                  prev.map(block => (block.id === next.id ? next : block)),
                );
              }}
            />
          )}
        </div>
      </div>

      <div style={styles.center}>
        <div ref={stageRef} className="stage" style={styles.stage}>
          <div style={styles.viewport}>
            <div
              style={{ ...styles.canvas, minHeight: canvasMinHeight }}
              onMouseDown={event => {
                if (event.target === event.currentTarget) {
                  setSelected(null);
                }
              }}
            >
              <div style={{ ...styles.layer, transform: `scale(${scale})` }}>
                {blocks.map(block => (
                  <BlockView
                    key={block.id}
                    block={block}
                    selected={selected === block.id}
                    onMouseDown={event => onBlockMouseDown(event, block.id)}
                    onHandleMouseDown={onHandleMouseDown}
                    onToggleOption={toggleOption}
                    resolve={(target, fallback) =>
                      getBound(block.id, target, fallback)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="right" style={styles.right}>
        <div style={styles.paneTitle}>Admin Bindings (Simple)</div>
        <div style={styles.pad}>
          {saveBanner ? (
            <div style={{
              ...(saveBanner.type === 'success' ? successStyle : errorStyle),
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              <span>{saveBanner.message}</span>
              {saveBanner.templateId ? (
                <button
                  type="button"
                  style={{ ...buttonStyle, padding: '6px 10px' }}
                  onClick={() => {
                    const target = `/templates/${saveBanner.templateId}/play`;
                    window.open(target, '_blank', 'noopener');
                  }}
                >
                  Preview tasks
                </button>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ ...mutedStyle, marginBottom: 6 }}>Data mode</legend>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="data-mode"
                    value={DATA_MODES.PROJECT}
                    checked={dataMode === DATA_MODES.PROJECT}
                    onChange={() => setDataMode(DATA_MODES.PROJECT)}
                  />
                  Project tasks
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="data-mode"
                    value={DATA_MODES.BATCH}
                    checked={dataMode === DATA_MODES.BATCH}
                    onChange={() => setDataMode(DATA_MODES.BATCH)}
                  />
                  Imported batch
                </label>
              </div>
            </fieldset>

            {dataMode === DATA_MODES.BATCH ? (
              <label>
                Imported batch
                <select
                  value={selectedBatchId}
                  onChange={event => setSelectedBatchId(event.target.value)}
                  style={inputProps}
                  disabled={sourceLoading}
                >
                  <option value="">Select a batch…</option>
                  {batchSources.map(source => (
                    <option key={source.batch_id} value={source.batch_id}>
                      {`${source.original_file || source.batch_id} · ${source.row_count} rows`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Project data
                <select
                  value={selectedProjectId}
                  onChange={event => setSelectedProjectId(event.target.value)}
                  style={inputProps}
                  disabled={sourceLoading}
                >
                  <option value="">Select a project…</option>
                  {projectSources.map(source => (
                    <option key={source.project_id} value={String(source.project_id)}>
                      {`${source.project_name} · ${source.total_tasks} tasks`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={{
                  ...buttonStyle,
                  opacity: sourceLoading ? 0.6 : 1,
                  cursor: sourceLoading ? 'not-allowed' : 'pointer',
                }}
                type="button"
                onClick={dataMode === DATA_MODES.BATCH ? refreshBatchSources : refreshProjectSources}
                disabled={sourceLoading}
              >
                {sourceLoading ? 'Refreshing…' : 'Refresh list'}
              </button>
              {detailLoading ? <span style={mutedStyle}>Loading fields…</span> : null}
            </div>

            {dataMode === DATA_MODES.BATCH ? (
              activeBatch ? (
                <div style={mutedStyle}>
                  {(activeBatch.original_file || 'Imported batch')} · {activeBatch.row_count} rows · Status: {activeBatch.status}
                </div>
              ) : (
                <div style={mutedStyle}>
                  Upload the task Excel via the Task Import tool, then refresh this list.
                </div>
              )
            ) : activeProject ? (
              <div style={mutedStyle}>
                {activeProject.project_name} · {activeProject.total_tasks} tasks · Latest task{' '}
                {activeProject.latest_task_at ? new Date(activeProject.latest_task_at).toLocaleString() : '—'}
              </div>
            ) : (
              <div style={mutedStyle}>
                Import or ingest task data for a project, then refresh this list.
              </div>
            )}

            {sourceError ? <div style={errorStyle}>{sourceError}</div> : null}
          </div>

          <div style={mutedStyle}>3 steps: Block → Property → Data</div>
          <label>
            Block
            <select
              value={admComp}
              onChange={event => setAdmComp(event.target.value)}
              style={inputProps}
            >
              {blocks.map(block => (
                <option key={block.id} value={block.id}>
                  {block.type} • {block.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            Property
            <select
              value={admProp}
              onChange={event => setAdmProp(event.target.value)}
              style={inputProps}
            >
              {(blocks.find(item => item.id === admComp)
                ? propertiesFor(blocks.find(item => item.id === admComp).type)
                : []
              ).map(prop => (
                <option key={prop} value={prop}>
                  {prop}
                </option>
              ))}
            </select>
          </label>

          <label>
            Data source
            <div style={{ display: 'flex', gap: 10, margin: '6px 0 10px' }}>
              <label>
                <input
                  type="radio"
                  name="source"
                  value="EXCEL_COLUMN"
                  checked={admSrcKind === 'EXCEL_COLUMN'}
                  onChange={() => setAdmSrcKind('EXCEL_COLUMN')}
                />
                {' Data field'}
              </label>
              <label>
                <input
                  type="radio"
                  name="source"
                  value="CONSTANT"
                  checked={admSrcKind === 'CONSTANT'}
                  onChange={() => setAdmSrcKind('CONSTANT')}
                />
                {' Constant'}
              </label>
            </div>
          </label>

          {admSrcKind === 'EXCEL_COLUMN' ? (
            <label>
              Data field
              <select
                value={admExcelCol}
                onChange={event => setAdmExcelCol(event.target.value)}
                style={inputProps}
                disabled={availableFields.length === 0}
              >
                {availableFields.length === 0 ? (
                  <option value="">No fields detected</option>
                ) : (
                  availableFields.map(header => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : (
            <label>
              Constant value
              <input
                value={admConstVal}
                onChange={event => setAdmConstVal(event.target.value)}
                style={inputProps}
              />
            </label>
          )}

          <div style={{ marginTop: 10 }}>
            <label>
              Sample Row (JSON) — preview
              <textarea
                value={sampleRow}
                onChange={event => setSampleRow(event.target.value)}
                style={{
                  ...inputProps,
                  height: 140,
                  fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
                  fontSize: 12,
                  whiteSpace: 'pre',
                }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              style={{
                ...buttonStyle,
                opacity:
                  admSrcKind === 'EXCEL_COLUMN' && availableFields.length === 0 ? 0.6 : 1,
                cursor:
                  admSrcKind === 'EXCEL_COLUMN' && availableFields.length === 0
                    ? 'not-allowed'
                    : 'pointer',
              }}
              onClick={addRule}
              type="button"
              disabled={admSrcKind === 'EXCEL_COLUMN' && availableFields.length === 0}
            >
              Add rule
            </button>
            <button style={buttonStyle} onClick={clearRules} type="button">
              Clear all
            </button>
            <button
              style={{ ...buttonStyle, ...primaryButtonStyle }}
              onClick={exportProfile}
              type="button"
            >
              Export profile
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>Rules</label>
            {adminRules.length === 0 ? (
              <div style={mutedStyle}>No rules yet.</div>
            ) : (
              adminRules.map((rule, index) => {
                const block = blocks.find(item => item.id === rule.component_key);
                return (
                  <div
                    key={`${rule.component_key}-${rule.target_prop}-${index}`}
                    style={{ ...mutedStyle, padding: '6px 0' }}
                  >
                    <b>{block ? block.type : '(deleted)'} • {rule.component_key}</b>
                    {' → '}
                    <i>{rule.target_prop}</i>
                    {' = '}
                    {rule.source_kind === 'EXCEL_COLUMN'
                      ? `Column: ${rule.source_path}`
                      : `Constant: ${rule.constant || ''}`}
                    <button
                      style={{ ...buttonStyle, marginLeft: 8 }}
                      type="button"
                      onClick={() => {
                        saveHistory();
                        setAdminRules(prev =>
                          prev.filter((_, idx) => idx !== index),
                        );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%',
    padding: '8px 10px',
    background: '#0b1428',
    border: '1px solid #1f2a44',
    borderRadius: 10,
    color: '#eaf1ff',
  };
}

function BlockView({
  block,
  selected,
  onMouseDown,
  onHandleMouseDown,
  onToggleOption,
  resolve,
}) {
  const baseStyle = {
    ...styles.block,
    left: block.frame.x,
    top: block.frame.y,
    width: block.frame.w,
    height: block.frame.h,
    outline: selected ? '2px solid #5b8cff' : 'none',
  };

  const cursorFor = direction => {
    if (direction === 'se') return 'nwse-resize';
    if (direction === 'sw') return 'nesw-resize';
    if (direction === 'ne') return 'nesw-resize';
    return 'nwse-resize';
  };

  const titleText =
    block.type === 'Title'
      ? resolve('text', block.props?.text ?? '')
      : null;
  const imageSrc =
    block.type === 'Image'
      ? resolve('src', block.props?.src ?? '')
      : null;
  const audioSrc =
    block.type === 'Audio'
      ? resolve('src', block.props?.src ?? '')
      : null;
  const buttonLabel =
    block.type === 'Submit'
      ? resolve('label', block.props?.label ?? 'Submit')
      : null;
  const duration =
    block.type === 'Timer'
      ? Number(resolve('duration', block.props?.duration ?? 60))
      : null;

  let optionsFromBinding = null;
  if (block.type === 'Options4' || block.type === 'Options5') {
    const raw = resolve('source', null);
    if (typeof raw === 'string') {
      optionsFromBinding = raw
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  const radioOptions =
    block.type === 'RadioButtons' ? resolve('options', block.props?.options) : null;
  const checkboxOptions =
    block.type === 'Checkbox' ? resolve('options', block.props?.options) : null;
  const workingTimer =
    block.type === 'WorkingTimer'
      ? { duration: resolve('duration', block.props?.duration), running: resolve('running', block.props?.running) }
      : null;
  const textContent = block.type === 'Text' ? resolve('content', block.props?.content) : null;
  const questionData =
    block.type === 'Questions'
      ? { question: resolve('question', block.props?.question), options: ['Excellent', 'Good', 'Fair', 'Poor', 'Bad'] }
      : null;

  const commentData =
    block.type === 'Comments'
      ? { placeholder: resolve('placeholder', block.props?.placeholder), value: resolve('value', block.props?.value) }
      : null;

  const [rating, setRating] = useState(null);
  const [discard, setDiscard] = useState(false);

  return (
    <div style={baseStyle} onMouseDown={onMouseDown}>
      {block.type === 'Title' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontWeight: 800,
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
            data-role="media"
            controls
            src={audioSrc}
            style={{ width: '100%', height: '36px' }}
            onMouseDown={event => event.stopPropagation()}
          />
        </div>
      ) : null}
      {block.type === 'Options4' || block.type === 'Options5' ? (
        <div style={styles.options}>
          {Array.from({
            length: block.type === 'Options4' ? 4 : 5,
          }).map((_, index) => {
            const fallback =
              (block.props.options && block.props.options[index]) ||
              `Option ${index + 1}`;
            const value =
              optionsFromBinding && optionsFromBinding[index] !== undefined
                ? optionsFromBinding[index]
                : fallback;
            const selectedOption = block.props.selected === index;
            return (
              <div
                key={index}
                data-role="option"
                onMouseDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  onToggleOption(block.id, index);
                }}
                style={{
                  ...styles.opt,
                  borderColor: selectedOption ? '#5b8cff' : '#1f2a44',
                  outline: selectedOption
                    ? '2px solid rgba(91,140,255,.35)'
                    : 'none',
                  background: selectedOption
                    ? 'linear-gradient(180deg,#12234a,#0e1d3c)'
                    : '#0d1830',
                }}
              >
                {value}
              </div>
            );
          })}
        </div>
      ) : null}
      {block.type === 'RadioButtons' ? (
        <div style={{ ...styles.options, gridTemplateColumns: '1fr' }}>
          {radioOptions.map((option, index) => (
            <label key={index} style={{ ...styles.opt, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name={`radio-${block.id}`}
                checked={block.props.selected === index}
                onChange={() => onToggleOption(block.id, index)}
                style={{ cursor: 'pointer' }}
              />
              {option}
            </label>
          ))}
        </div>
      ) : null}
      {block.type === 'Checkbox' ? (
        <div style={{ ...styles.options, gridTemplateColumns: '1fr' }}>
          {checkboxOptions.map((option, index) => (
            <label key={index} style={{ ...styles.opt, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={block.props.selected.includes(index)}
                onChange={() => onToggleOption(block.id, index)}
                style={{ cursor: 'pointer' }}
              />
              {option}
            </label>
          ))}
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
      {block.type === 'WorkingTimer' ? (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 26,
          }}
        >
          {formatSeconds(workingTimer.duration)}
          <button
            style={{ marginTop: 8, ...buttonStyle, background: workingTimer.running ? '#34d399' : '#fca5a5' }}
            onClick={() => {
              setBlocks(prev =>
                prev.map(b =>
                  b.id === block.id
                    ? {
                        ...b,
                        props: {
                          ...b.props,
                          running: !b.props.running,
                        },
                      }
                    : b,
                ),
              );
            }}
          >
            {workingTimer.running ? 'Pause' : 'Start'}
          </button>
        </div>
      ) : null}
      {block.type === 'Text' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', 
            height: '100%',
            padding: 10,
            fontSize: 16,
            textAlign: 'center',
          }}
        >
          {textContent}
        </div>
      ) : null}
      {block.type === 'Questions' ? (
        <div
          style={{
            border: '1px solid #1f2a44',
            borderRadius: '14px',
            padding: '16px',
            boxShadow: '0 6px 16px rgba(0,0,0,.25)',
            background: 'rgba(14,22,42,.92)',
          }}
        >
          <div
            style={{
              fontWeight: '600',
              marginBottom: '8px',
              color: '#eaf1ff',
            }}
          >
            {questionData.question}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}
          >
            {questionData.options.map(opt => (
              <label
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  border: `1px solid ${rating === opt ? '#34d399' : '#1f2a44'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: rating === opt ? 'rgba(52,211,153,0.1)' : 'rgba(14,22,42,.65)',
                  transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <input
                  type="radio"
                  name={`question-${block.id}`}
                  value={opt}
                  checked={rating === opt}
                  onChange={() => setRating(opt)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ fontSize: '14px', color: '#eaf1ff' }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {block.type === 'Comments' ? (
        <textarea
          style={{
            width: '100%',
            height: '100%',
            padding: 10,
            border: '1px solid #1f2a44',
            borderRadius: 10,
            background: '#0d1830',
            color: '#eaf1ff',
          }}
          placeholder={commentData.placeholder}
          value={commentData.value}
          readOnly // Value is controlled by Inspector
        />
      ) : null}
      {block.type === 'Discard' ? (
        <div className="p-4 max-w-md mx-auto border rounded-2xl shadow-sm bg-[#0d1830]">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm font-medium">Discard</div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setDiscard(false)}
                className={`px-3 py-2 rounded-lg border ${
                  !discard ? "bg-green-600 border-green" : "bg-[#0d1830]"
                }`}
              >
                No
              </button>
              <button
                onClick={() => setDiscard(true)}
                className={`px-3 py-2 rounded-lg border ${
                  discard ? "bg-red-500 border-red-300" : "bg-[#0d1830]"
                }`}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selected
        ? ['nw', 'ne', 'sw', 'se'].map(direction => (
            <div
              key={direction}
              onMouseDown={event => onHandleMouseDown(event, block.id, direction)}
              style={{
                ...styles.handle,
                left: direction.includes('w') ? -6 : undefined,
                right: direction.includes('e') ? -6 : undefined,
                top: direction.includes('n') ? -6 : undefined,
                bottom: direction.includes('s') ? -6 : undefined,
                cursor: cursorFor(direction),
              }}
            />
          ))
        : null}
    </div>
  );
}

function Inspector({ block, onChange }) {
  const [x, setX] = useState(block.frame.x);
  const [y, setY] = useState(block.frame.y);
  const [w, setW] = useState(block.frame.w);
  const [h, setH] = useState(block.frame.h);
  const [text, setText] = useState(block.props.text || '');
  const [src, setSrc] = useState(block.props.src || '');
  const [label, setLabel] = useState(block.props.label || '');
  const [duration, setDuration] = useState(block.props.duration || 60);
  const [options, setOptions] = useState(block.props.options || []);
  const [content, setContent] = useState(block.props.content || '');
  const [question, setQuestion] = useState(block.props.question || '');
  const [placeholder, setPlaceholder] = useState(block.props.placeholder || '');
  const [value, setValue] = useState(block.props.value || '');

  useEffect(() => {
    setX(block.frame.x);
    setY(block.frame.y);
    setW(block.frame.w);
    setH(block.frame.h);
    setText(block.props.text || '');
    setSrc(block.props.src || '');
    setLabel(block.props.label || '');
    setDuration(block.props.duration || 60);
    setOptions(block.props.options || []);
    setContent(block.props.content || '');
    setQuestion(block.props.question || '');
    setPlaceholder(block.props.placeholder || '');
    setValue(block.props.value || '');
  }, [block]);

  const muted = { color: '#9fb0d8', fontSize: 12 };

  const handleFrameChange = (key, value) => {
    const frame = { ...block.frame, [key]: value };
    onChange({ ...block, frame });
  };

  const handlePropChange = (prop, value) => {
    onChange({ ...block, props: { ...block.props, [prop]: value } });
  };

  const handleOptionsChange = newOptions => {
    setOptions(newOptions);
    onChange({ ...block, props: { ...block.props, options: newOptions } });
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ ...muted, marginBottom: 4 }}>
        {block.type} • {block.id}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <LabeledNumber
          label="X"
          value={x}
          onChange={value => {
            setX(value);
            handleFrameChange('x', value);
          }}
        />
        <LabeledNumber
          label="Y"
          value={y}
          onChange={value => {
            setY(value);
            handleFrameChange('y', value);
          }}
        />
        <LabeledNumber
          label="W"
          value={w}
          onChange={value => {
            setW(value);
            handleFrameChange('w', value);
          }}
        />
        <LabeledNumber
          label="H"
          value={h}
          onChange={value => {
            setH(value);
            handleFrameChange('h', value);
          }}
        />
      </div>

      {block.type === 'Title' ? (
        <LabeledText
          label="Text"
          value={text}
          onChange={value => {
            setText(value);
            handlePropChange('text', value);
          }}
        />
      ) : null}

      {block.type === 'Image' ? (
        <LabeledText
          label="Image URL"
          value={src}
          onChange={value => {
            setSrc(value);
            handlePropChange('src', value);
          }}
        />
      ) : null}

      {block.type === 'Audio' ? (
        <LabeledText
          label="Audio URL (.mp3)"
          value={src}
          onChange={value => {
            setSrc(value);
            handlePropChange('src', value);
          }}
        />
      ) : null}

      {block.type === 'Submit' ? (
        <LabeledText
          label='Button label'
          value={label}
          onChange={value => {
            setLabel(value);
            handlePropChange('label', value);
          }}
        />
      ) : null}

      {block.type === 'Timer' ? (
        <LabeledNumber
          label="Duration (s)"
          value={duration}
          onChange={value => {
            setDuration(value);
            handlePropChange('duration', value);
          }}
        />
      ) : null}

      {block.type === 'RadioButtons' || block.type === 'Checkbox' ? (
        <LabeledText
          label="Options (comma-separated)"
          value={options.join(', ')}
          onChange={value =>
            handleOptionsChange(value.split(',').map(opt => opt.trim()))
          }
        />
      ) : null}

      {block.type === 'WorkingTimer' ? (
        <LabeledNumber
          label="Duration (s)"
          value={block.props.duration}
          onChange={value =>
            onChange({ ...block, props: { ...block.props, duration: value } })
          }
        />
      ) : null}

      {block.type === 'Text' ? (
        <LabeledText
          label="Content"
          value={content}
          onChange={value => {
            setContent(value);
            onChange({ ...block, props: { ...block.props, content: value } });
          }}
        />
      ) : null}
      {block.type === 'Questions' ? (
        <LabeledText
          label="Question"
          value={question}
          onChange={value => {
            setQuestion(value);
            handlePropChange('question', value);
          }}
        />
      ) : null}
      {block.type === 'Comments' ? (
        <>
          <LabeledText
            label="Placeholder"
            value={placeholder}
            onChange={value => {
              setPlaceholder(value);
              handlePropChange('placeholder', value);
            }}
          />
          <LabeledText
            label="Comment Value"
            value={value}
            onChange={newValue => {
              setValue(newValue);
              handlePropChange('value', newValue);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function LabeledText({ label, value, onChange }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: '#9fb0d8', fontSize: 12 }}>{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{
          padding: '8px 10px',
          background: '#0b1428',
          border: '1px solid #1f2a44',
          borderRadius: 10,
          color: '#eaf1ff',
        }}
      />
    </label>
  );
}

function LabeledNumber({ label, value, onChange }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: '#9fb0d8', fontSize: 12 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        style={{
          padding: '8px 10px',
          background: '#0b1428',
          border: '1px solid #1f2a44',
          borderRadius: 10,
          color: '#eaf1ff',
        }}
      />
    </label>
  );
}

function formatSeconds(value) {
  const total = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function TemplateBuilder() {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
      
        <div className="p-0 md:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-900 shadow-lg overflow-hidden">
            <TemplateBuilderApp />
          </div>
        </div>
      </main>
    </div>
  );
}

export default TemplateBuilder;
