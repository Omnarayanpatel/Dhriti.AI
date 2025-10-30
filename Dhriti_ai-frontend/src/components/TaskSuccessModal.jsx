import React, { useEffect } from 'react';

// This function plays a custom sound effect.
// It assumes the sound file is placed in the `public/sounds/` directory.
const playSuccessSound = () => {
  try {
    // Create a new Audio object pointing to your sound file in the public folder.
    const audio = new Audio('/sounds/mixkit-winning-notification-2018.wav');
    audio.volume = .75; // Adjust volume as needed (0.0 to 1.0)
    audio.play().catch(e => {
      // Autoplay can sometimes be blocked by the browser.
      // We log the error but don't interrupt the user experience.
      console.error("Audio autoplay was prevented:", e);
    });
  } catch (e) {
    console.error("Could not create or play sound:", e);
  }
};

/**
 * A modal that appears on successful task submission.
 * @param {boolean} show Controls the visibility of the modal.
 * @param {function} onNext Callback for the "Next Task" button.
 * @param {function} onHome Callback for the "Go to Home" button.
 */
function TaskSuccessModal({ show, onNext, onHome }) {
  useEffect(() => {
    if (show) {
      playSuccessSound();

      // Trigger confetti burst if the library is available
      if (typeof window.confetti === 'function') {
        window.confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.52 },
        });
      }
    }
  }, [show]);

  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="m-4 w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
          <svg className="h-10 w-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-slate-800 dark:text-slate-100">Task Submitted!</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Your annotations have been saved successfully.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button onClick={onHome} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
            Go to Home
          </button>
          <button onClick={onNext} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            Next Task
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskSuccessModal;