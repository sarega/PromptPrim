import { Node, mergeAttributes } from '@tiptap/core';

export const InstructionNode = Node.create({
  name: 'instructionNode', // ชื่อของ Node

  group: 'block', // จัดกลุ่มเป็น Block Element

  content: 'block+', // อนุญาตให้มี Block Element อื่นๆ (เช่น <p>) อยู่ข้างในได้

  // กำหนดว่า HTML หน้าตาแบบไหนที่ควรจะถูกแปลงเป็น Node นี้
  parseHTML() {
    return [
      {
        tag: 'div[data-type="instruction-chunk"]',
      },
    ];
  },

  // กำหนดว่า Node นี้จะถูก Render ออกมาเป็น HTML หน้าตาแบบไหน
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'instruction-chunk' }), 0];
  },

  // เพิ่มคำสั่งใหม่ให้ Editor รู้จัก
  addCommands() {
    return {
      setInstructionNode: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          content: [
            {
              type: 'paragraph',
              // สามารถใส่ข้อความเริ่มต้นได้ถ้าต้องการ
            },
          ],
        });
      },
    };
  },
});