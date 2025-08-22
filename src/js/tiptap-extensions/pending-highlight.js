/* file: src/js/tiptap-extensions/pending-highlight.js */
import { Mark, mergeAttributes } from '@tiptap/core';

export const PendingHighlight = Mark.create({
  name: 'pendingHighlight',

  addAttributes() {
    return {
      // สามารถเพิ่ม attribute อื่นๆ ได้ในอนาคต
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark',
        'data-pending': 'true',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes, { 'data-pending': 'true' }), 0];
  },

  addCommands() {
    return {
      setPendingHighlight: () => ({ commands }) => {
        return commands.setMark(this.name);
      },
      togglePendingHighlight: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
      unsetPendingHighlight: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});