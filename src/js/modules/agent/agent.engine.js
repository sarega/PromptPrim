import { stateManager } from '../../core/core.state.js';
import { callLLM, getFullSystemPrompt, streamLLMResponse } from '../../core/core.api.js';
import { buildWorldStructuredContextPack } from '../world/world.retrieval.js';

// --- Prompt Templates (ที่เราจะนำไปเก็บใน Config ต่อไป) ---
const templates = {
  continue: `Instructions:\nContinue the story below without repeating the story unless it is for literary effect. Include only the text you are adding. You should read what is before the tag and match the same style and tone, so the next text fits into the narrative properly.\n\nStory: {{selection}}`,
  revise: `You will be doing a revision of text within the passage tags [passage][/passage]. You will include only text and not tags. Follow any instructions found in between [ ] inside of the passage.\n\n[passage]{{selection}}[/passage]\n\nAdditional instructions for the revision if available (Ignore if not found):\n{{instructions}}`,
  expand: `You are an expert prose editor...\n\n<instructions>{#if instructions}{instructions}{#else}Expand the text further by fleshing out the details...{/if}</instructions>\n\nOnly return the expanded text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  shorten: `You are an expert prose editor...\n\n{#if instructions}Shorten the prose to the following length: <instructions>{instructions}</instructions>{#else}Halve the length of the given prose.{/if}\n\nOnly return the condensed text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  rephrase: `You are an expert prose editor...\n\nRephrase it using the following instructions: <instructions>{instructions}</instructions>\n\nOnly return the rephrased text, nothing else.\n\n[passage]{{selection}}[/passage]`,
  fromInstruction: `{{user_instructions}}\n\nRead the story so far for context:\n[STORY_CONTEXT]\n{{story_context}}\n[/STORY_CONTEXT]\n\nNow, expand on the following scene beat:\n[SCENE_BEAT]\n{{selection}}\n[/SCENE_BEAT]`,
};

function getActiveSession(project) {
  if (!project?.activeSessionId) return null;
  return Array.isArray(project.chatSessions)
    ? (project.chatSessions.find(session => session?.id === project.activeSessionId) || null)
    : null;
}

function extractMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? (part.text || '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch (_error) {
      return String(content);
    }
  }
  return '';
}

function buildInlineAgentWorldContext(project, session, { action, selectionText, instructions }) {
  if (!project || !session?.bookId) {
    return {
      injected: false,
      text: '',
      itemCount: 0,
      mode: null,
      asOfChapter: null,
      worldName: null,
      bookName: null,
    };
  }

  const recentChatText = Array.isArray(session.history)
    ? session.history
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .slice(-6)
      .map((message) => extractMessageText(message.content))
      .filter(Boolean)
      .join('\n')
    : '';

  const selectionSample = String(selectionText || '');
  const queryText = [
    `inline-agent action: ${String(action || '')}`,
    String(instructions || ''),
    selectionSample.length > 1600 ? selectionSample.slice(-1600) : selectionSample,
    recentChatText.length > 1200 ? recentChatText.slice(-1200) : recentChatText
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const contextPack = buildWorldStructuredContextPack(project, session, {
      queryText,
      maxItems: 10
    });
    if (!contextPack?.enabled || !contextPack?.contextText) {
      return {
        injected: false,
        text: '',
        itemCount: 0,
        mode: contextPack?.access?.mode || null,
        asOfChapter: contextPack?.access?.asOfChapter ?? null,
        worldName: contextPack?.world?.name || null,
        bookName: contextPack?.book?.name || null,
      };
    }
    return {
      injected: true,
      text: String(contextPack.contextText || ''),
      itemCount: Number(contextPack?.diagnostics?.selectedItemCount) || 0,
      mode: contextPack?.access?.mode || null,
      asOfChapter: contextPack?.access?.asOfChapter ?? null,
      worldName: contextPack?.world?.name || null,
      bookName: contextPack?.book?.name || null,
    };
  } catch (error) {
    console.warn('Inline Agent world context build failed:', error);
    return {
      injected: false,
      text: '',
      itemCount: 0,
      mode: null,
      asOfChapter: null,
      worldName: null,
      bookName: null,
    };
  }
}

