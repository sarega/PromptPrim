// src/js/react-entry.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

// สร้าง object เพื่อเก็บ "Root" ที่เคยสร้างไว้แล้ว
// Key คือ ID ของ Element, Value คือ instance ของ Root
const roots = {};

// สร้าง "ผู้จัดการ" ของเรา
export const ReactBridge = {
  /**
   * Mounts a React component into a target element.
   * If the element has been used before, it re-renders the component.
   * @param {React.ComponentType} Component - The React component to render.
   * @param {object} props - The props to pass to the component.
   * @param {HTMLElement} targetElement - The DOM element to render into.
   */
  mount(Component, props, targetElement) {
    if (!targetElement) return;

    const targetId = targetElement.id;
    if (!targetId) {
      console.error("ReactBridge Error: Target element must have an ID.");
      return;
    }

    // 1. ตรวจสอบว่าเคยสร้าง Root บน Element นี้แล้วหรือยัง
    let root = roots[targetId];

    // 2. ถ้ายังไม่เคย ให้สร้างใหม่แล้วจำไว้
    if (!root) {
      root = ReactDOM.createRoot(targetElement);
      roots[targetId] = root;
    }
    
    // 3. สั่ง Render (หรือ Re-render) Component ด้วย props ใหม่
    // unmount function จะถูกส่งไปเป็น prop โดยอัตโนมัติ
    root.render(
      <React.StrictMode>
        <Component {...props} unmount={() => this.unmount(targetElement)} />
      </React.StrictMode>
    );
  },

  /**
   * Unmounts a React component from a target element.
   * @param {HTMLElement} targetElement - The DOM element to unmount from.
   */
  unmount(targetElement) {
    if (!targetElement || !targetElement.id) return;
    
    const root = roots[targetElement.id];
    if (root) {
      root.unmount();
      delete roots[targetElement.id]; // ลบออกจากหน่วยความจำ
    }
  }
};