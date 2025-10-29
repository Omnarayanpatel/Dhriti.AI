import React, { useEffect } from 'react';

/**
 * A reusable banner for displaying success, error, or info messages.
 * @param {string} message The message to display.
 * @param {'success' | 'error' | 'info'} type The type of message, for styling.
 * @param {number} duration Auto-dismiss duration in milliseconds. If 0, it won't auto-dismiss.
 * @param {function} onClose Callback function to close the banner.
 */
function NotificationBanner({ message, type = 'info', duration = 5000, onClose }) {
  useEffect(() => {
    if (duration > 0 && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) {
    return null;
  }

  const typeClasses = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/50 dark:text-red-300',
    info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  };

  return (
    <div className={`rounded-xl p-4 text-sm font-medium flex items-center justify-between ${typeClasses[type] || typeClasses.info}`}>
      <span>{message}</span>
      <button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

export default NotificationBanner;