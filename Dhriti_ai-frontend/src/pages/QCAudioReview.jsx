import React from 'react';
import QCReviewLayout from './QCReviewLayout';
import { useQCReview } from './useQCReview';

export default function QCAudioReview() {
  const qcProps = useQCReview();

  return (
    <QCReviewLayout {...qcProps}>
      <div className="w-full h-full bg-white rounded-lg shadow-inner p-4">
        <h2 className="text-lg font-semibold mb-4">Audio Annotation Viewer</h2>
        <p className="text-gray-600">An audio waveform with timestamp labels would appear here.</p>
      </div>
    </QCReviewLayout>
  );
}