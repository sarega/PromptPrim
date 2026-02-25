/*File: src/js/react-components/Composer.jsx
 * Composer Component for Tiptap Editor
 * This component provides a rich text editor with various formatting options.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { stateManager } from '../core/core.state.js';
import * as AgentHandlers from '../modules/agent/agent.handlers.js';
import ConfigureInlineAgentModal from './ConfigureInlineAgentModal.jsx';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Blockquote from '@tiptap/extension-blockquote';
import Highlight from '@tiptap/extension-highlight';
import { FontSize } from '../tiptap-extensions/font-size.js';
import { PendingHighlight } from '../tiptap-extensions/pending-highlight.js';
import ProcessingIndicator from './ProcessingIndicator.jsx';
import { Hotkey } from '../tiptap-extensions/hotkey.js';
import { WorldMentions, countWorldMentionMatchesByItemInText } from '../tiptap-extensions/world-mentions.js';
import { invokeAgent } from '../modules/agent/agent.engine.js';
import ComposerContextMenu from './ComposerContextMenu.jsx';
import InlineAgentInspector from './InlineAgentInspector.jsx';
import { InstructionNode } from '../tiptap-extensions/InstructionNode.js';
import { SuggestionNode } from '../tiptap-extensions/SuggestionNode.js';
import { getBookLinkedSessionDisplayTitle } from '../modules/world/world.schema-utils.js';
import { filterVisibleWorldItemsForSession } from '../modules/world/world.retrieval.js';

// ---------------------------------------------------------

// --- Toolbar Component (ฉบับสมบูรณ์) ---
const ComposerToolbar = ({
  editor,
  onCollapse,
  onToggleMaximize,
  isMaximized,
  onExport,
  onToggleInspector,
  onTogglePeekChat,
  isPeekChat,
  displayPrefs,
  onDisplayPrefsChange,
  onResetDisplayPrefs,
  onApplyDisplayPreset,
  onToggleFocusMode,
  isFocusMode,
  focusChapterOptions = [],
  activeFocusChapterId = '',
  onFocusChapterSelect,
  liveWordCount = 0,
  isInspectorOpen = false,
  showStructureActions = false,
  hasStructureSegments = false,
  isStructurePanelVisible = false,
  isStructureOutlineOpen = false,
  isStructureSettingsOpen = false,
  onToggleStructurePanel,
  onToggleStructureOutline,
  onToggleStructureSettings,
  onInsertStructureSegment,
  structureInsertLabel = '+ Scene'
}) => {
  
  if (!editor) return null;

  const [toolbarState, setToolbarState] = React.useState(0);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [isFormatPanelOpen, setIsFormatPanelOpen] = useState(false);
  const [isFormatToolbarVisible, setIsFormatToolbarVisible] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 720
  ));
  const formatPanelRef = useRef(null);
  const wasFocusModeRef = useRef(Boolean(isFocusMode));
  const preFocusFormatToolbarVisibleRef = useRef(null);

  React.useEffect(() => {
    const forceUpdate = () => setToolbarState(prev => prev + 1);
    editor.on('transaction', forceUpdate);
    editor.on('selectionUpdate', forceUpdate);
    return () => {
      editor.off('transaction', forceUpdate);
      editor.off('selectionUpdate', forceUpdate);
    };
  }, [editor]);

  React.useEffect(() => {
    if (!isFormatPanelOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!formatPanelRef.current) return;
      if (formatPanelRef.current.contains(event.target)) return;
      setIsFormatPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFormatPanelOpen]);

  React.useEffect(() => {
    const isFocusActive = Boolean(isFocusMode);
    const wasFocusActive = Boolean(wasFocusModeRef.current);

    if (isFocusActive && !wasFocusActive) {
      preFocusFormatToolbarVisibleRef.current = Boolean(isFormatToolbarVisible);
      setIsFormatToolbarVisible(false);
      if (isFormatPanelOpen) setIsFormatPanelOpen(false);
    } else if (!isFocusActive && wasFocusActive) {
      if (typeof preFocusFormatToolbarVisibleRef.current === 'boolean') {
        setIsFormatToolbarVisible(preFocusFormatToolbarVisibleRef.current);
      }
      preFocusFormatToolbarVisibleRef.current = null;
    }

    wasFocusModeRef.current = isFocusActive;
  }, [isFocusMode]);


  const handleFontSizeChange = (e) => {
    const size = e.target.value;
    if (size) editor.chain().focus().setFontSize(size).run();
    else editor.chain().focus().unsetFontSize().run();
  };

  
  const currentFontSize = editor.getAttributes('textStyle').fontSize?.replace('px', '') || '';
  const normalizedDisplayPrefs = normalizeComposerDisplayPrefs(displayPrefs || {});
  const liveWordCountLabel = formatComposerWordCountLabel(liveWordCount);
  const formatToolbarElementId = 'composer-format-toolbar';
  const isFocusMenu = Boolean(isFocusMode);
  const structureInsertMenuLabel = String(structureInsertLabel || '+ Scene').trim().startsWith('+ ')
    ? `Add ${String(structureInsertLabel || '+ Scene').trim().slice(2)}`
    : `Add ${String(structureInsertLabel || 'Segment').replace(/^\+\s*/, '')}`;
  const closeDropdownForNode = (node) => {
    if (!(node instanceof Element)) return;
    const dropdown = node.closest('.dropdown');
    if (dropdown) dropdown.classList.remove('open');
  };
  const runDropdownAction = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof action === 'function') action();
    closeDropdownForNode(event.currentTarget);
  };
  const handleDisplayPrefsPatch = (patch) => {
    if (typeof onDisplayPrefsChange !== 'function') return;
    onDisplayPrefsChange(patch);
  };
  const handleApplyPreset = (presetPatch) => {
    if (typeof onApplyDisplayPreset === 'function') {
      onApplyDisplayPreset(presetPatch);
      return;
    }
    handleDisplayPrefsPatch(presetPatch);
  };
  const handleInsertUserBeat = () => {
    editor.chain().focus().setInstructionNode().run();
  };
  const handleExportContent = () => {
    if (typeof onExport === 'function') {
      onExport({
        html: editor.getHTML(),
        text: editor.getText(),
        editor,
      });
    } else {
      console.warn('onExport is not a function');
    }
  };

  return (
    <>
      <div className={`composer-header ${isFormatToolbarVisible ? 'composer-header--format-tools-visible' : 'composer-header--format-tools-hidden'}`}>

        <div className="composer-title-area">
          <h3><span className="material-symbols-outlined">edit_square</span> Composer</h3>
        </div>
        <div
          id={formatToolbarElementId}
          className="composer-tools-area"
          hidden={!isFormatToolbarVisible}
          aria-hidden={isFormatToolbarVisible ? 'false' : 'true'}
        >
          {/* Paragraph & Headings */}
          <div className="tw-flex tw-items-center tw-gap-x-1">
            <button onClick={() => editor.chain().focus().setParagraph().run()} className={editor.isActive('paragraph') ? 'is-active' : ''} title="Paragraph">P</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Heading 1">H1</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2">H2</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3">H3</button>
            <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 4 }) ? 'is-active' : ''} title="Heading 4">H4</button>
          </div>
          <div className="toolbar-divider"></div>

          {/* Font Size, Highlight, Color */}
          <div className="tw-flex tw-items-center tw-gap-x-1">
            <select onChange={handleFontSizeChange} value={currentFontSize} className="font-size-selector">
              <option value="">Default</option>
              <option value="12">12px</option>
              <option value="14">14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
              <option value="24">24px</option>
              <option value="32">32px</option>
            </select>
            <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={editor.isActive('highlight') ? 'btn-icon small is-active' : 'btn-icon small'} title="Highlight Text"><span className="material-symbols-outlined">ink_highlighter</span></button>
            <input type="color" onInput={event => editor.chain().focus().setColor(event.target.value).run()} value={editor.getAttributes('textStyle').color || '#000000'} title="Text Color"/>
          </div>
          <div className="toolbar-divider"></div>

          <button onClick={() => editor.chain().focus().unsetColor().run()} title="Reset Color">
              <span className="material-symbols-outlined">format_clear</span>
          </button>

          <div className="toolbar-divider"></div>

          {/* Text Styles */}
          <div className="tw-flex tw-items-center">
            <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'btn-icon small is-active' : 'btn-icon small'} title="Bold"><span className="material-symbols-outlined">format_bold</span></button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'btn-icon small is-active' : 'btn-icon small'} title="Italic"><span className="material-symbols-outlined">format_italic</span></button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'btn-icon small is-active' : 'btn-icon small'} title="Underline"><span className="material-symbols-outlined">format_underlined</span></button>
            <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'btn-icon small is-active' : 'btn-icon small'} title="Strikethrough"><span className="material-symbols-outlined">format_strikethrough</span></button>
          </div>
          <div className="toolbar-divider"></div>

          {/* Text Align */}
          <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={editor.isActive({ textAlign: 'left' }) ? 'btn-icon small is-active' : 'btn-icon small'} title="Align Left"><span className="material-symbols-outlined">format_align_left</span></button>
          <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={editor.isActive({ textAlign: 'center' }) ? 'btn-icon small is-active' : 'btn-icon small'} title="Align Center"><span className="material-symbols-outlined">format_align_center</span></button>
          <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={editor.isActive({ textAlign: 'right' }) ? 'btn-icon small is-active' : 'btn-icon small'} title="Align Right"><span className="material-symbols-outlined">format_align_right</span></button>
          
          <div className="toolbar-divider"></div>
          
          {/* Quote & Lists */}
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive('blockquote') ? 'btn-icon small is-active' : 'btn-icon small'} title="Blockquote"><span className="material-symbols-outlined">format_quote</span></button>
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'btn-icon small is-active' : 'btn-icon small'} title="Bulleted List"><span className="material-symbols-outlined">format_list_bulleted</span></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'btn-icon small is-active' : 'btn-icon small'} title="Numbered List"><span className="material-symbols-outlined">format_list_numbered</span></button>

        </div>
        <div className="composer-actions">

          {isFocusMode && focusChapterOptions.length > 1 && (
            <label className="composer-focus-chapter-switcher" title="Switch chapter while in focus mode">
              <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
              <select
                className="selection-action-select composer-focus-chapter-select"
                value={String(activeFocusChapterId || '')}
                onChange={(event) => {
                  const nextId = String(event.target.value || '');
                  if (!nextId || typeof onFocusChapterSelect !== 'function') return;
                  onFocusChapterSelect(nextId);
                }}
                aria-label="Switch chapter"
              >
                {focusChapterOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}

          <div className="composer-live-word-count" title="Realtime word count in composer">
            {liveWordCountLabel}
          </div>

          <button
            type="button"
            className={`btn-icon composer-header-quiet-btn composer-format-toolbar-toggle ${isFormatToolbarVisible ? 'is-active' : ''}`}
            onClick={() => setIsFormatToolbarVisible((prev) => !prev)}
            aria-expanded={isFormatToolbarVisible ? 'true' : 'false'}
            aria-controls={formatToolbarElementId}
            title={isFormatToolbarVisible ? 'Hide Formatting Toolbar' : 'Show Formatting Toolbar'}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {isFormatToolbarVisible ? 'text_fields' : 'text_fields'}
            </span>
          </button>

          <button
            type="button"
            className={`btn-icon composer-header-quiet-btn composer-focus-trigger ${isFocusMode ? 'is-active' : ''}`}
            onClick={() => {
              if (typeof onToggleFocusMode === 'function') onToggleFocusMode();
            }}
            aria-pressed={isFocusMode ? 'true' : 'false'}
            title={isFocusMode ? 'Exit Focus Mode (F9)' : 'Enter Focus Mode (immersive fullscreen, F9)'}
          >
            <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
          </button>

          {isMaximized && (
            <button
              className={isPeekChat ? 'btn-icon composer-peek-chat-trigger is-active' : 'btn-icon composer-peek-chat-trigger'}
              onClick={onTogglePeekChat}
              title={isPeekChat ? 'Hide Chat Peek' : 'Peek Chat'}
            >
              <span className="material-symbols-outlined">splitscreen</span>
            </button>
          )}

          <button className="btn-icon composer-collapse-trigger" onClick={onCollapse} title="Collapse">
              <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </button>
          <button className="btn-icon composer-maximize-trigger" onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
              <span className="material-symbols-outlined">{isMaximized ? 'close_fullscreen' : 'fullscreen'}</span>
          </button>
          {/* --- [✅ เพิ่มเมนู Dropdown ที่นี่] --- */}
          <div className="dropdown align-right composer-display-menu" ref={formatPanelRef}>
            <button 
              className={`btn-icon ${isFormatPanelOpen ? 'is-active' : ''}`}
              onClick={(e) => e.currentTarget.parentElement.classList.toggle('open')}
              title={isFocusMenu ? 'Focus Menu' : 'More Actions'}
            >
              <span className="material-symbols-outlined">more_vert</span>
            </button>
            <div className="dropdown-content">
              {isFocusMenu ? (
                <>
                  <div className="composer-toolbar-menu-label">Focus Menu</div>
                  <a href="#" onClick={(e) => runDropdownAction(e, () => setIsFormatToolbarVisible((prev) => !prev))}>
                    <span className="material-symbols-outlined">text_fields</span>
                    {isFormatToolbarVisible ? 'Hide Formatting Toolbar' : 'Show Formatting Toolbar'}
                  </a>
                  <a href="#" onClick={(e) => runDropdownAction(e, () => setIsFormatPanelOpen((prev) => !prev))}>
                    <span className="material-symbols-outlined">format_size</span>
                    {isFormatPanelOpen ? 'Hide Display / Format' : 'Display / Format'}
                  </a>
                  <a href="#" onClick={(e) => runDropdownAction(e, handleInsertUserBeat)} title="Insert User Beat (Cmd/Ctrl+Alt+U)">
                    <span className="material-symbols-outlined">edit_note</span>
                    Insert User Beat
                  </a>

                  {showStructureActions && (
                    <>
                      <div className="dropdown-divider"></div>
                      <div className="composer-toolbar-menu-label">Structure</div>
                      <a href="#" onClick={(e) => runDropdownAction(e, onToggleStructurePanel)}>
                        <span className="material-symbols-outlined">{isStructurePanelVisible ? 'visibility_off' : 'movie'}</span>
                        {isStructurePanelVisible ? 'Hide Structure Index' : 'Show Structure Index'}
                      </a>
                      <a href="#" onClick={(e) => runDropdownAction(e, onToggleStructureOutline)}>
                        <span className="material-symbols-outlined">toc</span>
                        {isStructureOutlineOpen ? 'Hide Outline' : (hasStructureSegments ? 'Open Outline' : 'Open Outline (empty)')}
                      </a>
                      <a href="#" onClick={(e) => runDropdownAction(e, onInsertStructureSegment)}>
                        <span className="material-symbols-outlined">add</span>
                        {structureInsertMenuLabel}
                      </a>
                    </>
                  )}
                </>
              ) : (
                <>
                  {showStructureActions && (
                    <>
                      <div className="composer-toolbar-menu-label">Structure Index</div>
                      <a href="#" onClick={(e) => runDropdownAction(e, onToggleStructurePanel)}>
                        <span className="material-symbols-outlined">{isStructurePanelVisible ? 'visibility_off' : 'movie'}</span>
                        {isStructurePanelVisible ? 'Hide Structure Index' : 'Show Structure Index'}
                      </a>
                      <a href="#" onClick={(e) => runDropdownAction(e, onToggleStructureOutline)}>
                        <span className="material-symbols-outlined">toc</span>
                        {isStructureOutlineOpen ? 'Hide Outline' : (hasStructureSegments ? 'Open Outline' : 'Open Outline (empty)')}
                      </a>
                      <a href="#" onClick={(e) => runDropdownAction(e, onToggleStructureSettings)}>
                        <span className="material-symbols-outlined">tune</span>
                        {isStructureSettingsOpen ? 'Hide Settings' : 'Open Settings'}
                      </a>
                      <a href="#" onClick={(e) => runDropdownAction(e, onInsertStructureSegment)}>
                        <span className="material-symbols-outlined">add</span>
                        {structureInsertMenuLabel}
                      </a>
                      <div className="dropdown-divider"></div>
                    </>
                  )}

                  <a href="#" onClick={(e) => runDropdownAction(e, onToggleInspector)}>
                    <span className="material-symbols-outlined">bug_report</span>
                    {isInspectorOpen ? 'Hide Prompt Inspector' : 'Open Prompt Inspector'}
                  </a>

                  <div className="dropdown-divider"></div>

                  <a href="#" onClick={(e) => runDropdownAction(e, () => setIsFormatPanelOpen((prev) => !prev))}>
                    <span className="material-symbols-outlined">format_size</span>
                    {isFormatPanelOpen ? 'Hide Display / Format' : 'Display / Format'}
                  </a>

                  <div className="dropdown-divider"></div>

                  <a href="#" onClick={(e) => runDropdownAction(e, handleInsertUserBeat)} title="Insert User Beat (Cmd/Ctrl+Alt+U)">
                    <span className="material-symbols-outlined">edit_note</span>
                    Insert User Beat
                  </a>

                  <div className="dropdown-divider"></div>

                  <a href="#" onClick={(e) => runDropdownAction(e, () => setIsConfigOpen(true))}>
                    <span className="material-symbols-outlined">smart_toy</span>
                    Configure Inline Agent
                  </a>
                  <a href="#" onClick={(e) => runDropdownAction(e, handleExportContent)}>
                    <span className="material-symbols-outlined">save</span>
                    Export Content...
                  </a>
                </>
              )}
            </div>

            {isFormatPanelOpen && (
              <div className="composer-display-panel" role="dialog" aria-label="Composer display settings">
                <div className="composer-display-panel-header">
                  <div className="composer-display-panel-title">Display</div>
                  <button
                    type="button"
                    className="btn btn-small btn-secondary"
                    onClick={() => {
                      if (typeof onResetDisplayPrefs === 'function') onResetDisplayPrefs();
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div className="composer-display-panel-grid">
                  <section className="composer-display-panel-section composer-display-panel-section--full" aria-label="Display presets">
                    <div className="composer-display-panel-section-title">Presets</div>
                    <div className="composer-display-presets">
                      {COMPOSER_DISPLAY_PRESET_OPTIONS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          className="btn btn-small btn-secondary composer-display-preset-btn"
                          onClick={() => handleApplyPreset(preset.patch)}
                          title={`Apply ${preset.label} preset`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="composer-display-panel-note">Display only. Does not change your chapter content.</div>
                  </section>

                  <section className="composer-display-panel-section" aria-label="Page layout settings">
                    <div className="composer-display-panel-section-title">Page</div>

                    <label className="composer-display-field">
                      <span className="composer-display-field-label">Width</span>
                      <select
                        className="selection-action-select"
                        value={normalizedDisplayPrefs.pageWidthPreset}
                        onChange={(event) => handleDisplayPrefsPatch({ pageWidthPreset: event.target.value })}
                      >
                        <option value="compact">Compact</option>
                        <option value="novel">Novel</option>
                        <option value="wide">Wide</option>
                        <option value="full">Full width</option>
                      </select>
                    </label>

                    <label className="composer-display-check">
                      <input
                        type="checkbox"
                        checked={normalizedDisplayPrefs.centerContent}
                        onChange={(event) => handleDisplayPrefsPatch({ centerContent: event.target.checked })}
                      />
                      <span>Center content</span>
                    </label>

                    <label className="composer-display-field">
                      <span className="composer-display-field-label">Text Align</span>
                      <select
                        className="selection-action-select"
                        value={normalizedDisplayPrefs.textAlign}
                        onChange={(event) => handleDisplayPrefsPatch({ textAlign: event.target.value })}
                      >
                        <option value="left">Left</option>
                        <option value="justify">Justify</option>
                      </select>
                    </label>
                  </section>

                  <section className="composer-display-panel-section" aria-label="Typography display settings">
                    <div className="composer-display-panel-section-title">Typography</div>

                    <label className="composer-display-field">
                      <span className="composer-display-field-label">Text Size</span>
                      <select
                        className="selection-action-select"
                        value={String(normalizedDisplayPrefs.fontSizePx)}
                        onChange={(event) => handleDisplayPrefsPatch({ fontSizePx: Number(event.target.value) })}
                      >
                        <option value="14">Small</option>
                        <option value="16">16px</option>
                        <option value="18">18px</option>
                        <option value="20">20px</option>
                        <option value="22">22px</option>
                        <option value="24">24px</option>
                      </select>
                    </label>

                    <label className="composer-display-field">
                      <span className="composer-display-field-label">Line Height</span>
                      <select
                        className="selection-action-select"
                        value={String(normalizedDisplayPrefs.lineHeight)}
                        onChange={(event) => handleDisplayPrefsPatch({ lineHeight: Number(event.target.value) })}
                      >
                        <option value="1.5">Tight</option>
                        <option value="1.7">1.7</option>
                        <option value="1.85">Novel</option>
                        <option value="2">Loose</option>
                      </select>
                    </label>

                    <label className="composer-display-field">
                      <span className="composer-display-field-label">Paragraph Spacing</span>
                      <select
                        className="selection-action-select"
                        value={String(normalizedDisplayPrefs.paragraphSpacingEm)}
                        onChange={(event) => handleDisplayPrefsPatch({ paragraphSpacingEm: Number(event.target.value) })}
                      >
                        <option value="0.4">Tight</option>
                        <option value="0.7">Medium</option>
                        <option value="0.95">Novel</option>
                        <option value="1.2">Loose</option>
                      </select>
                    </label>

                    <div className="composer-display-inline-fields">
                      <label className="composer-display-check">
                        <input
                          type="checkbox"
                          checked={normalizedDisplayPrefs.paragraphIndent}
                          onChange={(event) => handleDisplayPrefsPatch({ paragraphIndent: event.target.checked })}
                        />
                        <span>First-line indent</span>
                      </label>
                      {normalizedDisplayPrefs.paragraphIndent && (
                        <label className="composer-display-field composer-display-field--compact">
                          <span className="composer-display-field-label">Indent</span>
                          <select
                            className="selection-action-select"
                            value={String(normalizedDisplayPrefs.paragraphIndentEm)}
                            onChange={(event) => handleDisplayPrefsPatch({ paragraphIndentEm: Number(event.target.value) })}
                          >
                            <option value="1.2">1.2em</option>
                            <option value="1.5">1.5em</option>
                            <option value="1.8">1.8em</option>
                            <option value="2.2">2.2em</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {isConfigOpen && (
        <ConfigureInlineAgentModal 
          unmount={() => setIsConfigOpen(false)}
          onSave={AgentHandlers.saveInlineAgentConfig}
          initialConfig={stateManager.getProject()?.globalSettings?.inlineAgentConfig}
        />
      )}    
    </>
  );
};

const CHAPTER_SEGMENT_HEADING_LEVEL = 2;
const DEFAULT_CHAPTER_STRUCTURE_CONFIG = {
  titleTemplatePreset: 'chapter_number_title',
  titleTemplateCustom: 'Chapter {number}: {title}',
  titleAlign: 'left',
  titleFontSizePx: 32,
  segmentNoun: 'scene',
  customSegmentNoun: '',
  implicitFirstSegment: true,
  segmentMarkerStyle: 'heading',
  segmentMarkerSymbol: '***',
};
const COMMON_SEGMENT_SEPARATOR_SYMBOLS = new Set(['***', '* * *', '---', '~~~']);
const COMPOSER_DISPLAY_PREFS_STORAGE_KEY = 'promptprim:composerDisplayPrefs:v1';
const DEFAULT_COMPOSER_DISPLAY_PREFS = {
  pageWidthPreset: 'novel',
  centerContent: true,
  fontSizePx: 18,
  lineHeight: 1.85,
  paragraphSpacingEm: 0.95,
  paragraphIndent: false,
  paragraphIndentEm: 1.8,
  textAlign: 'left',
  focusMode: false,
};
const COMPOSER_DISPLAY_PRESET_OPTIONS = [
  {
    key: 'thai_novel',
    label: 'Thai Novel',
    patch: {
      pageWidthPreset: 'novel',
      centerContent: true,
      fontSizePx: 20,
      lineHeight: 1.95,
      paragraphSpacingEm: 1.05,
      paragraphIndent: false,
      textAlign: 'left',
    },
  },
  {
    key: 'novel',
    label: 'Novel',
    patch: {
      pageWidthPreset: 'novel',
      centerContent: true,
      fontSizePx: 18,
      lineHeight: 1.85,
      paragraphSpacingEm: 0.95,
      paragraphIndent: false,
      textAlign: 'left',
    },
  },
  {
    key: 'manuscript',
    label: 'Manuscript',
    patch: {
      pageWidthPreset: 'wide',
      centerContent: true,
      fontSizePx: 16,
      lineHeight: 1.7,
      paragraphSpacingEm: 0.3,
      paragraphIndent: true,
      paragraphIndentEm: 1.8,
      textAlign: 'left',
    },
  },
  {
    key: 'review',
    label: 'Review',
    patch: {
      pageWidthPreset: 'wide',
      centerContent: true,
      fontSizePx: 16,
      lineHeight: 1.6,
      paragraphSpacingEm: 0.7,
      paragraphIndent: false,
      textAlign: 'left',
    },
  },
];

function getComposerRootElement() {
  return document.documentElement;
}

async function requestAppFullscreenForComposerFocus() {
  const root = getComposerRootElement();
  if (!root) return false;
  const requestFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
  if (typeof requestFullscreen !== 'function') return false;
  try {
    await requestFullscreen.call(root);
    return true;
  } catch (error) {
    console.warn('Failed to enter fullscreen for composer focus mode:', error);
    return false;
  }
}

async function exitAppFullscreenForComposerFocus() {
  const doc = document;
  const exitFullscreen = doc.exitFullscreen || doc.webkitExitFullscreen;
  const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement;
  if (!fullscreenElement || typeof exitFullscreen !== 'function') return false;
  try {
    await exitFullscreen.call(doc);
    return true;
  } catch (error) {
    console.warn('Failed to exit fullscreen for composer focus mode:', error);
    return false;
  }
}

function isAppInFullscreenMode() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeComposerDisplayPrefs(rawPrefs = {}) {
  const merged = {
    ...DEFAULT_COMPOSER_DISPLAY_PREFS,
    ...(rawPrefs && typeof rawPrefs === 'object' ? rawPrefs : {})
  };
  const pageWidthPreset = ['compact', 'novel', 'wide', 'full'].includes(String(merged.pageWidthPreset || '').trim())
    ? String(merged.pageWidthPreset).trim()
    : DEFAULT_COMPOSER_DISPLAY_PREFS.pageWidthPreset;
  const textAlign = ['left', 'justify'].includes(String(merged.textAlign || '').trim())
    ? String(merged.textAlign).trim()
    : DEFAULT_COMPOSER_DISPLAY_PREFS.textAlign;
  return {
    pageWidthPreset,
    centerContent: Boolean(merged.centerContent),
    fontSizePx: clampNumber(merged.fontSizePx, 14, 28, DEFAULT_COMPOSER_DISPLAY_PREFS.fontSizePx),
    lineHeight: clampNumber(merged.lineHeight, 1.2, 2.4, DEFAULT_COMPOSER_DISPLAY_PREFS.lineHeight),
    paragraphSpacingEm: clampNumber(merged.paragraphSpacingEm, 0, 2.4, DEFAULT_COMPOSER_DISPLAY_PREFS.paragraphSpacingEm),
    paragraphIndent: Boolean(merged.paragraphIndent),
    paragraphIndentEm: clampNumber(merged.paragraphIndentEm, 0, 4, DEFAULT_COMPOSER_DISPLAY_PREFS.paragraphIndentEm),
    textAlign,
    focusMode: Boolean(merged.focusMode),
  };
}

function loadComposerDisplayPrefs() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_COMPOSER_DISPLAY_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(COMPOSER_DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOSER_DISPLAY_PREFS;
    return normalizeComposerDisplayPrefs(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to load composer display prefs:', error);
    return DEFAULT_COMPOSER_DISPLAY_PREFS;
  }
}

function getComposerReadingWidthValue(pageWidthPreset = DEFAULT_COMPOSER_DISPLAY_PREFS.pageWidthPreset) {
  switch (pageWidthPreset) {
    case 'compact': return '680px';
    case 'wide': return '920px';
    case 'full': return 'none';
    case 'novel':
    default:
      return '780px';
  }
}

function countWordsForComposerDisplay(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
      let count = 0;
      for (const part of segmenter.segment(normalized)) {
        if (part?.isWordLike) count += 1;
      }
      if (count > 0) return count;
    } catch (_error) {
      // Fallback below.
    }
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function formatComposerWordCountLabel(count = 0) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0;
  return `${safeCount.toLocaleString()} word${safeCount === 1 ? '' : 's'}`;
}

function normalizeComposerMentionAliases(values = []) {
  const seen = new Set();
  const aliases = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const alias = String(value || '').replace(/\s+/g, ' ').trim();
    if (!alias || alias.length < 2) return;
    const key = alias.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push(alias);
  });
  return aliases;
}

function checksumStringFast(text = '') {
  let hash = 2166136261;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildComposerMentionTypeLabel(type = 'note') {
  const normalized = String(type || 'note').trim().toLowerCase();
  if (normalized === 'entity') return 'Entity';
  if (normalized === 'place') return 'Place';
  if (normalized === 'rule') return 'Rule';
  if (normalized === 'event') return 'Event';
  if (normalized === 'relationship') return 'Relationship';
  if (normalized === 'source') return 'Source';
  return 'Note';
}

function getComposerMentionIconName(type = 'note', subtype = '') {
  const normalizedType = String(type || 'note').trim().toLowerCase();
  const normalizedSubtype = String(subtype || '').trim().toLowerCase();
  if (normalizedType === 'entity') {
    if (['character', 'person', 'human', 'protagonist', 'antagonist'].includes(normalizedSubtype)) return 'person';
    if (['animal', 'pet', 'creature'].includes(normalizedSubtype)) return 'pets';
    if (['faction', 'group', 'organization', 'organisation', 'guild', 'clan'].includes(normalizedSubtype)) return 'groups';
    if (['object', 'item', 'artifact', 'weapon', 'tool'].includes(normalizedSubtype)) return 'inventory_2';
    return 'badge';
  }
  if (normalizedType === 'place') {
    if (['city', 'town', 'village'].includes(normalizedSubtype)) return 'location_city';
    if (['room', 'house', 'home', 'building'].includes(normalizedSubtype)) return 'home';
    return 'place';
  }
  if (normalizedType === 'relationship') return 'share';
  if (normalizedType === 'event') return 'event';
  if (normalizedType === 'rule') return 'gavel';
  if (normalizedType === 'source') return 'menu_book';
  return 'note';
}

function trimComposerMentionDescription(value, maxLength = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function clampComposerMentionPopupPosition(clientX, clientY, width = 360, height = 260) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const margin = 12;
  const preferredLeft = Number(clientX) + 10;
  const preferredTop = Number(clientY) + 10;
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  return {
    left: Math.max(margin, Math.min(preferredLeft, maxLeft)),
    top: Math.max(margin, Math.min(preferredTop, maxTop)),
  };
}

function buildComposerWorldMentionBundle(project, session) {
  if (!project || !session) {
    return {
      version: 'empty',
      worldName: '',
      itemCount: 0,
      sources: [],
      lookup: new Map(),
    };
  }

  const visibleResult = filterVisibleWorldItemsForSession(project, session);
  const visibleItems = Array.isArray(visibleResult?.visibleItems) ? visibleResult.visibleItems : [];
  const sources = [];
  const lookup = new Map();

  const versionSeedParts = [
    String(visibleResult?.world?.id || 'no-world'),
    String(session?.id || ''),
    String(visibleResult?.access?.mode || ''),
    String(visibleResult?.access?.asOfChapter ?? ''),
    String(visibleItems.length),
  ];

  visibleItems.forEach((item) => {
    const id = String(item?.id || '').trim();
    const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
    if (!id || !title) return;

    const aliases = normalizeComposerMentionAliases(item?.aliases || []).filter(
      (alias) => alias.toLocaleLowerCase() !== title.toLocaleLowerCase()
    );
    const subtype = String(item?.subtype || '').trim();
    const type = String(item?.type || 'note').trim().toLowerCase() || 'note';
    const thumbnailUrl = String(item?.thumbnailUrl || item?.portraitUrl || item?.imageUrl || '').trim();
    const description = trimComposerMentionDescription(item?.summary || item?.content, 420);

    sources.push({
      id,
      title,
      type,
      subtype,
      aliases: aliases.slice(0, 12),
    });

    lookup.set(id, {
      id,
      title,
      type,
      subtype,
      aliases,
      thumbnailUrl,
      description,
      rawSummary: String(item?.summary || ''),
    });

    versionSeedParts.push(`${id}:${Number(item?.updatedAt || 0)}:${title}:${aliases.join('|')}:${thumbnailUrl}:${String(item?.summary || '').slice(0, 120)}`);
  });

  return {
    version: `wm:${checksumStringFast(versionSeedParts.join('||'))}`,
    worldName: String(visibleResult?.world?.name || ''),
    itemCount: visibleItems.length,
    sources,
    lookup,
  };
}

function buildComposerMentionTrackingSnapshot(editorInstance, mentionSources = [], segmentIndex = { segments: [] }) {
  const doc = editorInstance?.state?.doc;
  if (!doc || !Array.isArray(mentionSources) || mentionSources.length === 0) {
    return {
      totalMentions: 0,
      uniqueItemCount: 0,
      countsByItemId: {},
      segmentCountsByKey: {},
      segmentUniqueByKey: {},
    };
  }

  const docEnd = Number(doc?.content?.size) || 0;
  const fullText = typeof doc.textBetween === 'function'
    ? doc.textBetween(0, docEnd, '\n', '\n')
    : String(doc.textContent || '');
  const chapterCounts = countWorldMentionMatchesByItemInText(fullText, mentionSources);
  const segments = Array.isArray(segmentIndex?.segments) ? segmentIndex.segments : [];
  const segmentCountsByKey = {};
  const segmentUniqueByKey = {};

  segments.forEach((segment, index) => {
    const key = String(segment?.key || '').trim();
    if (!key) return;
    const next = segments[index + 1] || null;
    const rawFrom = Number(segment?.markerPos);
    const rawTo = next ? Number(next?.markerPos) : docEnd;
    const from = Number.isFinite(rawFrom) ? Math.max(0, Math.min(docEnd, Math.round(rawFrom))) : 0;
    const to = Number.isFinite(rawTo) ? Math.max(from, Math.min(docEnd, Math.round(rawTo))) : docEnd;
    const segmentText = typeof doc.textBetween === 'function'
      ? doc.textBetween(from, to, '\n', '\n')
      : '';
    const segmentCounts = countWorldMentionMatchesByItemInText(segmentText, mentionSources);
    segmentCountsByKey[key] = Number(segmentCounts.totalMentions) || 0;
    segmentUniqueByKey[key] = Number(segmentCounts.uniqueItemCount) || 0;
  });

  return {
    totalMentions: Number(chapterCounts.totalMentions) || 0,
    uniqueItemCount: Number(chapterCounts.uniqueItemCount) || 0,
    countsByItemId: chapterCounts.countsByItemId || {},
    segmentCountsByKey,
    segmentUniqueByKey,
  };
}

function buildBookChapterSwitcherOptions(project, activeSession) {
  if (!project || !activeSession?.bookId) return [];
  const sessionsById = new Map((project.chatSessions || []).map((session) => [String(session?.id || ''), session]));
  const book = (project.books || []).find((item) => String(item?.id || '') === String(activeSession.bookId || ''));
  const orderedIds = Array.isArray(book?.structure?.chapterSessionIds) ? book.structure.chapterSessionIds : [];
  const orderedSessions = orderedIds
    .map((sessionId) => sessionsById.get(String(sessionId || '')))
    .filter(Boolean);
  const fallbackSessions = (project.chatSessions || [])
    .filter((session) => String(session?.bookId || '') === String(activeSession.bookId || ''));

  const seenIds = new Set();
  const merged = [];
  [...orderedSessions, ...fallbackSessions].forEach((session) => {
    const id = String(session?.id || '');
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    merged.push(session);
  });

  return merged
    .filter((session) => !session?.archived)
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a?.chapterNumber)) ? Number(a.chapterNumber) : Number.POSITIVE_INFINITY;
      const bOrder = Number.isFinite(Number(b?.chapterNumber)) ? Number(b.chapterNumber) : Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(getBookLinkedSessionDisplayTitle(a, { fallback: a?.name || 'Chapter' }))
        .localeCompare(String(getBookLinkedSessionDisplayTitle(b, { fallback: b?.name || 'Chapter' })), undefined, { numeric: true, sensitivity: 'base' });
    })
    .map((session) => ({
      id: String(session.id || ''),
      label: getBookLinkedSessionDisplayTitle(session, { fallback: String(session?.name || 'Chapter').trim() || 'Chapter' }),
      isActive: String(session.id || '') === String(activeSession?.id || '')
    }));
}

function escapeHtmlText(text = '') {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeChapterStructureConfig(rawConfig = {}) {
  const merged = {
    ...DEFAULT_CHAPTER_STRUCTURE_CONFIG,
    ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {})
  };
  const titleTemplatePreset = ['chapter_number_title', 'chapter_number_only', 'chapter_title_only', 'custom']
    .concat(['thai_chapter_number_title', 'thai_chapter_number_only'])
    .includes(String(merged.titleTemplatePreset || '').trim())
    ? String(merged.titleTemplatePreset).trim()
    : DEFAULT_CHAPTER_STRUCTURE_CONFIG.titleTemplatePreset;
  const titleAlign = ['left', 'center', 'right'].includes(String(merged.titleAlign || '').trim())
    ? String(merged.titleAlign).trim()
    : DEFAULT_CHAPTER_STRUCTURE_CONFIG.titleAlign;
  const rawTitleFontSizePx = Number(merged.titleFontSizePx);
  const titleFontSizePx = Number.isFinite(rawTitleFontSizePx)
    ? Math.max(14, Math.min(96, Math.round(rawTitleFontSizePx)))
    : DEFAULT_CHAPTER_STRUCTURE_CONFIG.titleFontSizePx;
  const segmentNoun = ['scene', 'section', 'custom', 'none'].includes(String(merged.segmentNoun || '').trim())
    ? String(merged.segmentNoun).trim()
    : DEFAULT_CHAPTER_STRUCTURE_CONFIG.segmentNoun;
  const implicitFirstSegment = merged.implicitFirstSegment !== false;
  const segmentMarkerStyle = ['heading', 'divider', 'symbol'].includes(String(merged.segmentMarkerStyle || '').trim())
    ? String(merged.segmentMarkerStyle).trim()
    : DEFAULT_CHAPTER_STRUCTURE_CONFIG.segmentMarkerStyle;

  return {
    ...merged,
    titleTemplatePreset,
    titleTemplateCustom: String(merged.titleTemplateCustom || DEFAULT_CHAPTER_STRUCTURE_CONFIG.titleTemplateCustom),
    titleAlign,
    titleFontSizePx,
    segmentNoun,
    customSegmentNoun: String(merged.customSegmentNoun || ''),
    implicitFirstSegment,
    segmentMarkerStyle,
    segmentMarkerSymbol: String(merged.segmentMarkerSymbol || DEFAULT_CHAPTER_STRUCTURE_CONFIG.segmentMarkerSymbol || '***') || '***',
  };
}

function getSegmentNounLabel(config) {
  const normalized = normalizeChapterStructureConfig(config);
  if (normalized.segmentNoun === 'section') return 'Section';
  if (normalized.segmentNoun === 'custom') {
    const custom = String(normalized.customSegmentNoun || '').trim();
    return custom || 'Segment';
  }
  if (normalized.segmentNoun === 'none') return '';
  return 'Scene';
}

function buildChapterTitlePreview(session, config) {
  const normalized = normalizeChapterStructureConfig(config);
  const chapterNumber = Number.isFinite(Number(session?.chapterNumber))
    ? Math.round(Number(session.chapterNumber))
    : null;
  const chapterTitle = String(session?.chapterTitle || '').trim();

  let template = 'Chapter {number}: {title}';
  if (normalized.titleTemplatePreset === 'chapter_number_only') template = 'Chapter {number}';
  if (normalized.titleTemplatePreset === 'chapter_title_only') template = '{title}';
  if (normalized.titleTemplatePreset === 'thai_chapter_number_title') template = 'บทที่ {number}: {title}';
  if (normalized.titleTemplatePreset === 'thai_chapter_number_only') template = 'บทที่ {number}';
  if (normalized.titleTemplatePreset === 'custom') template = String(normalized.titleTemplateCustom || '').trim() || DEFAULT_CHAPTER_STRUCTURE_CONFIG.titleTemplateCustom;

  const filled = template
    .replace(/\{number\}/g, chapterNumber ? String(chapterNumber) : '')
    .replace(/\{title\}/g, chapterTitle);

  const cleaned = filled
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([:.\-–—])/g, '$1')
    .replace(/([:.\-–—])\s*$/, '$1')
    .trim();

  if (cleaned) return cleaned;
  if (chapterNumber && chapterTitle) return `Chapter ${chapterNumber}: ${chapterTitle}`;
  if (chapterNumber) return `Chapter ${chapterNumber}`;
  if (chapterTitle) return chapterTitle;
  return 'Chapter';
}

function getChapterMetaLabelForConfig(config) {
  const normalized = normalizeChapterStructureConfig(config);
  const preset = String(normalized.titleTemplatePreset || '');
  if (preset.startsWith('thai_')) return 'บท';
  if (preset === 'custom') {
    const template = String(normalized.titleTemplateCustom || '').trim();
    if (/[ก-๙]/.test(template)) return 'บท';
  }
  return 'Chapter';
}

function buildSegmentIndexLabel(segmentNumber, config) {
  const noun = getSegmentNounLabel(config);
  if (!noun) return `#${segmentNumber}`;
  return `${noun} ${segmentNumber}`;
}

