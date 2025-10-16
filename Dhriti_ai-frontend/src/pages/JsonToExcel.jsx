import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import FileUpload from '../components/FileUpload.jsx';
import { getToken } from '../utils/auth.js';

const API_BASE = 'http://localhost:8000';
const MAX_VISIBLE_ROWS = 200;

const CORE_TRANSFORM_OPTIONS = [
  { value: 'trim', label: 'Trim' },
  { value: 'lower', label: 'Lowercase' },
  { value: 'upper', label: 'Uppercase' },
  { value: 'basename', label: 'Basename' },
];

const PAYLOAD_TRANSFORM_OPTIONS = [
  { value: 'trim', label: 'Trim' },
  { value: 'lower', label: 'Lowercase' },
  { value: 'upper', label: 'Uppercase' },
  { value: 'to_int(0)', label: 'To Int (empty→0)' },
  { value: 'split("|")', label: 'Split by |' },
  { value: 'join("|")', label: 'Join with |' },
  { value: 'basename', label: 'Basename' },
];

const TASK_ID_STRATEGIES = [
  { value: 'uuid_v4', label: 'UUID v4' },
  { value: 'seq_per_batch', label: 'Sequence (1,2,3)' },
  { value: 'expr', label: 'Expression' },
];

const deriveSheetNameFromFile = fileName => {
  if (!fileName) return '';
  const base = fileName.replace(/\.[^.]+$/, '') || fileName;
  const cleaned = base.replace(/[\[\]:*?/\\]/g, '_').trim();
  const truncated = cleaned.slice(0, 31).trim();
  return truncated || 'Sheet1';
};

const extractErrorMessage = (payload, fallback) => {
  if (!payload) {
    return fallback;
  }
  const detail = payload.detail ?? payload.message ?? payload.error;
  if (!detail) {
    return typeof payload === 'string' ? payload : fallback;
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail.map(entry => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      if (entry.msg) {
        const location = entry.loc ? ` (${entry.loc.join(' > ')})` : '';
        return `${entry.msg}${location}`;
      }
      return JSON.stringify(entry);
    }).filter(Boolean);
    return parts.join('; ') || fallback;
  }
  if (typeof detail === 'object') {
    if (detail.msg) {
      const location = detail.loc ? ` (${detail.loc.join(' > ')})` : '';
      return `${detail.msg}${location}`;
    }
    return JSON.stringify(detail);
  }
  return fallback;
};

const sanitizeHeaders = headerRow => {
  const counts = {};
  return headerRow.map((raw, index) => {
    let name = '';
    if (raw !== undefined && raw !== null) {
      name = String(raw).trim();
    }
    if (!name) {
      name = `column_${index + 1}`;
    }
    const key = name.toLowerCase();
    const counter = counts[key] ?? 0;
    counts[key] = counter + 1;
    if (counter) {
      name = `${name}_${counter + 1}`;
    }
    return name;
  });
};

const pickColumn = (columns, hints, fallback = '') => {
  const lowered = columns.reduce((acc, column) => {
    acc[column.toLowerCase()] = column;
    return acc;
  }, {});

  for (const hint of hints) {
    if (lowered[hint]) {
      return lowered[hint];
    }
  }

  for (const column of columns) {
    for (const hint of hints) {
      if (column.toLowerCase().includes(hint)) {
        return column;
      }
    }
  }

  return fallback;
};