function findInstructionContextForContinue(editor) {
  if (!editor?.state?.selection) return null;
  const { state } = editor;
  const { selection, doc } = state;
  const { $from } = selection;

  const buildFromNode = (node, nodePos) => {
    if (!node || node.type?.name !== 'instructionNode') return null;
    const from = Number(nodePos);
    const to = from + node.nodeSize;
    const instructionText = doc.textBetween(from + 1, to - 1, '\n\n').trim() || String(node.textContent || '').trim();
    if (!instructionText) return null;
    return {
      source: 'instructionNode',
      instructionText,
      storyContext: doc.textBetween(0, from, '\n\n'),
      insertRange: { from: to, to },
      instructionRange: { from, to },
    };
  };

  // Case 1: caret is inside an instruction chunk.
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node?.type?.name !== 'instructionNode') continue;
    return buildFromNode(node, $from.before(depth));
  }

  // Case 2: caret is immediately after an instruction chunk.
  const nodeBefore = $from.nodeBefore;
  if (nodeBefore?.type?.name === 'instructionNode') {
    return buildFromNode(nodeBefore, selection.from - nodeBefore.nodeSize);
  }

  // Case 3: caret is immediately before an instruction chunk.
  const nodeAfter = $from.nodeAfter;
  if (nodeAfter?.type?.name === 'instructionNode') {
    return buildFromNode(nodeAfter, selection.from);
  }

  return null;
}

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

export async function invokeAgent({ action, editor, instructions = '' }) {
  if (!editor) return;

  const { from, to, empty } = editor.state.selection;
  const project = stateManager.getProject();
  if (!project) {
    alert("No project is loaded.");
    return;
  }

  let finalAction = action;
  let storyContext = '';
  let selectionText = editor.state.doc.textBetween(from, to, ' ');
  let insertRange = { from, to };

  if (action === 'continue') {
    const instructionContext = findInstructionContextForContinue(editor);
    if (instructionContext) {
      finalAction = 'fromInstruction';
      selectionText = instructionContext.instructionText;
      storyContext = instructionContext.storyContext;
      insertRange = instructionContext.insertRange;
    } else {
      if (from <= 1) { // ใช้ <= 1 เพื่อเผื่อกรณีมีแค่ย่อหน้าว่าง
        alert("Please type something first to continue.");
        return;
      }
      selectionText = editor.state.doc.textBetween(0, from, '\n\n');
      storyContext = selectionText;
      insertRange = { from, to: from };
    }
  } else if (empty) {
    alert(`Please select text to ${action}.`);
    return;
  }

  const agentName = project.activeEntity?.name;
  const agent = project.agentPresets[agentName];
  if (!agent) {
    alert("Please select an active agent first.");
    return;
  }
  
  const config = project.globalSettings?.inlineAgentConfig || {};
  const systemPrompt = agent.systemPrompt; // ดึง System Prompt
  const actionPrompt = templates[finalAction] || templates[action];  // ดึง Action Template

  let finalPrompt = buildUserPrompt({
    finalAction,
    selectionText,
    storyContext,
    instructions,
    config
  });
  if (!finalPrompt) {
    finalPrompt = (templates[action] || '')
      .replace('{{selection}}', selectionText)
      .replace('{{instructions}}', instructions);
  }

  const activeSession = getActiveSession(project);
  const worldContext = buildInlineAgentWorldContext(project, activeSession, {
    action: finalAction,
    selectionText,
    instructions
  });
  const worldContextText = String(worldContext?.text || '');
  if (worldContextText) {
    finalPrompt = `${finalPrompt}\n\n[WORLD_CONTEXT]\n${worldContextText}\n[/WORLD_CONTEXT]\n\nUse the WORLD_CONTEXT as canonical chapter/book context. Do not contradict it.`;
  }

  // --- [✅ เพิ่ม] ส่ง Event พร้อมข้อมูล Prompt ทั้งหมด ---
  stateManager.bus.publish('composer:promptConstructed', {
    systemPrompt,
    actionPrompt,
    userText: finalAction === 'fromInstruction'
      ? `[SCENE_BEAT]\n${selectionText}\n\n[STORY_CONTEXT]\n${storyContext}`
      : selectionText,
    finalAction,
    worldContextInjected: worldContext?.injected === true,
    worldContextText,
    worldContextItemCount: Number(worldContext?.itemCount) || 0,
    worldContextMode: worldContext?.mode || null,
    worldContextAsOfChapter: worldContext?.asOfChapter ?? null,
    worldContextWorldName: worldContext?.worldName || null,
    worldContextBookName: worldContext?.bookName || null,
  });
  // --------------------------------------------------

  stateManager.bus.publish('composer:setLoading', { isLoading: true });

 try {
    const response = await callLLM(agent, [{ role: 'user', content: `${systemPrompt}\n\n${finalPrompt}` }]);
    
    const resultText = response.content.trim();
    const resultBlocks = resultText
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '')
      .map((paragraph) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph }],
      }));

    const suggestionContent = resultBlocks.length > 0
      ? resultBlocks
      : [{ type: 'paragraph' }];

    editor
      .chain()
      .focus()
      .insertContentAt(insertRange, {
        type: 'suggestionNode',
        attrs: { 'data-status': 'pending' },
        content: suggestionContent,
      })
      .run();

    // Keep cursor inside the inserted pending chunk so user can edit immediately,
    // and Decisions (Accept/Reject) become available right away.
    const insertedNode = editor.state.doc.nodeAt(insertRange.from);
    if (insertedNode?.type?.name === 'suggestionNode') {
      const innerTextPos = Math.min(insertRange.from + 2, Math.max(1, editor.state.doc.content.size));
      editor.chain().focus().setTextSelection(innerTextPos).run();
    }

  } catch (error) {
    console.error("Inline Agent Error:", error);
    alert(`An error occurred: ${error.message}`);
  } finally {
    stateManager.bus.publish('composer:setLoading', { isLoading: false });
  }
}

