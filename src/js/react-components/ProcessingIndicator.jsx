// file: src/js/react-components/ProcessingIndicator.jsx
import React, { useState, useEffect } from 'react';

export default function ProcessingIndicator() {
  const text = "Processing...";
  const [activeIndex, setActiveIndex] = useState(0);

  // useEffect จะทำงานครั้งเดียวเพื่อสร้าง "Loop" ของ Animation
  useEffect(() => {
    const interval = setInterval(() => {
      // วน index ของตัวอักษรไปเรื่อยๆ (0 -> 1 -> 2 -> ... -> 0)
      setActiveIndex((current) => (current + 1) % text.length);
    }, 150); // ความเร็วในการสลับตัวอักษร (ปรับค่าได้)

    // Cleanup function: หยุดการทำงานของ interval เมื่อ component ถูกทำลาย
    return () => clearInterval(interval);
  }, [text.length]); // ให้ re-run effect ถ้าความยาวของ text เปลี่ยน (ซึ่งในที่นี้คือไม่เปลี่ยน)

  return (
    // [✅ แก้ไข] Overlay หลัก: ทำให้เต็มจอและอยู่กลางเสมอ
    <div className="tw-fixed tw-inset-0 tw-z-[12000] tw-flex tw-items-center tw-justify-center tw-bg-slate-900/60 tw-backdrop-blur-sm">
      <div className="tw-flex tw-items-center tw-gap-2 tw-bg-slate-800/80 tw-text-white tw-px-4 tw-py-2 tw-rounded-lg tw-shadow-xl">
        {/* Spinner (ยังคงไว้) */}
        <div className="tw-w-4 tw-h-4 tw-border-2 tw-border-white tw-border-t-transparent tw-rounded-full tw-animate-spin"></div>
        
        {/* [✅ ใหม่] Text Animation */}
        <div className="tw-text-lg tw-font-semibold tw-flex">
          {text.split('').map((char, index) => (
            <span
              key={index}
              className={`tw-transition-transform tw-duration-150 ${activeIndex === index ? 'tw-scale-125 tw-text-cyan-300' : 'tw-scale-100'}`}
              style={{ display: 'inline-block' }} // จำเป็นสำหรับ transform
            >
              {char === ' ' ? '\u00A0' : char} {/* แปลง space เป็น non-breaking space */}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}