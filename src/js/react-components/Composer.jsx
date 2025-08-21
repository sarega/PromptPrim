/*File: src/js/react-components/Composer.jsx
 * Composer Component for Tiptap Editor
 * This component provides a rich text editor with various formatting options.
 */
import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { FontSize } from '../tiptap-extensions/font-size.js';
import { exportComposerContent } from '../modules/composer/composer.handlers.js';

// ---------------------------------------------------------

// --- Toolbar Component (ฉบับสมบูรณ์) ---
const ComposerToolbar = ({ initialContent, onContentChange, editor, onCollapse, onToggleMaximize, isMaximized, onExport }) => {
  
  if (!editor) return null;

  const [toolbarState, setToolbarState] = React.useState(0);

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
    <div className="composer-header">
      <div className="composer-title-area">
        <h3><span className="material-symbols-outlined">edit_square</span> Composer</h3>
      </div>
      <div className="composer-tools-area">
        {/* Paragraph & Headings */}
        <button onClick={() => editor.chain().focus().setParagraph().run()} className={editor.isActive('paragraph') ? 'is-active' : ''} title="Paragraph">P</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} title="Heading 1">H1</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2">H2</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3">H3</button>
        
        <div className="toolbar-divider"></div>
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
        
        <div className="toolbar-divider"></div>

        <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={editor.isActive('highlight') ? 'btn-icon small is-active' : 'btn-icon small'} title="Highlight Text"><span className="material-symbols-outlined">ink_highlighter</span></button>
        {/* Color Picker */}
        <input type="color" onInput={event => editor.chain().focus().setColor(event.target.value).run()} value={editor.getAttributes('textStyle').color || '#000000'} title="Text Color"/>
        <button onClick={() => editor.chain().focus().unsetColor().run()} title="Reset Color">
            <span className="material-symbols-outlined">format_clear</span>
        </button>

        <div className="toolbar-divider"></div>

        {/* Text Styles */}
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'btn-icon small is-active' : 'btn-icon small'} title="Bold"><span className="material-symbols-outlined">format_bold</span></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'btn-icon small is-active' : 'btn-icon small'} title="Italic"><span className="material-symbols-outlined">format_italic</span></button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'btn-icon small is-active' : 'btn-icon small'} title="Underline"><span className="material-symbols-outlined">format_underlined</span></button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'btn-icon small is-active' : 'btn-icon small'} title="Strikethrough"><span className="material-symbols-outlined">format_strikethrough</span></button>

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
            <a href="#" onClick={(e) => { e.preventDefault(); alert('Configure Inline Agent - Coming Soon!'); }}>
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
  );
};

// --- Component หลัก ---
export default function Composer({ initialContent, onContentChange, onCollapse, onToggleMaximize, isMaximized, onExport, onReady }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Highlight,
      Placeholder.configure({ placeholder: 'พิมพ์ข้อความของคุณที่นี่...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => onContentChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const isContentDifferent = editor.getHTML() !== initialContent;
    if (isContentDifferent) {
      editor.commands.setContent(initialContent || '', false);
    }
  }, [initialContent, editor]);

  useEffect(() => {
      if (editor && onReady) {
        // ประกาศความสามารถของเราออกไปให้โลกภายนอกรู้
        const api = {
          appendContent: (htmlContent) => {
            if (!editor) return;
            // ตรวจสอบว่าถ้า editor มีเนื้อหาอยู่แล้ว ให้เพิ่มเส้นคั่นก่อน
            if (editor.getText().trim().length > 0) {
              editor.chain().focus().insertContent('<hr>').run();
            }
            // เพิ่มเนื้อหาใหม่เข้าไป และเลื่อน cursor ไปท้ายสุด
            editor.chain().focus().insertContent(htmlContent).run();
          },
        };
        // เรียกใช้ onReady เพื่อส่ง API ของเราออกไป
        onReady(api);
      }
    }, [editor, onReady]); // ให้ทำงานเมื่อ editor พร้อม

  return (
    <div id="composer-panel" className="composer-panel">
      <ComposerToolbar
        editor={editor}                  // ⬅️ ส่ง editor ให้ Toolbar
        onCollapse={onCollapse}
        onToggleMaximize={onToggleMaximize}
        isMaximized={isMaximized}
          onExport={() => {
          const html = editor?.getHTML() || '';
          const text = editor?.getText() || '';
          exportComposerContent({ html, text });   // ⬅️ ส่งเนื้อหาเข้า handler
          }}
      />
      <EditorContent editor={editor} className="composer-editor" />
    </div>
  );
}