// export async function invokeAgent({ action, editor, instructions = '' }) {
//   if (!editor) return;
//   const project = stateManager.getProject();
//   if (!project) return;
  
//   // 1. ดึง Agent ที่ Active อยู่มาเป็นอันดับแรก
//   const agentName = project.activeEntity?.name;
//   const agent = project.agentPresets[agentName];
//   if (!agent) {
//     alert("Please select an active agent first.");
//     return;
//   }

//   // 2. ประกาศและกำหนดค่าเริ่มต้นให้ตัวแปรทั้งหมด
//   const { from, to, empty } = editor.state.selection;
//   const $pos = editor.state.selection.$from;
  
//   let finalAction = action;
//   let storyContext = '';
//   let selectionText = editor.state.doc.textBetween(from, to, ' ');
//   let insertPosition = { from, to }; // <-- กำหนดค่าเริ่มต้นที่นี่

//   // 3. ตรวจสอบ Context และกำหนดค่าตัวแปร
//   const nodeBefore = $pos.nodeBefore;
//   if (action === 'continue' && nodeBefore && nodeBefore.type.name === 'instructionNode') {
//     // กรณีที่ 1: กด Continue ต่อท้าย User Chunk
//     finalAction = 'fromInstruction';
//     selectionText = nodeBefore.textContent; // Scene Beat
//     storyContext = editor.state.doc.textBetween(0, $pos.pos - nodeBefore.nodeSize, '\n\n');
//     insertPosition = { from: $pos.pos, to: $pos.pos };
//   } else if (action === 'continue') {
//     // กรณีที่ 2: กด Continue ที่ข้อความปกติ
//     if (from <= 1) { alert("Please type something first."); return; }
//     storyContext = editor.state.doc.textBetween(0, from, '\n\n');
//   } else if (empty) {
//     // กรณีที่ 3: เรียก Action อื่นๆ แต่ยังไม่ได้เลือกข้อความ
//     alert(`Please select text to ${action}.`);
//     return;
//   }

//   // 4. สร้าง Prompt ทั้งหมด
//   const config = project.globalSettings?.inlineAgentConfig || {};
//   const userPrompt = buildUserPrompt({
//     finalAction, selectionText, storyContext, instructions, config
//   });
//   const systemPrompt = getFullSystemPrompt(agentName);

//   stateManager.bus.publish('composer:promptConstructed', {
//     systemPrompt, actionPrompt: templates[finalAction], userText: `[STORY_CONTEXT]\n${storyContext}\n\n[SELECTION/BEAT]\n${selectionText}`
//   });
//   stateManager.bus.publish('composer:setLoading', { isLoading: true });

//   try {
//     // 5. เรียก LLM และจัดการผลลัพธ์
//     const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
//     const response = await callLLM(agent, messages);
//     const resultText = response.content.trim();
    
//     const resultHtmlContent = resultText
//       .split('\n')
//       .filter(p => p.trim() !== '')
//       .map(p => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }));

//     // ใช้ .chain() เพื่อความปลอดภัย
//     editor.chain().focus()
//       .insertContentAt(insertPosition, {
//         type: 'suggestionNode',
//         attrs: { 'data-status': 'pending' },
//         content: resultHtmlContent,
//       })
//       .run();

//   } catch (error) {
//     console.error("Inline Agent Error:", error);
//     alert(`An error occurred: ${error.message}`);
//   } finally {
//     stateManager.bus.publish('composer:setLoading', { isLoading: false });
//   }
// }
