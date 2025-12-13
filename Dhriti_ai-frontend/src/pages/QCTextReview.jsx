import React from 'react';
import QCReviewLayout from './QCReviewLayout';
import { useQCReview } from './useQCReview';

export default function QCTextReview() {
  const qcProps = useQCReview();

  return (
    <QCReviewLayout {...qcProps}>
      <div className="w-full h-full bg-white rounded-lg shadow-inner p-4">
        <h2 className="text-lg font-semibold mb-4">Text Annotation Viewer</h2>
        <p className="text-gray-600">Highlighted entity labels and inline editing tools would appear here.</p>
      </div>
    </QCReviewLayout>
  );
}