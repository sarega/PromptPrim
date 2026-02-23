// src/js/react-components/InlineAgentInspector.jsx
import React from 'react';

export default function InlineAgentInspector({
  systemPrompt,
  actionPrompt,
  userText,
  worldContextInjected,
  worldContextText,
  worldContextItemCount,
  worldContextMode,
  worldContextAsOfChapter,
  worldContextWorldName,
  worldContextBookName,
  isVisible,
  onClose,
}) {
  if (!isVisible) return null;

  return (
    <div className="inline-agent-inspector tw-absolute tw-top-4 tw-right-4 tw-z-[12000] tw-w-80 tw-rounded-lg tw-shadow-xl tw-flex tw-flex-col">
      <div className="inline-agent-inspector__header tw-flex tw-items-center tw-justify-between tw-p-2 tw-rounded-t-lg">
        <h4 className="inline-agent-inspector__title tw-text-sm tw-font-bold tw-flex tw-items-center tw-gap-2">
          <span className="material-symbols-outlined inline-agent-inspector__title-icon">bug_report</span>
          Inline Agent Inspector
        </h4>
        <button onClick={onClose} className="inline-agent-inspector__close-btn" type="button" aria-label="Close Inspector">&times;</button>
      </div>
      <div className="inline-agent-inspector__body tw-p-3 tw-text-xs tw-overflow-y-auto tw-max-h-80">
        <div className="inline-agent-inspector__section tw-mb-3">
          <p className="inline-agent-inspector__label tw-font-bold tw-mb-1">1. System Prompt:</p>
          <pre className="inline-agent-inspector__prompt" dir="auto">{systemPrompt || '(Not available)'}</pre>
        </div>
        <div className="inline-agent-inspector__section tw-mb-3">
          <p className="inline-agent-inspector__label tw-font-bold tw-mb-1">2. Action Prompt (e.g., Continue):</p>
          <pre className="inline-agent-inspector__prompt" dir="auto">{actionPrompt || '(Not available)'}</pre>
        </div>
        <div className="inline-agent-inspector__section">
          <p className="inline-agent-inspector__label tw-font-bold tw-mb-1">3. User Text (Selection/Context):</p>
          <pre className="inline-agent-inspector__prompt" dir="auto">{userText || '(No text selected/available)'}</pre>
        </div>
        <div className="inline-agent-inspector__section tw-mt-3">
          <p className="inline-agent-inspector__label tw-font-bold tw-mb-1">4. World Context (Chapter/Codex):</p>
          <div className="inline-agent-inspector__prompt" dir="auto">
            {worldContextInjected ? (
              <>
                <div className="tw-mb-2">
                  Injected: Yes
                  {Number.isFinite(Number(worldContextItemCount)) ? ` • ${Math.max(0, Math.round(Number(worldContextItemCount)))} item(s)` : ''}
                  {worldContextMode ? ` • mode: ${worldContextMode}` : ''}
                  {Number.isFinite(Number(worldContextAsOfChapter)) ? ` • as-of Ch.${Math.round(Number(worldContextAsOfChapter))}` : ''}
                  {worldContextBookName ? ` • book: ${worldContextBookName}` : ''}
                  {worldContextWorldName ? ` • world: ${worldContextWorldName}` : ''}
                </div>
                <pre className="inline-agent-inspector__prompt tw-m-0" dir="auto">{worldContextText || '(No world context text)'}</pre>
              </>
            ) : (
              <span>
                Not injected
                {worldContextBookName ? ` • book: ${worldContextBookName}` : ''}
                {worldContextWorldName ? ` • world: ${worldContextWorldName}` : ''}
                {' '}(
                {worldContextText ? 'context unavailable after filtering' : 'no chapter/book world context for this composer run'}
                )
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
