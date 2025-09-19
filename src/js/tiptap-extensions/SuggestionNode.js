import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export const SuggestionNode = Node.create({
  name: 'suggestionNode',
  group: 'block',
  content: 'block+',
  addAttributes() {
    return {
      'data-status': {
        default: 'pending',
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="suggestion-chunk"]',
        getAttrs: (element) => ({
          'data-status': element.getAttribute('data-status') || 'pending',
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'suggestion-chunk' }), 0];
  },

  // --- [✅ หัวใจของการแก้ไขอยู่ตรงนี้] ---
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('suggestionAutoAccept'),
        appendTransaction: (transactions, oldState, newState) => {
          let tr = newState.tr;
          let modified = false;

          // เราสนใจเฉพาะ Transaction ที่มีการเปลี่ยนแปลงเอกสาร
          if (!transactions.some(t => t.docChanged)) {
            return null;
          }

          // ตรวจสอบตำแหน่งที่มีการเปลี่ยนแปลง
          newState.doc.nodesBetween(0, newState.doc.content.size, (node, pos) => {
            if (node.type.name === this.name && node.attrs['data-status'] === 'pending') {
              // ค้นหา Node เดียวกันใน State เก่า
              const oldNode = oldState.doc.nodeAt(pos);
              
              // ตรวจสอบว่า Node นี้เพิ่งถูกสร้างขึ้นมาหรือไม่
              // ถ้า Node ใน State เก่าไม่มี หรือไม่ใช่ประเภทเดียวกัน แสดงว่าเป็น Node ใหม่
              const isNewlyCreated = !oldNode || oldNode.type.name !== this.name;
              
              // ตรวจสอบว่าเนื้อหาข้างในมีการเปลี่ยนแปลงหรือไม่
              const contentHasChanged = !oldNode || !oldNode.content.eq(node.content);

              // เงื่อนไข: จะเปลี่ยนสถานะก็ต่อเมื่อ
              // 1. มัน "ไม่ใช่" Node ที่เพิ่งสร้างขึ้นมา
              // 2. และเนื้อหา "มีการเปลี่ยนแปลง"
              if (!isNewlyCreated && contentHasChanged) {
                console.log("Change detected inside a pending suggestion. Accepting it.");
                tr.setNodeMarkup(pos, null, { ...node.attrs, 'data-status': 'accepted' });
                modified = true;
              }
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },

 // --- [✅ เพิ่ม/แก้ไข] ส่วน Commands ---
  addCommands() {
    return {
      setSuggestionNode: (content) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { 'data-status': 'pending' },
          content: content,
        });
      },
      // [✅ ใหม่] คำสั่งสำหรับ "ยอมรับ"
      acceptSuggestion: () => ({ state, dispatch }) => {
        const { selection } = state;
        const node = selection.$from.node(selection.$from.depth);
        if (node && node.type.name === this.name) {
          const startPos = selection.$from.start(selection.$from.depth);
          const endPos = startPos + node.nodeSize;
          // แทนที่ Node ทั้งก้อนด้วยเนื้อหาข้างใน
          dispatch(state.tr.replaceWith(startPos - 1, endPos, node.content));
          return true;
        }
        return false;
      },
      // [✅ ใหม่] คำสั่งสำหรับ "ปฏิเสธ"
      rejectSuggestion: () => ({ commands }) => {
        return commands.deleteSelection();
      },
    };
  },
});