function getSegmentInsertButtonLabel(config) {
  const noun = getSegmentNounLabel(config);
  return noun ? `+ ${noun}` : '+ Segment';
}

function shouldTreatParagraphAsSegmentMarker(node, config) {
  if (!node || node.type?.name !== 'paragraph') return false;
  const text = String(node.textContent || '').trim();
  if (!text) return false;
  const normalized = normalizeChapterStructureConfig(config);
  if (COMMON_SEGMENT_SEPARATOR_SYMBOLS.has(text)) return true;
  if (normalized.segmentMarkerStyle === 'symbol' && text === String(normalized.segmentMarkerSymbol || '').trim()) return true;
  return false;
}

function readChapterSegmentsFromEditor(editorInstance, structureConfig) {
  if (!editorInstance?.state?.doc) {
    return { segments: [], activeSegmentKey: null };
  }

  const normalizedStructureConfig = normalizeChapterStructureConfig(structureConfig);
  const explicitMarkers = [];
  const selectionFrom = Number(editorInstance.state.selection?.from) || 0;
  const doc = editorInstance.state.doc;

  doc.descendants((node, pos) => {
    if (!node) return true;
    const isHeadingSegment = node.type?.name === 'heading' && Number(node.attrs?.level) === CHAPTER_SEGMENT_HEADING_LEVEL;
    const isDividerSegment = node.type?.name === 'horizontalRule';
    const isSymbolParagraphSegment = shouldTreatParagraphAsSegmentMarker(node, normalizedStructureConfig);
    if (!isHeadingSegment && !isDividerSegment && !isSymbolParagraphSegment) return true;

    explicitMarkers.push({
      markerPos: pos,
      markerKind: isHeadingSegment ? 'heading' : (isDividerSegment ? 'divider' : 'symbol'),
      rawTitle: String(node.textContent || '').trim(),
    });
    return true;
  });

  const segments = [];
  const firstExplicitMarkerPos = explicitMarkers.length > 0
    ? (Number(explicitMarkers[0].markerPos) || 0)
    : null;
  const documentHasMeaningfulText = String(doc.textContent || '').trim().length > 0;
  let hasMeaningfulTextBeforeFirstExplicit = false;
  if (Number.isFinite(firstExplicitMarkerPos) && firstExplicitMarkerPos > 0) {
    let skippedLeadingChapterHeading = false;
    doc.forEach((node, pos) => {
      const nodeStart = Number(pos) || 0;
      if (nodeStart >= firstExplicitMarkerPos || hasMeaningfulTextBeforeFirstExplicit) return;

      const nodeTypeName = String(node?.type?.name || '');
      const nodeText = String(node?.textContent || '').trim();
      const isLeadingChapterHeading = !skippedLeadingChapterHeading
        && nodeTypeName === 'heading'
        && Number(node?.attrs?.level) === 1;
      if (isLeadingChapterHeading) {
        skippedLeadingChapterHeading = true;
        return;
      }
      if (nodeTypeName === 'paragraph' && !nodeText) return;
      if (nodeText) {
        hasMeaningfulTextBeforeFirstExplicit = true;
        return;
      }
      // Treat non-text nodes before the first explicit marker as meaningful content.
      hasMeaningfulTextBeforeFirstExplicit = true;
    });
  }

  const shouldInjectImplicitFirstSegment = Boolean(normalizedStructureConfig.implicitFirstSegment)
    && (
      (explicitMarkers.length === 0 && documentHasMeaningfulText)
      || hasMeaningfulTextBeforeFirstExplicit
    );

  if (shouldInjectImplicitFirstSegment) {
    segments.push({
      key: 'segment_implicit_0_1',
      title: buildSegmentIndexLabel(1, normalizedStructureConfig),
      number: 1,
      markerKind: 'implicit',
      markerPos: 0,
    });
  }

  explicitMarkers.forEach((marker) => {
    const segmentNumber = segments.length + 1;
    const fallbackTitle = buildSegmentIndexLabel(segmentNumber, normalizedStructureConfig);
    const rawTitle = String(marker.rawTitle || '').trim();
    const shouldUseRawTitle = marker.markerKind === 'heading' && rawTitle && !COMMON_SEGMENT_SEPARATOR_SYMBOLS.has(rawTitle);
    segments.push({
      key: `segment_${Number(marker.markerPos) || 0}_${segmentNumber}`,
      title: shouldUseRawTitle ? rawTitle : fallbackTitle,
      number: segmentNumber,
      markerKind: marker.markerKind,
      markerPos: Number(marker.markerPos) || 0,
    });
  });

  let activeSegmentKey = null;
  if (segments.length > 0) {
    for (let i = 0; i < segments.length; i += 1) {
      const current = segments[i];
      const next = segments[i + 1];
      const currentPos = Number(current.markerPos) || 0;
      const nextPos = next ? (Number(next.markerPos) || Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      if (selectionFrom >= currentPos && selectionFrom < nextPos) {
        activeSegmentKey = current.key;
        break;
      }
    }
    if (!activeSegmentKey) activeSegmentKey = segments[0].key;
  }

  return { segments, activeSegmentKey };
}

function readEffectiveChapterStructureConfigForSession(session, book) {
  const sessionConfig = session?.chapterStructureConfig && typeof session.chapterStructureConfig === 'object'
    ? session.chapterStructureConfig
    : null;
  const hasExplicitChapterOverride = String(session?.chapterStructureConfigScope || '').toLowerCase() === 'chapter'
    && sessionConfig;
  if (hasExplicitChapterOverride) {
    return normalizeChapterStructureConfig(sessionConfig);
  }
  const bookDefaults = book?.chapterStructureDefaults && typeof book.chapterStructureDefaults === 'object'
    ? book.chapterStructureDefaults
    : null;
  if (bookDefaults) {
    return normalizeChapterStructureConfig(bookDefaults);
  }
  if (sessionConfig) {
    return normalizeChapterStructureConfig(sessionConfig);
  }
  return normalizeChapterStructureConfig(DEFAULT_CHAPTER_STRUCTURE_CONFIG);
}

function getChapterStructureScopeModeForSession(session, book) {
  const hasBook = Boolean(book && session?.bookId);
  if (!hasBook) return 'chapter';
  return String(session?.chapterStructureConfigScope || '').toLowerCase() === 'chapter'
    ? 'chapter'
    : 'book';
}

function readFirstChapterHeadingInfo(editorInstance) {
  const firstNode = editorInstance?.state?.doc?.firstChild || null;
  const isHeading = firstNode?.type?.name === 'heading' && Number(firstNode?.attrs?.level) === 1;
  if (!isHeading) return null;
  return {
    node: firstNode,
    nodeSize: Number(firstNode?.nodeSize) || 0,
    text: String(firstNode?.textContent || '').trim(),
  };
}

function hasMeaningfulContentBeyondChapterHeading(editorInstance) {
  const doc = editorInstance?.state?.doc;
  if (!doc) return false;
  let hasContent = false;
  let skippedFirstHeading = false;
  doc.forEach((node) => {
    if (hasContent) return;
    const nodeTypeName = String(node?.type?.name || '');
    const nodeText = String(node?.textContent || '').trim();
    if (!skippedFirstHeading && nodeTypeName === 'heading' && Number(node?.attrs?.level) === 1) {
      skippedFirstHeading = true;
      return;
    }
    if (nodeTypeName === 'paragraph' && !nodeText) return;
    if (nodeText) {
      hasContent = true;
      return;
    }
    // Non-text nodes (hr, lists, etc.) count as meaningful structure/content.
    hasContent = true;
  });
  return hasContent;
}

// --- Component หลัก ---
export default function Composer({
  initialContent,
  onContentChange,
  onCollapse,
  onToggleMaximize,
  isMaximized,
  onExport,
  onReady,
  onTogglePeekChat,
  isPeekChat = false
}) {
    const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0 });
    const selectionBarRef = useRef(null);
    const [selectionBarState, setSelectionBarState] = useState({
        visible: false,
        x: 0,
        y: 0,
        text: '',
        sessionId: null
    });
    const [selectionBarItemType, setSelectionBarItemType] = useState('note');
    const [loadingState, setLoadingState] = useState({ isLoading: false });
    const [hasPending, setHasPending] = useState(false);
    const [inspectorState, setInspectorState] = useState({
        isVisible: false,
        systemPrompt: '',
        actionPrompt: '',
        userText: '',
        worldContextInjected: false,
        worldContextText: '',
        worldContextItemCount: 0,
        worldContextMode: null,
        worldContextAsOfChapter: null,
        worldContextWorldName: null,
        worldContextBookName: null
    });
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [peekChatActive, setPeekChatActive] = useState(Boolean(isPeekChat));
    const [chapterSettingsExpanded, setChapterSettingsExpanded] = useState(false);
    const [chapterOutlineExpanded, setChapterOutlineExpanded] = useState(false);
    const [chapterMentionsExpanded, setChapterMentionsExpanded] = useState(false);
    const [chapterToolsVisible, setChapterToolsVisible] = useState(false);
    const [chapterStructureScopeMode, setChapterStructureScopeMode] = useState('chapter');
    const [chapterStructureConfig, setChapterStructureConfig] = useState(DEFAULT_CHAPTER_STRUCTURE_CONFIG);
    const [chapterSegmentIndex, setChapterSegmentIndex] = useState({ segments: [], activeSegmentKey: null });
    const [composerDisplayPrefs, setComposerDisplayPrefs] = useState(() => loadComposerDisplayPrefs());
    const [composerLiveWordCount, setComposerLiveWordCount] = useState(0);
    const composerMentionLookupRef = useRef(new Map());
    const composerMentionSourcesRef = useRef([]);
    const composerMentionPopupRef = useRef(null);
    const [composerMentionRefreshTick, setComposerMentionRefreshTick] = useState(0);
    const [composerMentionTrackingTick, setComposerMentionTrackingTick] = useState(0);
    const [composerMentionTracking, setComposerMentionTracking] = useState({
        totalMentions: 0,
        uniqueItemCount: 0,
        countsByItemId: {},
        segmentCountsByKey: {},
        segmentUniqueByKey: {},
    });
    const [composerMentionPopup, setComposerMentionPopup] = useState({
        visible: false,
        x: 0,
        y: 0,
        itemId: null,
        matchedText: '',
        item: null
    });

    // --- Functions สำหรับจัดการ Decisions ---
    const handleAcceptSuggestion = (editorInstance) => {
        if (!editorInstance) return;
        // ใช้ command `acceptSuggestion` ที่เราสร้างไว้ใน Node
        editorInstance.chain().focus().acceptSuggestion().run();
    };

    const handleRejectSuggestion = (editorInstance) => {
        if (!editorInstance) return;
        // ใช้ command `rejectSuggestion`
        editorInstance.chain().focus().rejectSuggestion().run();
    };

    const hideSelectionActionBar = () => {
        setSelectionBarState(prev => (prev.visible
            ? { ...prev, visible: false, text: '' }
            : prev));
    };

    const readComposerSelectionPayload = (editorInstance = editor) => {
        if (!editorInstance?.view?.dom) return null;
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const selectedText = String(selection.toString() || '').trim();
        if (!selectedText) return null;

        const range = selection.getRangeAt(0);
        const commonNode = range.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range.commonAncestorContainer?.parentElement;
        if (!commonNode || !editorInstance.view.dom.contains(commonNode)) return null;

        const rect = range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) return null;

        return {
            text: selectedText,
            rect,
            sessionId: stateManager.getProject()?.activeSessionId || null
        };
    };

    const refreshSelectionActionBar = (editorInstance = editor) => {
        if (menuState.visible) {
            hideSelectionActionBar();
            return;
        }
        const payload = readComposerSelectionPayload(editorInstance);
        if (!payload) {
            hideSelectionActionBar();
            return;
        }
        const approximateWidth = 340;
        const approximateHeight = 44;
        const margin = 8;
        let left = payload.rect.left + (payload.rect.width / 2) - (approximateWidth / 2);
        left = Math.max(10, Math.min(left, window.innerWidth - approximateWidth - 10));
        let top = payload.rect.top - approximateHeight - margin;
        if (top < 10) {
            top = payload.rect.bottom + margin;
        }
        top = Math.max(10, Math.min(top, window.innerHeight - approximateHeight - 10));

        setSelectionBarState({
            visible: true,
            x: Math.round(left),
            y: Math.round(top),
            text: payload.text,
            sessionId: payload.sessionId || null
        });
    };

    const handleAddSelectionToCodex = () => {
        const exactText = String(selectionBarState.text || '').trim();
        if (!exactText) return;
        stateManager.bus.publish('world:addSelectionVerbatim', {
            text: exactText,
            type: selectionBarItemType,
            sourceKind: 'composer',
            sessionId: selectionBarState.sessionId || null
        });
        hideSelectionActionBar();
    };

    const closeComposerMentionPopup = () => {
        setComposerMentionPopup((prev) => (
            prev.visible
                ? { visible: false, x: 0, y: 0, itemId: null, matchedText: '', item: null }
                : prev
        ));
    };

    const handleComposerMentionClick = (payload, event) => {
        const itemId = String(payload?.id || '').trim();
        if (!itemId) return;
        const item = composerMentionLookupRef.current.get(itemId) || {
            id: itemId,
            title: String(payload?.title || '').trim() || String(payload?.matchedText || '').trim() || 'World Item',
            type: String(payload?.type || 'note').trim().toLowerCase() || 'note',
            subtype: String(payload?.subtype || '').trim(),
            aliases: [],
            thumbnailUrl: '',
            description: ''
        };
        const pointX = Number(event?.clientX || 0);
        const pointY = Number(event?.clientY || 0);
        const popupPos = clampComposerMentionPopupPosition(pointX, pointY);
        hideSelectionActionBar();
        setComposerMentionPopup({
            visible: true,
            x: popupPos.left,
            y: popupPos.top,
            itemId,
            matchedText: String(payload?.matchedText || '').trim(),
            item
        });
    };

    const handleJumpToMentionItem = (itemId) => {
        const normalizedId = String(itemId || '').trim();
        if (!normalizedId || !editor?.view?.dom) return;
        const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
            ? CSS.escape(normalizedId)
            : normalizedId.replace(/["\\]/g, '\\$&');
        const mentionNodes = Array.from(editor.view.dom.querySelectorAll(`[data-world-mention-id="${escapedId}"]`));
        if (mentionNodes.length === 0) return;
        const targetNode = mentionNodes[0];
        if (!(targetNode instanceof HTMLElement)) return;
        targetNode.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        targetNode.classList.add('composer-world-mention--pulse');
        window.setTimeout(() => {
            targetNode.classList.remove('composer-world-mention--pulse');
        }, 900);
        targetNode.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        editor.commands.focus();
    };

    const project = stateManager.getProject();
    const activeSession = project?.chatSessions?.find((session) => session.id === project.activeSessionId) || null;
    const activeBook = activeSession?.bookId
      ? (project?.books || []).find((book) => String(book?.id || '') === String(activeSession.bookId || '')) || null
      : null;
    const isChapterSession = Boolean(activeSession && (activeSession.kind === 'chapter' || activeSession.bookId));
    const canUseBookStructureDefaults = Boolean(activeBook && activeSession?.bookId);
    const isUsingBookStructureDefaults = canUseBookStructureDefaults && chapterStructureScopeMode !== 'chapter';
    const normalizedChapterStructureConfig = normalizeChapterStructureConfig(chapterStructureConfig);
    const chapterStructureConfigKey = JSON.stringify(normalizedChapterStructureConfig);
    const chapterTitlePreview = buildChapterTitlePreview(activeSession, normalizedChapterStructureConfig);
    const chapterMetaLabel = getChapterMetaLabelForConfig(normalizedChapterStructureConfig);
    const activeChapterSegment = chapterSegmentIndex.segments.find((segment) => segment.key === chapterSegmentIndex.activeSegmentKey) || chapterSegmentIndex.segments[0] || null;
    const chapterNumberMeta = Number.isFinite(Number(activeSession?.chapterNumber)) ? Math.round(Number(activeSession.chapterNumber)) : null;
    const chapterNameMeta = String(activeSession?.chapterTitle || '').trim();
    const structureInsertButtonLabel = getSegmentInsertButtonLabel(normalizedChapterStructureConfig);
    const isChapterToolsPanelVisible = Boolean(chapterToolsVisible || chapterOutlineExpanded || chapterSettingsExpanded);
    const activeSegmentMentionCount = activeChapterSegment
      ? (Number(composerMentionTracking?.segmentCountsByKey?.[activeChapterSegment.key]) || 0)
      : 0;
    const composerMentionTopItems = Object.entries(composerMentionTracking?.countsByItemId || {})
      .map(([itemId, count]) => {
        const item = composerMentionLookupRef.current.get(String(itemId || '').trim()) || null;
        const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0;
        return {
          id: String(itemId || '').trim(),
          count: safeCount,
          item,
        };
      })
      .filter((entry) => entry.id && entry.count > 0)
      .sort((left, right) => {
        const countDiff = (right?.count || 0) - (left?.count || 0);
        if (countDiff !== 0) return countDiff;
        return String(left?.item?.title || '').localeCompare(String(right?.item?.title || ''), undefined, { sensitivity: 'base' });
      });
    const composerMentionTopItemsPreview = composerMentionTopItems.slice(0, 10);
    const normalizedComposerDisplayPrefs = normalizeComposerDisplayPrefs(composerDisplayPrefs);
    const composerDisplayPrefsStorageSnapshot = JSON.stringify(normalizedComposerDisplayPrefs);
    const focusChapterOptions = buildBookChapterSwitcherOptions(project, activeSession);
    const activeFocusChapterId = String(activeSession?.id || '');
    const composerPanelClassName = [
      'composer-panel',
      'tw-relative',
      normalizedComposerDisplayPrefs.centerContent ? 'composer-reading-centered' : 'composer-reading-left',
      normalizedComposerDisplayPrefs.focusMode ? 'composer-focus-mode' : '',
      normalizedComposerDisplayPrefs.paragraphIndent ? 'composer-indent-on' : '',
      normalizedComposerDisplayPrefs.textAlign === 'justify' ? 'composer-text-justify' : 'composer-text-left'
    ].filter(Boolean).join(' ');
    const composerPanelStyle = {
      '--composer-reading-width': getComposerReadingWidthValue(normalizedComposerDisplayPrefs.pageWidthPreset),
      '--composer-display-font-size': `${normalizedComposerDisplayPrefs.fontSizePx}px`,
      '--composer-display-line-height': String(normalizedComposerDisplayPrefs.lineHeight),
      '--composer-display-paragraph-gap': `${normalizedComposerDisplayPrefs.paragraphSpacingEm}em`,
      '--composer-display-paragraph-indent': `${normalizedComposerDisplayPrefs.paragraphIndentEm}em`,
    };

    const refreshChapterSegmentIndex = (editorInstance, config = normalizedChapterStructureConfig) => {
        setChapterSegmentIndex(readChapterSegmentsFromEditor(editorInstance, config));
    };

    const refreshComposerLiveWordCount = (editorInstance = editor) => {
        if (!editorInstance) {
            setComposerLiveWordCount(0);
            return;
        }
        setComposerLiveWordCount(countWordsForComposerDisplay(editorInstance.getText()));
    };

    const persistActiveChapterStructureConfig = (nextConfig) => {
        const projectState = stateManager.getProject();
        if (!projectState?.activeSessionId || !Array.isArray(projectState.chatSessions)) return;
        const session = projectState.chatSessions.find((item) => item.id === projectState.activeSessionId);
        if (!session || (!session.bookId && session.kind !== 'chapter')) return;
        const normalizedNext = normalizeChapterStructureConfig(nextConfig);
        const now = Date.now();
        const targetBook = session.bookId
            ? (projectState.books || []).find((book) => String(book?.id || '') === String(session.bookId || '')) || null
            : null;
        const hasExplicitChapterOverride = String(session.chapterStructureConfigScope || '').toLowerCase() === 'chapter';

        if (targetBook && !hasExplicitChapterOverride) {
            const currentBookNormalized = normalizeChapterStructureConfig(targetBook.chapterStructureDefaults || {});
            if (JSON.stringify(normalizedNext) === JSON.stringify(currentBookNormalized)) return;
            targetBook.chapterStructureDefaults = normalizedNext;
            targetBook.updatedAt = now;
            session.updatedAt = now;
        } else {
            const currentNormalized = normalizeChapterStructureConfig(session.chapterStructureConfig || {});
            if (JSON.stringify(normalizedNext) === JSON.stringify(currentNormalized)) return;
            session.chapterStructureConfig = normalizedNext;
            session.updatedAt = now;
        }
        stateManager.setProject(projectState);
        stateManager.updateAndPersistState();
    };

    const persistActiveChapterStructureScopeMode = (nextMode, { nextConfig = null } = {}) => {
        const normalizedMode = String(nextMode || '').toLowerCase() === 'chapter' ? 'chapter' : 'book';
        const projectState = stateManager.getProject();
        if (!projectState?.activeSessionId || !Array.isArray(projectState.chatSessions)) return false;
        const session = projectState.chatSessions.find((item) => item.id === projectState.activeSessionId);
        if (!session || (!session.bookId && session.kind !== 'chapter')) return false;
        const book = session.bookId
            ? (projectState.books || []).find((item) => String(item?.id || '') === String(session.bookId || '')) || null
            : null;
        const effectiveConfig = normalizeChapterStructureConfig(nextConfig || chapterStructureConfig);
        const now = Date.now();

        if (normalizedMode === 'chapter' || !book) {
            const currentScope = String(session.chapterStructureConfigScope || '').toLowerCase() || '';
            const currentSessionConfig = normalizeChapterStructureConfig(session.chapterStructureConfig || {});
            const alreadySame = currentScope === 'chapter'
                && JSON.stringify(currentSessionConfig) === JSON.stringify(effectiveConfig);
            if (alreadySame) return true;
            session.chapterStructureConfigScope = 'chapter';
            session.chapterStructureConfig = effectiveConfig;
            session.updatedAt = now;
            stateManager.setProject(projectState);
            stateManager.updateAndPersistState();
            return true;
        }

        const currentScope = String(session.chapterStructureConfigScope || '').toLowerCase() || '';
        const currentBookDefaults = normalizeChapterStructureConfig(book.chapterStructureDefaults || {});
        if (currentScope !== 'chapter' && JSON.stringify(currentBookDefaults) === JSON.stringify(effectiveConfig)) {
            return true;
        }
        delete session.chapterStructureConfigScope;
        if (!book.chapterStructureDefaults || typeof book.chapterStructureDefaults !== 'object') {
            book.chapterStructureDefaults = effectiveConfig;
        }
        session.updatedAt = now;
        book.updatedAt = now;
        stateManager.setProject(projectState);
        stateManager.updateAndPersistState();
        return true;
    };

    const handleChapterStructureScopeModeChange = (nextMode) => {
        const normalizedMode = String(nextMode || '').toLowerCase() === 'chapter' ? 'chapter' : 'book';
        if (normalizedMode === chapterStructureScopeMode) return;
        if (normalizedMode === 'book') {
            const bookDefaults = normalizeChapterStructureConfig(activeBook?.chapterStructureDefaults || {});
            setChapterStructureScopeMode('book');
            setChapterStructureConfig(bookDefaults);
            persistActiveChapterStructureScopeMode('book', { nextConfig: bookDefaults });
            return;
        }
        const currentConfig = normalizeChapterStructureConfig(chapterStructureConfig);
        setChapterStructureScopeMode('chapter');
        setChapterStructureConfig(currentConfig);
        persistActiveChapterStructureScopeMode('chapter', { nextConfig: currentConfig });
    };

    const handleChapterStructureConfigChange = (patch) => {
        setChapterStructureConfig((prev) => ({
            ...normalizeChapterStructureConfig(prev),
            ...(patch || {})
        }));
    };

    const handleComposerDisplayPrefsChange = (patch) => {
        setComposerDisplayPrefs((prev) => normalizeComposerDisplayPrefs({
            ...normalizeComposerDisplayPrefs(prev),
            ...(patch || {})
        }));
    };

    const handleResetComposerDisplayPrefs = () => {
        setComposerDisplayPrefs(DEFAULT_COMPOSER_DISPLAY_PREFS);
    };

    const handleApplyComposerDisplayPreset = (presetPatch) => {
        if (!presetPatch || typeof presetPatch !== 'object') return;
        handleComposerDisplayPrefsChange(presetPatch);
    };

    const toggleComposerImmersiveFocusMode = async () => {
        const nextFocusMode = !normalizedComposerDisplayPrefs.focusMode;
        handleComposerDisplayPrefsChange({ focusMode: nextFocusMode });
        if (nextFocusMode) {
            await requestAppFullscreenForComposerFocus();
        } else {
            await exitAppFullscreenForComposerFocus();
        }
    };

    const handleFocusChapterSelect = async (sessionId) => {
        const targetSessionId = String(sessionId || '').trim();
        if (!targetSessionId || targetSessionId === String(activeSession?.id || '')) return;
        const projectState = stateManager.getProject();
        const targetSession = projectState?.chatSessions?.find((session) => String(session?.id || '') === targetSessionId);
        if (!targetSession) return;

        // Keep chapter navigation inside composer workflow, especially during immersive focus.
        targetSession.workspaceView = 'composer';
        if (normalizedComposerDisplayPrefs.focusMode) {
            targetSession.composerViewMode = 'maximized';
        }
        targetSession.updatedAt = Date.now();

        try {
            const SessionHandlers = await import('../modules/session/session.handlers.js');
            if (typeof SessionHandlers?.loadChatSession === 'function') {
                SessionHandlers.loadChatSession(targetSessionId);
            }
        } catch (error) {
            console.error('Failed to switch chapter from composer focus dropdown:', error);
        }
    };

    const getHeadingSegmentDisplayText = (segmentNumber) => {
        const noun = getSegmentNounLabel(normalizedChapterStructureConfig);
        if (!noun) return String(segmentNumber);
        return `${noun} ${segmentNumber}`;
    };

    const buildSegmentInsertionHtml = (segmentNumber) => {
        const markerStyle = normalizedChapterStructureConfig.segmentMarkerStyle;
        if (markerStyle === 'divider') {
            return '<hr><p></p>';
        }
        if (markerStyle === 'symbol') {
            const symbol = escapeHtmlText(String(normalizedChapterStructureConfig.segmentMarkerSymbol || '***').trim() || '***');
            return `<p>${symbol}</p><p></p>`;
        }
        const headingText = escapeHtmlText(getHeadingSegmentDisplayText(segmentNumber));
        return `<h2>${headingText}</h2><p></p>`;
    };

    const handleJumpToSegment = (segment) => {
        if (!editor || !segment) return;
        const targetPos = Math.max(1, (Number(segment.markerPos) || 0) + 1);
        editor.chain().focus().setTextSelection(targetPos).run();
    };

    const handleInsertSegment = () => {
        if (!editor) return;
        const nextSegmentNumber = Math.max(1, (chapterSegmentIndex?.segments?.length || 0) + 1);
        const markerHtml = buildSegmentInsertionHtml(nextSegmentNumber);
        const hasAnyText = editor.getText().trim().length > 0;
        const insertionHtml = hasAnyText
            ? `<p></p>${markerHtml}`
            : markerHtml;
        editor.chain().focus('end').insertContent(insertionHtml).run();
    };

    const hideChapterToolsPanel = () => {
        setChapterToolsVisible(false);
        setChapterOutlineExpanded(false);
        setChapterSettingsExpanded(false);
    };

    const toggleChapterToolsPanel = () => {
        const currentlyVisible = Boolean(chapterToolsVisible || chapterOutlineExpanded || chapterSettingsExpanded);
        if (currentlyVisible) {
            hideChapterToolsPanel();
            return;
        }
        setChapterToolsVisible(true);
    };

    const handleToggleChapterOutlineFromMenu = () => {
        setChapterToolsVisible(true);
        setChapterOutlineExpanded((prev) => !prev);
    };

    const handleToggleChapterSettingsFromMenu = () => {
        setChapterToolsVisible(true);
        setChapterSettingsExpanded((prev) => !prev);
    };

    const handleInsertSegmentFromMenu = () => {
        setChapterToolsVisible(true);
        handleInsertSegment();
    };

    const buildChapterHeadingHtml = (headingTextRaw = chapterTitlePreview || 'Chapter') => {
        const headingText = escapeHtmlText(headingTextRaw || 'Chapter');
        const titleAlign = ['left', 'center', 'right'].includes(normalizedChapterStructureConfig.titleAlign)
            ? normalizedChapterStructureConfig.titleAlign
            : 'left';
        const titleFontSizePx = Number.isFinite(Number(normalizedChapterStructureConfig.titleFontSizePx))
            ? Math.max(14, Math.min(96, Math.round(Number(normalizedChapterStructureConfig.titleFontSizePx))))
            : 32;
        const headingStyle = titleAlign && titleAlign !== 'left'
            ? ` style="text-align: ${titleAlign};"`
            : '';
        const titleSpan = `<span style="font-size: ${titleFontSizePx}px;">${headingText}</span>`;
        return `<h1${headingStyle}>${titleSpan}</h1>`;
    };

    const applyChapterTitleHeadingToEditor = (options = {}) => {
        const editorInstance = options.editorInstance || editor;
        if (!editorInstance) return false;
        const headingHtml = buildChapterHeadingHtml(options.headingText || chapterTitlePreview || 'Chapter');
        const firstNode = editorInstance.state?.doc?.firstChild || null;
        const isFirstNodeChapterHeading = firstNode?.type?.name === 'heading' && Number(firstNode?.attrs?.level) === 1;
        const chain = editorInstance.chain();
        if (options.focus !== false) chain.focus();
        if (isFirstNodeChapterHeading) {
            chain.insertContentAt({ from: 0, to: firstNode.nodeSize }, headingHtml).run();
            return true;
        }
        if (options.focus !== false) {
            chain.focus('start');
        }
        chain.insertContent(`${headingHtml}<p></p>`).run();
        return true;
    };

    const handleApplyChapterTitleHeading = () => {
        applyChapterTitleHeadingToEditor({ focus: true });
    };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Highlight,
      Placeholder.configure({ placeholder: 'พิมพ์ข้อความของคุณที่นี่...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontSize,
      PendingHighlight,
      InstructionNode,
      SuggestionNode,
      WorldMentions.configure({
        onMentionClick: handleComposerMentionClick,
      }),
      // Underline, 
      // Blockquote,

      Hotkey.configure({
        shortcuts: [
          { hotkey: '\\', command: ({ editor: e }) => invokeAgent({ action: 'continue', editor: e }) },
          { hotkey: '=', command: ({ editor: e }) => handleAcceptSuggestion(e) },
          { hotkey: 'Mod-Shift-i', command: ({ editor: e }) => e.chain().focus().setInstructionNode().run() },
          { hotkey: 'Mod-Alt-u', command: ({ editor: e }) => e.chain().focus().setInstructionNode().run() },
        ]
      }),
    ],

    content: initialContent || '',
        onUpdate: ({ editor }) => {
            onContentChange(editor.getHTML());
            refreshComposerLiveWordCount(editor);
            setComposerMentionTrackingTick((prev) => prev + 1);
        },
        onTransaction: ({ editor }) => {
            setHasPending(editor.isActive('suggestionNode', { 'data-status': 'pending' }));
            if (isChapterSession) {
                refreshChapterSegmentIndex(editor);
            }
        },
        onSelectionUpdate: ({ editor }) => {
            setHasPending(editor.isActive('suggestionNode', { 'data-status': 'pending' }));
            if (isChapterSession) {
                refreshChapterSegmentIndex(editor);
            }
            window.requestAnimationFrame(() => refreshSelectionActionBar(editor));
        },
        editorProps: {
            handleDOMEvents: {
                contextmenu: (view, event) => {
                    event.preventDefault();
                    hideSelectionActionBar();
                    setMenuState({ visible: true, x: event.clientX, y: event.clientY });
                    return true;
                },
            },
        },
    });

    useEffect(() => {
        const handlePromptUpdate = (data) => setInspectorState(prev => ({ ...prev, ...data }));
        const handleLoading = ({ isLoading }) => setLoadingState({ isLoading });
        const unsubPrompt = stateManager.bus.subscribe('composer:promptConstructed', handlePromptUpdate);
        const unsubLoading = stateManager.bus.subscribe('composer:setLoading', handleLoading);
        return () => {
            unsubPrompt();
            unsubLoading();
        };
    }, []);

    useEffect(() => {
        const bumpMentionRefresh = () => {
            setComposerMentionRefreshTick((prev) => prev + 1);
        };
        const unsubProjectLoaded = stateManager.bus.subscribe('project:loaded', bumpMentionRefresh);
        const unsubSessionLoaded = stateManager.bus.subscribe('session:loaded', bumpMentionRefresh);
        const unsubWorldChanged = stateManager.bus.subscribe('world:dataChanged', bumpMentionRefresh);
        return () => {
            unsubProjectLoaded();
            unsubSessionLoaded();
            unsubWorldChanged();
        };
    }, []);

    useEffect(() => {
        if (!editor) return;
        if (!activeSession) {
            composerMentionLookupRef.current = new Map();
            composerMentionSourcesRef.current = [];
            if (typeof editor.commands.clearWorldMentionSources === 'function') {
                editor.commands.clearWorldMentionSources();
            }
            closeComposerMentionPopup();
            setComposerMentionTracking({
                totalMentions: 0,
                uniqueItemCount: 0,
                countsByItemId: {},
                segmentCountsByKey: {},
                segmentUniqueByKey: {},
            });
            return;
        }

        const latestProject = stateManager.getProject() || project;
        const mentionBundle = buildComposerWorldMentionBundle(latestProject, activeSession);
        composerMentionLookupRef.current = mentionBundle.lookup;
        composerMentionSourcesRef.current = mentionBundle.sources;
        if (typeof editor.commands.setWorldMentionSources === 'function') {
            editor.commands.setWorldMentionSources({
                sources: mentionBundle.sources,
                version: mentionBundle.version
            });
        }

        setComposerMentionPopup((prev) => {
            if (!prev.visible || !prev.itemId) return prev;
            const nextItem = mentionBundle.lookup.get(prev.itemId);
            if (!nextItem) {
                return { visible: false, x: 0, y: 0, itemId: null, matchedText: '', item: null };
            }
            return { ...prev, item: nextItem };
        });
    }, [
        editor,
        activeSession?.id,
        activeSession?.bookId,
        activeSession?.chapterNumber,
        activeSession?.writingMode,
        activeSession?.revealScope?.asOfChapter,
        activeBook?.linkedWorldId,
        project?.activeWorldId,
        composerMentionRefreshTick
    ]);

    useEffect(() => {
        if (!editor || !activeSession) {
            setComposerMentionTracking({
                totalMentions: 0,
                uniqueItemCount: 0,
                countsByItemId: {},
                segmentCountsByKey: {},
                segmentUniqueByKey: {},
            });
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            const sources = Array.isArray(composerMentionSourcesRef.current) ? composerMentionSourcesRef.current : [];
            const snapshot = buildComposerMentionTrackingSnapshot(editor, sources, chapterSegmentIndex);
            setComposerMentionTracking(snapshot);
        }, 90);

        return () => window.clearTimeout(timeoutId);
    }, [
        editor,
        activeSession?.id,
        composerMentionRefreshTick,
        composerMentionTrackingTick,
        chapterSegmentIndex?.activeSegmentKey,
        chapterSegmentIndex?.segments?.length,
        chapterStructureConfigKey,
    ]);

    useEffect(() => {
        if (!composerMentionPopup.visible) return undefined;
        const handlePointerDown = (event) => {
            const target = event?.target;
            if (composerMentionPopupRef.current && target instanceof Element && composerMentionPopupRef.current.contains(target)) {
                return;
            }
            if (target instanceof Element && target.closest('[data-world-mention-id]')) {
                return;
            }
            closeComposerMentionPopup();
        };
        const handleEscapeKey = (event) => {
            if (String(event?.key || '') !== 'Escape') return;
            closeComposerMentionPopup();
        };
        const handleViewportScroll = () => closeComposerMentionPopup();
        document.addEventListener('mousedown', handlePointerDown, true);
        window.addEventListener('keydown', handleEscapeKey);
        window.addEventListener('scroll', handleViewportScroll, true);
        window.addEventListener('resize', handleViewportScroll);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown, true);
            window.removeEventListener('keydown', handleEscapeKey);
            window.removeEventListener('scroll', handleViewportScroll, true);
            window.removeEventListener('resize', handleViewportScroll);
        };
    }, [composerMentionPopup.visible]);

    const handleCloseMenu = () => {
        setMenuState({ ...menuState, visible: false });
    };

    useEffect(() => {
        if (menuState.visible) {
            document.addEventListener('click', handleCloseMenu, { once: true });
        }
        return () => document.removeEventListener('click', handleCloseMenu);
    }, [menuState.visible]);

    useEffect(() => {
        if (!editor) return undefined;
        const handleWindowSelectionRelatedChange = () => {
            const activeEl = document.activeElement;
            if (selectionBarRef.current && (selectionBarRef.current.contains(activeEl) || selectionBarRef.current.contains(document.activeElement))) {
                return;
            }
            window.requestAnimationFrame(() => refreshSelectionActionBar());
        };
        const handleWindowResizeOrScroll = () => {
            if (!selectionBarState.visible) return;
            window.requestAnimationFrame(() => refreshSelectionActionBar());
        };
        document.addEventListener('mouseup', handleWindowSelectionRelatedChange);
        document.addEventListener('keyup', handleWindowSelectionRelatedChange);
        window.addEventListener('resize', handleWindowResizeOrScroll);
        window.addEventListener('scroll', handleWindowResizeOrScroll, true);
        return () => {
            document.removeEventListener('mouseup', handleWindowSelectionRelatedChange);
            document.removeEventListener('keyup', handleWindowSelectionRelatedChange);
            window.removeEventListener('resize', handleWindowResizeOrScroll);
            window.removeEventListener('scroll', handleWindowResizeOrScroll, true);
        };
    }, [editor, menuState.visible, selectionBarState.visible]);

    useEffect(() => {
        if (editor && initialContent !== undefined && editor.getHTML() !== initialContent) {
            editor.commands.setContent(initialContent || '', false);
        }
        if (editor) {
            window.requestAnimationFrame(() => refreshComposerLiveWordCount(editor));
        }
    }, [initialContent, editor]);

    useEffect(() => {
        if (!editor) return;
        if (!isChapterSession) {
            setChapterToolsVisible(false);
            setChapterSettingsExpanded(false);
            setChapterOutlineExpanded(false);
            setChapterSegmentIndex({ segments: [], activeSegmentKey: null });
            refreshComposerLiveWordCount(editor);
            return;
        }
        refreshChapterSegmentIndex(editor, normalizedChapterStructureConfig);
        refreshComposerLiveWordCount(editor);
    }, [editor, initialContent, isChapterSession, chapterStructureConfigKey]);

    useEffect(() => {
        if (!isChapterSession) return;
        setChapterStructureScopeMode(getChapterStructureScopeModeForSession(activeSession, activeBook));
        setChapterStructureConfig(readEffectiveChapterStructureConfigForSession(activeSession, activeBook));
        setChapterToolsVisible(false);
        setChapterSettingsExpanded(false);
        setChapterOutlineExpanded(false);
    }, [activeSession?.id, activeSession?.bookId, activeSession?.chapterStructureConfigScope, isChapterSession]);

    useEffect(() => {
        if (!editor || !isChapterSession) return;
        if (loadingState.isLoading) return;
        const expectedTitle = String(chapterTitlePreview || '').trim();
        if (!expectedTitle) return;
        const firstHeading = readFirstChapterHeadingInfo(editor);
        if (!firstHeading) return;
        if (hasMeaningfulContentBeyondChapterHeading(editor)) return;
        if (String(firstHeading.text || '').trim() === expectedTitle) return;
        window.requestAnimationFrame(() => {
            const latestFirstHeading = readFirstChapterHeadingInfo(editor);
            if (!latestFirstHeading) return;
            if (hasMeaningfulContentBeyondChapterHeading(editor)) return;
            if (String(latestFirstHeading.text || '').trim() === expectedTitle) return;
            applyChapterTitleHeadingToEditor({ editorInstance: editor, headingText: expectedTitle, focus: false });
        });
    }, [
        editor,
        isChapterSession,
        activeSession?.id,
        activeSession?.chapterNumber,
        activeSession?.chapterTitle,
        chapterStructureConfigKey,
        chapterTitlePreview,
        loadingState.isLoading
    ]);

    useEffect(() => {
        if (!isChapterSession) return;
        const timeoutId = window.setTimeout(() => {
            persistActiveChapterStructureConfig(chapterStructureConfig);
        }, 250);
        return () => window.clearTimeout(timeoutId);
    }, [chapterStructureConfig, isChapterSession]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            window.localStorage.setItem(COMPOSER_DISPLAY_PREFS_STORAGE_KEY, composerDisplayPrefsStorageSnapshot);
        } catch (error) {
            console.warn('Failed to persist composer display prefs:', error);
        }
    }, [composerDisplayPrefsStorageSnapshot]);

    useEffect(() => {
        if (!normalizedComposerDisplayPrefs.focusMode) return;
        setChapterSettingsExpanded(false);
        setChapterOutlineExpanded(false);
        setInspectorState((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
        setPeekChatActive(false);
        document.querySelector('.main-content-wrapper')?.classList.remove('composer-peek-chat');
    }, [normalizedComposerDisplayPrefs.focusMode]);

    useEffect(() => {
        const body = document.body;
        const mainChatPanel = document.getElementById('main-chat-panel') || document.querySelector('.main-chat-area');
        const mainContent = document.querySelector('.main-content-wrapper');
        const appWrapper = document.querySelector('.app-wrapper');
        body?.classList.toggle('composer-immersive-focus', normalizedComposerDisplayPrefs.focusMode);
        mainChatPanel?.classList.toggle('composer-immersive-focus', normalizedComposerDisplayPrefs.focusMode);
        mainContent?.classList.toggle('composer-immersive-focus', normalizedComposerDisplayPrefs.focusMode);
        appWrapper?.classList.toggle('composer-immersive-focus', normalizedComposerDisplayPrefs.focusMode);
        return () => {
            body?.classList.remove('composer-immersive-focus');
            mainChatPanel?.classList.remove('composer-immersive-focus');
            mainContent?.classList.remove('composer-immersive-focus');
            appWrapper?.classList.remove('composer-immersive-focus');
        };
    }, [normalizedComposerDisplayPrefs.focusMode]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (isAppInFullscreenMode()) return;
            if (!normalizedComposerDisplayPrefs.focusMode) return;
            handleComposerDisplayPrefsChange({ focusMode: false });
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, [normalizedComposerDisplayPrefs.focusMode]);

    useEffect(() => {
        const handleFocusShortcut = (event) => {
            if (event.defaultPrevented) return;
            const key = String(event.key || '');
            const isF9 = key === 'F9';
            const isModShiftF = key.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
            if (!isF9 && !isModShiftF) return;

            const activeEl = document.activeElement;
            const tagName = String(activeEl?.tagName || '').toUpperCase();
            const isTypingOutsideComposer = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) && !activeEl?.closest?.('#composer-panel');
            if (isTypingOutsideComposer) return;

            event.preventDefault();
            toggleComposerImmersiveFocusMode();
        };

        window.addEventListener('keydown', handleFocusShortcut);
        return () => window.removeEventListener('keydown', handleFocusShortcut);
    }, [normalizedComposerDisplayPrefs.focusMode]);

    useEffect(() => {
        setPeekChatActive(Boolean(isPeekChat));
    }, [isPeekChat, isMaximized]);

    const handleTogglePeekChat = () => {
        if (typeof onTogglePeekChat !== 'function') return;
        const nextState = onTogglePeekChat();
        if (typeof nextState === 'boolean') {
            setPeekChatActive(nextState);
        } else {
            setPeekChatActive((prev) => !prev);
        }
    };

    useEffect(() => {
        if (editor && onReady) {
            const api = {
                appendContent: (htmlContent) => {
                    if (!editor) return;
                    if (editor.getText().trim().length > 0) editor.chain().focus().insertContent('<hr>').run();
                    editor.chain().focus().insertContent(htmlContent).run();
                },
            };
            onReady(api);
        }
    }, [editor, onReady]);

    return (
        <div id="composer-panel" className={composerPanelClassName} style={composerPanelStyle}>
            <ComposerToolbar
                editor={editor}
                onCollapse={onCollapse}
                onToggleMaximize={onToggleMaximize}
                isMaximized={isMaximized}
                onExport={onExport}
                onToggleInspector={() => setInspectorState(prev => ({ ...prev, isVisible: !prev.isVisible }))}
                onTogglePeekChat={handleTogglePeekChat}
                isPeekChat={peekChatActive}
                displayPrefs={normalizedComposerDisplayPrefs}
                onDisplayPrefsChange={handleComposerDisplayPrefsChange}
                onResetDisplayPrefs={handleResetComposerDisplayPrefs}
                onApplyDisplayPreset={handleApplyComposerDisplayPreset}
                isFocusMode={normalizedComposerDisplayPrefs.focusMode}
                onToggleFocusMode={toggleComposerImmersiveFocusMode}
                focusChapterOptions={focusChapterOptions}
                activeFocusChapterId={activeFocusChapterId}
                onFocusChapterSelect={handleFocusChapterSelect}
                liveWordCount={composerLiveWordCount}
                isInspectorOpen={inspectorState.isVisible}
                showStructureActions={isChapterSession}
                hasStructureSegments={chapterSegmentIndex.segments.length > 0}
                isStructurePanelVisible={isChapterToolsPanelVisible}
                isStructureOutlineOpen={chapterOutlineExpanded}
                isStructureSettingsOpen={chapterSettingsExpanded}
                onToggleStructurePanel={toggleChapterToolsPanel}
                onToggleStructureOutline={handleToggleChapterOutlineFromMenu}
                onToggleStructureSettings={handleToggleChapterSettingsFromMenu}
                onInsertStructureSegment={handleInsertSegmentFromMenu}
                structureInsertLabel={structureInsertButtonLabel}
            />
            {isChapterSession && isChapterToolsPanelVisible && (
                <div className="composer-chapter-tools tw-flex tw-flex-col tw-gap-2 tw-px-3 tw-py-1 tw-border-b">
                    <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
                        <div className="tw-flex tw-flex-col tw-gap-1 tw-min-w-0">
                            <div className="composer-chapter-titleline tw-flex tw-items-center tw-gap-2 tw-text-sm">
                                <span className="material-symbols-outlined" aria-hidden="true">movie</span>
                                <span>Structure Index</span>
                                <span className="composer-chapter-meta tw-text-xs tw-opacity-80">
                                    {chapterSegmentIndex.segments.length} segment{chapterSegmentIndex.segments.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            {(activeChapterSegment || chapterSettingsExpanded || chapterNumberMeta || chapterNameMeta) && (
                                <div className="composer-chapter-muted tw-text-xs tw-truncate">
                                    {(chapterNumberMeta || chapterNameMeta) && (
                                        <>
                                            {chapterMetaLabel}:
                                            <span className="composer-chapter-preview-inline">
                                                {chapterNumberMeta ? ` ${chapterNumberMeta}` : ''}
                                                {chapterNameMeta ? `${chapterNumberMeta ? ' • ' : ' '}${chapterNameMeta}` : ''}
                                            </span>
                                        </>
                                    )}
                                    {activeChapterSegment ? (
                                        <>
                                            {(chapterNumberMeta || chapterNameMeta) && <span className="composer-chapter-inline-sep" aria-hidden="true">•</span>}
                                            Active: <span className="composer-chapter-preview-inline">{activeChapterSegment.title}</span>
                                        </>
                                    ) : (
                                        (!(chapterNumberMeta || chapterNameMeta) ? 'No segments yet' : null)
                                    )}
                                    {chapterSettingsExpanded && (
                                        <>
                                            <span className="composer-chapter-inline-sep" aria-hidden="true">•</span>
                                            Title: <span className="composer-chapter-preview-inline">{chapterTitlePreview}</span>
                                        </>
                                    )}
                                    {composerMentionTracking.totalMentions > 0 && (
                                        <>
                                            <span className="composer-chapter-inline-sep" aria-hidden="true">•</span>
                                            Mentions:
                                            <span className="composer-chapter-preview-inline"> {composerMentionTracking.totalMentions}</span>
                                            <span className="composer-chapter-muted"> ({composerMentionTracking.uniqueItemCount} item{composerMentionTracking.uniqueItemCount === 1 ? '' : 's'})</span>
                                            {activeChapterSegment && activeSegmentMentionCount > 0 && (
                                                <>
                                                    <span className="composer-chapter-inline-sep" aria-hidden="true">•</span>
                                                    Active mentions: <span className="composer-chapter-preview-inline">{activeSegmentMentionCount}</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="tw-flex tw-items-center tw-gap-1 tw-flex-shrink-0">
                            <button
                                type="button"
                                className="btn-icon composer-header-quiet-btn composer-chapter-tools-close"
                                onClick={hideChapterToolsPanel}
                                title="Hide Structure Index"
                                aria-label="Hide Structure Index"
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span>
                            </button>
                        </div>
                    </div>

                    {chapterSettingsExpanded && (
                        <div className="composer-chapter-settings-box tw-flex tw-flex-col tw-gap-3 tw-rounded-md tw-border tw-p-3">
                            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-border tw-px-3 tw-py-2" style={{ borderColor: 'var(--border-color)', background: 'rgba(127, 127, 127, 0.03)' }}>
                                <div className="tw-flex tw-flex-col tw-gap-0.5 tw-min-w-0">
                                    <div className="composer-chapter-field-label">Settings Scope</div>
                                    <div className="composer-chapter-muted tw-text-xs tw-leading-tight">
                                        {canUseBookStructureDefaults
                                            ? (isUsingBookStructureDefaults
                                                ? 'Applying chapter header + structure settings to this whole book.'
                                                : 'This chapter uses its own header + structure settings.')
                                            : 'This chapter is not linked to a Book, so settings apply only to this chapter.'}
                                    </div>
                                </div>
                                {canUseBookStructureDefaults && (
                                    <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-flex-shrink-0">
                                        <button
                                            type="button"
                                            className={`btn btn-small ${isUsingBookStructureDefaults ? '' : 'btn-secondary'}`}
                                            onClick={() => handleChapterStructureScopeModeChange('book')}
                                            aria-pressed={isUsingBookStructureDefaults ? 'true' : 'false'}
                                        >
                                            Use Book Defaults
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn btn-small ${!isUsingBookStructureDefaults ? '' : 'btn-secondary'}`}
                                            onClick={() => handleChapterStructureScopeModeChange('chapter')}
                                            aria-pressed={!isUsingBookStructureDefaults ? 'true' : 'false'}
                                        >
                                            Customize This Chapter
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="composer-chapter-settings-layout">
                                <section className="composer-chapter-settings-card" aria-label="Chapter header settings">
                                    <div className="composer-chapter-settings-card-header">
                                        <div className="composer-chapter-titleline tw-flex tw-items-center tw-gap-2 tw-text-sm">
                                            <span className="material-symbols-outlined" aria-hidden="true">title</span>
                                            <span>Chapter Header</span>
                                        </div>
                                        <button type="button" className="btn btn-small btn-secondary" onClick={handleApplyChapterTitleHeading}>
                                            Insert / Refresh Title
                                        </button>
                                    </div>

                                    <div className="composer-chapter-settings-card-body">
                                        <div className="composer-chapter-meta-panel" aria-label="Chapter metadata from book">
                                            <div className="composer-chapter-meta-item">
                                                <div className="composer-chapter-field-label">Chapter No.</div>
                                                <div className="composer-chapter-meta-value">{chapterNumberMeta ?? '-'}</div>
                                            </div>
                                            <div className="composer-chapter-meta-item">
                                                <div className="composer-chapter-field-label">Chapter Name</div>
                                                <div className="composer-chapter-meta-value">{chapterNameMeta || '-'}</div>
                                            </div>
                                        </div>

                                        <div className="composer-chapter-form-grid">
                                            <div className="composer-chapter-field composer-chapter-field--span-2">
                                                <label className="composer-chapter-field-label">Title Format</label>
                                                <select
                                                    className="selection-action-select"
                                                    value={normalizedChapterStructureConfig.titleTemplatePreset}
                                                    onChange={(event) => handleChapterStructureConfigChange({ titleTemplatePreset: event.target.value })}
                                                    aria-label="Chapter title format"
                                                >
                                                    <option value="chapter_number_title">Chapter No. + Name</option>
                                                    <option value="chapter_number_only">Chapter No. only</option>
                                                    <option value="chapter_title_only">Chapter Name only</option>
                                                    <option value="thai_chapter_number_title">Thai: บทที่ + ชื่อบท</option>
                                                    <option value="thai_chapter_number_only">Thai: บทที่</option>
                                                    <option value="custom">Custom template</option>
                                                </select>
                                            </div>

                                            {normalizedChapterStructureConfig.titleTemplatePreset === 'custom' && (
                                                <div className="composer-chapter-field composer-chapter-field--span-2">
                                                    <label className="composer-chapter-field-label">Custom Template</label>
                                                    <input
                                                        type="text"
                                                        className="selection-action-select"
                                                        value={normalizedChapterStructureConfig.titleTemplateCustom}
                                                        onChange={(event) => handleChapterStructureConfigChange({ titleTemplateCustom: event.target.value })}
                                                        placeholder="Chapter {number}: {title}"
                                                        aria-label="Custom chapter title template"
                                                    />
                                                </div>
                                            )}

                                        </div>

                                        <details className="composer-chapter-advanced-panel">
                                            <summary className="composer-chapter-advanced-summary">
                                                Style &amp; Preview
                                            </summary>
                                            <div className="composer-chapter-advanced-body">
                                                <div className="composer-chapter-form-grid">
                                                    <div className="composer-chapter-field">
                                                        <label className="composer-chapter-field-label">Align</label>
                                                        <select
                                                            className="selection-action-select"
                                                            value={normalizedChapterStructureConfig.titleAlign}
                                                            onChange={(event) => handleChapterStructureConfigChange({ titleAlign: event.target.value })}
                                                            aria-label="Chapter title alignment"
                                                        >
                                                            <option value="left">Left</option>
                                                            <option value="center">Center</option>
                                                            <option value="right">Right</option>
                                                        </select>
                                                    </div>

                                                    <div className="composer-chapter-field">
                                                        <label className="composer-chapter-field-label">Font Size</label>
                                                        <input
                                                            type="number"
                                                            min="14"
                                                            max="96"
                                                            step="1"
                                                            className="selection-action-select"
                                                            value={normalizedChapterStructureConfig.titleFontSizePx}
                                                            onChange={(event) => handleChapterStructureConfigChange({ titleFontSizePx: Number(event.target.value || 0) })}
                                                            aria-label="Chapter title font size"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="composer-chapter-preview-panel">
                                                    <div className="composer-chapter-field-label">Preview</div>
                                                    <div
                                                        className="composer-chapter-preview-value"
                                                        style={{
                                                            textAlign: normalizedChapterStructureConfig.titleAlign || 'left',
                                                            fontSize: `${normalizedChapterStructureConfig.titleFontSizePx || 32}px`
                                                        }}
                                                    >
                                                        {chapterTitlePreview}
                                                    </div>
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                </section>

                                <section className="composer-chapter-settings-card" aria-label="Structure settings">
                                    <div className="composer-chapter-settings-card-header">
                                        <div className="composer-chapter-titleline tw-flex tw-items-center tw-gap-2 tw-text-sm">
                                            <span className="material-symbols-outlined" aria-hidden="true">settings</span>
                                            <span>Structure Settings</span>
                                        </div>
                                    </div>

                                    <div className="composer-chapter-settings-card-body">
                                        <div className="composer-chapter-form-grid">
                                            <div className="composer-chapter-field">
                                                <label className="composer-chapter-field-label">Type</label>
                                                <select
                                                    className="selection-action-select"
                                                    value={normalizedChapterStructureConfig.segmentNoun}
                                                    onChange={(event) => handleChapterStructureConfigChange({ segmentNoun: event.target.value })}
                                                    aria-label="Structure segment type"
                                                >
                                                    <option value="scene">Scene</option>
                                                    <option value="section">Section</option>
                                                    <option value="custom">Custom label</option>
                                                    <option value="none">No label</option>
                                                </select>
                                            </div>

                                            {normalizedChapterStructureConfig.segmentNoun === 'custom' && (
                                                <div className="composer-chapter-field">
                                                    <label className="composer-chapter-field-label">Custom Label</label>
                                                    <input
                                                        type="text"
                                                        className="selection-action-select"
                                                        value={normalizedChapterStructureConfig.customSegmentNoun}
                                                        onChange={(event) => handleChapterStructureConfigChange({ customSegmentNoun: event.target.value })}
                                                        placeholder="e.g. Part"
                                                        aria-label="Custom segment label"
                                                    />
                                                </div>
                                            )}

                                            <div className="composer-chapter-field">
                                                <label className="composer-chapter-field-label">Marker</label>
                                                <select
                                                    className="selection-action-select"
                                                    value={normalizedChapterStructureConfig.segmentMarkerStyle}
                                                    onChange={(event) => handleChapterStructureConfigChange({ segmentMarkerStyle: event.target.value })}
                                                    aria-label="Segment marker style"
                                                >
                                                    <option value="heading">Heading</option>
                                                    <option value="divider">Divider</option>
                                                    <option value="symbol">Symbol</option>
                                                </select>
                                            </div>

                                            {normalizedChapterStructureConfig.segmentMarkerStyle === 'symbol' && (
                                                <div className="composer-chapter-field">
                                                    <label className="composer-chapter-field-label">Symbol</label>
                                                    <input
                                                        type="text"
                                                        className="selection-action-select"
                                                        value={normalizedChapterStructureConfig.segmentMarkerSymbol}
                                                        onChange={(event) => handleChapterStructureConfigChange({ segmentMarkerSymbol: event.target.value })}
                                                        placeholder="***"
                                                        aria-label="Segment marker symbol"
                                                    />
                                                </div>
                                            )}

                                            <div className="composer-chapter-field composer-chapter-field--span-2">
                                                <label className="composer-chapter-inline-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={normalizedChapterStructureConfig.implicitFirstSegment !== false}
                                                        onChange={(event) => handleChapterStructureConfigChange({ implicitFirstSegment: event.target.checked })}
                                                        aria-label="Implicit first segment without visible marker"
                                                    />
                                                    <span>
                                                        Implicit first segment (no visible marker at chapter start)
                                                    </span>
                                                </label>
                                            </div>
                                        </div>

                                        <details className="composer-chapter-advanced-panel">
                                            <summary className="composer-chapter-advanced-summary">
                                                Tips
                                            </summary>
                                            <div className="composer-chapter-advanced-body">
                                                <div className="composer-chapter-tip tw-text-xs">
                                                    Tip: ถ้าไม่อยากเห็นคำว่า Scene ให้เลือก <span className="composer-chapter-tip-emphasis">No label</span> และใช้ <span className="composer-chapter-tip-emphasis">Divider</span> หรือ <span className="composer-chapter-tip-emphasis">Symbol</span>
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    <details
                        className="composer-chapter-mentions-panel"
                        open={chapterMentionsExpanded}
                        onToggle={(event) => {
                            if (!(event.currentTarget instanceof HTMLDetailsElement)) return;
                            setChapterMentionsExpanded(event.currentTarget.open);
                        }}
                    >
                        <summary className="composer-chapter-mentions-summary">
                            <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-min-w-0">
                                <span className="material-symbols-outlined" aria-hidden="true">alternate_email</span>
                                <span>Mentions</span>
                            </span>
                            <span className="composer-chapter-mentions-summary-meta">
                                {composerMentionTracking.totalMentions > 0
                                    ? `${composerMentionTracking.totalMentions} mention${composerMentionTracking.totalMentions === 1 ? '' : 's'} • ${composerMentionTracking.uniqueItemCount} item${composerMentionTracking.uniqueItemCount === 1 ? '' : 's'}`
                                    : 'No mentions yet'}
                            </span>
                        </summary>

                        <div className="composer-chapter-mentions-body">
                            {composerMentionTopItemsPreview.length === 0 ? (
                                <div className="composer-chapter-muted tw-text-xs">
                                    ยังไม่พบชื่อ World item ใน chapter นี้
                                </div>
                            ) : (
                                <>
                                    <div className="composer-chapter-mentions-list" role="list" aria-label="Top mentioned world items in this chapter">
                                        {composerMentionTopItemsPreview.map((entry) => {
                                            const item = entry.item || null;
                                            const type = String(item?.type || 'note').trim().toLowerCase() || 'note';
                                            const subtype = String(item?.subtype || '').trim();
                                            const title = String(item?.title || 'World Item').trim() || 'World Item';
                                            return (
                                                <button
                                                    key={entry.id}
                                                    type="button"
                                                    className="composer-chapter-mention-row"
                                                    onClick={() => handleJumpToMentionItem(entry.id)}
                                                    title={`Jump to "${title}" mention`}
                                                    role="listitem"
                                                >
                                                    <span className="composer-chapter-mention-row__lead" aria-hidden="true">
                                                        <span className="material-symbols-outlined">
                                                            {getComposerMentionIconName(type, subtype)}
                                                        </span>
                                                    </span>
                                                    <span className="composer-chapter-mention-row__text">
                                                        <span className="composer-chapter-mention-row__title">{title}</span>
                                                        <span className="composer-chapter-mention-row__meta">
                                                            <span className={`composer-world-mention-pill composer-world-mention-pill--type composer-world-mention-pill--type-${type}`}>
                                                                {buildComposerMentionTypeLabel(type)}
                                                            </span>
                                                            {subtype && (
                                                                <span className="composer-world-mention-pill composer-world-mention-pill--subtype">
                                                                    {subtype}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                    <span className="composer-chapter-mention-row__count" aria-label={`${entry.count} mentions`}>
                                                        {entry.count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {composerMentionTopItems.length > composerMentionTopItemsPreview.length && (
                                        <div className="composer-chapter-muted tw-text-xs">
                                            +{composerMentionTopItems.length - composerMentionTopItemsPreview.length} more mentioned item{composerMentionTopItems.length - composerMentionTopItemsPreview.length === 1 ? '' : 's'}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </details>

                    {chapterOutlineExpanded && (
                        <div className="composer-chapter-outline-strip tw-flex tw-flex-wrap tw-gap-2">
                            {chapterSegmentIndex.segments.length > 0 ? chapterSegmentIndex.segments.map((segment) => {
                                const segmentMentionCount = Number(composerMentionTracking?.segmentCountsByKey?.[segment.key]) || 0;
                                const segmentUniqueMentions = Number(composerMentionTracking?.segmentUniqueByKey?.[segment.key]) || 0;
                                return (
                                    <button
                                        key={segment.key}
                                        type="button"
                                        className={`btn btn-small ${chapterSegmentIndex.activeSegmentKey === segment.key ? '' : 'btn-secondary'}`}
                                        onClick={() => handleJumpToSegment(segment)}
                                        title={`Jump to ${segment.title}${segmentMentionCount > 0 ? ` • ${segmentMentionCount} mention${segmentMentionCount === 1 ? '' : 's'}${segmentUniqueMentions > 0 ? ` • ${segmentUniqueMentions} item${segmentUniqueMentions === 1 ? '' : 's'}` : ''}` : ''}`}
                                    >
                                        <span>{segment.title}</span>
                                        {segmentMentionCount > 0 && (
                                            <span className="composer-chapter-outline-mention-count" aria-label={`${segmentMentionCount} mentions`}>
                                                {segmentMentionCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            }) : (
                                <button type="button" className="btn btn-small btn-secondary" onClick={handleInsertSegment}>
                                    {chapterSegmentIndex.segments.length === 0 ? `Create ${structureInsertButtonLabel.replace('+ ', '')}` : structureInsertButtonLabel}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
            <EditorContent editor={editor} className="composer-editor" />

            {composerMentionPopup.visible && composerMentionPopup.item && (
                <div
                    ref={composerMentionPopupRef}
                    className="composer-world-mention-popover"
                    role="dialog"
                    aria-label="World item mention details"
                    style={{ left: `${composerMentionPopup.x}px`, top: `${composerMentionPopup.y}px` }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        className="composer-world-mention-popover__close"
                        aria-label="Close mention details"
                        onClick={closeComposerMentionPopup}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">close</span>
                    </button>

                    <div className="composer-world-mention-popover__header">
                        {composerMentionPopup.item.thumbnailUrl ? (
                            <img
                                className="composer-world-mention-popover__thumb"
                                src={composerMentionPopup.item.thumbnailUrl}
                                alt={composerMentionPopup.item.title || 'World item thumbnail'}
                            />
                        ) : (
                            <div className="composer-world-mention-popover__icon" aria-hidden="true">
                                <span className="material-symbols-outlined">
                                    {getComposerMentionIconName(composerMentionPopup.item.type, composerMentionPopup.item.subtype)}
                                </span>
                            </div>
                        )}

                        <div className="composer-world-mention-popover__headmeta">
                            <div className="composer-world-mention-popover__eyebrow">
                                {composerMentionPopup.matchedText ? `Mention: ${composerMentionPopup.matchedText}` : 'Mentioned World Item'}
                            </div>
                            <div className="composer-world-mention-popover__title">
                                {composerMentionPopup.item.title || 'Untitled Item'}
                            </div>
                            <div className="composer-world-mention-popover__pills">
                                <span className={`composer-world-mention-pill composer-world-mention-pill--type composer-world-mention-pill--type-${String(composerMentionPopup.item.type || 'note').toLowerCase()}`}>
                                    {buildComposerMentionTypeLabel(composerMentionPopup.item.type)}
                                </span>
                                {composerMentionPopup.item.subtype && (
                                    <span className="composer-world-mention-pill composer-world-mention-pill--subtype">
                                        {composerMentionPopup.item.subtype}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {Array.isArray(composerMentionPopup.item.aliases) && composerMentionPopup.item.aliases.length > 0 && (
                        <div className="composer-world-mention-popover__aliases" title={composerMentionPopup.item.aliases.join(', ')}>
                            <span className="composer-world-mention-popover__label">Aliases</span>
                            <span className="composer-world-mention-popover__value">
                                {composerMentionPopup.item.aliases.slice(0, 6).join(', ')}
                                {composerMentionPopup.item.aliases.length > 6 ? ` +${composerMentionPopup.item.aliases.length - 6}` : ''}
                            </span>
                        </div>
                    )}

                    <div className="composer-world-mention-popover__body">
                        <div className="composer-world-mention-popover__label">Description</div>
                        <div className="composer-world-mention-popover__description">
                            {composerMentionPopup.item.description || 'No description yet.'}
                        </div>
                    </div>
                </div>
            )}

            {loadingState.isLoading && <ProcessingIndicator />}

            <div
                ref={selectionBarRef}
                className={`selection-action-bar ${selectionBarState.visible ? 'is-visible' : ''}`}
                aria-hidden={selectionBarState.visible ? 'false' : 'true'}
                style={{ left: selectionBarState.x, top: selectionBarState.y }}
                onMouseDown={(event) => {
                    if (event.target.closest('.selection-action-btn')) {
                        event.preventDefault();
                    }
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="selection-action-bar__label">Selected text</div>
                <select
                    className="selection-action-select"
                    value={selectionBarItemType}
                    onChange={(event) => setSelectionBarItemType(event.target.value)}
                    aria-label="Codex item type"
                >
                    <option value="note">Note</option>
                    <option value="entity">Entity</option>
                    <option value="place">Place</option>
                    <option value="rule">Rule</option>
                    <option value="event">Event</option>
                </select>
                <button type="button" className="selection-action-btn" onClick={handleAddSelectionToCodex}>
                    Add to Codex
                </button>
            </div>

            {menuState.visible && (
                <ComposerContextMenu
                    x={menuState.x}
                    y={menuState.y}
                    hasPendingSuggestion={hasPending}
                    onSelectAction={(action) => {
                        const actionKey = action.toLowerCase();
                        if (['accept', 'reject', 'rerun'].includes(actionKey)) {
                            if (actionKey === 'accept') handleAcceptSuggestion(editor);
                            if (actionKey === 'reject') handleRejectSuggestion(editor);
                        } else {
                            invokeAgent({ action: actionKey.replace('...', ''), editor });
                        }
                        handleCloseMenu();
                    }}
                />
            )}

            <InlineAgentInspector
                {...inspectorState}
                onClose={() => setInspectorState(prev => ({ ...prev, isVisible: false }))}
            />
        </div>
    );
}
