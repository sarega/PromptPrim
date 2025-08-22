/* file: src/js/tiptap-extensions/hotkey.js */
import { Extension } from '@tiptap/core';

export const Hotkey = Extension.create({
  name: 'hotkey',

  addOptions() {
    return {
      // [แก้ไข] เปลี่ยนเป็น shortcuts array
      shortcuts: [], 
    };
  },

  addKeyboardShortcuts() {
    const shortcuts = {};
    
    // [แก้ไข] วนลูปเพื่อสร้าง shortcuts ทั้งหมด
    this.options.shortcuts.forEach(({ hotkey, command }) => {
      if (hotkey && command) {
        shortcuts[hotkey] = () => {
          command({ editor: this.editor });
          return true;
        };
      }
    });

    return shortcuts;
  },
});