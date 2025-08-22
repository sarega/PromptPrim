/* file: src/js/react-components/ConfigureInlineAgentModal.jsx */
import React, { useState } from 'react';
import '../../styles/tw-runtime.css';
import ReactDOM from 'react-dom'; // [✅ Import] ReactDOM สำหรับ Portal


// Component ย่อยสำหรับแต่ละช่อง Prompt (แก้ไขให้รับ value และ onChange)
const PromptInput = ({ label, placeholder, value, onChange }) => (
  <div>
    <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-400 tw-mb-2">
      {label}
    </label>
    <textarea 
      rows="3" 
      placeholder={placeholder || `Enter prompt for ${label}...`}
      className="tw-w-full tw-bg-gray-100 dark:tw-bg-slate-700 tw-border tw-border-gray-300 dark:tw-border-slate-600 tw-rounded-md tw-p-2 tw-text-gray-800 dark:tw-text-gray-200 placeholder-gray-400 focus:tw-ring-blue-500 focus:tw-border-blue-500 tw-transition"
      value={value}
      onChange={onChange}
    ></textarea>
  </div>
);
// Component ย่อยสำหรับปุ่ม Hotkey
const HotkeyButton = ({ label, hotkey }) => (
  <div className="tw-text-center">
    <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-500 dark:tw-text-gray-400 tw-mb-2">{label}</label>
    <button className="tw-bg-gray-200 hover:tw-bg-gray-300 dark:tw-bg-slate-600 dark:hover:tw-bg-slate-500 tw-text-gray-800 dark:tw-text-white tw-font-bold tw-w-20 tw-h-10 tw-rounded-lg tw-text-lg tw-transition-colors">
      {hotkey}
    </button>
  </div>
);

// --- Component ใหม่สำหรับ Hotkey Dropdown ---
const HotkeyDropdown = ({ label, options }) => (
  <div className="tw-text-center">
    <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-400 tw-mb-2">{label}</label>
    <select className="tw-bg-gray-200 hover:tw-bg-gray-300 dark:tw-bg-slate-600 dark:hover:tw-bg-slate-500 tw-text-gray-800 dark:tw-text-white tw-font-bold tw-py-2 tw-px-4 tw-rounded-lg tw-border tw-border-gray-300 dark:tw-border-slate-500">
      {options.map(key => (
        <option key={key} value={key}>{key}</option>
      ))}
    </select>
  </div>
);

