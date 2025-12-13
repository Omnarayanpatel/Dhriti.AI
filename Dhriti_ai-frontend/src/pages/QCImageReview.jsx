import React, { useState, useRef, useEffect } from 'react';
import QCReviewLayout from './QCReviewLayout';
import { useQCReview } from './useQCReview';
import AnnotationCanvas from './AnnotationCanvas';
import Loader from '../components/Loader';

export default function QCImageReview() {
  const { task, loading, error, ...qcProps } = useQCReview();
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // Pan state for dragging
  const [highlightedId, setHighlightedId] = useState(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null); // Ref for the image container for pan

  const [isDragging, setIsDragging] = useState(false);

  // --- Helper functions to find data dynamically ---

  // Finds the first value in the payload that looks like an image URL.
  const getImageUrl = (payload) => {
    if (!payload) return null;
    if (payload.image_url) return payload.image_url; // Standard case
    // Find a key that contains a URL
    const urlKey = Object.keys(payload).find(k => typeof payload[k] === 'string' && payload[k].startsWith('http'));
    return urlKey ? payload[urlKey] : null;
  };

  // Finds the array of annotations, which might be nested.
  const getAnnotations = (annotations) => {
    if (Array.isArray(annotations)) return annotations; // Already an array
    if (annotations && Array.isArray(annotations.annotations)) return annotations.annotations; // Nested case
    return [];
  };

  const imageUrl = task ? getImageUrl(task.payload) : null;
  const imageAnnotations = task ? getAnnotations(task.annotations) : [];
  const selectedAnnotation = imageAnnotations.find(a => a.id === highlightedId) || null;

  // --- Effects ---
  useEffect(() => {
    // Use ResizeObserver to track the actual rendered size of the image
    const imgElement = imageRef.current;
    if (!imgElement) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDisplaySize({ w: width, h: height });
      }
    });

    observer.observe(imgElement);

    return () => {
      observer.unobserve(imgElement);
    }
  }, [imageRef.current]); // Rerun only when the image element is available

  const onImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
    const { width, height } = e.target.getBoundingClientRect();
    setDisplaySize({ w: width, h: height });
  };

  // --- Pan functionality ---
  const handleMouseDown = (e) => {
    if (zoom > 1) { // Only allow pan if zoomed in
      setIsDragging(true);
      // Store initial mouse position and current pan offset
      containerRef.current.dataset.startX = e.clientX - pan.x;
      containerRef.current.dataset.startY = e.clientY - pan.y;
      containerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newX = e.clientX - parseFloat(containerRef.current.dataset.startX);
    const newY = e.clientY - parseFloat(containerRef.current.dataset.startY);
    setPan({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
  };

  useEffect(() => {
    if (containerRef.current && zoom > 1) {
      containerRef.current.style.cursor = 'grab';
    } else if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }
  }, [zoom]);

  // --- Early returns moved to after all hooks ---
  if (loading) return <QCReviewLayout loading={true}><Loader /></QCReviewLayout>;
  if (error) return <QCReviewLayout error={error}><p>Error loading task: {error}</p></QCReviewLayout>;
  if (!task) return <QCReviewLayout><p>No Task Found</p></QCReviewLayout>;

  return (
    <QCReviewLayout
      task={task}
      {...qcProps} // Pass all qcProps including onAccept, onReject, onSaveEdits, onEditToggle, editMode
    >
      <div className="w-full h-full bg-white rounded-xl shadow overflow-hidden flex">

        {/* LEFT SIDE : IMAGE + ANNOTATIONS */}
        <div className="flex-1 flex items-center justify-center bg-gray-100 p-4 overflow-hidden">
          <div
            ref={containerRef} // Attach ref for pan
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp} // Stop dragging if mouse leaves container
            className="w-full h-full flex items-center justify-center"
          >
            <div
            className="relative transition-transform duration-200 select-none"
            style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
            >
              {imageUrl ? (
                <>
                  {/* Image */}
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    onLoad={onImageLoad}
                    alt="QC Preview"
                    className="rounded shadow-lg block max-w-full max-h-full"
                  />
  
                  {/* Annotations Layer */}
                  <AnnotationCanvas
                    annotations={imageAnnotations}
                    editMode={qcProps.editMode}
                    naturalSize={naturalSize}
                    displaySize={displaySize}
                    highlightedId={highlightedId}
                    onAnnotationClick={(id) => setHighlightedId(id)}
                  />
                </>
              ) : <p className="text-red-500">Image URL not found in task payload.</p>}
            </div>
          </div>
        </div>

        {/* RIGHT INFO SIDEBAR */}
        <div className="w-80 bg-white border-l p-4 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4">
            Annotation Details
          </h2>
            
            {/* Zoom Controls */}
          <div className="mb-4 p-2 border rounded bg-gray-50">
            <h3 className="font-semibold text-sm mb-2">View Controls</h3>
            <div className="flex gap-2">
              <button onClick={() => setZoom(z => Math.min(z * 1.2, 5))} className="px-2 py-1 text-xs border rounded w-full">Zoom In (+)</button>
              <button onClick={() => setZoom(z => Math.max(z / 1.2, 0.5))} className="px-2 py-1 text-xs border rounded w-full">Zoom Out (-)</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 py-1 text-xs border rounded w-full">Fit</button>
            </div>
          </div>


          <div className="space-y-3 text-sm">
            <h3 className="mt-4 mb-2 font-semibold">Labels ({imageAnnotations.length || 0})</h3>
            {imageAnnotations.length > 0 ? (
              <ul className="list-disc ml-4 space-y-2">
                {imageAnnotations.map((a, index) => (
                  <li
                    key={a.id || index} // Use stable key
                    onClick={() => setHighlightedId(a.id)} // Highlight on click
                    className={`text-gray-700 p-1 rounded cursor-pointer ${highlightedId === a.id ? 'bg-yellow-100' : 'hover:bg-gray-50'}`}>
                    <span className="font-semibold">{a.label || 'unlabeled'}</span>
                    {a.box && (
                      <div className="text-xs text-gray-500">x:{a.box.x.toFixed(0)}, y:{a.box.y.toFixed(0)}, w:{a.box.w.toFixed(0)}, h:{a.box.h.toFixed(0)}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="text-gray-500">No annotations submitted.</p>}
          </div>
          {/* Annotation Inspector */}
          {selectedAnnotation && (
            <div className="mt-6 p-3 border-t">
              <h3 className="font-semibold mb-2">Edit Selected</h3>
              <label className="block text-xs font-medium text-gray-600">Label</label>
              <input value={selectedAnnotation.label} onChange={() => {}} className="w-full mt-1 border rounded p-1 text-sm" />
              <p className="text-xs text-gray-400 mt-2">Full editing controls would go here.</p>
            </div>
          )}

        </div>
      </div>
    </QCReviewLayout>
  );
}