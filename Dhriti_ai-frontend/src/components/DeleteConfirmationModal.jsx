import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export default function DeleteConfirmationModal({ isOpen, onClose, onConfirm, projectName }) {
  const [inputValue, setInputValue] = useState('');

  if (!isOpen) return null;

  const isMatch = inputValue === 'delete';

  const handleConfirm = () => {
    if (isMatch) {
      onConfirm();
      setInputValue(''); // Reset for next time
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600">
            <div className="rounded-full bg-red-100 p-2">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Delete Project</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="mb-6 space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-semibold text-slate-900">{projectName}</span>? 
            This action cannot be undone and will remove all associated tasks and data.
          </p>
          
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Type <span className="font-mono font-bold text-red-600">delete</span> to confirm
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
              placeholder="delete"
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isMatch}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
          >
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}