import React, { useMemo, useState, useEffect } from 'react';
import QCReviewLayout from './QCReviewLayout';
import { useQCReview } from './useQCReview';
import Loader from '../components/Loader';

export default function QCTextReview() {
  const { task, loading, error, editMode, onSaveEdits, ...qcProps } = useQCReview();
  const [highlightedId, setHighlightedId] = useState(null);
  const [localAnnotations, setLocalAnnotations] = useState([]);
  const [localMeta, setLocalMeta] = useState({});

  // Sync task data to local state when task loads
  useEffect(() => {
    if (task) {
      setLocalAnnotations(task.annotations?.annotations?.sort((a, b) => a.start - b.start) || []);
      setLocalMeta(task.annotations?.meta || {});
    }
  }, [task]);

  // Memoize extracting the main text content from the task payload
  const textToDisplay = useMemo(() => {
    if (!task || !task.payload) return '';
    // Try to find the text using template rules first
    if (task.template?.rules) {
      const textRule = task.template.rules.find(r => r.target_prop === 'text' && r.component_key === 'text_content');
      if (textRule && task.payload[textRule.source_path]) {
        return task.payload[textRule.source_path];
      }
    }
    // Fallback to common keys
    return task.payload.text || task.payload.content || Object.values(task.payload).find(v => typeof v === 'string' && v.length > 50) || '';
  }, [task]);

  // Extract available labels from the template
  const templateLabels = useMemo(() => {
    if (!task?.template?.layout) return [];
    const meta = task.template.layout.find(item => item.type === 'meta');
    const labels = meta?.props?.annotation_settings?.labels || [];
    return labels.filter(l => typeof l === 'string' && l.trim() !== '');
  }, [task]);

  // Function to render text with highlighted annotations
  const renderAnnotatedText = () => {
    if (!textToDisplay) return <p className="text-gray-500">No text content found in task.</p>;

    const segments = [];
    let lastIndex = 0;

    localAnnotations.forEach(ann => {
      // Add plain text segment before the annotation
      if (ann.start > lastIndex) {
        segments.push(
          <span key={`text-${lastIndex}`}>
            {textToDisplay.substring(lastIndex, ann.start)}
          </span>
        );
      }
      // Add the annotated segment
      const isHighlighted = ann.id === highlightedId;
      segments.push(
        <span
          key={ann.id}
          onClick={(e) => { e.stopPropagation(); setHighlightedId(ann.id); }}
          className={`rounded px-1 cursor-pointer transition-all relative group ${ann.color || 'bg-yellow-200'} ${isHighlighted ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
        >
          {textToDisplay.substring(ann.start, ann.end)}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 z-10">
            {ann.label}
          </span>
        </span>
      );
      lastIndex = ann.end;
    });

    // Add any remaining plain text
    if (lastIndex < textToDisplay.length) {
      segments.push(
        <span key={`text-${lastIndex}`}>
          {textToDisplay.substring(lastIndex)}
        </span>
      );
    }

    return segments;
  };

  const handleLabelChange = (newLabel) => {
    if (!selectedAnnotation) return;
    setLocalAnnotations(prev =>
      prev.map(a => (a.id === selectedAnnotation.id ? { ...a, label: newLabel } : a))
    );
  };

  // Early returns for loading/error states
  if (loading) return <QCReviewLayout loading={true}><Loader /></QCReviewLayout>;
  if (error) return <QCReviewLayout error={error}><p>Error loading task: {error}</p></QCReviewLayout>;
  if (!task) return <QCReviewLayout><p>No Task Found</p></QCReviewLayout>;

  const selectedAnnotation = localAnnotations.find(a => a.id === highlightedId);

  // The `onSaveEdits` from the hook needs to be called with the updated data.
  // We'll override the prop passed to the layout.
  const qcLayoutProps = {
    ...qcProps,
    task,
    loading,
    error,
    onSaveEdits: () => onSaveEdits({ annotations: localAnnotations, meta: localMeta }),
    editMode,
  };

  return (
    <QCReviewLayout {...qcLayoutProps}>
      <div className="w-full h-full bg-white rounded-xl shadow overflow-hidden flex">
        {/* Left Side: Text Viewer */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4">Annotated Text</h2>
          <div className="text-base leading-loose whitespace-pre-wrap p-4 bg-gray-50 rounded-lg border">
            {renderAnnotatedText()}
          </div>
        </div>

        {/* Right Side: Annotation Details */}
        <div className="w-80 bg-gray-50 border-l p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">
            Annotations ({localAnnotations.length})
          </h2>

          {/* Meta annotations like sentiment */}
          {Object.keys(localMeta).length > 0 && (
            <div className="mb-4 p-3 border rounded bg-white">
              <h3 className="font-semibold text-sm mb-2">Meta Data</h3>
              {localMeta.sentiment && <p className="text-sm"><strong>Sentiment:</strong> {localMeta.sentiment}</p>}
              {localMeta.emotion && <p className="text-sm"><strong>Emotion:</strong> {localMeta.emotion}</p>}
            </div>
          )}

          {/* List of annotations */}
          <div className="space-y-2 text-sm">
            {localAnnotations.length > 0 ? (
              localAnnotations.map(ann => (
                <div
                  key={ann.id}
                  onClick={() => setHighlightedId(ann.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${highlightedId === ann.id ? 'bg-blue-100 border-blue-400' : 'bg-white hover:bg-gray-100'}`}
                >
                  <div className="font-bold text-gray-800">{ann.label}</div>
                  <div className="text-gray-600 italic mt-1">"{ann.text}"</div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No annotations submitted for this task.</p>
            )}
          </div>

          {/* Inspector for selected annotation */}
          {selectedAnnotation && (
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-semibold mb-2">Edit Selected</h3>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">Label</label>
                {templateLabels.length > 0 ? (
                  <select
                    value={selectedAnnotation.label}
                    disabled={!editMode}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    className="w-full mt-1 border rounded p-1 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">Select Label</option>
                    {templateLabels.map((l, idx) => (
                      <option key={idx} value={l}>{l}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={selectedAnnotation.label}
                    readOnly
                    className="w-full mt-1 border rounded p-1 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </QCReviewLayout>
  );
}