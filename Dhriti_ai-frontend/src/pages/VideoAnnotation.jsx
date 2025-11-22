import React, { useEffect, useRef, useState } from "react";

// Video Annotation Tool — Professional UI (light green theme) — Rectangle only
// Added: selectable/movable/resizable boxes and simple frame-propagation tracking (keyboard shortcuts: T = propagate 10 frames, Y = propagate 1 frame)
export default function VideoAnnotationTool() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [videoURL, setVideoURL] = useState(null);

  // drawing / interaction
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [selection, setSelection] = useState({ frame: null, index: null }); // selected annotation
  const [interaction, setInteraction] = useState({ type: null, edge: null }); // null | 'drawing' | 'moving' | 'resizing'

  // FPS and frame state
  const [fps] = useState(30);
  const [frameNumber, setFrameNumber] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // annotations per frame and labels
  const [annotationsMap, setAnnotationsMap] = useState(() => {
    try {
      const saved = localStorage.getItem("va_annotations");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [labels, setLabels] = useState(() => {
    try {
      const saved = localStorage.getItem("va_labels");
      return saved
        ? JSON.parse(saved)
        : [
          { name: "car", color: "#16a34a" },
          { name: "person", color: "#059669" },
          { name: "bike", color: "#10b981" },
        ];
    } catch {
      return [
        { name: "car", color: "#16a34a" },
        { name: "person", color: "#059669" },
        { name: "bike", color: "#10b981" },
      ];
    }
  });

  const [currentLabel, setCurrentLabel] = useState(labels[0]?.name || "car");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#16a34a");

  // undo stack
  const undoStackRef = useRef([]);

  // helper: get current frame number
  const getCurrentFrame = () => {
    const v = videoRef.current;
    if (!v) return 0;
    return Math.floor(v.currentTime * fps);
  };

  // persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("va_annotations", JSON.stringify(annotationsMap));
      localStorage.setItem("va_labels", JSON.stringify(labels));
    } catch (e) {
      console.warn("Unable to save to localStorage", e);
    }
  }, [annotationsMap, labels]);

  // video loaded -> set canvas size
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v && c) {
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 360;
      drawFrameAnnotations();
    }
  };

  // update frameNumber on timeupdate
  const onTimeUpdate = () => {
    setFrameNumber(getCurrentFrame());
  };

  // load file and try autoplay
  const handleUpload = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  setVideoURL(url);

  // ✅ Clear previous annotations, selections, and undo stack
  setAnnotationsMap({});
  setSelection({ frame: null, index: null });
  undoStackRef.current = [];

  // Optionally also clear autosaved data for previous video
  localStorage.removeItem("va_annotations");

  // Reset playback + frame
  setFrameNumber(0);
  setIsPlaying(false);

  // Load & autoplay new video
  setTimeout(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, 200);
};


  // draw annotations for current frame
  const drawFrameAnnotations = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = getCurrentFrame();
    const list = annotationsMap[frame] || [];

    list.forEach((a, i) => {
      ctx.strokeStyle = a.color || "#16a34a";
      ctx.lineWidth = selection.frame === frame && selection.index === i ? 3 : 2;
      ctx.strokeRect(a.x1, a.y1, a.x2 - a.x1, a.y2 - a.y1);

      // label background
      ctx.fillStyle = a.color || "#16a34a";
      ctx.font = "16px Arial";
      const text = a.label;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(a.x1, a.y1 - 20, textWidth + 8, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, a.x1 + 4, a.y1 - 6);

      // draw small resize handles
      const handles = [
        { x: a.x1, y: a.y1 },
        { x: a.x2, y: a.y1 },
        { x: a.x2, y: a.y2 },
        { x: a.x1, y: a.y2 },
      ];
      handles.forEach((h) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = a.color || '#16a34a';
        ctx.lineWidth = 1;
        ctx.fillRect(h.x - 5, h.y - 5, 10, 10);
        ctx.strokeRect(h.x - 5, h.y - 5, 10, 10);
      });
    });
  };

  // redraw when frame changes or annotations change or selection changes
  useEffect(() => {
    drawFrameAnnotations();
  }, [annotationsMap, frameNumber, selection]);

  // convert mouse event to canvas coords (account for CSS scaling)
  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const x = (e.clientX - rect.left) * (cw / rect.width);
    const y = (e.clientY - rect.top) * (ch / rect.height);
    return { x, y };
  };

  // hit test for selecting box; also detect if near a corner for resize
  const hitTest = (x, y) => {
    const frame = getCurrentFrame();
    const list = annotationsMap[frame] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      // check handles (10x10)
      const corners = [
        { x: a.x1, y: a.y1, edge: 'nw' },
        { x: a.x2, y: a.y1, edge: 'ne' },
        { x: a.x2, y: a.y2, edge: 'se' },
        { x: a.x1, y: a.y2, edge: 'sw' },
      ];
      for (const c of corners) {
        if (x >= c.x - 6 && x <= c.x + 6 && y >= c.y - 6 && y <= c.y + 6) {
          return { index: i, type: 'resize', edge: c.edge };
        }
      }
      // inside box
      if (x >= Math.min(a.x1, a.x2) && x <= Math.max(a.x1, a.x2) && y >= Math.min(a.y1, a.y2) && y <= Math.max(a.y1, a.y2)) {
        return { index: i, type: 'move' };
      }
    }
    return { index: -1, type: null };
  };

  // mouse handlers
  const handleMouseDown = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    if (!drawMode) {
      // selection/move/resize
      const hit = hitTest(pos.x, pos.y);
      if (hit.index >= 0) {
        setSelection({ frame, index: hit.index });
        if (hit.type === 'move') {
          setInteraction({ type: 'moving', edge: null });
          setStartPos(pos);
        } else if (hit.type === 'resize') {
          setInteraction({ type: 'resizing', edge: hit.edge });
          setStartPos(pos);
        }
      } else {
        setSelection({ frame: null, index: null });
      }
      return;
    }

    // start drawing
    setStartPos(pos);
    setIsDrawing(true);
    setInteraction({ type: 'drawing', edge: null });
    // clear selection while drawing
    setSelection({ frame: null, index: null });
  };

  const handleMouseMove = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    if (interaction.type === 'drawing' && isDrawing && startPos) {
      // draw live preview
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      drawFrameAnnotations();
      ctx.strokeStyle = (labels.find(l => l.name === currentLabel) || labels[0]).color;
      ctx.lineWidth = 2;
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (interaction.type === 'moving' && startPos && selection.index != null && selection.frame === frame) {
  const dx = pos.x - startPos.x;
  const dy = pos.y - startPos.y;
  setStartPos(pos);

  setAnnotationsMap(prev => {
    const copy = { ...prev };
    const list = (copy[frame] || []).slice();
    const moved = { ...list[selection.index] };
    moved.x1 += dx; moved.x2 += dx; moved.y1 += dy; moved.y2 += dy;
    list[selection.index] = moved;
    copy[frame] = list;

    // 👇 Propagate new position to all future frames with same id
    const v = videoRef.current;
    const totalFrames = Math.floor((v?.duration || 0) * fps);
    for (let f = frame + 1; f <= totalFrames; f++) {
      const futureList = (copy[f] || []).slice();
      const idx = futureList.findIndex(b => b.id === moved.id);
      if (idx >= 0) {
        futureList[idx] = { ...futureList[idx], ...moved, frame: f };
        copy[f] = futureList;
      }
    }

    return copy;
  });
} else if (interaction.type === 'resizing' && startPos && selection.index != null && selection.frame === frame) {
  const dx = pos.x - startPos.x;
  const dy = pos.y - startPos.y;
  setStartPos(pos);
  setAnnotationsMap(prev => {
    const copy = { ...prev };
    const list = (copy[frame] || []).slice();
    const a = { ...list[selection.index] };
    const edge = interaction.edge;
    if (edge === 'nw') { a.x1 += dx; a.y1 += dy; }
    if (edge === 'ne') { a.x2 += dx; a.y1 += dy; }
    if (edge === 'se') { a.x2 += dx; a.y2 += dy; }
    if (edge === 'sw') { a.x1 += dx; a.y2 += dy; }
    list[selection.index] = a;
    copy[frame] = list;

    // 👇 propagate resize to all future frames with same id
    const v = videoRef.current;
    const totalFrames = Math.floor((v?.duration || 0) * fps);
    for (let f = frame + 1; f <= totalFrames; f++) {
      const futureList = (copy[f] || []).slice();
      const idx = futureList.findIndex(b => b.id === a.id);
      if (idx >= 0) {
        futureList[idx] = { ...futureList[idx], ...a, frame: f };
        copy[f] = futureList;
      }
    }

    return copy;
  });
}

};

  const handleMouseUp = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    if (interaction.type === 'drawing' && isDrawing && startPos) {
      const labelObj = labels.find((l) => l.name === currentLabel) || labels[0] || { color: "#16a34a" };
      const newAnno = {
        label: currentLabel,
        color: labelObj.color,
        frame,
        x1: startPos.x,
        y1: startPos.y,
        x2: pos.x,
        y2: pos.y,
        id: Date.now(),
      };

      undoStackRef.current.push(JSON.stringify(annotationsMap));

      setAnnotationsMap((prev) => {
        const copy = { ...prev };
        copy[frame] = copy[frame] ? [...copy[frame], newAnno] : [newAnno];
        const v = videoRef.current;
        const totalFrames = Math.floor((v?.duration || 0) * fps);
        for (let f = frame + 1; f <= totalFrames; f++) {
          const same = { ...newAnno, frame: f, id: Date.now() + f };
          copy[f] = copy[f] ? [...copy[f], same] : [same];
        }
        return copy;
      });
    }

    // finish any move/resize interaction
    setIsDrawing(false);
    setInteraction({ type: null, edge: null });
    setStartPos(null);
  };

  // delete selected annotation
  const deleteSelected = () => {
    if (selection.frame == null) return;
    const frame = selection.frame;
    const idx = selection.index;
    if (idx == null) return;

    undoStackRef.current.push(JSON.stringify(annotationsMap));

    setAnnotationsMap((prev) => {
      const copy = { ...prev };
      const list = (copy[frame] || []).slice();
      list.splice(idx, 1);
      copy[frame] = list;
      return copy;
    });

    setSelection({ frame: null, index: null });
  };

  // undo
  const undo = () => {
    const last = undoStackRef.current.pop();
    if (!last) return;
    try {
      setAnnotationsMap(JSON.parse(last));
    } catch (e) {
      console.warn("failed to undo", e);
    }
  };

  // propagate selected annotation to next N frames (simple copy tracking)
  const propagateSelected = (count = 1) => {
    if (selection.frame == null || selection.index == null) return;
    const startFrame = selection.frame;
    const idx = selection.index;
    const list = (annotationsMap[startFrame] || []).slice();
    const anno = list[idx];
    if (!anno) return;

    undoStackRef.current.push(JSON.stringify(annotationsMap));

    setAnnotationsMap(prev => {
      const copy = { ...prev };
      for (let f = startFrame + 1; f <= startFrame + count; f++) {
        // simple copy — exact same bbox on next frames
        const copied = { ...anno, frame: f, id: Date.now() + f };
        copy[f] = copy[f] ? [...copy[f], copied] : [copied];
      }
      return copy;
    });
  };

  // prev/next frame functions (with jump10)
  const seekToFrame = (frame) => {
    const v = videoRef.current;
    if (!v) return;

    v.pause(); // stop playback to prevent desync

    // add tiny offset (+0.0001) to force next frame render
    const t = Math.max(0, Math.min(v.duration || 0, frame / fps + 0.0001));

    v.currentTime = t;
    setFrameNumber(Math.floor(t * fps));

    // redraw annotations after short delay
    setTimeout(() => {
      drawFrameAnnotations();
    }, 100);
  };

  const prevFrame = () => seekToFrame(getCurrentFrame() - 1);
  const nextFrame = () => seekToFrame(getCurrentFrame() + 1);
  const jumpBack = () => seekToFrame(getCurrentFrame() - 10);
  const jumpForward = () => seekToFrame(getCurrentFrame() + 10);

  // play/pause
  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      try {
        await v.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false); 4
      }
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // avoid interfering with inputs
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevFrame();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextFrame();
      } else if (e.key.toLowerCase() === "d") {
        setDrawMode((s) => !s);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        undo();
      } else if (e.key === "Delete") {
        deleteSelected();
      } else if (e.key.toLowerCase() === "t") {
        // propagate 10 frames
        propagateSelected(10);
      } else if (e.key.toLowerCase() === "y") {
        // propagate 1 frame
        propagateSelected(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annotationsMap, selection]);

  // add/delete label
  const addLabel = () => {
    const name = newLabel.trim();
    if (!name) return;
    if (labels.find((l) => l.name === name)) {
      setNewLabel("");
      return;
    }
    const next = [...labels, { name, color: newColor }];
    setLabels(next);
    setNewLabel("");
    setNewColor("#16a34a");
    setCurrentLabel(name);
  };

  const deleteLabel = (name) => {
    // remove label and update annotations that used it
    const nextLabels = labels.filter((l) => l.name !== name);
    setLabels(nextLabels);
    if (currentLabel === name && nextLabels.length) setCurrentLabel(nextLabels[0].name);

    // remove label from existing annotations (optional: also delete those annotations)
    undoStackRef.current.push(JSON.stringify(annotationsMap));
    const next = {};
    Object.keys(annotationsMap).forEach((k) => {
      next[k] = (annotationsMap[k] || []).map((a) => ({ ...a }));
      next[k] = next[k].filter((a) => a.label !== name);
    });
    setAnnotationsMap(next);
  };

  // export / import
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ annotationsMap, labels }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "va_export.json";
    a.click();
  };

  const importData = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.annotationsMap) setAnnotationsMap(parsed.annotationsMap);
        if (parsed.labels) setLabels(parsed.labels);
      } catch (err) {
        alert("Invalid file");
      }
    };
    reader.readAsText(f);
  };

  // render annotation list for sidebar
  const currentList = annotationsMap[frameNumber] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#e6f9ef] to-[#dff7ee] text-gray-800">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex gap-4">
          {/* Sidebar */}
          <aside className="w-80 bg-white/80 rounded-2xl p-4 shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#10b981] to-[#16a34a] flex items-center justify-center text-white font-bold">DA</div>
              <div>
                <h3 className="font-bold text-lg">Dhriti.AI — Annotator</h3>
                <p className="text-sm text-gray-600">Rectangle Mode (Manual)</p>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-sm font-medium">Video</label>
              <input type="file" accept="video/*" onChange={handleUpload} className="mt-2" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => document.getElementById("importFile").click()} className="text-sm px-3 py-1 rounded bg-gray-100">Import</button>
                <input id="importFile" type="file" accept="application/json" onChange={importData} className="hidden" />
                <button onClick={exportData} className="text-sm px-3 py-1 rounded bg-green-500 text-white">Export</button>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-sm font-medium">Labels</label>
              <div className="flex flex-col gap-2 mt-2">
                {labels.map((l) => (
                  <div key={l.name} className="flex items-center justify-between gap-2 border rounded p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded" style={{ backgroundColor: l.color }} />
                      <button className="text-left" onClick={() => setCurrentLabel(l.name)}>{l.name}</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => deleteLabel(l.name)} className="text-red-500">Delete</button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <input placeholder="Label name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="border rounded px-2 py-1 flex-1" />
                  <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                  <button onClick={addLabel} className="bg-green-500 text-white px-3 py-1 rounded">Add</button>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-sm font-medium">Tools</label>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => setDrawMode(false)} className={`px-3 py-1 rounded ${!drawMode ? 'bg-gray-200' : 'bg-white'}`}>Select</button>
                <button onClick={() => setDrawMode(true)} className={`px-3 py-1 rounded ${drawMode ? 'bg-green-200' : 'bg-white'}`}>Draw</button>
                <button onClick={undo} className="px-3 py-1 rounded bg-gray-100">Undo</button>
                <button onClick={deleteSelected} className="px-3 py-1 rounded bg-red-100 text-red-600">Delete Selected</button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Frame: {frameNumber}</label>
              <div className="flex gap-2 mt-2">
                <button onClick={jumpBack} className="px-2 py-1 rounded bg-gray-100">-10</button>
                <button onClick={prevFrame} className="px-2 py-1 rounded bg-gray-100">‹</button>
                <button onClick={togglePlay} className="px-3 py-1 rounded bg-green-500 text-white">{isPlaying ? 'Pause' : 'Play'}</button>
                <button onClick={nextFrame} className="px-2 py-1 rounded bg-gray-100">›</button>
                <button onClick={jumpForward} className="px-2 py-1 rounded bg-gray-100">+10</button>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium">Annotations (this frame)</label>
              <div className="max-h-40 overflow-auto mt-2">
                {currentList.length === 0 && <div className="text-sm text-gray-500">No annotations on this frame</div>}
                {currentList.map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-2 border-b">
                    <div>
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="text-xs text-gray-500">{Math.round(Math.abs(a.x2 - a.x1))}×{Math.round(Math.abs(a.y2 - a.y1))}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setSelection({ frame: frameNumber, index: i })} className="text-sm px-2 py-1 rounded bg-gray-100">Select</button>
                      <button onClick={() => { setSelection({ frame: frameNumber, index: i }); deleteSelected(); }} className="text-sm px-2 py-1 rounded bg-red-50 text-red-600">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Shortcuts: Space Play/Pause · ←/→ Prev/Next · D Toggle Draw · Ctrl+Z Undo · Del Delete · T Propagate 10 frames · Y Propagate 1 frame
            </div>
          </aside>

          {/* Main editor area */}
          <main className="flex-1">
            <div className="bg-white rounded-2xl p-3 shadow">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-2xl font-bold text-[#0f5132]">Video Annotation</h1>
                  <p className="text-sm text-gray-600">Manual rectangle annotation — light Dhriti.AI theme</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-sm">Active label:</div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: (labels.find(l => l.name === currentLabel) || labels[0]).color }}></div>
                    <select value={currentLabel} onChange={(e) => setCurrentLabel(e.target.value)} className="border rounded px-2 py-1">
                      {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="relative bg-black/70 rounded overflow-hidden" style={{ height: 420 }}>
                {videoURL ? (
                  <>
                    <video
                      ref={videoRef}
                      src={videoURL}
                      onLoadedMetadata={onLoadedMetadata}
                      onTimeUpdate={onTimeUpdate}
                      style={{ width: "100%", height: "420px", objectFit: "cover" }}
                      controls
                    />

                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "420px", pointerEvents: 'auto', cursor: drawMode ? 'crosshair' : 'default' }}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-500">
                    <div className="text-xl font-medium">Upload a video to start annotating</div>
                    <div className="text-sm mt-2">Supported: mp4, webm, ogg</div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={prevFrame} className="px-3 py-1 rounded bg-gray-100">Prev</button>
                  <button onClick={nextFrame} className="px-3 py-1 rounded bg-gray-100">Next</button>
                  <button onClick={jumpBack} className="px-3 py-1 rounded bg-gray-100">-10</button>
                  <button onClick={jumpForward} className="px-3 py-1 rounded bg-gray-100">+10</button>
                </div>

                <div className="text-sm text-gray-600">Frame: {frameNumber}</div>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Notes: Use <strong>Draw</strong> mode to create rectangles. Switch to <strong>Select</strong> to pick and delete existing ones. Everything autosaves to your browser. Use <strong>T</strong> (10 frames) or <strong>Y</strong> (1 frame) to propagate selected annotation across frames.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}