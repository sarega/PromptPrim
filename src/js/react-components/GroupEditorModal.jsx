// src/js/react-components/GroupEditorModal.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sortable from 'sortablejs';

export default function GroupEditorModal({ unmount, groupData, allAgents, onSave }) {
    // --- STATE MANAGEMENT ---
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [flowType, setFlowType] = useState('manual');
    const [moderator, setModerator] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [maxTurns, setMaxTurns] = useState(1);
    const [timerInSeconds, setTimerInSeconds] = useState(0);

    const selectedListRef = useRef(null);

    // --- EFFECTS ---
    useEffect(() => {
        if (groupData) {
            setGroupName(groupData.name || '');
            const validSavedMembers = (groupData.agents || []).filter(name => allAgents && allAgents.hasOwnProperty(name));
            setSelectedMembers(validSavedMembers);
            setFlowType(groupData.flowType || 'manual');
            setModerator(groupData.moderatorAgent || '');
            setMaxTurns(groupData.maxTurns || 1);
            setTimerInSeconds(groupData.timerInSeconds || 0);
        } else {
            setGroupName('New Group');
            setSelectedMembers([]);
            setFlowType('manual');
            setModerator('');
            setMaxTurns(1);
            setTimerInSeconds(0);
        }
    }, [groupData, allAgents]);

    useEffect(() => {
        if (moderator && !selectedMembers.includes(moderator)) {
            setModerator('');
        }
    }, [selectedMembers, moderator]);

    useEffect(() => {
        if (selectedListRef.current) {
            const sortable = Sortable.create(selectedListRef.current, {
                animation: 150,
                handle: '.agent-sortable-item',
                onEnd: (evt) => {
                    const newOrderedMembers = [...selectedMembers];
                    const [movedItem] = newOrderedMembers.splice(evt.oldIndex, 1);
                    newOrderedMembers.splice(evt.newIndex, 0, movedItem);
                    setSelectedMembers(newOrderedMembers);
                },
            });
            return () => sortable.destroy();
        }
    }, [selectedMembers]);

    // --- EVENT HANDLERS & DERIVED STATE ---
    const handleMemberToggle = (agentName) => {
        const isSelected = selectedMembers.includes(agentName);
        if (isSelected) {
            setSelectedMembers(prev => prev.filter(name => name !== agentName));
        } else {
            setSelectedMembers(prev => [...prev, agentName]);
        }
    };
    

    const handleSave = () => {
        // 1. สร้าง Object ข้อมูลทั้งหมดที่จะบันทึก
        const dataToSave = { 
            name: groupName, 
            members: selectedMembers,
            flowType: flowType,
            moderator: moderator,
            maxTurns: maxTurns,
            timerInSeconds: timerInSeconds
        };
        
        // 2. [สำคัญ] เรียกใช้ฟังก์ชัน onSave ที่ได้รับมาจาก props พร้อมส่งข้อมูลกลับไป
        onSave(dataToSave);

        // 3. ไม่ต้องเรียก unmount() จากที่นี่แล้ว เพราะ Logic การปิดจะอยู่ที่ onSave
    };

    // --- DERIVED STATE ---
    const { selectedList, availableList } = useMemo(() => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const allAgentNames = Object.keys(allAgents);
        const currentSelected = new Set(selectedMembers);

        const filteredAndSelected = selectedMembers
            .filter(name => name.toLowerCase().includes(lowerSearchTerm));

        const filteredAndAvailable = allAgentNames
            .filter(name => !currentSelected.has(name) && name.toLowerCase().includes(lowerSearchTerm))
            .sort();

        return { selectedList: filteredAndSelected, availableList: filteredAndAvailable };
    }, [searchTerm, allAgents, selectedMembers]);

    const moderatorOptions = selectedMembers.map(name => (
        <option key={name} value={name}>{name}</option>
    ));
    
    // --- RENDER ---
    return (
        <div id="agent-group-editor-modal" className="modal-overlay" style={{ display: 'flex' }}>
            <div className="modal-box is-resizable">
                <div className="modal-header">
                     <h3 id="agent-group-modal-title">
                        {groupData ? `Edit Group: ${groupName}` : 'Create New Agent Group'}
                    </h3>
                    <button type="button" className="modal-close-btn" title="Close" onClick={unmount}>&times;</button>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column' }}>

                    <div className="form-group">
                        <label htmlFor="group-name-input">Group Name</label>
                        <input type="text" id="group-name-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="group-flow-select">Conversation Flow</label>
                        <select id="group-flow-select" value={flowType} onChange={(e) => setFlowType(e.target.value)}>
                            <option value="manual">Manual Selection</option>
                            <option value="round-robin">Round Robin</option>
                            <option value="auto-moderator">Automated Moderator</option>
                        </select>
                    </div>
                    {flowType === 'round-robin' && (
                        <div className="form-group">
                            <label htmlFor="group-max-turns-input">Rounds (1-8)</label>
                            <input 
                                type="number" 
                                id="group-max-turns-input" 
                                value={maxTurns}
                                onChange={(e) => setMaxTurns(Math.max(1, Math.min(8, parseInt(e.target.value, 10))))}
                                min="1" 
                                max="8"
                            />
                        </div>
                    )}

                    {/* แสดงฟอร์มนี้เมื่อ Flow Type เป็น 'auto-moderator' */}
                    {flowType === 'auto-moderator' && (
                         <div className="form-group">
                            <label htmlFor="group-timer-input">Timer (0-180 seconds)</label>
                            <input 
                                type="number" 
                                id="group-timer-input" 
                                value={timerInSeconds}
                                onChange={(e) => setTimerInSeconds(parseInt(e.target.value, 10))}
                                min="0" 
                                max="180" 
                                step="10"
                            />
                             <p className="modal-warning">ใส่ 0 เพื่อให้ Moderator ทำงานรอบเดียวแล้วหยุด (โหมดปกติ)</p>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="group-moderator-select">Moderator Agent</label>
                        <select id="group-moderator-select" value={moderator} onChange={(e) => setModerator(e.target.value)} disabled={selectedMembers.length === 0}>
                            <option value="">-- Select from members --</option>
                            {moderatorOptions}
                        </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
                        <label>Group Members ({selectedMembers.length} selected)</label>
                        <input 
                            type="text" 
                            placeholder="Search agents..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ marginBottom: '10px' }}
                        />
               
                        <div id="group-member-list">
                            <div ref={selectedListRef}>
                                {selectedList.map(agentName => (
                                    <div className="agent-sortable-item" key={agentName} data-id={agentName}>
                                        <input type="checkbox" id={`agent-cb-${agentName}`} checked={true} onChange={() => handleMemberToggle(agentName)} />
                                        <label htmlFor={`agent-cb-${agentName}`}>{allAgents[agentName]?.icon || '🤖'} {agentName}</label>
                                    </div>
                                ))}
                            </div>

                            {selectedList.length > 0 && availableList.length > 0 && <hr style={{margin: '10px 0'}} />}

                            <div>
                                {availableList.map(agentName => (
                                    <div className="agent-sortable-item" key={agentName}>
                                        <input type="checkbox" id={`agent-cb-${agentName}`} checked={false} onChange={() => handleMemberToggle(agentName)} />
                                        <label htmlFor={`agent-cb-${agentName}`}>{allAgents[agentName]?.icon || '🤖'} {agentName}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={unmount}>ยกเลิก</button>
                    <button className="btn" onClick={handleSave}>บันทึก Group</button>
                </div>
            </div>
        </div>
    );
}