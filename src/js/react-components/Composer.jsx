/*File: src/js/react-components/Composer.jsx
 * Composer Component for Tiptap Editor
 * This component provides a rich text editor with various formatting options.
 */
import React, { useEffect, useState } from 'react';
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
import { invokeAgent } from '../modules/agent/agent.engine.js';
import ComposerContextMenu from './ComposerContextMenu.jsx';
import InlineAgentInspector from './InlineAgentInspector.jsx';
import { InstructionNode } from '../tiptap-extensions/InstructionNode.js';
import { SuggestionNode } from '../tiptap-extensions/SuggestionNode.js';

// ---------------------------------------------------------

// --- Toolbar Component (ฉบับสมบูรณ์) ---
const ComposerToolbar = ({ editor, onCollapse, onToggleMaximize, isMaximized, onExport, onToggleInspector }) => {
  
  if (!editor) return null;

  const [toolbarState, setToolbarState] = React.useState(0);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);

  React.useEffect(() => {
    const forceUpdate = () => setToolbarState(prev => prev + 1);
    editor.on('transaction', forceUpdate);
    editor.on('selectionUpdate', forceUpdate);
    return () => {
      editor.off('transaction', forceUpdate);
      editor.off('selectionUpdate', forceUpdate);
    };
  }, [editor]);


  const handleFontSizeChange = (e) => {
    const size = e.target.value;
    if (size) editor.chain().focus().setFontSize(size).run();
    else editor.chain().focus().unsetFontSize().run();
  };

  
  const currentFontSize = editor.getAttributes('textStyle').fontSize?.replace('px', '') || '';

  return (
    <>
      <div className="composer-header tw-flex tw-items-center tw-justify-between tw-p-2 tw-border-b tw-border-gray-700 tw-flex-wrap tw-gap-y-2">

        <div className="composer-title-area">
          <h3><span className="material-symbols-outlined">edit_square</span> Composer</h3>
        </div>
        <div className="composer-tools-area tw-flex tw-flex-wrap">
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
        <div className="composer-actions tw-flex-shrink-0">

          <button className="btn-icon" onClick={onToggleInspector} title="Toggle Prompt Inspector">
              <span className="material-symbols-outlined">bug_report</span>
          </button>

          <button className="btn-icon" onClick={onCollapse} title="Collapse">
              <span className="material-symbols-outlined">keyboard_arrow_down</span>
          </button>
          <button className="btn-icon" onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
              <span className="material-symbols-outlined">{isMaximized ? 'close_fullscreen' : 'fullscreen'}</span>
          </button>
          {/* --- [✅ เพิ่มเมนู Dropdown ที่นี่] --- */}
          <div className="dropdown align-right">
            <button 
              className="btn-icon" 
              onClick={(e) => e.currentTarget.parentElement.classList.toggle('open')}
              title="More Actions"
            >
              <span className="material-symbols-outlined">more_vert</span>
            </button>
            <div className="dropdown-content">
              <a href="#" onClick={(e) => { e.preventDefault(); setIsConfigOpen(true); }}>
                <span className="material-symbols-outlined">smart_toy</span>
                Configure Inline Agent
              </a>
              <div className="dropdown-divider"></div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof onExport === 'function') {
                    // เลือกได้ว่าจะส่ง editor ไปเลย หรือส่ง HTML/Text
                    onExport({
                      html: editor.getHTML(),
                      text: editor.getText(),
                      editor,
                    });
                  } else {
                    console.warn('onExport is not a function');
                  }
                }}
              >
                <span className="material-symbols-outlined">save</span>
                Export Content...
              </a>
            </div>
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

// --- Component หลัก ---
export default function Composer({ initialContent, onContentChange, onCollapse, onToggleMaximize, isMaximized, onExport, onReady }) {
    const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0 });
    const [loadingState, setLoadingState] = useState({ isLoading: false });
    const [hasPending, setHasPending] = useState(false);
    const [inspectorState, setInspectorState] = useState({ isVisible: false, systemPrompt: '', actionPrompt: '', userText: '' });
    const [isConfigOpen, setIsConfigOpen] = useState(false);

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
      // Underline, 
      // Blockquote,

      Hotkey.configure({
        shortcuts: [
          { hotkey: '\\', command: ({ editor: e }) => invokeAgent({ action: 'continue', editor: e }) },
          { hotkey: '=', command: ({ editor: e }) => handleAcceptSuggestion(e) },
          { hotkey: 'Mod-Shift-i', command: ({ editor: e }) => e.chain().focus().setInstructionNode().run() },
        ]
      }),
    ],

    content: initialContent || '',
        onUpdate: ({ editor }) => onContentChange(editor.getHTML()),
        onTransaction: ({ editor }) => {
            setHasPending(editor.isActive('suggestionNode', { 'data-status': 'pending' }));
        },
        onSelectionUpdate: ({ editor }) => {
            setHasPending(editor.isActive('suggestionNode', { 'data-status': 'pending' }));
        },
        editorProps: {
            handleDOMEvents: {
                contextmenu: (view, event) => {
                    event.preventDefault();
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
        if (editor && initialContent !== undefined && editor.getHTML() !== initialContent) {
            editor.commands.setContent(initialContent || '', false);
        }
    }, [initialContent, editor]);

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
        <div id="composer-panel" className="composer-panel tw-relative">
            <ComposerToolbar
                editor={editor}
                onCollapse={onCollapse}
                onToggleMaximize={onToggleMaximize}
                isMaximized={isMaximized}
                onExport={onExport}
                onToggleInspector={() => setInspectorState(prev => ({ ...prev, isVisible: !prev.isVisible }))}
            />
            <EditorContent editor={editor} className="composer-editor" />

            {loadingState.isLoading && <ProcessingIndicator />}

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