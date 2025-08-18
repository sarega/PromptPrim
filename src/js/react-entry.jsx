// src/js/react-entry.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';

// ฟังก์ชันนี้จะทำหน้าที่เป็นสะพาน
export function mountReactComponent(Component, props, targetElement) {
    const root = ReactDOM.createRoot(targetElement);
    
    // สร้างฟังก์ชัน unmount เพื่อให้ component ปิดตัวเองได้
    const unmount = () => root.unmount();

    root.render(
        <React.StrictMode>
            <Component {...props} unmount={unmount} />
        </React.StrictMode>
    );
}