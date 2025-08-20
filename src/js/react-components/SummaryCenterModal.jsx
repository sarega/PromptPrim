// src/js/react-components/SummaryCenterModal.jsx
import React, { useState, useEffect, useMemo, memo } from 'react';
import { stateManager, defaultSummarizationPresets } from '../core/core.state.js';
import * as SummaryHandlers from '../modules/summary/summary.handlers.js';

// --- Sub-Components (Moved outside for stability) ---

const LogsView = memo(({ selectedLog, currentSessionName, isGenerating, onGenerate, editorTitle, setEditorTitle, editorContent, setEditorContent }) => (
    <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4>{selectedLog ? 'Edit Summary' : `Generate new summary for "${currentSessionName}"`}</h4>
            {!selectedLog && 
                <button className={`btn ${isGenerating ? 'is-loading' : ''}`} onClick={onGenerate} disabled={isGenerating}>
                    ✨ Generate New Summary
                </button>
            }
        </div>
        <div className="form-group" style={{flexGrow: 1, display: 'flex', flexDirection: 'column'}}>
            <label>Summary Title</label>
            <input type="text" value={editorTitle} onChange={e => setEditorTitle(e.target.value)} placeholder="A concise title..." />
            <label style={{marginTop: '10px'}}>Summary Content (Editable)</label>
            <textarea style={{flexGrow: 1, resize: 'none'}} value={editorContent} onChange={e => setEditorContent(e.target.value)} />
        </div>
    </>
));

const SettingsView = memo(({ selectedModel, setSelectedModel, allModels, selectedTemplateName, handleTemplateChange, promptTemplates, templateContent, setTemplateContent, defaultPresets, handleActionClick }) => {
    
    // [THE FIX] 1. แยกรายชื่อ Preset ออกเป็น 2 กลุ่ม
    const factoryPresetNames = Object.keys(promptTemplates)
        .filter(name => defaultPresets.hasOwnProperty(name))
        .sort();
    
    const userPresetNames = Object.keys(promptTemplates)
        .filter(name => !defaultPresets.hasOwnProperty(name))
        .sort();

    return (
     <>
        <h4>Settings</h4>
        <div className="form-group">
            <label>Summarization Model</label>
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="">-- Select a Model --</option>
                {allModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
        </div>
         <div className="form-group" style={{flexGrow: 1, display: 'flex', flexDirection: 'column'}}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ flexGrow: 1, marginBottom: 0 }}>Summarization Prompt Template</label>
                <div className="dropdown align-right">
                    <button className="btn btn-small btn-secondary" onClick={e => e.currentTarget.parentElement.classList.toggle('open')}>Actions &#9662;</button>
                    <div className="dropdown-content">
                        {selectedTemplateName && !defaultPresets[selectedTemplateName] ? (
                            <>
                                <a href="#" onClick={() => handleActionClick('settings:saveSummaryPreset', {saveAs: false, presetName: selectedTemplateName, content: templateContent})}>Save Changes</a>
                                <a href="#" onClick={() => handleActionClick('settings:renameSummaryPreset', { presetName: selectedTemplateName })}>Rename...</a>
                                <a href="#" onClick={() => handleActionClick('settings:saveSummaryPreset', {saveAs: true, content: templateContent})}>Save as New Preset...</a>
                                <div className="dropdown-divider"></div>
                                <a href="#" className="is-destructive" onClick={() => handleActionClick('settings:deleteSummaryPreset', { presetName: selectedTemplateName })}>Delete Preset</a>
                            </>
                        ) : (
                            <a href="#" onClick={() => handleActionClick('settings:saveSummaryPreset', {saveAs: true, content: templateContent})}>Save as New Preset...</a>
                        )}
                    </div>
                </div>
            </div>
            {/* [THE FIX] 2. สร้าง Dropdown ใหม่โดยใช้ <optgroup> */}
            <select value={selectedTemplateName} onChange={handleTemplateChange}>
                <optgroup label="Factory Presets (Read-only)">
                    {factoryPresetNames.map(name => <option key={name} value={name}>{name}</option>)}
                </optgroup>
                {userPresetNames.length > 0 && (
                    <optgroup label="User Presets">
                        {userPresetNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </optgroup>
                )}
            </select>
            <textarea style={{flexGrow: 1, resize: 'none', marginTop: '10px'}} value={templateContent} onChange={e => setTemplateContent(e.target.value)} />
        </div>
    </>
    );
});


// --- Main Component ---

