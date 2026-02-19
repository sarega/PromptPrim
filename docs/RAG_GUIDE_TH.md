# คู่มือการใช้งาน RAG ใน PromptPrim

อัปเดตล่าสุด: 19 กุมภาพันธ์ 2026  
เอกสารนี้อธิบายการใช้งาน RAG (Retrieval-Augmented Generation) ของ PromptPrim จากฟีเจอร์ที่มีอยู่จริงในระบบปัจจุบัน

## 1) RAG คืออะไรใน PromptPrim

RAG ใน PromptPrim คือการให้ระบบดึงข้อมูลจาก `Knowledge Files` ที่อัปโหลดไว้ในโปรเจกต์ แล้วแนบ context เข้าไปก่อนส่ง prompt ไปยัง LLM เพื่อให้ตอบแม่นขึ้นและอ้างอิงแหล่งที่มาได้

ในเวอร์ชันนี้:
- ใช้ embedding แบบ local (`local-hash-v1`) ภายในแอป
- เก็บ index อยู่ในโปรเจกต์เดียวกัน (ไม่ต้องมี vector DB ภายนอก)
- มี Source chip และ Debug panel ในคำตอบของ Assistant

## 2) Quick Start (เริ่มใช้งานเร็ว)

1. เปิด `Agent & Asset Studio` (แถบขวา)
2. ไปที่หัวข้อ `Knowledge Files`
3. กด `Upload Files...` แล้วเลือกไฟล์
4. รอให้สถานะไฟล์เป็น `Indexed` และมีจำนวน `chunk(s)` มากกว่า 0
5. ตั้งค่า RAG ของ session ปัจจุบัน:
   - `Scope`: All files หรือ Selected files only
   - `Top-K`
   - `Token Budget`
6. กลับไปถามคำถามในแชทตามปกติ
7. ดู `Sources` ใต้คำตอบ และกด chip เพื่อกระโดดไป preview chunk ต้นฉบับใน Knowledge section

## 3) การตั้งค่า RAG (ระดับ Session)

การตั้งค่าต่อไปนี้เป็น **ต่อ session** ไม่ใช่ global ทั้งโปรเจกต์:
- `Scope`
  - `All files`: ดึงจากไฟล์ทั้งหมดในโปรเจกต์
  - `Selected files only`: ดึงเฉพาะไฟล์ที่ติ๊กเลือก
- `Top-K`
  - จำนวน chunk ที่คัดเลือกสูงสุด
  - ช่วงที่รองรับ: `1 - 12`
- `Token Budget`
  - งบ token สูงสุดสำหรับ context ที่ดึงมา
  - ช่วงที่รองรับ: `200 - 10000`

หมายเหตุ:
- ค่า default ของ session ใหม่คือ `Scope=all`, `Top-K=6`, `Token Budget=1800`
- การลบไฟล์จะลบไฟล์นั้นออกจาก selected scope ของทุก session อัตโนมัติ

## 4) Source Chip และ Preview Chunk

เมื่อ Assistant ใช้ข้อมูลจาก RAG จะมีแถบ `Sources:` ใต้ข้อความ

- แต่ละ chip แสดงรูปแบบ `filename #chunkN`
- คลิก chip แล้วระบบจะ:
  1. เปิด sidebar ขวา (ถ้าปิดอยู่)
  2. โฟกัสไฟล์เป้าหมายใน `Knowledge Files`
  3. เลื่อนไปตำแหน่งไฟล์นั้น
  4. แสดง `Focused source: #chunkN` พร้อมข้อความ chunk ต้นฉบับ

สามารถกดปุ่ม `x` ใน preview เพื่อ clear focus ได้

## 5) RAG Debug Panel

ใน Assistant bubble จะมีปุ่ม `RAG Debug` (ไอคอน dataset)

ข้อมูลที่แสดง:
- query ที่ใช้ดึง
- scope / top-k / budget
- จำนวน candidate และจำนวน chunk ที่ใช้งานจริง
- token ที่ใช้จริง
- รายการ chunk พร้อม score และ excerpt

