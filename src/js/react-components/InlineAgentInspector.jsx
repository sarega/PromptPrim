// src/js/react-components/InlineAgentInspector.jsx
import React from 'react';

export default function InlineAgentInspector({
  systemPrompt,
  actionPrompt,
  userText,
  isVisible,
  onClose,
}) {
  if (!isVisible) return null;

  return (
    <div className="tw-absolute tw-top-4 tw-right-4 tw-z-[12000] tw-w-80 tw-bg-slate-800 tw-text-white tw-rounded-lg tw-shadow-xl tw-border tw-border-slate-700 tw-flex tw-flex-col">
      <div className="tw-flex tw-items-center tw-justify-between tw-p-2 tw-bg-slate-700 tw-rounded-t-lg">
        <h4 className="tw-text-sm tw-font-bold tw-flex tw-items-center tw-gap-2">
          <span className="material-symbols-outlined tw-text-cyan-400">bug_report</span>
          Inline Agent Inspector
        </h4>
        <button onClick={onClose} className="tw-text-slate-400 hover:tw-text-white">&times;</button>
      </div>
      <div className="tw-p-3 tw-text-xs tw-overflow-y-auto tw-max-h-80">
        <div className="tw-mb-3">
          <p className="tw-font-bold tw-text-yellow-400 tw-mb-1">1. System Prompt:</p>
          <pre className="tw-whitespace-pre-wrap tw-bg-black/20 tw-p-2 tw-rounded-md tw-font-mono">{systemPrompt || '(Not available)'}</pre>
        </div>
        <div className="tw-mb-3">
          <p className="tw-font-bold tw-text-yellow-400 tw-mb-1">2. Action Prompt (e.g., Continue):</p>
          <pre className="tw-whitespace-pre-wrap tw-bg-black/20 tw-p-2 tw-rounded-md tw-font-mono">{actionPrompt || '(Not available)'}</pre>
        </div>
        <div>
          <p className="tw-font-bold tw-text-yellow-400 tw-mb-1">3. User Text (Selection/Context):</p>
          <pre className="tw-whitespace-pre-wrap tw-bg-black/20 tw-p-2 tw-rounded-md tw-font-mono">{userText || '(No text selected/available)'}</pre>
        </div>
      </div>
    </div>
  );
}