export default function SummaryCenterModal({ unmount, summaryLogs, allModels, promptTemplates: initialPromptTemplates, currentSessionName, systemUtilityModel, activeTemplate, defaultPresets, onApplySettings }) {
    
    // --- State Management ---
    const [view, setView] = useState('logs');
    const [selectedLog, setSelectedLog] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [editorTitle, setEditorTitle] = useState('');
    const [editorContent, setEditorContent] = useState('');
    const [selectedModel, setSelectedModel] = useState(systemUtilityModel || '');
    const [promptTemplates, setPromptTemplates] = useState(initialPromptTemplates);
    const [selectedTemplateName, setSelectedTemplateName] = useState(activeTemplate || 'Standard');
    const [templateContent, setTemplateContent] = useState(initialPromptTemplates[activeTemplate || 'Standard'] || '');
    const [isGenerating, setIsGenerating] = useState(false);

    // --- Effects ---
    useEffect(() => {
        if (selectedLog) {
            setEditorTitle(selectedLog.summary);
            setEditorContent(selectedLog.content);
        } else {
            setEditorTitle('');
            setEditorContent('');
        }
    }, [selectedLog]);

    // This single useEffect hook handles all state synchronization from the main app
    useEffect(() => {
        const resyncComponentState = () => {
            const project = stateManager.getProject();
            const newTemplates = { ...defaultSummarizationPresets, ...project.globalSettings.summarizationPromptPresets };
            const activeName = project.globalSettings.activeSummarizationPreset || 'Standard';

            setPromptTemplates(newTemplates);
            setSelectedTemplateName(activeName);
        };
        
        const handleNewLog = ({ newlyCreatedId }) => {
             if (newlyCreatedId) {
                const newLog = stateManager.getProject().summaryLogs.find(l => l.id === newlyCreatedId);
                if (newLog) setSelectedLog(newLog);
            }
        };

        const unsubPresets = stateManager.bus.subscribe('summary:presetsChanged', resyncComponentState);
        const unsubLogs = stateManager.bus.subscribe('summary:listChanged', handleNewLog);

        return () => { // Cleanup function
            unsubPresets();
            unsubLogs();
        };
    }, []);

    // This useEffect updates the textarea when the dropdown selection changes
    useEffect(() => {
        setTemplateContent(promptTemplates[selectedTemplateName] || '');
    }, [selectedTemplateName, promptTemplates]);

    // --- Derived Data & Event Handlers ---
    const filteredLogs = useMemo(() => {
        if (!searchTerm) return summaryLogs;
        return summaryLogs.filter(log => log.summary.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, summaryLogs]);

    const handleSelectLog = (log) => {
        setSelectedLog(log);
        setView('logs');
    };

    const handleGenerateClick = async () => {
        setIsGenerating(true);
        setSelectedLog(null);
        try {
            const result = await SummaryHandlers.generateNewSummary({ modelId: selectedModel, promptTemplate: templateContent });
            setEditorTitle(result.title);
            setEditorContent(result.content);
            setSelectedLog({ id: 'new_log', summary: result.title, content: result.content });
        } catch (error) {
            console.error("Summary generation failed:", error);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleActionClick = (action, payload) => { stateManager.bus.publish(action, payload); };
    const handleTemplateChange = (e) => { setSelectedTemplateName(e.target.value); };
    
    // --- Main Render ---
    return (
        <div id="summarization-modal" className="modal-overlay" style={{ display: 'flex' }}>
            <div className="modal-box is-resizable">
                <div className="modal-header">
                    <h3>Conversation Summary Center</h3>
                    <button className="btn-icon" title="Settings" onClick={() => setView(view === 'logs' ? 'settings' : 'logs')}>
                        <span className="material-symbols-outlined">{view === 'settings' ? 'article' : 'settings'}</span>
                    </button>
                    <button className="modal-close-btn" onClick={unmount}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="log-list-column">
                        <input type="text" placeholder="Search summaries..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ marginBottom: '15px' }} />
                        <div id="summary-log-list-modal" className="item-list">
                            {filteredLogs.map(log => (
                                <div key={log.id} className={`item summary-log-item ${selectedLog?.id === log.id ? 'active' : ''}`} onClick={() => handleSelectLog(log)}>
                                    <span className="item-name"><span className="item-icon">💡</span> {log.summary}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="log-editor-column">
                        {view === 'logs' ? 
                            <LogsView 
                                selectedLog={selectedLog}
                                currentSessionName={currentSessionName}
                                isGenerating={isGenerating}
                                onGenerate={handleGenerateClick}
                                editorTitle={editorTitle}
                                setEditorTitle={setEditorTitle}
                                editorContent={editorContent}
                                setEditorContent={setEditorContent}
                            /> : 
                            <SettingsView 
                                selectedModel={selectedModel}
                                setSelectedModel={setSelectedModel}
                                allModels={allModels}
                                selectedTemplateName={selectedTemplateName}
                                handleTemplateChange={handleTemplateChange}
                                promptTemplates={promptTemplates}
                                templateContent={templateContent}
                                setTemplateContent={setTemplateContent}
                                defaultPresets={defaultPresets}
                                handleActionClick={handleActionClick}
                            />
                        }
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={unmount}>Close</button>
                    {view === 'logs' && selectedLog && (
                         <>
                            {selectedLog.id !== 'new_log' && <button className="btn btn-danger" onClick={() => handleActionClick('summary:deleteLog', {logId: selectedLog.id})}>Delete Log</button>}
                            {selectedLog.id !== 'new_log' && <button className="btn" onClick={() => handleActionClick('summary:loadToContext', {logId: selectedLog.id})}>Load to Context</button>}
                            <button className="btn" onClick={() => handleActionClick(selectedLog.id === 'new_log' ? 'summary:saveNewLog' : 'summary:saveEdit', {logId: selectedLog.id, title: editorTitle, content: editorContent})}>
                                {selectedLog.id === 'new_log' ? 'Save New Log' : 'Save Changes'}
                            </button>
                         </>
                    )}
                    {view === 'settings' && <button className="btn" onClick={() => onApplySettings({ model: selectedModel, templateName: selectedTemplateName })}>Apply Settings</button>}
                </div>
            </div>
        </div>
    );
}