reason ที่พบบ่อย:
- `ok`: ดึง context ได้ปกติ
- `empty_query`: ไม่มีข้อความ query ที่เหมาะสมให้ดึง
- `no_index`: ยังไม่มี knowledge index
- `scope_has_no_chunks`: scope ที่ตั้งไว้ไม่มี chunk ให้ใช้
- `no_similarity_match`: ไม่มี chunk ที่คะแนน similarity มากกว่า 0
- `budget_limited`: token budget จำกัดจนใส่ chunk ไม่ได้

## 6) ประเภทไฟล์และข้อจำกัดสำคัญ

### 6.1 ไฟล์ที่ระบบ index เพื่อใช้ RAG
รองรับไฟล์ข้อความ:
- `.txt`, `.md`, `.markdown`, `.csv`, `.json`, `.log`, `.xml`, `.yaml`, `.yml`

### 6.2 ไฟล์ที่อัปโหลดได้แต่ยังไม่ถูก index
- `.pdf`, `.doc`, `.docx` (สถานะเป็น `Binary`, ยังไม่เข้า RAG)

### 6.3 ข้อจำกัดปริมาณ
- ขนาดไฟล์สูงสุดต่อไฟล์: `25 MB`
- เก็บข้อความสูงสุดต่อไฟล์: `500,000 ตัวอักษร` (เกินจะถูกตัดและมี note)
- Chunking:
  - target ~`1200` ตัวอักษร/chunk
  - overlap `180` ตัวอักษร
  - สูงสุด `500` chunk/ไฟล์

### 6.4 เงื่อนไขอื่น
- กันไฟล์ซ้ำด้วยคีย์ `(name + size + lastModified)`
- ไฟล์ที่ไม่มี textContent จะไม่ถูก index

## 7) การทำงานร่วมกับ Session และ LLM

### โปรเจกต์ vs Session
- `Knowledge Files` และ `knowledge index` เป็นระดับ **โปรเจกต์**
  - ทุก session ในโปรเจกต์เดียวกันแชร์ชุดความรู้เดียวกัน
- ค่า `RAG settings` เป็นระดับ **session**
  - แต่ละ session ปรับ scope/top-k/token แยกกันได้

### เปลี่ยนโมเดล LLM กระทบ RAG ไหม
- โดยตรง: **ไม่กระทบ index**
- โดยอ้อม: อาจทำให้คุณภาพการตอบต่างกัน เพราะคนตอบเปลี่ยน แต่ retrieval pipeline เดิม

## 8) Best Practices

- ใช้ไฟล์ข้อความที่สะอาดและมีโครงสร้างชัดเจน
- ถ้าข้อมูลเฉพาะทางมาก ให้ตั้ง `Scope=Selected files only` แล้วติ๊กเฉพาะไฟล์ที่เกี่ยวข้อง
- เริ่มจาก `Top-K=4-6`, `Token Budget=1200-2200` แล้วค่อยปรับตามความยาวคำตอบ
- ใช้ RAG Debug ช่วยดูว่าไม่ได้ context เพราะอะไร ก่อนปรับพารามิเตอร์

## 9) Troubleshooting แบบเร็ว

### ไม่ขึ้น Sources ใต้คำตอบ
- ตรวจว่าไฟล์มีสถานะ `Indexed` และ `chunk(s) > 0`
- ตรวจ `Scope` ว่าไม่จำกัดจนไม่มีไฟล์
- ตรวจใน RAG Debug ว่า reason เป็นอะไร

### ขึ้น `scope_has_no_chunks`
- อยู่ในโหมด `Selected files only` แต่ยังไม่ได้ติ๊กไฟล์ หรือไฟล์ที่ติ๊กไม่มี chunk

### ขึ้น `budget_limited`
- เพิ่ม `Token Budget` หรือ ลด `Top-K`

### ข้อมูลใหม่ไม่ถูกใช้
- กด `Re-index` ที่ไฟล์ หรือ `Re-index All`

---

ถ้าต้องการต่อยอดเอกสารนี้ แนะนำเพิ่ม:
- ชุดตัวอย่างคำถาม/คำตอบจริงแบบ domain-specific
- นโยบายการเตรียมไฟล์ก่อนอัปโหลด (data hygiene checklist)
