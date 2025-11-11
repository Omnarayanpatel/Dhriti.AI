import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';

/**
 * Text Annotation App.jsx
 * - LanguageTool grammar checking (public endpoint)
 * - Selection-based labeling (+ custom labels)
 * - Sentiment + Emotion tagging
 * - Save to localStorage + View Saved (structured)
 * - Clean grey-white Tailwind UI
 *
 * Note: If LanguageTool CORS issues appear, run a tiny proxy (I can provide).
 */

// Demo tasks
const DEMO_TASKS = [
  {
    id: "task-1",
    title: "Grammar demo",
    text: "He is a engineer at OpenAI in San Fransisco. Please send the report to hr@openai.com by monday 9am.",
  },
  {
    id: "task-2",
    title: "Feedback sample",
    text: "I loved the update — it is awesome! But sometimes it crashes. Would you fix this?",
  },
  {
    id: "task-3",
    title: "Short sample",
    text: "Is this product useful? I think it's okay but could be better.",
  },
];

const DEFAULT_LABELS = ["PERSON", "EMAIL", "ORGANIZATION", "LOCATION", "DATE", "TIME", "POSITIVE", "NEGATIVE"];
const COLOR_OPTIONS = [
  { id: "yellow", class: "bg-yellow-200", hex: "#FEF08A" },
  { id: "green", class: "bg-emerald-200", hex: "#BBF7D0" },
  { id: "blue", class: "bg-sky-200", hex: "#BFDBFE" },
  { id: "pink", class: "bg-pink-200", hex: "#FBCFE8" },
  { id: "violet", class: "bg-violet-200", hex: "#E9D5FF" },
];

const SENTIMENTS = ["Positive", "Negative", "Neutral"];
const EMOTIONS = ["Happy", "Sad", "Angry", "Surprised", "Calm"];

export default function TextAnnotationPage() {
  // tasks + navigation
  const [tasks, setTasks] = useState(() => {
    const s = localStorage.getItem("tat_tasks_v4");
    return s ? JSON.parse(s) : DEMO_TASKS;
  });
  const [index, setIndex] = useState(0);
  const task = tasks[index];

  // labels
  const [labels, setLabels] = useState(() => {
    const s = localStorage.getItem("tat_labels_v4");
    return s ? JSON.parse(s) : DEFAULT_LABELS;
  });
  const [chosenColor, setChosenColor] = useState(COLOR_OPTIONS[0].class);

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
    localStorage.setItem("tat_tasks_v4", JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem("tat_saved_v4", JSON.stringify(savedList));
  }, [savedList]);

  function showToast(msg, ms = 1600) {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
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
      localStorage.setItem("tat_tasks_v4", JSON.stringify(next));
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
  const annotations = annotationsMap[task.id] || [];
  const currentMeta = metaMap[task.id] || { sentiment: "", emotion: "" };

  /* ---------- JSX ---------- */
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
            <button onClick={() => setView("annotate")} className={`px-3 py-2 rounded text-sm ${view === "annotate" ? "bg-indigo-600 text-white" : "bg-white border"}`}>Annotate</button>
            <button onClick={() => setView("saved")} className={`px-3 py-2 rounded text-sm ${view === "saved" ? "bg-indigo-600 text-white" : "bg-white border"}`}>View Saved</button>
          </div>
        </header>

        {view === "annotate" ? (
          <div className="grid grid-cols-12 gap-6">
            {/* left / main */}
            <main className="col-span-12 lg:col-span-8">
              <div className="bg-white rounded-xl shadow p-5 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm text-gray-500">{task?.title}</div>
                    <div className="text-xs text-gray-400">Task {index + 1} / {tasks.length}</div>
                  </div>

                  <div className="flex gap-2">
                    <button disabled={index === 0} onClick={() => { if (index > 0) setIndex(index - 1); }} className="px-3 py-1 border rounded text-sm">Prev</button>
                    <button disabled={index === tasks.length - 1} onClick={() => { if (index < tasks.length - 1) setIndex(index + 1); }} className="px-3 py-1 border rounded text-sm">Next</button>
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
                        {COLOR_OPTIONS.map((c) => (
                          <button key={c.id} onClick={() => setChosenColor(c.class)} className={`${c.class} w-9 h-9 rounded border ${chosenColor === c.class ? "ring-2 ring-offset-1" : ""}`} />
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
                        {SENTIMENTS.map(s => (
                          <button key={s} onClick={() => setSentimentForCurrent(s)} className={`px-3 py-1 rounded text-sm ${currentMeta.sentiment === s ? "bg-indigo-600 text-white" : "bg-white border"}`}>{s}</button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded border">
                      <div className="text-sm font-medium mb-2">Emotion</div>
                      <select value={currentMeta.emotion || ""} onChange={(e) => setEmotionForCurrent(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
                        <option value="">Select emotion</option>
                        {EMOTIONS.map(em => <option key={em} value={em}>{em}</option>)}
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