function JsonToExcel() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');

  const [jsonFile, setJsonFile] = useState(null);
  const [recordsPath, setRecordsPath] = useState('$');
  const [sheetName, setSheetName] = useState('');
  const [convertLoading, setConvertLoading] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);

  const [sheetData, setSheetData] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  const [columns, setColumns] = useState([]);
  const [coreMapping, setCoreMapping] = useState({
    taskIdMode: 'GENERATE',
    taskIdStrategy: 'uuid_v4',
    taskIdColumn: '',
    taskIdTransforms: [],
    taskIdExpression: '',
    taskNameColumn: '',
    taskNameTransforms: ['trim'],
    fileNameColumn: '',
    fileNameTransforms: [],
  });
  const [payloadColumns, setPayloadColumns] = useState({});

  const [previewRows, setPreviewRows] = useState([]);
  const [previewIssues, setPreviewIssues] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);

  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
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
        setFeedback(err instanceof Error ? err.message : 'Unable to load projects.');
      }
    };

    loadProjects();
  }, []);

  useEffect(() => {
    if (!sheetData.length) {
      setColumns([]);
      return;
    }

    const header = sheetData[0] ?? [];
    const sanitized = sanitizeHeaders(header);
    setColumns(sanitized);

    const needsUpdate = header.length !== sanitized.length || header.some((value, index) => value !== sanitized[index]);
    if (needsUpdate) {
      setSheetData(prev => {
        if (!prev.length) {
          return prev;
        }
        const next = prev.map((row, index) => {
          if (index === 0) {
            return sanitized;
          }
          const clone = [...row];
          while (clone.length < sanitized.length) {
            clone.push('');
          }
          if (clone.length > sanitized.length) {
            clone.length = sanitized.length;
          }
          return clone;
        });
        return next;
      });
    }
  }, [sheetData]);

  useEffect(() => {
    if (!columns.length) {
      setPayloadColumns({});
      setCoreMapping(prev => ({
        ...prev,
        taskIdColumn: prev.taskIdMode === 'COLUMN' ? '' : prev.taskIdColumn,
        taskNameColumn: '',
        fileNameColumn: '',
      }));
      return;
    }

    setPayloadColumns(prev => {
      const next = {};
      columns.forEach(column => {
        const existing = prev[column];
        next[column] = existing || {
          enabled: true,
          key: column,
          transforms: [],
        };
      });
      return next;
    });

    setCoreMapping(prev => {
      const available = new Set(columns);
      let { taskIdColumn, taskNameColumn, fileNameColumn, fileNameTransforms } = prev;

      if (prev.taskIdMode === 'COLUMN' && taskIdColumn && !available.has(taskIdColumn)) {
        taskIdColumn = '';
      }

      if (taskNameColumn && !available.has(taskNameColumn)) {
        taskNameColumn = '';
      }

      if (fileNameColumn && !available.has(fileNameColumn)) {
        fileNameColumn = '';
        fileNameTransforms = [];
      }

      if (prev.taskIdMode === 'COLUMN' && !taskIdColumn) {
        taskIdColumn = pickColumn(columns, ['task_id', 'external', 'id', 'uid'], '');
      }

      if (!taskNameColumn) {
        taskNameColumn = pickColumn(columns, ['task_name', 'name', 'title'], columns[0] || '');
      }

      if (!fileNameColumn) {
        fileNameColumn = pickColumn(columns, ['file_name', 'filename', 'file', 'url', 'path'], columns[0] || '');
        if (!fileNameTransforms.length && /url|path/.test(fileNameColumn.toLowerCase())) {
          fileNameTransforms = ['basename'];
        }
      }

      return {
        ...prev,
        taskIdColumn,
        taskNameColumn,
        fileNameColumn,
        fileNameTransforms,
      };
    });
  }, [columns]);

  const handleJsonSelected = file => {
    setJsonFile(file ?? null);
    setFeedback('');
    setConversionResult(null);
    setSheetData([]);
    setPreviewRows([]);
    setPreviewIssues([]);
    setConfirmResult(null);
    setSheetName(file ? deriveSheetNameFromFile(file.name) : '');
  };

  const handleCellChange = useCallback((rowIndex, columnIndex, value) => {
    setSheetData(prev => {
      if (!prev.length) {
        return prev;
      }
      const columnsCount = prev[0]?.length ?? 0;
      const next = prev.map(row => [...row]);
      if (!next[rowIndex]) {
        next[rowIndex] = Array(columnsCount).fill('');
      }
      while (next[rowIndex].length < columnsCount) {
        next[rowIndex].push('');
      }
      next[rowIndex][columnIndex] = value;
      return next;
    });
  }, []);

  const handleAddRow = useCallback(() => {
    setSheetData(prev => {
      const columnCount = prev[0]?.length ?? 0;
      if (!columnCount) {
        return prev;
      }
      const newRow = Array(columnCount).fill('');
      return [...prev, newRow];
    });
  }, []);

  const handleAddColumn = useCallback(() => {
    setSheetData(prev => {
      if (!prev.length) {
        return [['column_1'], []];
      }
      const next = prev.map((row, rowIndex) => {
        const clone = [...row];
        if (rowIndex === 0) {
          clone.push(`column_${row.length + 1}`);
        } else {
          clone.push('');
        }
        return clone;
      });
      return next;
    });
  }, []);

  const toggleTransform = useCallback((current, transform) => {
    if (current.includes(transform)) {
      return current.filter(item => item !== transform);
    }
    return [...current, transform];
  }, []);

  const fetchWorkbook = useCallback(async (downloadPath, targetSheet) => {
    if (!downloadPath) {
      return;
    }
    const token = getToken();
    if (!token) {
      setFeedback('Session expired. Please log in again.');
      return;
    }

    try {
      setSheetLoading(true);
      const resolved = downloadPath.startsWith('http') ? downloadPath : `${API_BASE}${downloadPath}`;
      const response = await fetch(resolved, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Unable to download Excel file.');
      }
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetToUse = targetSheet && workbook.SheetNames.includes(targetSheet)
        ? targetSheet
        : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetToUse];
      if (!worksheet) {
        throw new Error('Excel sheet missing.');
      }
      const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (aoa.length) {
        setSheetData(aoa.map(row => row.map(cell => (cell === null || cell === undefined ? '' : cell))));
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to read Excel.');
    } finally {
      setSheetLoading(false);
    }
  }, []);

  const downloadFileWithAuth = useCallback(async (downloadPath, fallbackName) => {
    if (!downloadPath) {
      setFeedback('No download available yet.');
      return;
    }
    const token = getToken();
    if (!token) {
      setFeedback('Session expired. Please log in again.');
      return;
    }
    try {
      const resolved = downloadPath.startsWith('http') ? downloadPath : `${API_BASE}${downloadPath}`;
      const response = await fetch(resolved, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(payload, 'Unable to download file.'));
      }
      const blob = await response.blob();
      let filename = fallbackName || 'download.xlsx';
      const disposition = response.headers.get('Content-Disposition');
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        if (match) {
          filename = decodeURIComponent(match[1] || match[2] || filename);
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
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to download file.');
    }
  }, []);

  const convertJson = async () => {
    if (!jsonFile) {
      setFeedback('Select a JSON file first.');
      return;
    }
    const token = getToken();
    if (!token) {
      setFeedback('Session expired. Please log in again.');
      return;
    }

    setConvertLoading(true);
    setFeedback('');
    setPreviewRows([]);
    setPreviewIssues([]);
    setConfirmResult(null);

    try {
      const form = new FormData();
      form.append('file', jsonFile);
      form.append('records_path', recordsPath || '$');
      if (sheetName && sheetName.trim()) {
        form.append('sheet_name', sheetName.trim());
      }

      const response = await fetch(`${API_BASE}/imports/json-to-excel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(payload, 'Failed to convert JSON to Excel.'));
      }

      const payload = await response.json();
      setConversionResult(payload);
      setSheetName(payload.sheet_name || sheetName || '');
      if (Array.isArray(payload.preview_rows) && payload.preview_rows.length) {
        setSheetData(payload.preview_rows.map(row => [...row]));
      }

      await fetchWorkbook(payload.download_url, payload.sheet_name);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to convert JSON to Excel.');
    } finally {
      setConvertLoading(false);
    }
  };

  const buildRecords = useCallback(() => {
    if (!columns.length || sheetData.length < 2) {
      return [];
    }

    const records = [];
    for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex += 1) {
      const row = sheetData[rowIndex] ?? [];
      const entry = {};
      let hasValue = false;
      columns.forEach((column, columnIndex) => {
        const cell = row[columnIndex];
        const value = cell === null || cell === undefined ? '' : cell;
        if (typeof value === 'string') {
          if (value.trim()) {
            hasValue = true;
          }
        } else if (value !== '') {
          hasValue = true;
        }
        entry[column] = value;
      });
      if (hasValue) {
        records.push(entry);
      }
    }
    return records;
  }, [columns, sheetData]);

  const buildMappingConfig = useCallback(() => {
    if (!columns.length) {
      throw new Error('No columns detected in sheet.');
    }

    if (!coreMapping.taskNameColumn) {
      throw new Error('Select a column for task name.');
    }

    if (!coreMapping.fileNameColumn) {
      throw new Error('Select a column for file name.');
    }

    if (coreMapping.taskIdMode === 'COLUMN' && !coreMapping.taskIdColumn) {
      throw new Error('Select a column for task ID.');
    }

    if (coreMapping.taskIdMode === 'GENERATE' && coreMapping.taskIdStrategy === 'expr' && !coreMapping.taskIdExpression.trim()) {
      throw new Error('Provide an expression for task ID generation.');
    }

    const taskIdConfig =
      coreMapping.taskIdMode === 'GENERATE'
        ? {
            mode: 'GENERATE',
            strategy: coreMapping.taskIdStrategy,
            ...(coreMapping.taskIdStrategy === 'expr'
              ? { expression: coreMapping.taskIdExpression.trim() }
              : {}),
          }
        : {
            mode: 'COLUMN',
            name: coreMapping.taskIdColumn,
            transforms: coreMapping.taskIdTransforms,
          };

    const coreColumns = new Set([
      coreMapping.taskNameColumn,
      coreMapping.fileNameColumn,
      ...(coreMapping.taskIdMode === 'COLUMN' ? [coreMapping.taskIdColumn] : []),
    ]);

    const activeSheetName = (sheetName && sheetName.trim())
      || conversionResult?.sheet_name
      || deriveSheetNameFromFile(jsonFile?.name)
      || 'Raw';

    const payloadSelections = columns
      .filter(column => !coreColumns.has(column))
      .map(column => ({ column, config: payloadColumns[column] }))
      .filter(({ config }) => config?.enabled !== false)
      .map(({ column, config }) => ({
        mode: 'COLUMN',
        column,
        key: config?.key?.trim() || column,
        transforms: config?.transforms || [],
      }));

    return {
      sheet: activeSheetName,
      core: {
        task_id: taskIdConfig,
        task_name: {
          mode: 'COLUMN',
          name: coreMapping.taskNameColumn,
          transforms: coreMapping.taskNameTransforms,
        },
        file_name: {
          mode: 'COLUMN',
          name: coreMapping.fileNameColumn,
          transforms: coreMapping.fileNameTransforms,
        },
      },
      payload_selected: payloadSelections,
    };
  }, [columns, coreMapping, payloadColumns, sheetName, conversionResult, jsonFile]);

  const normalizeMappingState = useCallback((suggestion, columnList) => {
    if (!suggestion) {
      return;
    }

    const resolvedColumns = Array.isArray(columnList) && columnList.length ? columnList : columns;
    setSheetName(suggestion.sheet || sheetName || 'Raw');

    setCoreMapping(prev => {
      const next = { ...prev };
      if (suggestion.core?.task_id?.mode === 'COLUMN') {
        next.taskIdMode = 'COLUMN';
        next.taskIdStrategy = 'uuid_v4';
        next.taskIdColumn = suggestion.core.task_id.name;
        next.taskIdTransforms = suggestion.core.task_id.transforms || [];
        next.taskIdExpression = '';
      } else {
        next.taskIdMode = 'GENERATE';
        next.taskIdStrategy = suggestion.core?.task_id?.strategy || 'uuid_v4';
        next.taskIdColumn = '';
        next.taskIdTransforms = [];
        next.taskIdExpression = suggestion.core?.task_id?.expression || '';
      }

      next.taskNameColumn = suggestion.core?.task_name?.name || prev.taskNameColumn;
      next.taskNameTransforms = suggestion.core?.task_name?.transforms || [];
      next.fileNameColumn = suggestion.core?.file_name?.name || prev.fileNameColumn;
      next.fileNameTransforms = suggestion.core?.file_name?.transforms || [];
      return next;
    });

    setPayloadColumns(prev => {
      const next = {};
      resolvedColumns.forEach(column => {
        next[column] = {
          enabled: true,
          key: column,
          transforms: [],
        };
      });

      (suggestion.payload_selected || []).forEach(entry => {
        if (entry.mode === 'COLUMN' && entry.column) {
          next[entry.column] = {
            enabled: true,
            key: entry.key || entry.column,
            transforms: entry.transforms || [],
          };
        }
      });

      return next;
    });
  }, [columns, sheetName]);

  const runPreview = async requestMapping => {
    if (!projectId) {
      setFeedback('Select a project to continue.');
      return;
    }
    const token = getToken();
    if (!token) {
      setFeedback('Session expired. Please log in again.');
      return;
    }

    const records = buildRecords();
    if (!records.length) {
      setFeedback('No rows found to preview.');
      return;
    }

    const body = {
      project_id: Number(projectId),
      rows: records,
    };

    if (requestMapping) {
      try {
        body.mapping_config = buildMappingConfig();
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : 'Mapping is not ready yet.');
        return;
      }
    }

    setPreviewLoading(true);
    setFeedback('');

    try {
      const response = await fetch(`${API_BASE}/imports/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(payload, 'Preview failed.'));
      }

      const payload = await response.json();
      setPreviewRows(Array.isArray(payload.preview_rows) ? payload.preview_rows : []);
      setPreviewIssues(Array.isArray(payload.issues) ? payload.issues : []);
      setPreviewTotal(typeof payload.total_rows === 'number' ? payload.total_rows : records.length);
      if (payload.suggested_mapping) {
        normalizeMappingState(payload.suggested_mapping, payload.columns);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!projectId) {
      setFeedback('Select a project to continue.');
      return;
    }
    const token = getToken();
    if (!token) {
      setFeedback('Session expired. Please log in again.');
      return;
    }

    const records = buildRecords();
    if (!records.length) {
      setFeedback('No rows found to import.');
      return;
    }

    let mapping;
    try {
      mapping = buildMappingConfig();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Mapping is not ready yet.');
      return;
    }

    setConfirmLoading(true);
    setFeedback('');

    try {
      const excelUploadId = conversionResult?.excel_upload_id;
      const response = await fetch(`${API_BASE}/imports/confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: Number(projectId),
          final_mapping_config: mapping,
          rows: records,
          ...(excelUploadId ? { excel_upload_id: excelUploadId } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(payload, 'Import failed.'));
      }

      const payload = await response.json();
      setConfirmResult(payload);
      setPreviewIssues(Array.isArray(payload.errors) ? payload.errors : []);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const downloadEditedExcel = () => {
    if (!sheetData.length) {
      setFeedback('Nothing to download yet.');
      return;
    }
    try {
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      const effectiveSheetName = (sheetName && sheetName.trim())
        || conversionResult?.sheet_name
        || deriveSheetNameFromFile(jsonFile?.name)
        || 'Edited';
      XLSX.utils.book_append_sheet(workbook, worksheet, effectiveSheetName);
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${jsonFile?.name?.replace(/\.json$/i, '') || 'edited'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to download edited Excel.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-800">Task Import Pipeline</h1>
            <p className="text-sm text-slate-600">
              Upload a JSON payload once, review or tweak the auto-generated Excel, map core columns, and push curated tasks into the project database.
            </p>
          </header>

          {feedback ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {feedback}
            </div>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <h2 className="text-lg font-semibold text-slate-800">Step 1 · Upload Source JSON</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <FileUpload onFileSelected={handleJsonSelected} accept=".json,application/json" disabled={convertLoading} />
                <div className="space-y-2 text-sm">
                  <label className="block font-medium text-slate-700">Records path (JSON pointer)</label>
                  <input
                    value={recordsPath}
                    onChange={event => setRecordsPath(event.target.value)}
                    placeholder="$ or $.items"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                    disabled={convertLoading}
                  />
                  <label className="block font-medium text-slate-700">Sheet name</label>
                  <input
                    value={sheetName}
                    onChange={event => setSheetName(event.target.value)}
                    placeholder="Defaults to JSON filename"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                    disabled={convertLoading}
                  />
                  <p className="text-xs text-slate-500">Leave blank to reuse the uploaded file name.</p>
                  <button
                    type="button"
                    onClick={convertJson}
                    disabled={convertLoading || !jsonFile}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {convertLoading ? 'Processing…' : 'Convert JSON to Excel'}
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <label className="block font-medium text-slate-700">Project</label>
                <select
                  value={projectId}
                  onChange={event => setProjectId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="">Select a project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    downloadFileWithAuth(
                      conversionResult?.download_url || '',
                      `${jsonFile?.name?.replace(/\.json$/i, '') || 'raw'}.xlsx`,
                    )
                  }
                  disabled={!conversionResult?.download_url}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download raw Excel
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Step 2 · Preview &amp; Edit Sheet</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadEditedExcel}
                  disabled={!sheetData.length}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download edited Excel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    fetchWorkbook(
                      conversionResult?.download_url || '',
                      (sheetName && sheetName.trim()) || conversionResult?.sheet_name || undefined,
                    )
                  }
                  disabled={!conversionResult || sheetLoading}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sheetLoading ? 'Refreshing…' : 'Reload raw sheet'}
                </button>
              </div>
            </div>

            {sheetData.length ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Editing is applied directly above. Only the first {MAX_VISIBLE_ROWS} rows are visible for performance; additional rows will still be used for preview/import.
                </p>
                <SheetGrid
                  data={sheetData}
                  onCellChange={handleCellChange}
                  onAddRow={handleAddRow}
                  onAddColumn={handleAddColumn}
                  loading={sheetLoading}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Upload and convert a JSON file to start editing.
              </div>
            )}
          </section>

          {columns.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Step 3 · Mapping Configuration</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => runPreview(false)}
                    disabled={previewLoading}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {previewLoading ? 'Loading…' : 'Preview with suggestions'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runPreview(true)}
                    disabled={previewLoading}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {previewLoading ? 'Refreshing…' : 'Preview with current mapping'}
                  </button>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Task ID</h3>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="radio"
                      checked={coreMapping.taskIdMode === 'GENERATE'}
                      onChange={() =>
                        setCoreMapping(prev => ({
                          ...prev,
                          taskIdMode: 'GENERATE',
                          taskIdColumn: '',
                          taskIdTransforms: [],
                        }))
                      }
                    />
                    Auto-generate
                  </label>
                  {coreMapping.taskIdMode === 'GENERATE' ? (
                    <div className="space-y-2">
                      <select
                        value={coreMapping.taskIdStrategy}
                        onChange={event =>
                          setCoreMapping(prev => ({ ...prev, taskIdStrategy: event.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      >
                        {TASK_ID_STRATEGIES.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {coreMapping.taskIdStrategy === 'expr' ? (
                        <input
                          value={coreMapping.taskIdExpression}
                          onChange={event =>
                            setCoreMapping(prev => ({ ...prev, taskIdExpression: event.target.value }))
                          }
                          placeholder={'e.g. `"T-" + seq`'}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="radio"
                      checked={coreMapping.taskIdMode === 'COLUMN'}
                      onChange={() =>
                        setCoreMapping(prev => ({
                          ...prev,
                          taskIdMode: 'COLUMN',
                          taskIdStrategy: 'uuid_v4',
                          taskIdExpression: '',
                        }))
                      }
                    />
                    Use column
                  </label>
                  {coreMapping.taskIdMode === 'COLUMN' ? (
                    <div className="space-y-2">
                      <select
                        value={coreMapping.taskIdColumn}
                        onChange={event =>
                          setCoreMapping(prev => ({ ...prev, taskIdColumn: event.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      >
                        <option value="">Select column</option>
                        {columns.map(column => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                      <TransformSelector
                        options={CORE_TRANSFORM_OPTIONS}
                        selected={coreMapping.taskIdTransforms}
                        onToggle={transform =>
                          setCoreMapping(prev => ({
                            ...prev,
                            taskIdTransforms: toggleTransform(prev.taskIdTransforms, transform),
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Task Name</h3>
                  <select
                    value={coreMapping.taskNameColumn}
                    onChange={event =>
                      setCoreMapping(prev => ({ ...prev, taskNameColumn: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  >
                    <option value="">Select column</option>
                    {columns.map(column => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <TransformSelector
                    options={CORE_TRANSFORM_OPTIONS}
                    selected={coreMapping.taskNameTransforms}
                    onToggle={transform =>
                      setCoreMapping(prev => ({
                        ...prev,
                        taskNameTransforms: toggleTransform(prev.taskNameTransforms, transform),
                      }))
                    }
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">File Name</h3>
                  <select
                    value={coreMapping.fileNameColumn}
                    onChange={event =>
                      setCoreMapping(prev => ({ ...prev, fileNameColumn: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  >
                    <option value="">Select column</option>
                    {columns.map(column => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <TransformSelector
                    options={CORE_TRANSFORM_OPTIONS}
                    selected={coreMapping.fileNameTransforms}
                    onToggle={transform =>
                      setCoreMapping(prev => ({
                        ...prev,
                        fileNameTransforms: toggleTransform(prev.fileNameTransforms, transform),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Payload Columns</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Include</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Column</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Payload key</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Transforms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {columns.map(column => {
                        const isCoreColumn = [
                          coreMapping.taskNameColumn,
                          coreMapping.fileNameColumn,
                          coreMapping.taskIdMode === 'COLUMN' ? coreMapping.taskIdColumn : null,
                        ].includes(column);
                        const config = payloadColumns[column] || {
                          enabled: true,
                          key: column,
                          transforms: [],
                        };
                        return (
                          <tr key={column} className={isCoreColumn ? 'bg-slate-50' : ''}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={config.enabled && !isCoreColumn}
                                disabled={isCoreColumn}
                                onChange={event =>
                                  setPayloadColumns(prev => ({
                                    ...prev,
                                    [column]: {
                                      ...config,
                                      enabled: event.target.checked,
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-700">{column}</td>
                            <td className="px-3 py-2">
                              <input
                                value={config.key}
                                onChange={event =>
                                  setPayloadColumns(prev => ({
                                    ...prev,
                                    [column]: {
                                      ...config,
                                      key: event.target.value,
                                    },
                                  }))
                                }
                                disabled={!config.enabled || isCoreColumn}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <TransformSelector
                                options={PAYLOAD_TRANSFORM_OPTIONS}
                                selected={config.transforms}
                                disabled={!config.enabled || isCoreColumn}
                                onToggle={transform =>
                                  setPayloadColumns(prev => ({
                                    ...prev,
                                    [column]: {
                                      ...config,
                                      transforms: toggleTransform(config.transforms, transform),
                                    },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => runPreview(true)}
                  disabled={previewLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {previewLoading ? 'Refreshing preview…' : 'Refresh Preview'}
                </button>
                <button
                  type="button"
                  onClick={confirmImport}
                  disabled={confirmLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {confirmLoading ? 'Importing…' : 'Confirm Import'}
                </button>
                {previewTotal ? (
                  <span className="text-sm text-slate-600">
                    Previewing first {previewRows.length} of {previewTotal} rows.
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {previewRows.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Preview</h2>
              <div className="overflow-x-auto text-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Task ID</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Task Name</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">File Name</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {previewRows.slice(0, 30).map(row => (
                      <tr key={row.row}>
                        <td className="px-3 py-2 text-slate-600">{row.row}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{row.task_id}</td>
                        <td className="px-3 py-2 text-slate-700">{row.task_name}</td>
                        <td className="px-3 py-2 text-slate-700">{row.file_name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                          {JSON.stringify(row.payload)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {previewIssues.length ? (
            <section className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm space-y-3 text-sm text-yellow-800">
              <h2 className="text-lg font-semibold text-yellow-800">Issues &amp; Warnings</h2>
              <ul className="space-y-1">
                {previewIssues.slice(0, 50).map((issue, index) => (
                  <li key={`${issue.row}-${index}`}>
                    Row {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {confirmResult ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm text-sm text-emerald-800">
              Imported {confirmResult.inserted} tasks · Skipped {confirmResult.skipped}.
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function TransformSelector({ options, selected, onToggle, disabled = false }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const active = selected.includes(option.value);
        return (
          <button
            type="button"
            key={option.value}
            onClick={() => onToggle(option.value)}
            disabled={disabled}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              active
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-slate-100 text-slate-600'
            } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-brand-500 hover:text-brand-700'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SheetGrid({ data, onCellChange, onAddRow, onAddColumn, loading }) {
  if (!data.length) {
    return null;
  }

  const header = data[0] ?? [];
  const rows = data.slice(1, 1 + MAX_VISIBLE_ROWS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Add row
        </button>
        <button
          type="button"
          onClick={onAddColumn}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Add column
        </button>
        {loading ? <span className="text-xs text-slate-500">Loading sheet…</span> : null}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="sticky left-0 bg-slate-200 px-2 py-1 font-medium text-slate-600">#</th>
              {header.map((cell, columnIndex) => (
                <th key={`header-${columnIndex}`} className="px-2 py-1 font-medium text-slate-600">
                  <input
                    value={cell}
                    onChange={event => onCellChange(0, columnIndex, event.target.value)}
                    className="w-full rounded border border-transparent bg-slate-200 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="sticky left-0 bg-slate-100 px-2 py-1 text-xs text-slate-500">{rowIndex + 1}</td>
                {header.map((_, columnIndex) => (
                  <td key={`cell-${rowIndex}-${columnIndex}`} className="px-2 py-1">
                    <input
                      value={row[columnIndex] ?? ''}
                      onChange={event => onCellChange(rowIndex + 1, columnIndex, event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JsonToExcel;