// --- Component หลักของ Modal ---
export default function ConfigureInlineAgentModal({ unmount, onSave, initialConfig = {} }) {  const [prompts, setPrompts] = useState({
    system: initialConfig.system || '',
    continue: initialConfig.continue || '',
    revise: initialConfig.revise || '',
    expand: initialConfig.expand || '',
    shorten: initialConfig.shorten || '',
    rephrase: initialConfig.rephrase || '',
    styleTransfer: initialConfig.styleTransfer || '',
    translateTo: initialConfig.translateTo || '',
    userInstructions: initialConfig.userInstructions || '',
  });

  const handleInputChange = (e, field) => {
    setPrompts(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    // ส่งข้อมูลทั้งหมดกลับไปให้ Vanilla JS ผ่าน prop onSave
    if (typeof onSave === 'function') {
      onSave(prompts);
    }
    unmount(); // ปิด Modal
  };

  return ReactDOM.createPortal(
    // [Theme] Overlay หลัก
    <div className="tw-fixed tw-inset-0 tw-z-[10000] tw-flex tw-items-center tw-justify-center tw-bg-gray-800 tw-bg-opacity-50 dark:tw-bg-opacity-70 tw-backdrop-blur-sm tw-p-4">
      {/* [Theme] กล่อง Modal */}
      <div className="tw-bg-white dark:tw-bg-slate-800 tw-border tw-border-gray-200 dark:tw-border-slate-700 tw-rounded-xl tw-shadow-2xl tw-w-full tw-max-w-4xl tw-text-black dark:tw-text-white tw-flex tw-flex-col tw-max-h-[90vh]">
        
        {/* [Theme] Header */}
        <div className="tw-flex-shrink-0 tw-flex tw-items-center tw-justify-between tw-p-4 tw-border-b tw-border-gray-200 dark:tw-border-slate-700">
          <h3 className="tw-text-lg tw-font-semibold tw-flex tw-items-center tw-gap-3">
            <span className="material-symbols-outlined tw-text-blue-500 dark:tw-text-cyan-400">smart_toy</span>
            Configure Inline Agent
          </h3>
          <button className="tw-text-gray-400 hover:tw-text-gray-700 dark:hover:tw-text-white tw-transition-colors" onClick={unmount}>&times;</button>
        </div>
        
        {/* Body */}
        <div className="tw-flex-grow tw-p-6 tw-overflow-y-auto">
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-6">
            {/* Column 1 */}
            <div className="tw-flex tw-flex-col tw-gap-4">
              <PromptInput label="System Prompt" value={prompts.system} onChange={(e) => handleInputChange(e, 'system')} />
              <PromptInput label="Continue Prompt" value={prompts.continue} onChange={(e) => handleInputChange(e, 'continue')} />
              <PromptInput label="Revise Prompt" value={prompts.revise} onChange={(e) => handleInputChange(e, 'revise')} />
              <PromptInput label="Expand" value={prompts.expand} onChange={(e) => handleInputChange(e, 'expand')} />
              <PromptInput label="Shorten" value={prompts.shorten} onChange={(e) => handleInputChange(e, 'shorten')} />
            </div>

            {/* Column 2 */}
            <div className="tw-flex tw-flex-col tw-gap-4">
              <PromptInput label="Rephrase" value={prompts.rephrase} onChange={(e) => handleInputChange(e, 'rephrase')} />
              <PromptInput label="Style Transfer" value={prompts.styleTransfer} onChange={(e) => handleInputChange(e, 'styleTransfer')} />
              <PromptInput label="Translate to" value={prompts.translateTo} onChange={(e) => handleInputChange(e, 'translateTo')} />
              <PromptInput label="User Instructions" placeholder="Prefix instructions..." value={prompts.userInstructions} onChange={(e) => handleInputChange(e, 'userInstructions')} />
            </div>
          </div>
           {/* --- Hotkey Section --- */}
          <div className="tw-mt-6 tw-pt-5 tw-border-t tw-border-gray-200 dark:tw-border-slate-700 tw-flex tw-justify-center tw-gap-10 tw-items-center">
              <HotkeyDropdown 
                label="Hotkey for LLM Request" 
                options={['\\', '/', '|', 'F1']} 
              />
              <HotkeyDropdown 
                label="Hotkey for Confirm LLM" 
                options={['=', 'END', 'INSERT', ';']} 
              />          </div>
        </div>
        
        {/* [Theme] Actions */}
        <div className="tw-flex-shrink-0 tw-flex tw-justify-end tw-gap-4 tw-p-4 tw-bg-gray-50 dark:tw-bg-slate-900/50 tw-rounded-b-xl tw-border-t tw-border-gray-200 dark:tw-border-slate-700">
            <button className="tw-bg-white hover:tw-bg-gray-100 tw-text-gray-700 dark:tw-bg-slate-600 dark:hover:tw-bg-slate-500 dark:tw-text-white tw-font-bold tw-py-2 tw-px-4 tw-rounded-lg tw-border tw-border-gray-300 dark:tw-border-slate-500 tw-transition-colors" onClick={unmount}>Cancel</button>
            <button className="tw-bg-blue-600 hover:tw-bg-blue-700 tw-text-white tw-font-bold tw-py-2 tw-px-4 tw-rounded-lg tw-transition-colors" onClick={handleSave}>Save Configuration</button>
        </div>
      </div>
    </div>,
    document.body
  );
}