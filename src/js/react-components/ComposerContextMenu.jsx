// file: src/js/react-components/ComposerContextMenu.jsx
import React from 'react';

// --- Component หลักของ Context Menu ---
export default function ComposerContextMenu({ x, y, onSelectAction, hasPendingSuggestion }) {
  // รายการเมนูที่เราจะใช้
  const actions = ['Continue', 'Revise', 'Expand', 'Shorten', 'Rephrase', 'more...'];
  const decisions = ['Accept', 'Reject', 'Rerun'];

  const handleActionClick = (e, action) => {
    e.stopPropagation(); // หยุดไม่ให้ event click นี้ไปปิดเมนูทันที
    onSelectAction(action);
  };

  return (
    <div 
      className="tw-fixed tw-bg-gray-200 dark:tw-bg-gray-700 tw-text-black dark:tw-text-white tw-rounded-md tw-shadow-lg tw-p-2 tw-flex tw-gap-4 tw-select-none"
      style={{ top: y, left: x, zIndex: 11000 }}
      // ดักจับ event click ที่ตัวเมนูเอง เพื่อไม่ให้มันปิดตัวเอง
      onClick={(e) => e.stopPropagation()} 
    >
      {/* Column 1: Actions */}
      <div className={`tw-flex tw-flex-col ${hasPendingSuggestion ? 'tw-opacity-40 tw-pointer-events-none' : ''}`}>
        <div className="tw-px-2 tw-py-1 tw-bg-blue-500 tw-text-white tw-font-bold tw-rounded-t-sm tw-text-sm">Action</div>
        <ul className="tw-bg-white dark:tw-bg-gray-600 tw-p-1 tw-rounded-b-sm">
          {actions.map(action => (
            <li 
              key={action}
              className="tw-px-3 tw-py-1 hover:tw-bg-blue-500 hover:tw-text-white tw-rounded tw-cursor-pointer tw-text-sm"
              onClick={(e) => handleActionClick(e, action)}
            >
              {action}
            </li>
          ))}
        </ul>
      </div>

      {/* Column 2: Decisions */}
      <div className={`tw-flex tw-flex-col ${!hasPendingSuggestion ? 'tw-opacity-40 tw-pointer-events-none' : ''}`}>
        <div className="tw-px-2 tw-py-1 tw-bg-yellow-400 tw-text-black tw-font-bold tw-rounded-t-sm tw-text-sm">Decisions</div>
        <ul className="tw-bg-white dark:tw-bg-gray-600 tw-p-1 tw-rounded-b-sm">
          {decisions.map(decision => (
            <li 
              key={decision}
              className="tw-px-3 tw-py-1 hover:tw-bg-blue-500 hover:tw-text-white tw-rounded tw-cursor-pointer tw-text-sm"
              onClick={(e) => handleActionClick(e, decision)}
            >
              {decision}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}