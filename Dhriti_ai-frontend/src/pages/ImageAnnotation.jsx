import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken } from '../utils/auth.js';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';

const API_BASE = 'http://localhost:8000';

function ImageAnnotatorComponent() {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const svgRef = useRef(null);
  const { taskId } = useParams(); // Get task ID from URL
  const navigate = useNavigate();

  const [imageSrc, setImageSrc] = useState(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 900, h: 600 });
  const [annotations, setAnnotations] = useState([]);

  // Interaction state for moving/resizing
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [interaction, setInteraction] = useState(null);
  // tools: select | bbox | polygon | seg | keypoint | cuboid
  const [tool, setTool] = useState('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [current, setCurrent] = useState(null); // temp drawing state

  // labeling
  const [labels, setLabels] = useState(['Person', 'Car', 'Bike', 'Tree']);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelValue, setLabelValue] = useState('');
  const [pendingAnnotation, setPendingAnnotation] = useState(null);
  const [modalPos, setModalPos] = useState({ x: 10, y: 10 });

  // chosen color for new annotations and editing
  const [chosenColor, setChosenColor] = useState('#ef4444'); // Default red

  const [template, setTemplate] = useState(null);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [payloadKeys, setPayloadKeys] = useState([]);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  
  // State for the new mapping UI
  const [mappingRules, setMappingRules] = useState([{ component_type: 'Image', target_prop: 'src', source_path: '' }]);

  // State for the new setup mode
  const [projects, setProjects] = useState([]);
  const [setupProjectId, setSetupProjectId] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [sampleTask, setSampleTask] = useState(null); // New state for sample task data

  useEffect(() => {
    let taskDataForMapping = null; // Variable to hold task data for mapping
    async function fetchTask() {
      if (!taskId) {
        // If there's no task ID, we're in setup mode. Just do nothing.
        // The setup UI is handled by a different effect.
        return;
      }

      setLoading(true);
      setError('');
      const token = getToken();
      if (!token) {
        setError('You must be logged in to annotate tasks.');
        setLoading(false);
        return;
      }

      try {
        // Fetch the task data, which now includes the template
        const response = await fetch(`${API_BASE}/tasks/image/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Failed to load task data.');
        }
        const taskData = await response.json(); // This is the ImageTaskResponse from the backend

        taskDataForMapping = taskData; // Store for use in handleSaveMapping
        if (!taskData.template) {
          // No template exists, so we need to ask the user to map the image field.
          setPayloadKeys(Object.keys(taskData.task.payload || {}));
          // Auto-select a likely image key
          const keys = Object.keys(taskData.task.payload || {});
          const imageKeyGuess = keys.find(k => /image|url|link|src/i.test(k)) || '';
          setMappingRules([{ component_type: 'Image', target_prop: 'src', source_path: imageKeyGuess }]);

          setNeedsMapping(true);
          return;
        }
        const imageFieldRule = taskData.template.rules?.find(r => {
          const layoutComponent = taskData.template.layout?.find(l => l.id === r.component_key);
          return layoutComponent?.type === 'Image';
      
        })
        const imageFieldKey = imageFieldRule?.source_path;


        // Find the image component in the layout and the rule that maps to it.
        const imageComponent = taskData.template.layout?.find(l => l.type === 'Image');
        if (!imageComponent || !imageFieldKey) {
          // Template exists but is missing the image mapping.
          setError(
            'The project template is incomplete. It must contain an "Image" component with a corresponding rule. Please fix it in the Template Builder or re-run the setup.'
          );
          return;
        }

        // We have a valid template and mapping.
        setNeedsMapping(false);
        setTemplate(taskData.template);
        const imageUrl = taskData.task.payload[imageFieldKey];
        if (!imageUrl) {
          throw new Error(`Image URL not found in task payload using key: '${imageFieldKey}'.`);

        } else {
          setImageSrc(imageUrl);
        }
        setAnnotations(taskData.annotations || []); // Load existing annotations
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchTask();
  }, [taskId, navigate]);

  const handleRuleChange = (index, field, value) => {
    const newRules = [...mappingRules];
    newRules[index][field] = value;
    setMappingRules(newRules);
  };

  const addMappingRule = () => {
    setMappingRules([...mappingRules, { component_type: 'Text', target_prop: 'content', source_path: '' }]);
  };

  const handleSaveMapping = async () => {
    const imageRule = mappingRules.find(r => r.component_type === 'Image');
    if (!imageRule || !imageRule.source_path) {
      setError('You must map a field to the Image source.');
      return;
    }
    const validRules = mappingRules.filter(r => r.source_path);

    setIsSavingMapping(true);
    setError('');
    const token = getToken();

    const projectIdToUse = taskId ? template.project_id : setupProjectId;
    if (!projectIdToUse) {
      setError('A project must be selected.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/tasks/admin/projects/${projectIdToUse}/autogenerate-template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rules: validRules }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save mapping.');
      }

      // Mapping saved successfully. Reload the page to fetch the new template.
      window.location.reload();

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingMapping(false);
    }
  };

  // --- Effects and handlers for the new Setup Mode ---
  useEffect(() => {
    // Fetch projects only if in setup mode (no taskId)
    if (!taskId) {
      const fetchProjects = async () => {
        const token = getToken();
        if (!token) return;
        try {
          const response = await fetch(`${API_BASE}/tasks/admin/projects`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) throw new Error('Could not fetch projects.');
          const data = await response.json();
          setProjects(data);
        } catch (err) {
          setError(err.message);
        }
      };
      fetchProjects();
    }
  }, [taskId]);

  const handleProjectSelectForSetup = async (projectId) => {
    setSetupProjectId(projectId);
    setSampleTask(null); // Reset sample task on new selection
    if (!projectId) {
      setPayloadKeys([]);
      return;
    }
    setSetupLoading(true);
    setError('');
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/tasks/admin/projects/${projectId}/sample-task`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch sample task.');
      }
      const sampleTaskData = await response.json();
      setSampleTask(sampleTaskData); // Store the full sample task
      setPayloadKeys(Object.keys(sampleTaskData.payload || {}));
    } catch (err) {
      setError(err.message);
    } finally {
      setSetupLoading(false);
    }
  };

  // New useEffect to update the image preview in setup mode
  useEffect(() => {
    // Only run in setup mode when we have a sample task
    if (!taskId && sampleTask) {
      const imageRule = mappingRules.find(r => r.component_type === 'Image');
      if (imageRule && imageRule.source_path) {
        const imageUrl = sampleTask.payload[imageRule.source_path];
        setImageSrc(imageUrl || null); // Set the image source for preview
      } else {
        setImageSrc(null); // Clear the image if no mapping is selected
      }
    }
  }, [mappingRules, sampleTask, taskId]);

  useEffect(() => {
    function update() {
      const cont = containerRef.current;
      if (!cont) return;
      const maxW = Math.min(1100, cont.clientWidth - 40);
      const maxH = 700;
      if (naturalSize.w && naturalSize.h) {
        const aspect = naturalSize.w / naturalSize.h;
        let w = maxW;
        let h = Math.round(w / aspect);
        if (h > maxH) {
          h = maxH;
          w = Math.round(h * aspect);
        }
        setDisplaySize({ w, h });
      } else setDisplaySize({ w: maxW, h: maxH });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [naturalSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcuts if user is typing in an input/modal
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      // Tool selection shortcuts
      if (e.key === 's') startNewTool('select');
      else if (e.key === 'b') startNewTool('bbox');
      else if (e.key === 'p') startNewTool('polygon');
      else if (e.key === 'm') startNewTool('seg'); // M for Mask/Segmentation
      else if (e.key === 'k') startNewTool('keypoint');
      else if (e.key === 'c') startNewTool('cuboid');

      // Deletion shortcut
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); // Prevent browser back navigation on Backspace
        deleteSelected();
      }

      // Finish polygon
      if (e.key === 'Enter' && (tool === 'polygon' || tool === 'seg') && isDrawing) {
        finishCurrentPolygon();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, isDrawing]); // Re-bind if tool or drawing state changes

  // Helper to convert screen coordinates to SVG user space coordinates
  const getRelativeCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return { x, y };
  };

  const onImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  const startBBox = (pos) => {
    setIsDrawing(true);
    setCurrent({ id: `a_${Date.now()}`, type: 'bbox', color: chosenColor, box: { x: pos.x, y: pos.y, w: 0, h: 0 } });
  };

  const onMouseDown = (e) => {
    // If clicking on the SVG background, deselect all annotations
    if (e.target === svgRef.current) {
      setAnnotations(p => p.map(a => ({ ...a, selected: false })));
    }

    if (!svgRef.current || tool !== 'select' && e.target !== svgRef.current) {
      // If a drawing tool is active, but the click is on an existing shape, do nothing.
      // This prevents starting a new shape on top of an old one.
      if (tool !== 'select' && e.target.dataset.annotationId) {
        return;
      }
    }

    const pos = getRelativeCoords(e);

    if (tool === 'bbox') {
      startBBox(pos);
    } else if (tool === 'polygon' || tool === 'seg') {
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrent({ id: `a_${Date.now()}`, type: tool, color: chosenColor, points: [{ x: pos.x, y: pos.y }] });
      } else {
        // add point
        // Check if clicking near the first point to close the polygon
        if (current.points.length >= 3) {
          const firstPoint = current.points[0];
          const dist = Math.sqrt(Math.pow(pos.x - firstPoint.x, 2) + Math.pow(pos.y - firstPoint.y, 2));
          if (dist < 8) { // 8px tolerance for closing
            finishCurrentPolygon();
            e.stopPropagation();
            return;
          }
        }

        // Otherwise, add a new point
        setCurrent((c) => ({ ...c, points: [...c.points, { x: pos.x, y: pos.y }] }));
        // Prevent panning if adding points to polygon
        e.stopPropagation();
      }
    } else if (tool === 'keypoint') {
      const kp = { id: `a_${Date.now()}`, type: 'keypoint', color: chosenColor, x: pos.x, y: pos.y };
      setPendingAnnotation(kp);
      openLabelModalFor(kp);
    } else if (tool === 'cuboid') {
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrent({ id: `a_${Date.now()}`, type: 'cuboid', color: chosenColor, front: { x: pos.x, y: pos.y, w: 0, h: 0 }, back: null, phase: 'front' });
      } else if (isDrawing && current && current.phase === 'front') {
        // start back box
        setCurrent((c) => ({ ...c, phase: 'back', back: { x: pos.x, y: pos.y, w: 0, h: 0 } }));
      }
    }
  };

  const onMouseMove = (e) => {
    if (interaction) {
      const pos = getRelativeCoords(e);
      const dx = pos.x - interaction.startPos.x;
      const dy = pos.y - interaction.startPos.y;

      setAnnotations(prev => prev.map(a => {
        if (a.id !== interaction.id) return a;

        if (interaction.mode === 'move') {
          if (a.box) {
            return { ...a, box: { ...a.box, x: interaction.startFrame.x + dx, y: interaction.startFrame.y + dy } };
          }
          if (a.points) {
            const newPoints = interaction.startFrame.map(p => ({ x: p.x + dx, y: p.y + dy }));
            return { ...a, points: newPoints };
          }
          if (a.x !== undefined) {
            return { ...a, x: interaction.startFrame.x + dx, y: interaction.startFrame.y + dy };
          }
        } else if (interaction.mode === 'resize') {
          let { x, y, w, h } = interaction.startFrame;
          if (interaction.handle.includes('e')) w = Math.max(10, w + dx);
          if (interaction.handle.includes('s')) h = Math.max(10, h + dy);
          if (interaction.handle.includes('w')) {
            x += dx;
            w = Math.max(10, w - dx);
          }
          if (interaction.handle.includes('n')) {
            y += dy;
            h = Math.max(10, h - dy);
          }
          return { ...a, box: { x, y, w, h } };
        }
        return a;
      }));

      return;
    }

    if (!isDrawing || !current || !svgRef.current) {
      return;
    }

    const pos = getRelativeCoords(e);

    if (current.type === 'bbox') {
      const x = Math.min(current.box.x, pos.x);
      const y = Math.min(current.box.y, pos.y);
      const w = Math.abs(pos.x - current.box.x);
      const h = Math.abs(pos.y - current.box.y);
      setCurrent((c) => ({ ...c, box: { x, y, w, h } }));
    } else if (current.type === 'polygon' || current.type === 'seg') {
      setCurrent((c) => ({ ...c, preview: { x: pos.x, y: pos.y } }));
    } else if (current.type === 'cuboid') {
      if (current.phase === 'front') {
        const x = Math.min(current.front.x, pos.x);
        const y = Math.min(current.front.y, pos.y);
        const w = Math.abs(pos.x - current.front.x);
        const h = Math.abs(pos.y - current.front.y);
        setCurrent((c) => ({ ...c, front: { x, y, w, h } }));
      } else if (current.phase === 'back') {
        const x = Math.min(current.back.x, pos.x);
        const y = Math.min(current.back.y, pos.y);
        const w = Math.abs(pos.x - current.back.x);
        const h = Math.abs(pos.y - current.back.y);
        setCurrent((c) => ({ ...c, back: { x, y, w, h } }));
      }
    }
  };

  const finishCurrentPolygon = () => {
    if (!current || !(current.type === 'polygon' || current.type === 'seg')) return;
    if (current.points && current.points.length >= 3) {
      const ann = { ...current };
      setPendingAnnotation(ann);
      openLabelModalFor(ann);
    }
    setCurrent(null);
    setIsDrawing(false);
  };

  const onMouseUp = (e) => {
    if (interaction) {
      setInteraction(null);
      return;
    }

    if (!isDrawing || !current) return;

    if (current.type === 'bbox') {
      // finalize bbox
      const { w, h } = current.box;
      if (w > 4 && h > 4) {
        setPendingAnnotation(current);
        openLabelModalFor(current);
      }
      setCurrent(null);
      setIsDrawing(false);
    } else if (current.type === 'polygon' || current.type === 'seg') {
      // polygons are point-click based; do nothing on mouseup
    } else if (current.type === 'cuboid') {
      // Cuboid finalization: if back exists and has area -> finalize
      if (current.back && current.back.w > 4 && current.back.h > 4) {
        const ann = { ...current };
        setPendingAnnotation(ann);
        openLabelModalFor(ann);
        setCurrent(null);
        setIsDrawing(false);
      }
    }
  };

  const openLabelModalFor = (ann) => {
    // position modal near the annotation
    let x = 10, y = 10;
    if (ann.box) {
      x = Math.min(displaySize.w - 260, Math.max(6, ann.box.x));
      y = Math.min(displaySize.h - 140, Math.max(6, ann.box.y + (ann.box.h || 0) + 6));
    } else if (ann.points && ann.points.length) {
      const p = ann.points[ann.points.length - 1];
      x = Math.min(displaySize.w - 260, Math.max(6, p.x));
      y = Math.min(displaySize.h - 140, Math.max(6, p.y + 6));
    } else if (ann.x && ann.y) {
      x = Math.min(displaySize.w - 260, Math.max(6, ann.x));
      y = Math.min(displaySize.h - 140, Math.max(6, ann.y + 6));
    }
    setModalPos({ x, y });
    setLabelValue('');
    setPendingAnnotation(ann);
    setShowLabelModal(true);
  };

  const confirmLabel = (addToList = false) => {
    if (!pendingAnnotation) return;
    const ann = { ...pendingAnnotation, label: labelValue || 'unlabeled' };
    setAnnotations((p) => [...p, ann]);
    if (addToList && labelValue && !labels.includes(labelValue)) setLabels((l) => [...l, labelValue]);
    setPendingAnnotation(null);
    setShowLabelModal(false);
    setLabelValue('');
  };

  const deleteSelected = () => setAnnotations((p) => p.filter((a) => !a.selected));

  const onAnnotationMouseDown = (e, id) => {
    e.stopPropagation();
    if (tool !== 'select') return;

    const ann = annotations.find(a => a.id === id);
    if (!ann) return;

    // Bring selected to front by re-ordering
    setAnnotations(p => [...p.filter(a => a.id !== id), { ...ann, selected: true }]);

    const startPos = getRelativeCoords(e);
    let startFrame;
    if (ann.box) startFrame = { ...ann.box };
    else if (ann.points) startFrame = ann.points.map(p => ({ ...p }));
    else if (ann.x !== undefined) startFrame = { x: ann.x, y: ann.y };

    setInteraction({ mode: 'move', id, startPos, startFrame });
  };

  const onHandleMouseDown = (e, id, handle) => {
    e.stopPropagation();
    if (tool !== 'select') return;

    const ann = annotations.find(a => a.id === id);
    if (!ann || !ann.box) return;

    // Bring selected to front
    setAnnotations(p => [...p.filter(a => a.id !== id), { ...ann, selected: true }]);

    setInteraction({
      mode: 'resize',
      id,
      handle,
      startPos: getRelativeCoords(e),
      startFrame: { ...ann.box }
    });
  };

  const ptsToStr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  const handleSubmit = async () => {
    const token = getToken();
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }

    // Calculate scaling factors to convert display coordinates to natural image coordinates
    const scaleX = naturalSize.w > 0 ? naturalSize.w / displaySize.w : 1;
    const scaleY = naturalSize.h > 0 ? naturalSize.h / displaySize.h : 1;

    const payload = {
      annotations: annotations.map((a) => {
        const scaledAnnotation = { ...a };
        if (a.box) scaledAnnotation.box = { x: a.box.x * scaleX, y: a.box.y * scaleY, w: a.box.w * scaleX, h: a.box.h * scaleY };
        if (a.points) scaledAnnotation.points = a.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
        if (a.x !== undefined) { scaledAnnotation.x = a.x * scaleX; scaledAnnotation.y = a.y * scaleY; }
        if (a.front) scaledAnnotation.front = { x: a.front.x * scaleX, y: a.front.y * scaleY, w: a.front.w * scaleX, h: a.front.h * scaleY };
        if (a.back) scaledAnnotation.back = { x: a.back.x * scaleX, y: a.back.y * scaleY, w: a.back.w * scaleX, h: a.back.h * scaleY };
        return scaledAnnotation;
      }),
    };

    try {
      // This is a hypothetical endpoint. You will need to create it.
      const response = await fetch(`${API_BASE}/tasks/image/${taskId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Failed to submit annotations.');
      alert('✅ Annotations submitted successfully!');
      // Optionally, navigate to the next task or back to the project board
      // navigate('/projects');
    } catch (err) {
      console.error(err);
      alert(`Submission failed: ${err.message}`);
    }
  };

  // UI helpers
  const startNewTool = (t) => { setTool(t); setCurrent(null); setIsDrawing(false); setPendingAnnotation(null); };

  const selectAnnotationFromList = (id) => {
    // Switch to select tool for consistency
    startNewTool('select');

    // Find the annotation and bring it to the front (for rendering order) while selecting it
    const annToSelect = annotations.find(a => a.id === id);
    if (!annToSelect) return;

    setAnnotations(p => [...p.filter(a => a.id !== id).map(a => ({ ...a, selected: false })), { ...annToSelect, selected: true }]);
  };

  const updateSelectedAnnotationLabel = (newLabel) => {
    setAnnotations(prev =>
      prev.map(a => (a.selected ? { ...a, label: newLabel } : a))
    );
    // Also update the label in the labels list if it's new
    if (newLabel && !labels.includes(newLabel)) setLabels(l => [...l, newLabel]);
  };

  const selectedAnnotation = annotations.find(a => a.selected);
  const handleColorSelect = (color) => {
    const selectedId = annotations.find(a => a.selected)?.id;

    if (selectedId) {
      // If an annotation is selected, update its color
      setAnnotations(prev =>
        prev.map(a => (a.id === selectedId ? { ...a, color: color } : a))
      );
    }
    setChosenColor(color); // Also set for next new annotation
  };

  return (
    <div ref={containerRef} className="p-4 bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-1 bg-white p-1 rounded shadow">
          {['select', 'bbox','polygon','seg','keypoint','cuboid'].map((t) => (
            <button key={t} onClick={() => startNewTool(t)} className={`px-3 py-1 rounded ${tool===t? 'bg-blue-600 text-white':'bg-gray-100'}`}>
              {t === 'seg' ? 'Seg' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}

        </div>

        <div className="ml-3 flex items-center gap-2">
          <div className="text-sm text-gray-600">Color:</div>
          <div className="flex gap-1 items-center">
            <input type="color" value={chosenColor} onChange={(e) => handleColorSelect(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
            {/* Optionally, keep a few common colors as quick picks */}
            {['#ef4444', '#10b981', '#3b82f6', '#f97316', '#8b5cf6'].map((c) => (
              <button key={c} onClick={() => handleColorSelect(c)} style={{ background: c }} className={`w-7 h-7 rounded border ${chosenColor === c ? 'ring-2 ring-offset-1' : ''}`} />
            ))}
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <button className="px-3 py-1 rounded bg-red-500 text-white" onClick={deleteSelected}>Delete</button>
          <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={handleSubmit}>Submit</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

      {needsMapping && taskId && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold text-amber-900">Project Setup Required</h2>
          <p className="text-amber-800">
            This project doesn't have a UI template yet. Map the data fields from your task to the UI components below.
          </p>
          <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-4">
            {mappingRules.map((rule, index) => (
              <div key={index} className="grid grid-cols-3 items-center gap-3">
                <div className="font-medium text-slate-700">
                  {rule.component_type === 'Image' ? 'Image Source' : 'Text Content'}
                </div>
                <div className="text-slate-500 text-center">→</div>
                <select
                  value={rule.source_path}
                  onChange={(e) => handleRuleChange(index, 'source_path', e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">-- Select a data field --</option>
                  {payloadKeys.map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
             <button onClick={addMappingRule} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              + Map another text field
            </button>
            <button onClick={handleSaveMapping} disabled={isSavingMapping} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {isSavingMapping ? 'Saving...' : 'Save and Start'}
            </button>
          </div>
        </div>
      )}

      {!taskId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold text-slate-800">Image Annotation Setup</h2>
          <p className="text-slate-600">
            Select a project to configure its annotation template. This is a one-time setup per project.
          </p>
          
          <div className="max-w-sm space-y-2">
            <label className="block text-sm font-medium text-slate-700">1. Select Project</label>
            <select
              value={setupProjectId}
              onChange={(e) => handleProjectSelectForSetup(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            >
              <option value="">-- Choose a project --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {setupLoading && <div className="text-sm text-slate-500">Loading sample data...</div>}

          {payloadKeys.length > 0 && (
            <div className="space-y-4 pt-4">
              <label className="block text-sm font-medium text-slate-700">2. Map Data Fields</label>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {mappingRules.map((rule, index) => (
                  <div key={index} className="grid grid-cols-3 items-center gap-3">
                    <div className="font-medium text-slate-700">{rule.component_type === 'Image' ? 'Image Source' : 'Text Content'}</div>
                    <div className="text-slate-500 text-center">→</div>
                    <select value={rule.source_path} onChange={(e) => handleRuleChange(index, 'source_path', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none">
                      <option value="">-- Select a data field --</option>
                      {payloadKeys.map(key => <option key={key} value={key}>{key}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <button onClick={addMappingRule} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Map another text field</button>
                <button onClick={handleSaveMapping} disabled={isSavingMapping} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                  {isSavingMapping ? 'Saving...' : 'Save Template and Finish'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      <div className="flex gap-4">
        <div className="relative bg-white border rounded shadow-md" style={{ width: displaySize.w, height: displaySize.h }}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-gray-400">Loading task...</div>
          ) : imageSrc ? (
            <>
              <img ref={imgRef} src={imageSrc} onLoad={onImageLoad} alt="annotation" style={{ width: displaySize.w, height: displaySize.h, objectFit: 'contain', display: 'block' }} />
              <svg
                ref={svgRef}
                width={displaySize.w}
                height={displaySize.h}
                className="absolute top-0 left-0"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
              >
                {/* existing annotations */}
                {annotations.map((a) => (
                  <g key={a.id}>
                    {a.type === 'bbox' && a.box && (
                      <>
                        <rect x={a.box.x} y={a.box.y} width={a.box.w} height={a.box.h} fill="transparent" stroke={a.color} strokeWidth={2} onMouseDown={(e)=>onAnnotationMouseDown(e,a.id)} style={{ cursor: tool === 'select' ? 'move' : 'default' }} data-annotation-id={a.id} />
                        {a.label && <text x={a.box.x+6} y={a.box.y+14} fontSize={12} fill={a.color}>{a.label}</text>}
                        {a.selected && tool === 'select' && (
                          <>
                            {/* Resize handles */}
                            <circle onMouseDown={(e) => onHandleMouseDown(e, a.id, 'nw')} cx={a.box.x} cy={a.box.y} r={5} fill="#fff" stroke="#000" cursor="nwse-resize" />
                            <circle onMouseDown={(e) => onHandleMouseDown(e, a.id, 'ne')} cx={a.box.x + a.box.w} cy={a.box.y} r={5} fill="#fff" stroke="#000" cursor="nesw-resize" />
                            <circle onMouseDown={(e) => onHandleMouseDown(e, a.id, 'sw')} cx={a.box.x} cy={a.box.y + a.box.h} r={5} fill="#fff" stroke="#000" cursor="nesw-resize" />
                            <circle onMouseDown={(e) => onHandleMouseDown(e, a.id, 'se')} cx={a.box.x + a.box.w} cy={a.box.y + a.box.h} r={5} fill="#fff" stroke="#000" cursor="nwse-resize" />
                          </>
                        )}
                      </>
                    )}

                    {a.type === 'polygon' && a.points && (
                      <>
                        <polygon
                          points={ptsToStr(a.points)}
                          fill="transparent"
                          stroke={a.color}
                          strokeWidth={1.8}
                          onMouseDown={(e)=>onAnnotationMouseDown(e,a.id)}
                          style={{ cursor: tool === 'select' ? 'move' : 'default' }}
                          data-annotation-id={a.id}
                        />
                        {a.label && <text x={a.points[0].x+6} y={a.points[0].y+14} fontSize={12} fill={a.color}>{a.label}</text>}
                      </>
                    )}

                    {a.type === 'seg' && a.points && (
                      <>
                        <polygon
                          points={ptsToStr(a.points)}
                          fill={a.color+'55'}
                          stroke={a.color}
                          strokeWidth={1}
                          onMouseDown={(e)=>onAnnotationMouseDown(e,a.id)}
                          style={{ cursor: tool === 'select' ? 'move' : 'default' }}
                          data-annotation-id={a.id}
                        />
                        {a.label && <text x={a.points[0].x+6} y={a.points[0].y+14} fontSize={12} fill={a.color}>{a.label}</text>}
                      </>
                    )}

                    {a.type === 'keypoint' && (
                      <>
                        <circle cx={a.x} cy={a.y} r={5} fill={a.color} onMouseDown={(e)=>onAnnotationMouseDown(e,a.id)} style={{ cursor: tool === 'select' ? 'move' : 'default' }} data-annotation-id={a.id} />
                        {a.label && <text x={a.x+6} y={a.y+6} fontSize={12} fill={a.color}>{a.label}</text>}
                      </>
                    )}

                    {a.type === 'cuboid' && (
                      <>
                        <rect x={a.front.x} y={a.front.y} width={a.front.w} height={a.front.h} fill="transparent" stroke={a.color} strokeWidth={1.5} />
                        {a.back && <rect x={a.back.x} y={a.back.y} width={a.back.w} height={a.back.h} fill="transparent" stroke={a.color} strokeWidth={1.5} />}
                        {a.back && (
                          <>
                            <line x1={a.front.x} y1={a.front.y} x2={a.back.x} y2={a.back.y} stroke={a.color} strokeWidth={1} />
                            <line x1={a.front.x+a.front.w} y1={a.front.y} x2={a.back.x+a.back.w} y2={a.back.y} stroke={a.color} strokeWidth={1} />
                            <line x1={a.front.x} y1={a.front.y+a.front.h} x2={a.back.x} y2={a.back.y+a.back.h} stroke={a.color} strokeWidth={1} />
                            <line x1={a.front.x+a.front.w} y1={a.front.y+a.front.h} x2={a.back.x+a.back.w} y2={a.back.y+a.back.h} stroke={a.color} strokeWidth={1} />
                          </>
                        )}
                        {a.label && <text x={a.front.x+6} y={a.front.y+14} fontSize={12} fill={a.color}>{a.label}</text>}
                      </>
                    )}

                  </g>
                ))}

                {/* current preview */}
                {current && current.type === 'bbox' && (
                  <rect x={current.box.x} y={current.box.y} width={current.box.w} height={current.box.h} fill="transparent" stroke={current.color} strokeDasharray="4" />
                )}

                {current && (current.type === 'polygon' || current.type === 'seg') && (
                  <>
                    <polyline points={ptsToStr((current.points||[]).concat(current.preview ? [current.preview] : []))} fill="none" stroke={current.color} strokeDasharray="4" />
                    {(current.points||[]).map((p,i) => (
                      // Make the first point larger to indicate it can be clicked to close
                      <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 5 : 3} fill={i === 0 ? '#3b82f6' : '#fff'} stroke="#000" />
                    ))}
                  </>
                )}

                {current && current.type === 'cuboid' && (
                  <>
                    <rect x={current.front.x} y={current.front.y} width={current.front.w} height={current.front.h} fill="transparent" stroke={current.color} strokeDasharray="4" />
                    {current.back && <rect x={current.back.x} y={current.back.y} width={current.back.w} height={current.back.h} fill="transparent" stroke={current.color} strokeDasharray="4" />}
                  </>
                )}

              </svg>

              {/* label modal */}
              {showLabelModal && (
                <div style={{ position: 'absolute', left: modalPos.x, top: modalPos.y, zIndex: 80 }}>
                  <div className="bg-white p-3 rounded shadow border w-[260px]">
                    <div className="text-sm font-medium mb-1">Add label & color</div>
                    <select className="w-full mb-2 p-1 border rounded" value={labelValue} onChange={(e)=>setLabelValue(e.target.value)}>
                      <option value="">-- choose label --</option>
                      {labels.map((l)=> <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input className="w-full p-1 border rounded mb-2" placeholder="Or type new label" value={labelValue} onChange={(e)=>setLabelValue(e.target.value)} />
                    <div className="mb-2 text-xs text-gray-600">Pick color for this annotation:</div>
                    <div className="flex gap-1 mb-3 items-center">
                      <input type="color" value={chosenColor} onChange={(e) => setChosenColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button className="px-2 py-1 rounded bg-gray-200" onClick={()=>{ setShowLabelModal(false); setPendingAnnotation(null); setLabelValue(''); }}>Cancel</button>
                      <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>{ if(pendingAnnotation){ pendingAnnotation.color = chosenColor; } confirmLabel(false); }}>Add</button>
                      <button className="px-2 py-1 rounded bg-green-600 text-white" onClick={()=>{ if(pendingAnnotation){ pendingAnnotation.color = chosenColor; } confirmLabel(true); }}>Add & Save</button>
                    </div>
                  </div>
                </div>
              )}

            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">No image loaded for this task.</div>
          )}
        </div>

        {/* sidebar */}
        {selectedAnnotation ? (
          <AnnotationInspector
            annotation={selectedAnnotation}
            labels={labels}
            onLabelChange={updateSelectedAnnotationLabel}
            onColorChange={handleColorSelect}
          />
        ) : (
        <div className="w-80 bg-white border rounded shadow p-3 h-[620px] overflow-auto">
          <h3 className="font-semibold mb-2">Annotations ({annotations.length})</h3>
          {annotations.map((a)=> (
            <div key={a.id} onClick={() => selectAnnotationFromList(a.id)} className={`p-2 border rounded mb-2 cursor-pointer hover:bg-blue-100 ${a.selected? 'bg-blue-50 border-blue-300':''}`}>
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium">{a.type.toUpperCase()}{a.label? ` • ${a.label}` : ''}</div>
                <div style={{ width: 14, height: 14, background: a.color, border: '1px solid #ccc' }} />
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {a.box && `x:${Math.round(a.box.x)} y:${Math.round(a.box.y)} w:${Math.round(a.box.w)} h:${Math.round(a.box.h)}`}
                {a.points && `Points:${a.points.length}`}
                {a.x !== undefined && `x:${Math.round(a.x)} y:${Math.round(a.y)}`}
              </div>
            </div>
          ))}

          <hr className="my-2" />
          <div className="text-sm font-medium mb-1">Labels</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {labels.map((l)=> <div key={l} className="px-2 py-1 bg-gray-100 rounded text-xs">{l}</div>)}
          </div>

          <div className="mt-3 text-sm text-gray-600">Tip: For polygons/segmentation — click to add points. Press <strong>Finish Polygon</strong> when done.</div>
        </div>
        )}
      </div>
    </div>
  );
}

export default function ImageAnnotator() {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="p-4 md:p-6">
          <ImageAnnotatorComponent />
        </div>
      </main>
    </div>
  );
}

// New AnnotationInspector Component
function AnnotationInspector({ annotation, labels, onLabelChange, onColorChange }) {
  const [currentLabel, setCurrentLabel] = useState(annotation.label || '');

  useEffect(() => {
    setCurrentLabel(annotation.label || '');
  }, [annotation.label]);

  const handleLabelInput = (e) => {
    setCurrentLabel(e.target.value);
    onLabelChange(e.target.value);
  };

  const handleLabelSelect = (e) => {
    setCurrentLabel(e.target.value);
    onLabelChange(e.target.value);
  };

  return (
    <div className="w-80 bg-white border rounded shadow p-3 h-[620px] overflow-auto">
      <h3 className="font-semibold mb-2">Annotation Inspector</h3>
      <div className="text-sm text-gray-600 mb-3">
        <p><strong>ID:</strong> {annotation.id}</p>
        <p><strong>Type:</strong> {annotation.type.toUpperCase()}</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Label:</label>
        <select className="w-full mb-2 p-1 border rounded" value={currentLabel} onChange={handleLabelSelect}>
          <option value="">-- choose label --</option>
          {labels.map((l)=> <option key={l} value={l}>{l}</option>)}
        </select>
        <input
          type="text"
          className="w-full p-1 border rounded"
          placeholder="Or type new label"
          value={currentLabel}
          onChange={handleLabelInput}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Color:</label>
        <input
          type="color"
          value={annotation.color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded border cursor-pointer"
        />
      </div>
    </div>
  );
}