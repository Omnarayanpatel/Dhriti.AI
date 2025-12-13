import React, { useEffect, useRef, useState } from "react";
import { BsThreeDotsVertical } from "react-icons/bs";
import {
  RiPlayLine,
  RiPauseLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiSkipLeftLine,
  RiSkipRightLine,
} from "react-icons/ri";


/**
 * Full merged VideoAnnotationTool component with:
 * - bbox / polygon / polyline / segmentation
 * - CVAT-like forward propagation (auto copy bbox to all future frames with same id)
 * - move/resize propagate to future frames (if same id exists)
 * - undo/redo, labels, import/export
 *
 * Replace your existing component with this file.
 */

export default function VideoAnnotationTool() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // -------- app state --------
  const [videoURL, setVideoURL] = useState(null);

  // Tools: "select" | "bbox" | "polygon" | "polyline" | "segmentation"
  const [currentTool, setCurrentTool] = useState("select");
  const [drawMode, setDrawMode] = useState(false);

  // playback & frames
  const [fps] = useState(30);
  const [frameNumber, setFrameNumber] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // annotations per frame (Format B)
  const [annotationsMap, setAnnotationsMap] = useState(() => {
    try {
      const saved = localStorage.getItem("va_annotations");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // labels
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

  // selection & interaction
  const [selection, setSelection] = useState({ frame: null, index: null });
  const [interaction, setInteraction] = useState({ type: null, edge: null }); // moving, resizing, drawing-*
  const [startPos, setStartPos] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // temporary state for shapes
  const tempPointsRef = useRef([]); // polygon/polyline preview points
  const freehandRef = useRef([]); // segmentation stroke while drawing

  // undo/redo
  const undoStackRef = useRef([]);
  const [redoStack, setRedoStack] = useState([]);

  // menu
  const [openMenu, setOpenMenu] = useState(false);

  // ensure drawMode matches tool
  useEffect(() => {
    setDrawMode(currentTool !== "select");
  }, [currentTool]);

  // persist annotations + labels
  useEffect(() => {
    try {
      localStorage.setItem("va_annotations", JSON.stringify(annotationsMap));
      localStorage.setItem("va_labels", JSON.stringify(labels));
    } catch (e) {
      console.warn("Unable to save to localStorage", e);
    }
  }, [annotationsMap, labels]);

  // helper: current frame number
  const getCurrentFrame = () => {
    const v = videoRef.current;
    if (!v) return 0;
    return Math.floor(v.currentTime * fps);
  };

  // snapshot helper
  const pushSnapshot = () => {
    try {
      undoStackRef.current.push(JSON.stringify(annotationsMap));
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      setRedoStack([]);
    } catch (e) {
      console.warn("pushSnapshot failed", e);
    }
  };

  // undo / redo
  const undo = () => {
    if (!undoStackRef.current || undoStackRef.current.length === 0) return;
    const last = undoStackRef.current.pop();
    if (!last) return;
    setRedoStack((r) => [...r, JSON.stringify(annotationsMap)]);
    setAnnotationsMap(JSON.parse(last));
    setSelection({ frame: null, index: null });
  };

  const redo = () => {
    if (!redoStack || redoStack.length === 0) return;
    const lastRedo = redoStack[redoStack.length - 1];
    if (!lastRedo) return;
    undoStackRef.current.push(JSON.stringify(annotationsMap));
    setRedoStack((prev) => prev.slice(0, -1));
    setAnnotationsMap(JSON.parse(lastRedo));
    setSelection({ frame: null, index: null });
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
        if (parsed.annotationsMap) {
          pushSnapshot();
          setAnnotationsMap(parsed.annotationsMap);
        }
        if (parsed.labels) setLabels(parsed.labels);
      } catch (err) {
        alert("Invalid file");
      }
    };
    reader.readAsText(f);
  };

  // upload video
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoURL(url);
    setAnnotationsMap({});
    setSelection({ frame: null, index: null });
    undoStackRef.current = [];
    setRedoStack([]);
    localStorage.removeItem("va_annotations");
    setFrameNumber(0);
    setIsPlaying(false);
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

  // canvas sizing
  useEffect(() => {
    const resizeCanvas = () => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width);
      c.height = Math.round(rect.height);
      drawFrameAnnotations();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoURL]);

  // on video loaded -> set canvas pixel size to video size if available
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v && c) {
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width);
      c.height = Math.round(rect.height);
      drawFrameAnnotations();
    }
  };

  // update frame number
  const onTimeUpdate = () => {
    setFrameNumber(getCurrentFrame());
    drawFrameAnnotations();
  };

  // get canvas coords scaled to pixel size
  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const x = (e.clientX - rect.left) * (cw / rect.width);
    const y = (e.clientY - rect.top) * (ch / rect.height);
    return { x, y };
  };

  // ---------- Drawing ----------
  const drawFrameAnnotations = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = getCurrentFrame();
    const list = annotationsMap[frame] || [];

    // draw saved annos
    list.forEach((a, i) => {
      ctx.strokeStyle = a.color || "#16a34a";
      ctx.lineWidth = selection.frame === frame && selection.index === i ? 3 : 2;
      ctx.fillStyle = a.color || "#16a34a";

      if (a.type === "bbox") {
        const x = a.x1,
          y = a.y1,
          w = a.x2 - a.x1,
          h = a.y2 - a.y1;
        ctx.strokeRect(x, y, w, h);
        ctx.font = "14px Arial";
        const text = a.label || "";
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = a.color || "#16a34a";
        ctx.fillRect(x, y - 18, tw + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, x + 4, y - 5);

        // handles
        const handles = [
          { x: a.x1, y: a.y1 },
          { x: a.x2, y: a.y1 },
          { x: a.x2, y: a.y2 },
          { x: a.x1, y: a.y2 },
        ];
        handles.forEach((hpt) => {
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = a.color || "#16a34a";
          ctx.lineWidth = 1;
          ctx.fillRect(hpt.x - 5, hpt.y - 5, 10, 10);
          ctx.strokeRect(hpt.x - 5, hpt.y - 5, 10, 10);
        });
      } else if (a.type === "polygon" || a.type === "polyline" || a.type === "segmentation") {
        const pts = a.points || [];
        if (pts.length === 0) return;

        // -------- POLYGON + SEGMENTATION FILL --------
        if (a.type === "polygon" || a.type === "segmentation") {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
          ctx.closePath();

          // fill color
          ctx.fillStyle = (a.color || "#16a34a") + "4D"; // 30% opacity
          ctx.fill();
        }

        // -------- OUTLINE --------
        ctx.strokeStyle = a.color || "#16a34a";
        ctx.lineWidth = selection.frame === frame && selection.index === i ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        if (a.type === "polygon") ctx.closePath();
        ctx.stroke();

        // -------- ALWAYS SHOW VERTEX POINTS --------
        pts.forEach((p) => {
          ctx.beginPath();
          ctx.fillStyle = a.color || "#16a34a";
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        // -------- LABEL --------
        ctx.font = "14px Arial";
        ctx.fillStyle = a.color || "#16a34a";
        ctx.fillText(a.label || "", pts[0].x + 4, pts[0].y - 6);
      }

    });

    // draw temp preview shapes
    const color = (labels.find((l) => l.name === currentLabel) || labels[0])?.color || "#16a34a";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillStyle = color;

    if (interaction?.type === "drawing-bbox" && startPos && tempPointsRef.current.length > 0) {
      const cur = tempPointsRef.current[tempPointsRef.current.length - 1];
      const x = startPos.x,
        y = startPos.y,
        w = cur.x - startPos.x,
        h = cur.y - startPos.y;
      ctx.strokeRect(x, y, w, h);
    }

    if ((interaction?.type === "drawing-points") && tempPointsRef.current.length > 0) {
      const pts = tempPointsRef.current;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
      // draw point markers
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (interaction?.type === "drawing-freehand" && freehandRef.current.length > 1) {
      const pts = freehandRef.current;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
    }
  };

  // redraw when relevant changes
  useEffect(() => {
    drawFrameAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationsMap, frameNumber, selection, currentTool]);

  // ---------- Hit testing for bbox selection / resize ----------
  // universal hit test for bbox / polygon / polyline / segmentation
  const hitTestShape = (x, y) => {
    const frame = getCurrentFrame();
    const list = annotationsMap[frame] || [];

    // iterate topmost first
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];

      // BBOX: check corner handles first then inside
      if (a.type === "bbox") {
        const corners = [
          { x: a.x1, y: a.y1, edge: "nw" },
          { x: a.x2, y: a.y1, edge: "ne" },
          { x: a.x2, y: a.y2, edge: "se" },
          { x: a.x1, y: a.y2, edge: "sw" },
        ];
        for (const c of corners) {
          if (Math.abs(x - c.x) <= 8 && Math.abs(y - c.y) <= 8) {
            return { index: i, type: "resize", edge: c.edge };
          }
        }
        // inside bbox -> move
        if (x >= Math.min(a.x1, a.x2) && x <= Math.max(a.x1, a.x2) &&
          y >= Math.min(a.y1, a.y2) && y <= Math.max(a.y1, a.y2)) {
          return { index: i, type: "move" };
        }
        continue;
      }

      // POLYGON / POLYLINE / SEGMENTATION: check vertex handles first
      if (a.points && a.points.length > 0) {
        for (let vi = 0; vi < a.points.length; vi++) {
          const p = a.points[vi];
          if (Math.abs(x - p.x) <= 8 && Math.abs(y - p.y) <= 8) {
            return { index: i, type: "vertex", vertex: vi };
          }
        }

        // simple bounding-box test for "inside" (fast). If you need stricter,
        // replace with point-in-polygon test below.
        const minX = Math.min(...a.points.map((p) => p.x));
        const maxX = Math.max(...a.points.map((p) => p.x));
        const minY = Math.min(...a.points.map((p) => p.y));
        const maxY = Math.max(...a.points.map((p) => p.y));
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          // for polygon, we should do pointInPolygon for accuracy
          if (a.type === "polygon") {
            // point-in-polygon (ray casting)
            let inside = false;
            for (let vi = 0, vj = a.points.length - 1; vi < a.points.length; vj = vi++) {
              const xi = a.points[vi].x, yi = a.points[vi].y;
              const xj = a.points[vj].x, yj = a.points[vj].y;
              const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
              if (intersect) inside = !inside;
            }
            if (inside) return { index: i, type: "move" };
          } else {
            // polyline / segmentation use bounding-box inside as "move"
            return { index: i, type: "move" };
          }
        }
      }
    }
    return { index: -1, type: null };
  };


  // ---------- Mouse handlers (single unified) ----------
  const handleMouseDown = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    // If in select tool: use hitTestShape to select / start moving / start resize
    if (currentTool === "select") {
      const hit = hitTestShape(pos.x, pos.y);
      if (hit.index >= 0) {
        setSelection({ frame, index: hit.index });

        // snapshot for undo on mutation actions
        if (hit.type === "move" || hit.type === "resize" || hit.type === "vertex") {
          pushSnapshot();
        }

        if (hit.type === "move") {
          setInteraction({ type: "moving", edge: null, vertex: null });
          setStartPos(pos);
        } else if (hit.type === "resize") {
          setInteraction({ type: "resizing", edge: hit.edge, vertex: null });
          setStartPos(pos);
        } else if (hit.type === "vertex") {
          // editing a polygon/polyline vertex
          setInteraction({ type: "vertex-drag", edge: null, vertex: hit.vertex });
          setStartPos(pos);
        }
      } else {
        // clicked empty area -> clear selection
        setSelection({ frame: null, index: null });
        setInteraction({ type: null, edge: null, vertex: null });
      }
      return;
    }

    // ---------- DRAW modes (existing behaviour) ----------
    setSelection({ frame: null, index: null });
    setIsDrawing(true);
    setStartPos(pos);

    if (currentTool === "bbox") {
      setInteraction({ type: "drawing-bbox", edge: null, vertex: null });
      tempPointsRef.current = [pos, pos];
    } else if (currentTool === "polygon" || currentTool === "polyline") {
      if (!interaction || interaction.type !== "drawing-points") {
        setInteraction({ type: "drawing-points", edge: null, vertex: null });
        tempPointsRef.current = [pos];
      } else {
        tempPointsRef.current = [...tempPointsRef.current, pos];
      }
      drawFrameAnnotations();
    } else if (currentTool === "segmentation") {
      setInteraction({ type: "drawing-freehand", edge: null, vertex: null });
      freehandRef.current = [pos];
    }
  };


  const handleMouseMove = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    // MOVING a selected shape (whole shape)
    if (interaction?.type === "moving" && startPos && selection.index != null && selection.frame === frame) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      setStartPos(pos);

      setAnnotationsMap((prev) => {
        const copy = { ...prev };
        const list = (copy[frame] || []).slice();
        const moved = { ...list[selection.index] };

        if (moved.type === "bbox") {
          moved.x1 += dx; moved.x2 += dx; moved.y1 += dy; moved.y2 += dy;
        } else if (moved.points) {
          moved.points = moved.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        }

        list[selection.index] = moved;
        copy[frame] = list;

        // propagate to future frames if same id exists
        const v = videoRef.current;
        const totalFrames = Math.floor((v?.duration || 0) * fps);
        for (let f = frame + 1; f <= totalFrames; f++) {
          const futureList = (copy[f] || []).slice();
          const idx = futureList.findIndex((b) => b.id === moved.id);
          if (idx >= 0) {
            futureList[idx] = { ...futureList[idx], ...moved, frame: f };
            copy[f] = futureList;
          }
        }

        return copy;
      });

      drawFrameAnnotations();
      return;
    }

    // RESIZING a bbox (corner handles)
    if (interaction?.type === "resizing" && startPos && selection.index != null && selection.frame === frame) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      setStartPos(pos);

      setAnnotationsMap((prev) => {
        const copy = { ...prev };
        const list = (copy[frame] || []).slice();
        const a = { ...list[selection.index] };
        const edge = interaction.edge;
        if (edge === "nw") { a.x1 += dx; a.y1 += dy; }
        if (edge === "ne") { a.x2 += dx; a.y1 += dy; }
        if (edge === "se") { a.x2 += dx; a.y2 += dy; }
        if (edge === "sw") { a.x1 += dx; a.y2 += dy; }
        list[selection.index] = a;
        copy[frame] = list;

        // propagate
        const v = videoRef.current;
        const totalFrames = Math.floor((v?.duration || 0) * fps);
        for (let f = frame + 1; f <= totalFrames; f++) {
          const futureList = (copy[f] || []).slice();
          const idx = futureList.findIndex((b) => b.id === a.id);
          if (idx >= 0) {
            futureList[idx] = { ...futureList[idx], ...a, frame: f };
            copy[f] = futureList;
          }
        }

        return copy;
      });

      drawFrameAnnotations();
      return;
    }

    // VERTEX DRAG (polygon/polyline/segmentation)
    if (interaction?.type === "vertex-drag" && startPos && selection.index != null && selection.frame === frame) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      setStartPos(pos);

      setAnnotationsMap((prev) => {
        const copy = { ...prev };
        const list = (copy[frame] || []).slice();
        const a = { ...list[selection.index] };
        if (a.points && typeof interaction.vertex === "number") {
          a.points = a.points.map((p, idx) => idx === interaction.vertex ? { x: p.x + dx, y: p.y + dy } : p);
        }
        list[selection.index] = a;
        copy[frame] = list;

        // propagate changes to future frames if same id exists
        const v = videoRef.current;
        const totalFrames = Math.floor((v?.duration || 0) * fps);
        for (let f = frame + 1; f <= totalFrames; f++) {
          const futureList = (copy[f] || []).slice();
          const idx = futureList.findIndex((b) => b.id === a.id);
          if (idx >= 0) {
            futureList[idx] = { ...futureList[idx], ...a, frame: f };
            copy[f] = futureList;
          }
        }

        return copy;
      });

      drawFrameAnnotations();
      return;
    }

    // ---------- existing drawing preview behavior ----------
    if (interaction?.type === "drawing-bbox" && isDrawing && startPos) {
      tempPointsRef.current[tempPointsRef.current.length - 1] = pos;
      drawFrameAnnotations();
      return;
    }

    if ((interaction?.type === "drawing-points") && tempPointsRef.current.length > 0) {
      const committed = tempPointsRef.current.slice(0);
      const preview = [...committed, pos];
      const saved = tempPointsRef.current;
      tempPointsRef.current = preview;
      drawFrameAnnotations();
      tempPointsRef.current = saved;
      return;
    }

    if (interaction?.type === "drawing-freehand" && isDrawing) {
      freehandRef.current.push(pos);
      drawFrameAnnotations();
      return;
    }
  };


  const handleMouseUp = (e) => {
    const pos = getCanvasCoords(e);
    const frame = getCurrentFrame();

    // finish move/resize/vertex interactions
    if (interaction?.type === "moving" || interaction?.type === "resizing" || interaction?.type === "vertex-drag") {
      setIsDrawing(false);
      setInteraction({ type: null, edge: null, vertex: null });
      setStartPos(null);
      return;
    }

    // keep your existing finalize-drawing logic (bbox/poly/seg) unchanged:
    // finalize bbox
    if (interaction?.type === "drawing-bbox" && startPos) {
      pushSnapshot();
      const labelObj = labels.find((l) => l.name === currentLabel) || labels[0] || { color: "#16a34a" };
      const lastPreview = tempPointsRef.current[tempPointsRef.current.length - 1] || pos;
      const newId = Date.now();
      const newAnno = {
        id: newId, type: "bbox", label: currentLabel, color: labelObj.color, frame,
        x1: startPos.x, y1: startPos.y, x2: lastPreview.x, y2: lastPreview.y,
      };
      setAnnotationsMap((prev) => {
        const copy = { ...prev };
        copy[frame] = copy[frame] ? [...copy[frame], newAnno] : [newAnno];
        const v = videoRef.current;
        const totalFrames = Math.floor((v?.duration || 0) * fps);
        for (let f = frame + 1; f <= totalFrames; f++) {
          const cloned = { ...newAnno, frame: f };
          copy[f] = copy[f] ? [...copy[f], cloned] : [cloned];
        }
        return copy;
      });
      tempPointsRef.current = [];
      setIsDrawing(false);
      setInteraction({ type: null, edge: null, vertex: null });
      setStartPos(null);
      return;
    }

    // finalize freehand segmentation
    if (interaction?.type === "drawing-freehand") {
      if (freehandRef.current.length > 1) {
        pushSnapshot();

        const labelObj =
          labels.find((l) => l.name === currentLabel) ||
          labels[0] ||
          { color: "#16a34a" };

        const baseAnno = {
          id: Date.now(),
          type: "segmentation",
          label: currentLabel,
          color: labelObj.color,
          frame,
          points: freehandRef.current.slice(),
        };

        setAnnotationsMap((prev) => {
          const copy = { ...prev };

          // Add segmentation to current frame
          copy[frame] = copy[frame] ? [...copy[frame], baseAnno] : [baseAnno];

          // Auto-propagate to all future frames (same as bbox)
          const v = videoRef.current;
          const totalFrames = Math.floor((v?.duration || 0) * fps);

          for (let f = frame + 1; f <= totalFrames; f++) {
            const cloned = {
              ...baseAnno,
              frame: f,
              id: Date.now() + f // ensure unique id per frame
            };
            copy[f] = copy[f] ? [...copy[f], cloned] : [cloned];
          }

          return copy;
        });
      }

      // Cleanup
      freehandRef.current = [];
      setIsDrawing(false);
      setInteraction({ type: null, edge: null, vertex: null });
      setStartPos(null);
      return;
    }


    // finalize polygon/polyline on double click (keeps your behavior)
    if (interaction?.type === "drawing-points") {

      // Double-click = finish polygon
      if (e.detail === 2) {
        if (tempPointsRef.current.length >= 2) {
          pushSnapshot();

          const labelObj =
            labels.find((l) => l.name === currentLabel) ||
            labels[0] ||
            { color: "#16a34a" };

          const baseAnno = {
            id: Date.now(),
            type: "polygon",
            label: currentLabel,
            color: labelObj.color,
            frame,
            points: tempPointsRef.current.slice(),

            // 🔥 Add fill color
            fill: labelObj.color,
            fillOpacity: 0.3,  // 30% transparency
          };

          setAnnotationsMap((prev) => {
            const copy = { ...prev };

            // Add polygon to current frame
            copy[frame] = copy[frame] ? [...copy[frame], baseAnno] : [baseAnno];

            // Auto-propagate polygon to all FUTURE frames
            const v = videoRef.current;
            const totalFrames = Math.floor((v?.duration || 0) * fps);

            for (let f = frame + 1; f <= totalFrames; f++) {
              const cloned = {
                ...baseAnno,
                frame: f,
                id: Date.now() + f,  // unique id per frame
              };

              copy[f] = copy[f] ? [...copy[f], cloned] : [cloned];
            }

            return copy;
          });
        }

        // Cleanup
        tempPointsRef.current = [];
        setIsDrawing(false);
        setInteraction({ type: null, edge: null, vertex: null });
      }

      // Single click → preview polygon points
      else {
        tempPointsRef.current = tempPointsRef.current.slice();
        drawFrameAnnotations();
      }

      return;
    }




    // default cleanup
    setIsDrawing(false);
    setInteraction({ type: null, edge: null, vertex: null });
    setStartPos(null);
  };


  // delete selected
  const deleteSelected = () => {
    if (selection.frame == null || selection.index == null) return;
    pushSnapshot();
    setAnnotationsMap(prev => {
      const copy = { ...prev };
      copy[selection.frame] = copy[selection.frame].filter(
        (_, i) => i !== selection.index
      );
      return copy;
    });
    setSelection({ frame: null, index: null });
  };

  // propagate selected annotation to next N frames
  const propagateSelected = (count = 1) => {
    if (selection.frame == null || selection.index == null) return;
    const startFrame = selection.frame;
    const idx = selection.index;
    const list = (annotationsMap[startFrame] || []).slice();
    const anno = list[idx];
    if (!anno) return;
    pushSnapshot();
    setAnnotationsMap((prev) => {
      const copy = { ...prev };
      for (let f = startFrame + 1; f <= startFrame + count; f++) {
        const copied = { ...anno, frame: f, id: Date.now() + f };
        copy[f] = copy[f] ? [...copy[f], copied] : [copied];
      }
      return copy;
    });
  };

  // ★ FULL PROPAGATION TILL VIDEO END (CVAT-Style)
  const propagateForwardTillEnd = () => {
    if (selection.frame == null || selection.index == null) return;

    const startFrame = selection.frame;
    const idx = selection.index;
    const list = (annotationsMap[startFrame] || []).slice();
    const anno = list[idx];
    if (!anno) return;

    pushSnapshot();

    setAnnotationsMap((prev) => {
      const copy = { ...prev };

      const v = videoRef.current;
      const totalFrames = Math.floor((v?.duration || 0) * fps);

      for (let f = startFrame + 1; f <= totalFrames; f++) {
        const existingList = (copy[f] || []).slice();
        const existingIndex = existingList.findIndex((x) => x.id === anno.id);

        if (existingIndex >= 0) {
          existingList[existingIndex] = { ...existingList[existingIndex], ...anno, frame: f };
          copy[f] = existingList;
        } else {
          const cloned = { ...anno, frame: f };
          copy[f] = [...existingList, cloned];
        }
      }

      return copy;
    });
  };

  // playback helpers
  const seekToFrame = (frame) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const t = Math.max(0, Math.min(v.duration || 0, frame / fps + 0.0001));
    v.currentTime = t;
    setFrameNumber(Math.floor(t * fps));
    setTimeout(() => drawFrameAnnotations()
      , 80);
  };
  const prevFrame = () => seekToFrame(getCurrentFrame() - 1);
  const nextFrame = () => seekToFrame(getCurrentFrame() + 1);
  const jumpBack = () => seekToFrame(getCurrentFrame() - 10);
  const jumpForward = () => seekToFrame(getCurrentFrame() + 10);
  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      try {
        await v.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
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
        setCurrentTool((s) => (s === "bbox" ? "select" : "bbox"));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        redo();
      } else if (e.key === "Delete") {
        deleteSelected();
      } else if (e.key.toLowerCase() === "t") {
        propagateSelected(10);
      } else if (e.key.toLowerCase() === "y") {
        propagateSelected(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationsMap, selection, redoStack, currentTool]);

  // add / delete label
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

  const removeLabel = (name) => {
    const nextLabels = labels.filter((l) => l.name !== name);
    setLabels(nextLabels);
    if (currentLabel === name && nextLabels.length) setCurrentLabel(nextLabels[0].name);
    pushSnapshot();
    const next = {};
    Object.keys(annotationsMap).forEach((k) => {
      next[k] = (annotationsMap[k] || []).map((a) => ({ ...a }));
      next[k] = next[k].filter((a) => a.label !== name);
    });
    setAnnotationsMap(next);
  };

  // current list for sidebar
  const currentList = annotationsMap[frameNumber] || [];

  // render
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#e6f9ef] to-[#dff7ee] text-gray-800">
      <div className="max-w-7xl mx-auto py-8 px-6">
        <div className="flex gap-8 justify-between items-start">
          {/* Sidebar */}
          <aside className="w-1/5 backdrop-blur-sm bg-white/60 dark:bg-black/30 rounded-2xl p-5 shadow-lg border border-white/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#10b981] to-[#16a34a] flex items-center justify-center text-white font-extrabold shadow">DA</div>
                <div>
                  <h3 className="text-lg font-semibold leading-tight text-[#064e3b]">Dhritii.Ai</h3>
                  <div className="text-xs text-gray-600">Video Annotation</div>
                </div>
              </div>

              <div className="relative">
                <button onClick={() => setOpenMenu(!openMenu)} aria-label="menu" className="p-2 rounded-md hover:bg-gray-100 transition"><BsThreeDotsVertical size={18} /></button>
                {openMenu && (
                  <div className="absolute right-0 mt-2 w-44 bg-white/95 rounded-lg shadow-md border">
                    <button onClick={() => { document.getElementById("videoFile").click(); setOpenMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">Choose File</button>
                    <button onClick={() => { document.getElementById("importFile").click(); setOpenMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">Import JSON</button>
                    <button onClick={() => { exportData(); setOpenMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">Export</button>
                  </div>
                )}
              </div>
            </div>

            <input id="videoFile" type="file" accept="video/*" onChange={handleUpload} className="hidden" />
            <input id="importFile" type="file" accept="application/json" onChange={importData} className="hidden" />

            {/* Labels */}
            <div className="mb-4 bg-white/60 rounded-xl p-3 shadow-sm border ">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Labels</label>
                <div className="text-xs text-gray-500">{labels.length} total</div>
              </div>

              <div className="flex flex-col gap-2">
                {labels.map((l) => (
                  <div key={l.name} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded" style={{ backgroundColor: l.color }} />
                      <button onClick={() => setCurrentLabel(l.name)} className={`text-sm font-medium text-left ${currentLabel === l.name ? 'text-[#065f46]' : 'text-gray-700'}`}>{l.name}</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeLabel(l.name)} className="text-red-500 font-semibold text-sm px-2 py-1 rounded hover:bg-red-50">x</button>
                    </div>
                  </div>
                ))}

                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex gap-2 items-center ">
                    <input placeholder="Label name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="border rounded-md py-1 px-2 flex-1 w-32 text-sm" />
                    <button onClick={addLabel} className="bg-green-500 text-white px-3 py-1 rounded-md text-sm shadow-sm hover:brightness-95">+</button>
                  </div>

                  <div className="relative">
                    <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <div className="w-[20%] h-[20px] rounded-full border cursor-pointer" style={{ backgroundImage: "linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet)" }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tools */}
            <div className="mb-4 bg-white/60 rounded-xl p-3 shadow-sm border">
              <label className="text-sm font-medium text-gray-700">Tools</label>
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={() => { setCurrentTool("select"); setDrawMode(false); }} className={`px-3 py-1 rounded-md border ${currentTool === "select" ? "bg-gray-200" : "bg-white"}`}><i className="ri-cursor-line"></i></button>

                <button onClick={() => { setCurrentTool("bbox"); setDrawMode(true); }} className={`px-3 py-1 rounded-md border ${currentTool === "bbox" ? "bg-green-200" : "bg-white"}`}><i class="ri-square-line"></i></button>

                <button onClick={() => { setCurrentTool("polygon"); setDrawMode(true); }} className={`px-3 py-1 rounded-md border ${currentTool === "polygon" ? "bg-green-200" : "bg-white"}`}><i className="ri-pentagon-line"></i></button>

                {/* <button onClick={() => { setCurrentTool("polyline"); setDrawMode(true); }} className={`px-3 py-1 rounded-md border ${currentTool === "polyline" ? "bg-green-200" : "bg-white"}`}><i className="ri-polyline"></i></button> */}

                <button onClick={() => { setCurrentTool("segmentation"); setDrawMode(true); }} className={`px-3 py-1 rounded-md border ${currentTool === "segmentation" ? "bg-green-200" : "bg-white"}`}><i className="ri-brush-line"></i></button>

                <button onClick={undo} className="px-3 py-1 rounded-md border bg-white"><i className="ri-arrow-go-back-fill"></i></button>
                <button onClick={redo} className="px-3 py-1 rounded-md border bg-white disabled:opacity-50" disabled={redoStack.length === 0}><i className="ri-arrow-go-forward-fill"></i></button>
                <button onClick={deleteSelected} className="px-3 py-1 rounded-md border bg-red-50 text-red-600"><i className="ri-delete-bin-6-line"></i></button>

                {/* Optional: quick button to propagate currently selected annotation to end */}
                <button onClick={propagateForwardTillEnd} className="px-3 py-1 rounded-md border bg-white text-sm">Propagate→End</button>
              </div>
            </div>

            {/* Playback */}
            <div className="bg-white/60 rounded-xl p-3 shadow-sm border">
              <label className="text-sm font-medium text-gray-700">Playback</label>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={jumpBack} className=" rounded-md hover:bg-gray-100"><RiSkipLeftLine /></button>
                <button onClick={prevFrame} className="p-2 rounded-md hover:bg-gray-100"><RiArrowLeftSLine /></button>
                <button onClick={togglePlay} className="px-3 py-1 rounded-md bg-green-500 text-white flex items-center gap-2">{isPlaying ? <RiPauseLine /> : <RiPlayLine />}</button>
                <button onClick={nextFrame} className="p-2 rounded-md hover:bg-gray-100"><RiArrowRightSLine /></button>
                <button onClick={jumpForward} className="p-2 rounded-md hover:bg-gray-100"><RiSkipRightLine /></button>
              </div>
              <div className="text-xs text-gray-500 mt-2">Frame: <span className="font-semibold text-gray-700">{frameNumber}</span></div>
            </div>

            {/* Annotations list */}
            <div className="mt-4 bg-white/60 rounded-xl p-3 shadow-sm border">
              <label className="text-sm font-medium text-gray-700">Annotations (this frame)</label>
              <div className="max-h-40 overflow-auto mt-2 divide-y">
                {currentList.length === 0 && <div className="text-sm text-gray-500 py-4">No annotations on this frame</div>}
                {currentList.map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="text-xs text-gray-500">{a.type === "bbox" ? `${Math.round(Math.abs(a.x2 - a.x1))}×${Math.round(Math.abs(a.y2 - a.y1))}` : `${(a.points || []).length} pts`}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelection({ frame: frameNumber, index: i })} className="text-sm px-2 py-1 rounded-md bg-gray-100">Select</button>
                      <button onClick={() => { setSelection({ frame: frameNumber, index: i }); deleteSelected(); }} className="text-sm px-2 py-1 rounded-md bg-red-50 text-red-600">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main editor */}
          <main className="flex-1">
            <div className="bg-white rounded-2xl p-5 shadow-xl border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#0f5132]">Video Annotator</h1>
                  <div className="text-sm text-gray-500">Annotate frames, propagate annotations, and export JSON</div>
                </div>

                {/* <button
                  onClick={downloadAnnotatedVideo}
                  className="px-3 py-2 bg-blue-600 text-white rounded"
                >
                  Download Annotated Video
                </button> */}


                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">Active label:</div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: (labels.find(l => l.name === currentLabel) || labels[0]).color }}></div>
                    <select value={currentLabel} onChange={(e) => setCurrentLabel(e.target.value)} className="border rounded-md px-3 py-1 text-sm">
                      {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="relative rounded-lg overflow-hidden bg-black/80" style={{ height: 460 }}>
                {videoURL ? (
                  <>
                    <video ref={videoRef} src={videoURL} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} style={{ width: "100%", height: "460px", objectFit: "cover" }} controls />
                    <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "460px", pointerEvents: 'auto', cursor: drawMode ? 'crosshair' : 'default' }} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                    <div className="text-2xl font-semibold">Upload a video to start annotating</div>
                    <div className="text-sm mt-2">Supported formats: mp4, webm, ogg</div>
                    <div className="mt-4">
                      <button onClick={() => document.getElementById("videoFile").click()} className="px-4 py-2 rounded-md bg-green-500 text-white shadow-sm">Choose Video</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={jumpBack} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200">⏮️</button>
                  <button onClick={prevFrame} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"><RiArrowLeftSLine /></button>
                  <button onClick={togglePlay} className="px-4 py-2 rounded-md bg-green-500 text-white flex items-center gap-2">{isPlaying ? <RiPauseLine /> : <RiPlayLine />}</button>
                  <button onClick={nextFrame} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200"><RiArrowRightSLine /></button>
                  <button onClick={jumpForward} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200">⏭️</button>
                </div>

                <div className="text-sm text-gray-600">Frame: <span className="font-semibold">{frameNumber}</span></div>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Notes: Use Select to move/resize rectangles. Use BBox, Polygon, Polyline, or Segmentation to draw. For polygon/polyline: click points and double-click to finish. Everything autosaves to browser. Use T (10 frames) or Y (1 frame) to propagate selected annotation. Use "Propagate→End" to copy selected annotation to all future frames.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}