import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import { getToken } from "../utils/auth.js";

/**
 * Text Annotation App.jsx
 * - LanguageTool grammar checking (public endpoint)
 * - Selection-based labeling (+ custom labels)
 * - Sentiment + Emotion tagging
 * - Save to localStorage + View Saved (structured)
 * - Clean grey-white Tailwind UI
 *
 * Uses localStorage for persistence.
 */

const DEFAULT_LABELS = ["PERSON", "EMAIL", "ORGANIZATION", "LOCATION", "DATE", "TIME", "POSITIVE", "NEGATIVE"]; // Fallback
const DEFAULT_COLOR_OPTIONS = [
  { id: "yellow", class: "bg-yellow-200", hex: "#FEF08A" },
  { id: "green", class: "bg-emerald-200", hex: "#BBF7D0" },
  { id: "blue", class: "bg-sky-200", hex: "#BFDBFE" },
  { id: "pink", class: "bg-pink-200", hex: "#FBCFE8" },
  { id: "violet", class: "bg-violet-200", hex: "#E9D5FF" },
];
const DEFAULT_SENTIMENTS = ["Positive", "Negative", "Neutral"];
const DEFAULT_EMOTIONS = ["Happy", "Sad", "Angry", "Surprised", "Calm"];

const API_BASE = 'http://localhost:8000';

