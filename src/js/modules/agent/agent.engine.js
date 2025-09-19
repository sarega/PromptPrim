import { stateManager } from '../../core/core.state.js';
import { callLLM, getFullSystemPrompt, streamLLMResponse } from '../../core/core.api.js';
import { DOMParser } from "prosemirror-model";

// --- Prompt Templates (ที่เราจะนำไปเก็บใน Config ต่อไป) ---
const templates = {
  continue: `Instructions:\nContinue the story below without repeating the story unless it is for literary effect. Include only the text you are adding. You should read what is before the tag and match the same style and tone, so the next text fits into the narrative properly.\n\nStory: {{selection}}`,
  revise: `You will be doing a revision of text within the passage tags [passage][/passage]. You will include only text and not tags. Follow any instructions found in between [ ] inside of the passage.\n\n[passage]{{selection}}[/passage]\n\nAdditional instructions for the revision if available (Ignore if not found):\n{{instructions}}`,
  expand: `You are an expert prose editor...\n\n<instructions>{#if instructions}{instructions}{#else}Expand the text further by fleshing out the details...{/if}</instructions>\n\nOnly return the expanded text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  shorten: `You are an expert prose editor...\n\n{#if instructions}Shorten the prose to the following length: <instructions>{instructions}</instructions>{#else}Halve the length of the given prose.{/if}\n\nOnly return the condensed text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  rephrase: `You are an expert prose editor...\n\nRephrase it using the following instructions: <instructions>{instructions}</instructions>\n\nOnly return the rephrased text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  fromInstruction: `{{user_instructions}}\n\nRead the story so far for context:\n[STORY_CONTEXT]\n{{story_context}}\n[/STORY_CONTEXT]\n\nNow, expand on the following scene beat:\n[SCENE_BEAT]\n{{selection}}\n[/SCENE_BEAT]`,
};

/**
 * [✅ ใหม่] ฟังก์ชัน Helper สำหรับสร้าง User Prompt ที่สมบูรณ์
 * @param {object} context - ข้อมูล Context ที่รวบรวมมา
 * @returns {string} - User Prompt ที่พร้อมส่งให้ LLM
 */
function buildUserPrompt(context) {
  const { finalAction, selectionText, storyContext, instructions, config } = context;
  const template = templates[finalAction];
  if (!template) return '';
  const userInstructions = config.userInstructions || 'Expand the following scene beat into a full narrative scene. Match the existing tone and style.';
  return template
    .replace('{{selection}}', selectionText)
    .replace('{{story_context}}', storyContext)
    .replace('{{user_instructions}}', userInstructions)
    .replace('{{instructions}}', instructions);
}

/**
 * ฟังก์ชันหลักในการเรียกใช้ Inline Agent
 * @param {object} options
 * @param {'continue'|'revise'|'expand'|'shorten'|'rephrase'} options.action - ประเภทของคำสั่ง
 * @param {object} options.editor - instance ของ TipTap editor
 * @param {string} [options.instructions] - คำสั่งเพิ่มเติมจากผู้ใช้ (ถ้ามี)
 */

// export async function invokeAgent({ action, editor, instructions = '' }) {
//   if (!editor) return;

//   const { from, to, empty } = editor.state.selection;
//   let selectionText = editor.state.doc.textBetween(from, to, ' ');

//   if (action === 'continue') {
//     if (from <= 1) { // ใช้ <= 1 เพื่อเผื่อกรณีมีแค่ย่อหน้าว่าง
//         alert("Please type something first to continue.");
//         return;
//     }
//     selectionText = editor.state.doc.textBetween(0, from, '\n\n');
//   } else {
//     if (empty) {
//       alert("Please select text to revise.");
//       return;
//     }
//   }

//   let prompt = templates[action]
//     .replace('{{selection}}', selectionText)
//     .replace('{{instructions}}', instructions);
  
//   console.log("Final Prompt:", prompt);
  
//   const project = stateManager.getProject();
//   const agentName = project.activeEntity?.name;
//   const agent = project.agentPresets[agentName];
//   if (!agent) {
//     alert("Please select an active agent first.");
//     return;
//   }
  
//     const systemPrompt = agent.systemPrompt; // ดึง System Prompt
//   const actionPrompt = templates[action];  // ดึง Action Template

//   let finalPrompt = actionPrompt
//     .replace('{{selection}}', selectionText)
//     .replace('{{instructions}}', instructions);

//   // --- [✅ เพิ่ม] ส่ง Event พร้อมข้อมูล Prompt ทั้งหมด ---
//   stateManager.bus.publish('composer:promptConstructed', {
//     systemPrompt,
//     actionPrompt,
//     userText: selectionText,
//   });
//   // --------------------------------------------------

//   stateManager.bus.publish('composer:setLoading', { isLoading: true });

//  try {
//     const response = await callLLM(agent, [{ role: 'user', content: `${systemPrompt}\n\n${finalPrompt}` }]);
    
//     const resultText = response.content.trim();
    
//     // สร้าง HTML ที่ถูกต้อง โดยห่อทุกย่อหน้าด้วย <p> (วิธีนี้ยังคงดีที่สุด)
//     const resultHtml = resultText
//       .split('\n')
//       .filter(p => p.trim() !== '')
//       .map(paragraph => `<p>${paragraph}</p>`)
//       .join('');

//     // --- [✅ หัวใจของการแก้ไข] ---
//     let transaction = editor.state.tr;
//     const startPos = from;

//     // 1. ลบข้อความเดิม (ถ้าจำเป็น)
//     if (action !== 'continue' && !empty) {
//       transaction.delete(from, to);
//     }
    
//     // 2. แปลง HTML string ให้เป็น Node ที่ TipTap รู้จัก
//     const tempDiv = document.createElement('div');
//     tempDiv.innerHTML = resultHtml;
//     const slice = DOMParser.fromSchema(editor.schema).parseSlice(tempDiv);
    
//     // 3. แทรก Node ใหม่เข้าไป และ "จำ" ตำแหน่งใหม่ที่เกิดขึ้น
//     transaction.replace(startPos, startPos, slice);
    
//     // 4. คำนวณตำแหน่งสิ้นสุดใหม่จาก Transaction โดยตรง (แม่นยำที่สุด)
//     const endPos = transaction.selection.$head.pos;
    
//     // 5. เพิ่ม Mark 'pendingHighlight' ในขอบเขตที่ถูกต้อง
//     const mark = editor.schema.marks.pendingHighlight.create();
//     transaction.addMark(startPos, endPos, mark);
    
//     // 6. สั่งให้ Editor ทำงานตาม Transaction
//     editor.view.dispatch(transaction);
//     // ------------------------------------

//   } catch (error) {
//     console.error("Inline Agent Error:", error);
//     alert(`An error occurred: ${error.message}`);
//   } finally {
//     stateManager.bus.publish('composer:setLoading', { isLoading: false });
//   }
// }

export async function invokeAgent({ action, editor, instructions = '' }) {
  if (!editor) return;
  const project = stateManager.getProject();
  if (!project) return;
  
  // 1. ดึง Agent ที่ Active อยู่มาเป็นอันดับแรก
  const agentName = project.activeEntity?.name;
  const agent = project.agentPresets[agentName];
  if (!agent) {
    alert("Please select an active agent first.");
    return;
  }

  // 2. ประกาศและกำหนดค่าเริ่มต้นให้ตัวแปรทั้งหมด
  const { from, to, empty } = editor.state.selection;
  const $pos = editor.state.selection.$from;
  
  let finalAction = action;
  let storyContext = '';
  let selectionText = editor.state.doc.textBetween(from, to, ' ');
  let insertPosition = { from, to }; // <-- กำหนดค่าเริ่มต้นที่นี่

  // 3. ตรวจสอบ Context และกำหนดค่าตัวแปร
  const nodeBefore = $pos.nodeBefore;
  if (action === 'continue' && nodeBefore && nodeBefore.type.name === 'instructionNode') {
    // กรณีที่ 1: กด Continue ต่อท้าย User Chunk
    finalAction = 'fromInstruction';
    selectionText = nodeBefore.textContent; // Scene Beat
    storyContext = editor.state.doc.textBetween(0, $pos.pos - nodeBefore.nodeSize, '\n\n');
    insertPosition = { from: $pos.pos, to: $pos.pos };
  } else if (action === 'continue') {
    // กรณีที่ 2: กด Continue ที่ข้อความปกติ
    if (from <= 1) { alert("Please type something first."); return; }
    storyContext = editor.state.doc.textBetween(0, from, '\n\n');
  } else if (empty) {
    // กรณีที่ 3: เรียก Action อื่นๆ แต่ยังไม่ได้เลือกข้อความ
    alert(`Please select text to ${action}.`);
    return;
  }

  // 4. สร้าง Prompt ทั้งหมด
  const config = project.globalSettings?.inlineAgentConfig || {};
  const userPrompt = buildUserPrompt({
    finalAction, selectionText, storyContext, instructions, config
  });
  const systemPrompt = getFullSystemPrompt(agentName);

  stateManager.bus.publish('composer:promptConstructed', {
    systemPrompt, actionPrompt: templates[finalAction], userText: `[STORY_CONTEXT]\n${storyContext}\n\n[SELECTION/BEAT]\n${selectionText}`
  });
  stateManager.bus.publish('composer:setLoading', { isLoading: true });

  try {
    // 5. เรียก LLM และจัดการผลลัพธ์
    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
    const response = await callLLM(agent, messages);
    const resultText = response.content.trim();
    
    const resultHtmlContent = resultText
      .split('\n')
      .filter(p => p.trim() !== '')
      .map(p => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }));

    // ใช้ .chain() เพื่อความปลอดภัย
    editor.chain().focus()
      .insertContentAt(insertPosition, {
        type: 'suggestionNode',
        attrs: { 'data-status': 'pending' },
        content: resultHtmlContent,
      })
      .run();

  } catch (error) {
    console.error("Inline Agent Error:", error);
    alert(`An error occurred: ${error.message}`);
  } finally {
    stateManager.bus.publish('composer:setLoading', { isLoading: false });
  }
}