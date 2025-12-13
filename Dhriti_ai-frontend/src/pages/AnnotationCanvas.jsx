import React from 'react';

/**
 * Renders annotation overlays (bounding boxes) on top of an image,
 * handling scaling and highlighting.
 */
export default function AnnotationCanvas({
  annotations,
  editMode,
  naturalSize,
  displaySize,
  highlightedId,
  onAnnotationClick,
}) {
  if (!annotations || !Array.isArray(annotations)) {
    return null;
  }

  // Calculate scaling factors
  // Ensure naturalSize and displaySize are valid to avoid division by zero or NaN
  const scaleX = (naturalSize.w > 0 && displaySize.w > 0) ? displaySize.w / naturalSize.w : 1;
  const scaleY = (naturalSize.h > 0 && displaySize.h > 0) ? displaySize.h / naturalSize.h : 1;

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none"> {/* Make canvas non-interactive by default */}
      {annotations.map((annotation, index) => {
        // Handle both direct coordinates and nested 'box' objects
        const box = annotation.box || annotation;
        if (!box || box.w === undefined) return null; // Skip if no valid box data

        const isHighlighted = annotation.id === highlightedId;
        const borderColor = annotation.color || (editMode ? '#3b82f6' : '#22c55e'); // Default blue for edit, green for view

        return (
          <div
            key={annotation.id || index} // Use a stable ID if available
            onClick={(e) => { e.stopPropagation(); onAnnotationClick(annotation.id); }} // Stop propagation to prevent image click
            className={`absolute ${editMode ? 'pointer-events-auto cursor-move' : 'pointer-events-none'} ${isHighlighted ? 'ring-2 ring-offset-2 ring-yellow-400' : ''}`}
            style={{
              left: `${box.x * scaleX}px`,
              top: `${box.y * scaleY}px`,
              width: `${box.w * scaleX}px`,
              height: `${box.h * scaleY}px`,
              borderColor: borderColor,
              borderWidth: '2px',
            }}
          >
            {/* Label Tag - ensure it doesn't block clicks on the box itself */}
            <div className="absolute -top-5 left-0 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded pointer-events-none">
              {annotation.label || 'unlabeled'}
            </div>
          </div>
        );
      })}
    </div>
  );
}