export default function TextAnnotationPage() {
  const navigate = useNavigate();
  const { id: taskId } = useParams(); // Correctly get the 'id' param and rename it to taskId
  // tasks + navigation
  const [tasks, setTasks] = useState(() => {
    const s = localStorage.getItem("tat_tasks_v4");
    return s ? JSON.parse(s) : [];
  });
  const [index, setIndex] = useState(0);
  const task = tasks[index];

  // labels
  const [labels, setLabels] = useState(() => {
    const s = localStorage.getItem("tat_labels_v4");
    return s ? JSON.parse(s) : DEFAULT_LABELS;
  });
  const [colorOptions, setColorOptions] = useState(DEFAULT_COLOR_OPTIONS);
  const [sentiments, setSentiments] = useState(DEFAULT_SENTIMENTS);
  const [emotions, setEmotions] = useState(DEFAULT_EMOTIONS);

  const [chosenColor, setChosenColor] = useState(DEFAULT_COLOR_OPTIONS[0].class);

  // annotations map per task id
  const [annotationsMap, setAnnotationsMap] = useState(() => {
    const s = localStorage.getItem("tat_annotations_v4");
    return s ? JSON.parse(s) : {};
  });

  // metadata map per task (sentiment/emotion)
  const [metaMap, setMetaMap] = useState(() => {
    const s = localStorage.getItem("tat_meta_v4");
    return s ? JSON.parse(s) : {};
  });

  // saved items array (structured records)
  const [savedList, setSavedList] = useState(() => {
    const s = localStorage.getItem("tat_saved_v4");
    return s ? JSON.parse(s) : [];
  });

  // selection & floating toolbar
  const containerRef = useRef(null);
  const [selection, setSelection] = useState(null); // { startChar, endChar, text }
  const [floatingPos, setFloatingPos] = useState(null);
  const [chosenLabel, setChosenLabel] = useState("");
  const [newLabelText, setNewLabelText] = useState("");

  // grammar results
  const [grammar, setGrammar] = useState({ loading: false, matches: [] });
  const [preview, setPreview] = useState(null); // { matchIndex, replacement, previewText }

  // UI
  const [view, setView] = useState("annotate"); // annotate | saved
  const [toast, setToast] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const fileInputRef = useRef(null);
  const [tasksError, setTasksError] = useState(null);

  // Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingProjects, setMappingProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectColumns, setProjectColumns] = useState([]);
  const [mapping, setMapping] = useState({
    title: '',
    text: '',
    sentiments: DEFAULT_SENTIMENTS.join(', '),
    emotions: DEFAULT_EMOTIONS.join(', '),
  });
  const [labelConfigs, setLabelConfigs] = useState(() => 
    DEFAULT_LABELS.map((label, index) => ({
      text: label,
      color: DEFAULT_COLOR_OPTIONS[index % DEFAULT_COLOR_OPTIONS.length]
    }))
  );
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState('');

  useEffect(() => {
    const fetchSingleTask = async (id) => {
      setTasksLoading(true);
      setTasksError(null);
      try {
        const token = getToken();
        if (!token) {
          throw new Error("You must be logged in to view tasks.");
        }
        const response = await fetch(`${API_BASE}/text/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.task) {
          let taskData = data.task.payload || {};
          let taskTitle = data.task.payload?.title || data.task.payload?.name || 'Untitled Task';
          let taskText = '';

          // If a template exists, use its rules to find the title and text
          if (data.template && data.template.rules) {
            const textRule = data.template.rules.find(r => r.component_key === 'text_content');
            const titleRule = data.template.rules.find(r => r.component_key === 'title_display');

            if (textRule && taskData[textRule.source_path]) {
              taskText = taskData[textRule.source_path];
            }
            if (titleRule && taskData[titleRule.source_path]) {
              taskTitle = taskData[titleRule.source_path];
            }

            // Find annotation settings within the layout array
            const metaBlock = Array.isArray(data.template.layout)
              ? data.template.layout.find(item => item.type === 'meta')
              : null;
            const settings = metaBlock ? metaBlock.props?.annotation_settings : null;

            if (settings?.labels) setLabels(settings.labels);
            if (settings?.colors) {
              setColorOptions(settings.colors);
              setChosenColor(settings.colors[0]?.class || DEFAULT_COLOR_OPTIONS[0].class);
            }
            if (settings?.sentiments) setSentiments(settings.sentiments);
            if (settings?.emotions) setEmotions(settings.emotions);
          } else {
            // Fallback if no template exists: try common keys
            taskText = taskData.text || taskData.content || '';
          }

          // The component expects `title` and `text` at the top level of the task object
          const processedTask = { ...data.task, title: taskTitle, text: taskText };
          setTasks([processedTask]);
          setIndex(0);
          if (data.annotations) {
            setAnnotationsMap(prev => ({ ...prev, [data.task.id]: data.annotations }));
          }
        } else {
          throw new Error("Task data not found in response.");
        }
      } catch (error) {
        console.error("Failed to fetch single task:", error);
        setTasksError(`Failed to load task: ${error.message}`);
      } finally {
        setTasksLoading(false);
      }
    };

    const fetchTaskList = async () => {
      setTasksLoading(true);
      setTasksError(null);
      try {
        const response = await fetch("/api/tasks"); // Placeholder for multiple tasks
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setTasks(data);
        localStorage.setItem("tat_tasks_v4", JSON.stringify(data));
      } catch (error) {
        console.error("Failed to fetch task list:", error);
        setTasksError("Failed to load task list. Please try again later.");
      } finally {
        setTasksLoading(false);
      }
    };

    if (taskId) {
      fetchSingleTask(taskId);
    } else {
      const storedTasks = localStorage.getItem("tat_tasks_v4");
      if (!storedTasks || JSON.parse(storedTasks).length === 0) {
        fetchTaskList();
      } else {
        setTasksLoading(false);
      }
    }
  }, [taskId]);

  useEffect(() => {
    // This effect is now separate to avoid re-running fetches on every annotation change.
    if (tasks.length > 0 && !taskId) { // Only persist to localStorage in multi-task mode
      localStorage.setItem("tat_tasks_v4", JSON.stringify(tasks));
    }
  }, [tasks, taskId]);

  useEffect(() => {
    localStorage.setItem("tat_annotations_v4", JSON.stringify(annotationsMap));
  }, [annotationsMap]);
  useEffect(() => {
    localStorage.setItem("tat_labels_v4", JSON.stringify(labels));
  }, [labels]);
  useEffect(() => {
    localStorage.setItem("tat_meta_v4", JSON.stringify(metaMap));
  }, [metaMap]);
  useEffect(() => {
    localStorage.setItem("tat_saved_v4", JSON.stringify(savedList));
  }, [savedList]);

  function showToast(msg, ms = 1600) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setTasksLoading(true);
      setTasksError(null);
      // Send the file to the backend endpoint
      // Ensure your backend is running and accessible at this URL
      const response = await fetch("http://localhost:8000/text/upload", {
        method: "POST",
        body: formData,
        // Note: Do not set 'Content-Type' header, browser does it for FormData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "File upload failed");
      }

      const newTasks = await response.json();
      setTasks(newTasks);
      setIndex(0);
      setAnnotationsMap({}); // Clear annotations for new task set
      setMetaMap({}); // Clear metadata for new task set
      showToast(`Loaded ${newTasks.length} task(s) from ${file.name}`);
    } catch (error) {
      console.error("File upload error:", error);
      showToast(`Error: ${error.message}`);
      setTasksError(`Failed to upload file: ${error.message}`);
    } finally {
      setTasksLoading(false);
      event.target.value = null; // Reset file input
    }
  }

  /* -------- Selection helpers (char offset) -------- */
  function getCharOffsetWithin(range, container) {
    let charCount = 0;
    const iter = document.createNodeIterator(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = iter.nextNode())) {
      if (node === range.startContainer) {
        charCount += range.startOffset;
        break;
      } else {
        charCount += node.textContent.length;
      }
    }
    return charCount;
  }

  function onMouseUpText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      setFloatingPos(null);
      return;
    }
    try {
      const range = sel.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setSelection(null);
        setFloatingPos(null);
        return;
      }
      const startChar = getCharOffsetWithin(range, containerRef.current);

      // compute end offset
      const iter = document.createNodeIterator(containerRef.current, NodeFilter.SHOW_TEXT);
      let node;
      let pos = 0;
      let endChar = startChar;
      while ((node = iter.nextNode())) {
        if (node === range.endContainer) {
          endChar = pos + range.endOffset;
          break;
        } else {
          pos += node.textContent.length;
        }
      }

      const selText = task.text.slice(startChar, endChar);
      if (!selText.trim()) {
        setSelection(null);
        setFloatingPos(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setFloatingPos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 44 });
      setSelection({ startChar, endChar, text: selText });
    } catch (err) {
      console.error("select error", err);
      setSelection(null);
      setFloatingPos(null);
    }
  }

  function clearSelection() {
    setSelection(null);
    setFloatingPos(null);
    try {
      window.getSelection().removeAllRanges();
    } catch (e) {}
  }

  /* -------- Annotation actions -------- */
  function applyLabel() {
    if (!selection || !chosenLabel) {
      showToast("Select text and choose/enter label");
      return;
    }
    const ann = {
      id: uuidv4(),
      start: selection.startChar,
      end: selection.endChar,
      text: selection.text,
      label: chosenLabel,
      color: chosenColor,
      note: "",
      verified: false,
      createdAt: new Date().toISOString(),
    };
    setAnnotationsMap((prev) => {
      const copy = { ...prev };
      copy[task.id] = copy[task.id] ? [...copy[task.id], ann] : [ann];
      return copy;
    });
    clearSelection();
    showToast("Label applied");
  }

  function deleteAnnotation(id) {
    setAnnotationsMap((prev) => {
      const copy = { ...prev };
      copy[task.id] = copy[task.id].filter((a) => a.id !== id);
      return copy;
    });
  }

  function toggleVerify(id) {
    setAnnotationsMap((prev) => {
      const copy = { ...prev };
      copy[task.id] = copy[task.id].map((a) => (a.id === id ? { ...a, verified: !a.verified } : a));
      return copy;
    });
  }

  function addCustomLabel() {
    const v = newLabelText.trim();
    if (!v) return;
    if (!labels.includes(v)) setLabels((p) => [...p, v]);
    setChosenLabel(v);
    setNewLabelText("");
    showToast("Custom label added");
  }

  /* -------- Grammar (LanguageTool) -------- */
  async function runGrammarCheck() {
    if (!task) return;
    setGrammar({ loading: true, matches: [] });
    try {
      const body = new URLSearchParams();
      body.append("language", "en-US");
      body.append("text", task.text);
      const res = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) throw new Error("API failed");
      const json = await res.json();
      setGrammar({ loading: false, matches: json.matches || [] });
      setPreview(null);
      showToast((json.matches || []).length ? `Found ${json.matches.length} issue(s)` : "No issues");
    } catch (err) {
      console.error(err);
      setGrammar({ loading: false, matches: [] });
      showToast("Grammar check failed (CORS/network?)");
    }
  }

  function previewReplacement(matchIndex, replacementValue) {
    const m = grammar.matches[matchIndex];
    if (!m) return;
    const before = task.text.slice(0, m.offset);
    const after = task.text.slice(m.offset + m.length);
    const previewText = before + replacementValue + after;
    setPreview({ matchIndex, replacementValue, previewText });
  }

  function applyPreviewCorrection() {
    if (!preview) {
      showToast("Choose a suggestion first");
      return;
    }
    const m = grammar.matches[preview.matchIndex];
    if (!m) return;
    const newText = task.text.slice(0, m.offset) + preview.replacementValue + task.text.slice(m.offset + m.length);
    // update tasks
    setTasksAndPersist((prev) => prev.map((tk) => (tk.id === task.id ? { ...tk, text: newText } : tk)));
    setPreview(null);
    setGrammar({ loading: true, matches: [] });
    setTimeout(() => runGrammarCheck(), 300);
    showToast("Correction applied");
  }

  // small helper to update tasks and persist
  function setTasksAndPersist(setter) {
    setTasks((prev) => {
      const next = typeof setter === "function" ? setter(prev) : setter;
      // This now only persists if not in single-task mode
      if (!taskId) {
        localStorage.setItem("tat_tasks_v4", JSON.stringify(next));
      }
      return next;
    });
  }

  /* -------- Save / Export -------- */
  function saveCurrent(saveMeta = {}) {
    const payload = {
      id: uuidv4(),
      taskId: task.id,
      title: task.title,
      text: task.text,
      annotations: annotationsMap[task.id] || [],
      meta: metaMap[task.id] || {},
      savedAt: new Date().toISOString(),
    };
    setSavedList((prev) => [payload, ...prev]);
    showToast("Saved ✅");
  }

  function exportCurrent() {
    const payload = {
      task,
      annotations: annotationsMap[task.id] || [],
      grammar: grammar.matches || [],
      meta: metaMap[task.id] || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${task.id}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllSaved() {
    const blob = new Blob([JSON.stringify(savedList, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved_annotations.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* -------- Render text with annotations + grammar highlights -------- */
  function renderAnnotatedText() {
    const t = task?.text || "";
    if (!t) return null;
    const anns = (annotationsMap[task.id] || []).map((a) => ({ start: a.start, end: a.end, type: "ann", a }));
    const grams = (grammar.matches || []).map((m, idx) => ({ start: m.offset, end: m.offset + m.length, type: "gram", m, idx }));
    // filter grammar spans that overlap annotations
    const gramsFiltered = grams.filter((g) => !anns.some((x) => !(g.end <= x.start || g.start >= x.end)));
    const all = [...anns, ...gramsFiltered].sort((x, y) => x.start - y.start);

    const out = [];
    let pos = 0;
    let key = 0;
    for (const r of all) {
      if (r.start > pos) out.push(<span key={`plain-${key++}`}>{t.slice(pos, r.start)}</span>);
      const seg = t.slice(r.start, r.end);
      if (r.type === "ann") {
        const a = r.a;
        out.push(
          <span key={`ann-${a.id}`} className={`${a.color} rounded px-1`} title={`${a.label} — ${a.note || "no note"}`} style={{ color: "#111" }}>
            {seg}
          </span>
        );
      } else {
        const m = r.m;
        out.push(
          <span key={`gram-${key++}`} title={m.message} style={{ backgroundColor: "rgba(255,200,200,0.6)", textDecoration: "underline", textDecorationColor: "#ef4444", textDecorationThickness: "2px" }}>
            {seg}
          </span>
        );
      }
      pos = r.end;
    }
    if (pos < t.length) out.push(<span key={`rest-${pos}`}>{t.slice(pos)}</span>);
    return out;
  }

  /* ---------- helpers to set meta ---------- */
  function setSentimentForCurrent(val) {
    setMetaMap((prev) => ({ ...prev, [task.id]: { ...(prev[task.id] || {}), sentiment: val, emotion: (prev[task.id] && prev[task.id].emotion) || "" } }));
  }
  function setEmotionForCurrent(val) {
    setMetaMap((prev) => ({ ...prev, [task.id]: { ...(prev[task.id] || {}), emotion: val, sentiment: (prev[task.id] && prev[task.id].sentiment) || "" } }));
  }

  // convenience getters
  const annotations = (task && annotationsMap[task.id]) || [];
  const currentMeta = (task && metaMap[task.id]) || { sentiment: "", emotion: "" };

  /* ---------- Mapping Modal Logic ---------- */
  useEffect(() => {
    if (showMappingModal) {
      const fetchProjects = async () => {
        setMappingLoading(true);
        setMappingError('');
        try {
          // Fetch projects with data category 'text'
          const response = await fetch(`${API_BASE}/text/projects?category=text`);
          if (!response.ok) {
            throw new Error('Failed to fetch projects.');
          }
          const data = await response.json();
          setMappingProjects(data.projects || []);
        } catch (error) {
          setMappingError(error.message);
        } finally {
          setMappingLoading(false);
        }
      };
      fetchProjects();
    }
  }, [showMappingModal]);

  useEffect(() => {
    if (selectedProjectId) {
      const fetchColumns = async () => {
        setMappingLoading(true);
        setMappingError('');
        setProjectColumns([]);
        try {
          // Fetch the schema (columns) for the selected project
          const response = await fetch(`${API_BASE}/text/project/${selectedProjectId}/schema`);
          if (!response.ok) {
            throw new Error('Failed to fetch project columns.');
          }
          const data = await response.json();
          setProjectColumns(data.columns || []);
        } catch (error) {
          setMappingError(error.message);
        } finally {
          setMappingLoading(false);
        }
      };
      fetchColumns();
    }
  }, [selectedProjectId]);

  const handleApplyMapping = async () => {
    if (!selectedProjectId || !mapping.text) {
      setMappingError("Please select a project and map the 'text' field.");
      return;
    }
    setMappingLoading(true);
    setMappingError('');
    try {
      const payload = {
        title: mapping.title,
        text: mapping.text,
        labels: labelConfigs.map(lc => lc.text).filter(Boolean),
        sentiments: mapping.sentiments.split(',').map(s => s.trim()).filter(Boolean),
        emotions: mapping.emotions.split(',').map(s => s.trim()).filter(Boolean),
        colors: [...new Set(labelConfigs.map(lc => lc.color))].filter(Boolean), // Unique colors
      };

      const response = await fetch(`${API_BASE}/text/project/${selectedProjectId}/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to save mapping template.');
      }

      showToast("Mapping applied successfully!");
      setShowMappingModal(false); // Close modal on success
      // Optionally, you could trigger a re-fetch of the current task to see changes immediately
      if (taskId) {
        // This is a simplified call, you might need to re-implement the fetch logic here
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to apply mapping:", error);
      setMappingError(error.message);
    } finally {
      setMappingLoading(false);
    }
  };
  /* ---------- JSX ---------- */

  // Early return for loading or error states to prevent rendering with undefined task
  if (tasksLoading) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center">Loading task...</div>;
  }
  if (tasksError) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-red-500">{tasksError}</div>;
  }
  if (!task) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center">No task available.</div>;
  }

  return (
    
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* header */}
        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Text Annotation Studio</h1>
            <p className="text-sm text-gray-500 mt-1">Grey–white theme · Grammar + Labeling + Sentiment/Emotion</p>
          </div>

          <div className="flex gap-2 items-center">
            <button onClick={() => navigate(-1)} className="px-3 py-2 rounded text-sm bg-white border text-gray-700 hover:bg-gray-50">Back to Dashboard</button>
            <button onClick={() => setView("annotate")} className={`px-3 py-2 rounded text-sm ${view === "annotate" ? "bg-indigo-600 text-white" : "bg-white border"}`}>Annotate</button>
            <button onClick={() => setView("saved")} className={`px-3 py-2 rounded text-sm ${view === "saved" ? "bg-indigo-600 text-white" : "bg-white border"}`}>View Saved</button>
            {!taskId && (
              <><input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.txt,.csv" className="hidden" /><button onClick={() => fileInputRef.current.click()} className="px-3 py-2 rounded text-sm bg-white border">Upload File</button></>
            )}
            <button 
              onClick={() => setShowMappingModal(true)}
              className="px-3 py-2 rounded text-sm bg-white border"
            >Map Data</button>
          </div>
        </header>

        {view === "annotate" ? (
          <div className="grid grid-cols-12 gap-6">
            {/* left / main */}
            <main className="col-span-12 lg:col-span-8">
              <div className="bg-white rounded-xl shadow p-5 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm text-gray-500">{task?.title || task?.name || 'Untitled Task'}</div>
                    <div className="text-xs text-gray-400">
                      {taskId ? `Task ID: ${taskId}` : `Task ${index + 1} / ${tasks.length}`}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button disabled={index === 0 || !!taskId} onClick={() => { if (index > 0) setIndex(index - 1); }} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Prev</button>
                    <button disabled={index === tasks.length - 1 || !!taskId} onClick={() => { if (index < tasks.length - 1) setIndex(index + 1); }} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
                  </div>
                </div>

                <div ref={containerRef} onMouseUp={onMouseUpText} className="p-4 bg-gray-50 border rounded min-h-[160px] text-sm leading-relaxed" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                  {renderAnnotatedText()}
                </div>

                {/* selection / controls */}
                <div className="mt-4 flex items-start gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-2">Selected</div>
                    <div className="p-3 border rounded bg-white min-h-[64px]">
                      <div className="text-sm text-gray-700">{selection ? selection.text : "Select text to label or check grammar"}</div>
                    </div>

                    {/* Grammar panel */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Grammar</div>
                        <div className="text-xs text-gray-500">{grammar.loading ? "Checking..." : `${grammar.matches.length} issue(s)`}</div>
                      </div>

                      <div className="p-3 bg-white border rounded">
                        <div className="flex gap-2">
                          <button onClick={() => runGrammarCheck()} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Run</button>
                          <button onClick={() => { setGrammar({ loading: false, matches: [] }); setPreview(null); }} className="px-3 py-1 border rounded text-sm">Clear</button>
                        </div>

                        {grammar.matches.length > 0 && (
                          <ul className="mt-3 space-y-2 text-sm">
                            {grammar.matches.map((m, idx) => (
                              <li key={idx} className="p-2 border rounded bg-gray-50">
                                <div className="font-medium text-gray-800">{m.message}</div>
                                <div className="text-xs text-gray-500 mt-1">Context: "{task.text.slice(Math.max(0, m.offset - 20), m.offset + m.length + 20)}"</div>
                                <div className="text-xs text-gray-500 mt-1">Suggestions: {m.replacements && m.replacements.length ? m.replacements.map(r => r.value).join(", ") : "—"}</div>
                                <div className="mt-2 flex gap-2">
                                  {m.replacements && m.replacements.slice(0, 3).map((r, ridx) => (
                                    <button key={ridx} onClick={() => previewReplacement(idx, r.value)} className="px-2 py-1 border rounded text-sm">Use: {r.value}</button>
                                  ))}
                                  <button onClick={() => previewReplacement(idx, task.text.slice(m.offset, m.offset + m.length))} className="px-2 py-1 border rounded text-sm">Use original</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {preview && (
                        <div className="mt-3 p-3 bg-indigo-50 rounded border">
                          <div className="font-medium">Preview correction</div>
                          <div className="text-xs text-gray-700 mt-1"><code className="bg-white px-1 rounded">{preview.previewText}</code></div>
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => {
                              // apply preview by replacing in the task text
                              const m = grammar.matches[preview.matchIndex];
                              applyPreviewCorrection();
                              setPreview(null);
                              setGrammar({ loading: true, matches: [] });
                              setTimeout(() => runGrammarCheck(), 300);
                              showToast("Correction applied");
                            }} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Apply</button>
                            <button onClick={() => setPreview(null)} className="px-3 py-1 border rounded text-sm">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* right controls */}
                  <aside className="w-72">
                    <div className="p-3 bg-white rounded border mb-4">
                      <div className="text-sm font-medium mb-2">Color</div>
                      <div className="flex gap-2">
                        {colorOptions.map((c) => (
                          <button key={c.id} onClick={() => setChosenColor(c.class)} className={`${c.class} w-9 h-9 rounded border ${chosenColor === c.class ? "ring-2 ring-offset-1 ring-indigo-500" : ""}`} />
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded border mb-4">
                      <div className="text-sm font-medium mb-2">Label</div>
                      <select value={chosenLabel} onChange={(e) => setChosenLabel(e.target.value)} className="w-full border rounded px-2 py-1 text-sm mb-2">
                        <option value="">Select label</option>
                        {labels.map((l, i) => <option key={i} value={l}>{l}</option>)}
                        <option value="__new">+ Add new</option>
                      </select>
                      {chosenLabel === "__new" && (
                        <div className="flex gap-2">
                          <input value={newLabelText} onChange={(e) => setNewLabelText(e.target.value)} placeholder="New label" className="flex-1 border rounded px-2 py-1 text-sm" />
                          <button onClick={() => addCustomLabel()} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Add</button>
                        </div>
                      )}
                      <div className="mt-3">
                        <button onClick={() => applyLabel()} className="w-full px-3 py-2 bg-green-600 text-white rounded text-sm">Apply Label</button>
                        <button onClick={() => clearSelection()} className="w-full mt-2 px-3 py-2 border rounded text-sm">Cancel</button>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded border mb-4">
                      <div className="text-sm font-medium mb-2">Sentiment</div>
                      <div className="flex gap-2 flex-wrap">
                        {sentiments.map(s => (
                          <button key={s} onClick={() => setSentimentForCurrent(s)} className={`px-3 py-1 rounded text-sm ${currentMeta.sentiment === s ? "bg-indigo-600 text-white" : "bg-white border"}`}>{s}</button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded border">
                      <div className="text-sm font-medium mb-2">Emotion</div>
                      <select value={currentMeta.emotion || ""} onChange={(e) => setEmotionForCurrent(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
                        <option value="">Select emotion</option>
                        {emotions.map(em => <option key={em} value={em}>{em}</option>)}
                      </select>
                    </div>
                  </aside>
                </div>
              </div>

              {/* bottom row */}
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="text-sm text-gray-600">Saved annotations: {(annotationsMap[task.id] || []).length}</div>
                <div className="flex items-center gap-3">
                  <button onClick={() => saveCurrent()} className="px-3 py-2 bg-green-600 text-white rounded">Save</button>
                  <button onClick={() => exportCurrent()} className="px-3 py-2 border rounded">Export</button>
                </div>
              </div>
            </main>

            {/* right panel: structured annotations */}
            <aside className="col-span-12 lg:col-span-4">
              <div className="bg-white rounded-xl p-4 border mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">Annotations</div>
                    <div className="text-xs text-gray-500">{(annotationsMap[task.id] || []).length} total</div>
                  </div>
                  <div className="text-xs text-gray-400">•</div>
                </div>

                <div className="space-y-3 max-h-[46vh] overflow-auto">
                  {(annotationsMap[task.id] || []).length === 0 && <div className="text-sm text-gray-500">No annotations — select text and apply label.</div>}

                  {(annotationsMap[task.id] || []).map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className={`${a.color} w-5 h-5 rounded-sm`} />
                            <div className="font-medium text-sm">{a.label}</div>
                          </div>
                          <div className="text-xs text-gray-600 mt-1 italic">“{a.text}”</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</div>
                          <div className="mt-1">
                            <button onClick={() => toggleVerify(a.id)} className={`text-xs px-2 py-1 rounded border ${a.verified ? "bg-green-100" : ""}`}>{a.verified ? "Verified" : "Verify"}</button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-gray-600 space-y-1">
                        <div>🏷 Label: <strong>{a.label}</strong></div>
                        <div>📍 Range: {a.start} — {a.end}</div>
                        <div>📝 Note: {a.note || "—"}</div>
                      </div>

                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => deleteAnnotation(a.id)} className="text-xs px-2 py-1 border rounded text-red-500">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">Saved Records</div>
                    <div className="text-xs text-gray-500">{savedList.length} stored</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => downloadAllSaved()} className="px-2 py-1 border rounded text-sm">Download</button>
                    <button onClick={() => { setSavedList([]); localStorage.removeItem("tat_saved_v4"); showToast("Cleared saved records"); }} className="px-2 py-1 border rounded text-sm">Clear</button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[24vh] overflow-auto">
                  {savedList.length === 0 && <div className="text-sm text-gray-500">No saved records yet — click Save.</div>}
                  {savedList.map((s, i) => (
                    <div key={s.id} className="p-3 rounded border bg-gray-50 text-sm">
                      <div className="font-medium">{s.title || s.taskId}</div>
                      <div className="text-xs text-gray-500">Saved: {new Date(s.savedAt).toLocaleString()}</div>
                      <div className="mt-2 text-xs text-gray-700">
                        <div>Annotations: {(s.annotations || []).length}</div>
                        <div>Sentiment: {s.meta?.sentiment || "—"}</div>
                        <div>Emotion: {s.meta?.emotion || "—"}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => {
                          const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = `${s.taskId || "saved"}_${i}.json`; a.click(); URL.revokeObjectURL(url);
                        }} className="px-2 py-1 border rounded text-xs">Export</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* Saved view: full detail list */
          <div className="bg-white rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div><div className="text-sm text-gray-600">Saved Annotations</div><div className="text-xs text-gray-400">{savedList.length} records</div></div>
              <div className="flex gap-2">
                <button onClick={() => downloadAllSaved()} className="px-3 py-1 border rounded text-sm">Download all</button>
                <button onClick={() => { setSavedList([]); localStorage.removeItem("tat_saved_v4"); showToast("Saved cleared"); }} className="px-3 py-1 border rounded text-sm">Clear saved</button>
              </div>
            </div>

            {savedList.length === 0 && <div className="text-sm text-gray-500">No saved annotations yet.</div>}

            <div className="space-y-4">
              {savedList.map((s, idx) => (
                <div key={s.id} className="p-4 border rounded bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{s.title || s.taskId}</div>
                      <div className="text-xs text-gray-500">Saved: {new Date(s.savedAt).toLocaleString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `${s.taskId || 'saved'}_${idx}.json`; a.click(); URL.revokeObjectURL(url);
                      }} className="px-2 py-1 border rounded text-sm">Export</button>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-gray-700">
                    <div className="mb-2"><strong>Text:</strong><div className="p-2 bg-white rounded border mt-1">{s.text}</div></div>
                    <div className="mb-2"><strong>Meta:</strong> Sentiment: {s.meta?.sentiment || "—"}, Emotion: {s.meta?.emotion || "—"}</div>
                    <div><strong>Annotations:</strong>
                      <ul className="mt-2 list-disc list-inside text-sm">
                        {(s.annotations || []).map((a, ai) => (
                          <li key={ai}>{a.label} — "{a.text}" (start:{a.start}, end:{a.end})</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mapping Modal */}
        {showMappingModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Create Mapping Template</h3>
                <button onClick={() => setShowMappingModal(false)} className="text-gray-500 hover:text-gray-800">&times;</button>
              </div>

              {mappingError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{mappingError}</div>}

              <div className="space-y-4 overflow-y-auto pr-2">
                <div>
                  <label htmlFor="project-select" className="block text-sm font-medium text-gray-700 mb-1">Select Project</label>
                  <select
                    id="project-select"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                    disabled={mappingLoading}
                  >
                    <option value="">-- Choose a project --</option>
                    {mappingProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {selectedProjectId && (
                  <>
                    <div>
                      <label htmlFor="title-map" className="block text-sm font-medium text-gray-700 mb-1">Map to Title</label>
                      <select
                        id="title-map"
                        value={mapping.title}
                        onChange={(e) => setMapping(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full border rounded px-3 py-2 text-sm"
                        disabled={mappingLoading || projectColumns.length === 0}
                      >
                        <option value="">-- Select title column (optional) --</option>
                        {projectColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="text-map" className="block text-sm font-medium text-gray-700 mb-1">Map to Text (for annotation)</label>
                      <select
                        id="text-map"
                        value={mapping.text}
                        onChange={(e) => setMapping(prev => ({ ...prev, text: e.target.value }))}
                        className="w-full border rounded px-3 py-2 text-sm"
                        disabled={mappingLoading || projectColumns.length === 0}
                      >
                        <option value="">-- Select text column --</option>
                        {projectColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <hr className="my-4" />
                    <div className="text-md font-semibold mb-3">Annotation Settings</div>
                    
                    {/* New Labels and Colors UI */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">Labels and Colors</label>
                      <div className="space-y-2 rounded-md border p-3 max-h-60 overflow-y-auto">
                        {labelConfigs.map((config, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded border" style={{ backgroundColor: config.color.hex }}></div>
                            <input
                              type="text"
                              value={config.text}
                              onChange={(e) => {
                                const newConfigs = [...labelConfigs];
                                newConfigs[index].text = e.target.value;
                                setLabelConfigs(newConfigs);
                              }}
                              className="flex-grow border rounded px-2 py-1 text-sm"
                            />
                            <select
                              value={config.color.id}
                              onChange={(e) => {
                                const newColor = DEFAULT_COLOR_OPTIONS.find(c => c.id === e.target.value);
                                const newConfigs = [...labelConfigs];
                                newConfigs[index].color = newColor;
                                setLabelConfigs(newConfigs);
                              }}
                              className="border rounded p-1 text-sm"
                            >
                              {DEFAULT_COLOR_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                            </select>
                            <button onClick={() => setLabelConfigs(labelConfigs.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700 text-lg">&times;</button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setLabelConfigs([...labelConfigs, { text: '', color: DEFAULT_COLOR_OPTIONS[0] }])}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        + Add Label
                      </button>
                    </div>

                    <div>
                      <label htmlFor="sentiments-map" className="block text-sm font-medium text-gray-700 mb-1">Sentiments (comma-separated)</label>
                      <textarea
                        id="sentiments-map"
                        value={mapping.sentiments}
                        onChange={(e) => setMapping(prev => ({ ...prev, sentiments: e.target.value }))}
                        className="w-full border rounded px-3 py-2 text-sm"
                        rows="2"
                      />
                    </div>
                    <div>
                      <label htmlFor="emotions-map" className="block text-sm font-medium text-gray-700 mb-1">Emotions (comma-separated)</label>
                      <textarea
                        id="emotions-map"
                        value={mapping.emotions}
                        onChange={(e) => setMapping(prev => ({ ...prev, emotions: e.target.value }))}
                        className="w-full border rounded px-3 py-2 text-sm"
                        rows="2"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3 flex-shrink-0">
                <button onClick={() => setShowMappingModal(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
                <button onClick={handleApplyMapping} disabled={mappingLoading || !selectedProjectId || !mapping.text} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm disabled:bg-indigo-300">
                  {mappingLoading ? 'Applying...' : 'Apply Mapping'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* floating toolbar */}
        {selection && floatingPos && (
          <div style={{ position: "absolute", left: floatingPos.x, top: floatingPos.y }} className="z-50">
            <div className="bg-white border rounded shadow p-2 flex gap-2 items-center">
              <div className="text-sm text-gray-700 px-2 max-w-xs overflow-hidden whitespace-nowrap text-ellipsis">{selection.text}</div>
              <select value={chosenLabel} onChange={(e) => setChosenLabel(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="">Label</option>
                {labels.map((l, i) => <option key={i} value={l}>{l}</option>)}
                <option value="__new">+ Add</option>
              </select>
              {chosenLabel === "__new" && (
                <input value={newLabelText} onChange={(e) => setNewLabelText(e.target.value)} placeholder="New label" className="border rounded px-2 py-1 text-sm" />
              )}
              <div className="flex gap-1">
                {COLOR_OPTIONS.map(c => (
                  <button key={c.id} onClick={() => setChosenColor(c.class)} className={`${c.class} w-6 h-6 rounded border ${chosenColor === c.class ? "ring-2" : ""}`} />
                ))}
              </div>
              <button onClick={() => {
                if (chosenLabel === "__new") addCustomLabel();
                else applyLabel();
              }} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Apply</button>
              <button onClick={() => clearSelection()} className="px-2 py-1 border rounded text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* toast */}
        {toast && <div className="fixed right-6 bottom-6 bg-gray-800 text-white px-4 py-2 rounded shadow">{toast}</div>}
      </div>
    </div>
  );
}