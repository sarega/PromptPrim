import"./main-Cr0rqbzZ.js";import{ai as T,s as m,aj as N,b as v,ak as X,al as Q,Y as K,am as Z,an as S,q as $,W as ee,ao as te,ap as ne,U as V,aq as se,ar as ae,as as q,at as z,X as oe,z as ie,_ as le,T as de,a3 as re}from"./core.theme-BUDMDT7H.js";function ce(e){const t=document.getElementById("admin-preset-selector"),n=document.getElementById("admin-preset-name-input"),s=t.value,a=n.value.trim();if(!a){m("Preset name cannot be empty.","Error");return}const o=a.toLowerCase().replace(/\s+/g,"_"),l=T();if(o!==s&&l[o]){m(`A preset named "${a}" already exists.`,"Error");return}s!=="--new--"&&s!==o&&delete l[s],l[o]={name:a,modelIds:Array.from(e)},N(l),m(`Master Preset "${a}" saved!`,"Success"),v.bus.publish("admin:presetsChanged")}function ue(){try{const e=T(),t=JSON.stringify(e,null,2),n=new Blob([t],{type:"application/json"}),s=URL.createObjectURL(n),a=document.createElement("a");a.href=s,a.download=`promptprim_master_presets_${new Date().toISOString().slice(0,10)}.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(s)}catch(e){m("Error exporting presets."),console.error(e)}}function me(e){const t=e.target.files[0];if(!t)return;const n=new FileReader;n.onload=s=>{try{const a=JSON.parse(s.target.result);if(a&&Object.values(a).every(o=>o.name&&Array.isArray(o.modelIds)))confirm("This will overwrite your current master presets. Are you sure?")&&(N(a),v.bus.publish("admin:presetsChanged"),m("Master presets imported successfully!","Success"));else throw new Error("Invalid preset file format.")}catch(a){m(`Error loading preset file: ${a.message}`),console.error(a)}},n.readAsText(t),e.target.value=""}function pe(){const e=document.getElementById("admin-preset-selector");if(!e)return;const t=e.value;if(!t||t==="--new--"){m("Please select a preset to delete.","Info");return}const n=T(),s=n[t]?.name||t;confirm(`Delete master preset "${s}"?`)&&(delete n[t],N(n),m(`Deleted preset "${s}".`,"Success"),v.bus.publish("admin:presetsChanged"))}let r=new Set,E=-1;function U(){const e=document.getElementById("admin-preset-included-list");if(!e)return;const t=v.getState().systemProviderModels||[];e.innerHTML="";const n=document.createElement("div");if(n.className="included-models-count",n.textContent=`Included: ${r.size} models`,e.appendChild(n),r.size===0){e.innerHTML+='<p class="no-items-message">Select models from the list on the left.</p>';return}t.filter(a=>r.has(a.id)).forEach(a=>{const o=document.createElement("div");o.className="model-manager-item",o.innerHTML=`<label>${a.name} &nbsp;•&nbsp; <small>${a.id}</small></label>`,e.appendChild(o)})}function M(){const e=document.getElementById("admin-model-master-list"),t=document.getElementById("admin-model-search-input"),n=document.getElementById("admin-filter-selected-toggle");if(!e||!t||!n)return;let a=v.getState().systemProviderModels||[];const o=t.value.toLowerCase(),l=n.checked;e.innerHTML="",l&&(a=a.filter(i=>r.has(i.id))),a.filter(i=>i.name.toLowerCase().includes(o)||i.id.toLowerCase().includes(o)).forEach((i,g)=>{const p=r.has(i.id),u=document.createElement("div");u.className="model-manager-item",u.innerHTML=`
            <input type="checkbox" id="admin-model-cb-${i.id}" data-model-id="${i.id}" data-index="${g}" ${p?"checked":""}>
            <label for="admin-model-cb-${i.id}">
                ${i.name} &nbsp;•&nbsp; <small>${i.id}</small>
            </label>
        `,e.appendChild(u)})}function x(){const e=T(),t=document.getElementById("admin-preset-selector"),n=document.getElementById("admin-preset-name-input");if(!t||!n)return;const s=t.value;t.innerHTML='<option value="--new--">-- Create New Master Preset --</option>';for(const o in e)t.add(new Option(e[o].name,o));e[s]&&(t.value=s);const a=t.value;a==="--new--"?(n.value="",r.clear()):e[a]&&(n.value=e[a].name,r=new Set(e[a].modelIds)),M(),U()}function ge(){const e=document.getElementById("admin-save-preset-btn"),t=document.getElementById("admin-delete-preset-btn"),n=document.getElementById("admin-preset-selector"),s=document.getElementById("admin-model-master-list"),a=document.getElementById("admin-model-search-input"),o=document.getElementById("admin-filter-selected-toggle"),l=document.getElementById("admin-select-all-btn"),d=document.getElementById("admin-deselect-all-btn"),i=document.getElementById("import-presets-btn"),g=document.getElementById("export-presets-btn"),p=document.createElement("input");p.type="file",p.accept=".json",p.style.display="none",i?.addEventListener("click",()=>p.click()),g?.addEventListener("click",ue),p.addEventListener("change",me),e?.addEventListener("click",()=>ce(r)),t?.addEventListener("click",pe),n?.addEventListener("change",x),a?.addEventListener("input",M),o?.addEventListener("change",M),l?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(c=>{c.checked=!0,r.add(c.dataset.modelId)}),U()}),d?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(c=>{c.checked=!1,r.delete(c.dataset.modelId)}),U()}),s?.addEventListener("click",u=>{const c=u.target.closest('input[type="checkbox"]');if(!c)return;const I=Array.from(s.querySelectorAll('input[type="checkbox"]')),A=I.indexOf(c);if(u.altKey||u.metaKey){u.preventDefault();const y=c.dataset.modelId,D=r.has(y)&&r.size===1;r.clear(),D||r.add(y),I.forEach(f=>f.checked=r.has(f.dataset.modelId))}else if(u.shiftKey&&E>-1){u.preventDefault();const y=Math.min(A,E),D=Math.max(A,E);for(let f=y;f<=D;f++)I[f].checked=!0,r.add(I[f].dataset.modelId)}else{const y=c.dataset.modelId;c.checked?r.add(y):r.delete(y)}E=A,U()}),v.bus.subscribe("models:loaded",()=>{console.log("Model list updated. Re-rendering Admin Model Manager."),x()}),v.bus.subscribe("admin:presetsChanged",x)}const J="promptPrimAdminBilling_v1";function G(){const e=localStorage.getItem(J);return e?JSON.parse(e):{balanceUSD:10,usedUSD:0,markupRate:2.5}}function ve(e){const t=G();t.balanceUSD=parseFloat(e.balanceUSD)||0,t.markupRate=parseFloat(e.markupRate)||1,localStorage.setItem(J,JSON.stringify(t))}function ye(){const e=K(),t=document.getElementById("admin-api-key"),n=document.getElementById("admin-ollama-url");t&&(t.value=e.openrouterKey||""),n&&(n.value=e.ollamaBaseUrl||"")}function L(){const e=G(),t=Z(),n=document.getElementById("billing-balance-usd"),s=document.getElementById("billing-used-usd"),a=document.getElementById("billing-remaining-usd"),o=document.getElementById("billing-markup-rate"),l=document.getElementById("billing-distributable-credits"),d=document.getElementById("billing-issued-credits"),i=document.getElementById("billing-warning-message"),g=(e.balanceUSD||0)-(e.usedUSD||0),p=e.markupRate||1,u=g*p*1e6,c=t/(p*1e6);if(n&&(n.value=(e.balanceUSD||0).toFixed(2)),o&&(o.value=p),s&&(s.value=(e.usedUSD||0).toFixed(6)),a&&(a.value=g.toFixed(8)),l&&(l.value=u.toLocaleString("en-US",{maximumFractionDigits:0})),d&&(d.value=`$${c.toFixed(2)}`),i)if(c>g){const I=c-g;i.innerHTML=`⚠️ **Warning:** You have issued credits worth ~$${c.toFixed(2)}, but only have ~$${g.toFixed(2)} remaining. You have a deficit of <strong>$${I.toFixed(2)}</strong>.`,i.classList.remove("hidden","billing-safe"),i.classList.add("billing-warning")}else i.textContent="✅ Credit pool is sufficient to cover all issued credits.",i.classList.remove("hidden","billing-warning"),i.classList.add("billing-safe")}function fe(){const e=document.getElementById("billing-balance-usd").value,t=document.getElementById("billing-markup-rate").value;ve({balanceUSD:e,markupRate:t}),m("Billing settings saved!","Success"),L()}function be(){ye(),document.getElementById("save-system-settings-btn")?.addEventListener("click",()=>{const e=document.getElementById("admin-api-key").value,t=document.getElementById("admin-ollama-url").value;X({openrouter:e,ollamaBaseUrl:t}),m("System API settings saved!","Success"),console.log("API Keys saved, triggering a full model refresh..."),Q()}),L(),document.getElementById("save-billing-btn")?.addEventListener("click",fe),v.bus.subscribe("user:settingsUpdated",L)}function he(e){const t=`Timestamp,Model,PromptTokens,CompletionTokens,TotalTokens,CostUSD,Speed(TPS)
`,n=e.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),o=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A";return[`"${$(s.timestamp)}"`,`"${s.model}"`,s.promptTokens||0,s.completionTokens||0,a,(s.costUSD||0).toFixed(8),o].join(",")}).join(`
`);return t+n}function Ie(e){const t=S(e);if(!t||!t.activityLog||t.activityLog.length===0){alert("No activity to export.");return}const n=he(t.activityLog),s=new Blob([n],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),o=document.createElement("a");o.setAttribute("href",a),o.setAttribute("download",`activity_log_${t.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(o),o.click(),document.body.removeChild(o)}const k=document.getElementById("activity-log-modal"),C=document.getElementById("activity-log-body"),O=document.getElementById("activity-log-title");let P=null;function _(){k.style.display="flex"}function $e(){k.style.display="none"}function Y(e){P=e;const t=S(e);if(!t||!C||!O)return;if(O.textContent=`Activity Log for ${t.userName}`,!t.activityLog||t.activityLog.length===0){C.innerHTML="<p>No activity recorded for this user.</p>",_();return}const n=t.activityLog.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),o=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A",l=(s.costUSD||0).toFixed(8),d=s.usageIsEstimated?'<span class="estimate-indicator" title="This is an estimate.">*</span>':"";return`
            <tr>
                <td>${$(s.timestamp)}</td>
                <td>${s.model}</td>
                <td>${s.promptTokens}</td>
                <td>${s.completionTokens}</td>
                <td>${a}${d}</td>
                <td style="text-align: right;">$${l}</td> <td>${o} tps</td>
            </tr>
        `}).reverse().join("");C.innerHTML=`
        <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Model</th>
                        <th>Prompt Tokens</th>
                        <th>Completion Tokens</th>
                        <th>Total Tokens</th>
                        <th style="text-align: right;">Cost (USD)</th> <th>Speed</th>
                    </tr>
                </thead>
                <tbody>
                    ${n}
                </tbody>
            </table>
        </div>
    `,_()}function Se(){const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",t=>{if(t.target.id==="view-activity-log-btn"){const n=e.dataset.userId;Y(n)}}),k?.querySelectorAll(".modal-close-btn")?.forEach(t=>{t.addEventListener("click",$e)}),k?.querySelector("#export-activity-csv-btn")?.addEventListener("click",()=>{P&&Ie(P)})}const h=document.getElementById("account-log-modal"),w=document.getElementById("account-log-body"),j=document.getElementById("account-log-title");let W=null;function Ee(){h&&(h.style.display="flex")}function Ue(){h&&(h.style.display="none")}function xe(){const e=S(W);if(!e||!e.logs)return;const t=`Timestamp,Event,Details,Amount (USD),Balance After (USD)
`,n=[...e.logs].reverse().map(d=>{let i;return typeof d.event=="string"?i=[`"${$(d.timestamp)}"`,`"${d.event}"`,`"${d.details}"`,d.amountUSD||0,d.balanceAfterUSD||0]:i=[`"${$(d.timestamp)}"`,`"${d.action}"`,"","",""],i.join(",")}).join(`
`),s=t+n,a=new Blob([s],{type:"text/csv;charset=utf-8;"}),o=URL.createObjectURL(a),l=document.createElement("a");l.setAttribute("href",o),l.setAttribute("download",`account_log_${e.userName}.csv`),document.body.appendChild(l),l.click(),document.body.removeChild(l)}function Le(e){W=e;const t=S(e);if(!(!t||!h||!j||!w)){if(j.textContent=`Account Log for ${t.userName}`,!t.logs||t.logs.length===0)w.innerHTML="<p>No account activity recorded.</p>";else{const n=[...t.logs].reverse().map(s=>{if(typeof s.event=="string"){const a=parseFloat(s.amountUSD)||0,o=parseFloat(s.balanceAfterUSD).toFixed(6),l=a>=0?"color: var(--success-color);":"color: var(--error-color);",d=`${a>=0?"+":""}${a.toFixed(a>=0?2:8)}`;return`
                    <tr>
                        <td>${$(s.timestamp)}</td>
                        <td>${s.details}</td>
                        <td style="text-align: right; ${l}">${d}</td>
                        <td style="text-align: right;">$${o}</td>
                    </tr>
                `}else return`
                    <tr>
                        <td>${$(s.timestamp)}</td>
                        <td>${s.action}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">-</td>
                    </tr>
                `}).join("");w.innerHTML=`
            <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                <table class="activity-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Details</th>
                            <th style="text-align: right;">Amount (USD)</th>
                            <th style="text-align: right;">Balance (USD)</th>
                        </tr>
                    </thead>
                    <tbody>${n}</tbody>
                </table>
            </div>
        `}Ee()}}function ke(){document.getElementById("user-detail-section")?.addEventListener("click",t=>{if(t.target.id==="view-account-log-btn"){const n=t.currentTarget.dataset.userId;n&&Le(n)}}),h?.querySelectorAll(".modal-close-btn").forEach(t=>t.addEventListener("click",Ue)),h?.querySelector("#export-account-log-csv-btn")?.addEventListener("click",xe)}let B=null;function Be(e){const t=S(e);if(!t){m(`Error: User ${e} not found.`,"Error");return}const n=JSON.parse(JSON.stringify(t)),s=document.getElementById("detail-user-plan").value,a=parseInt(document.getElementById("detail-user-credits").value,10);n.plan!==s&&(n.logs.push({timestamp:Date.now(),action:`Admin changed plan from ${n.plan} to ${s}.`}),n.plan=s),n.credits.current=a,n.plan==="pro"&&n.credits.current>0&&n.planStatus!=="active"&&(n.planStatus="active",n.gracePeriodStartDate=null,n.logs.push({timestamp:Date.now(),action:"Account status reactivated by admin."})),ae(n),m(`User ${n.userName} updated successfully!`,"Success"),b(),F(e)}function Te(){const e=prompt("Enter the new user's name:");if(!e)return;const t=prompt(`Enter the email for ${e}:`);if(!t)return;const n=se(e,t);n?(m(`Successfully created user: ${e} (ID: ${n.userId})`,"User Created"),b()):m("Failed to create user. Please check the console.","Error")}function Ae(e){if(!e||!e.plan)return{text:"Error",class:"status-blocked"};const t=e.credits?.current??0;return e.plan==="master"?{text:"Master",class:"status-active"}:e.plan==="free"?t>0?{text:"Free",class:"status-free"}:{text:"Blocked",class:"status-blocked"}:e.plan==="pro"?e.planStatus==="active"&&t>0?{text:"Active",class:"status-active"}:e.planStatus==="grace_period"?{text:"Grace Period",class:"status-grace"}:{text:"Blocked",class:"status-blocked"}:{text:"Unknown",class:""}}function De(e){const t=document.createElement("div");t.className="user-list-item",e.userId===B&&t.classList.add("active"),t.dataset.userId=e.userId;const n=Ae(e),s=e.plan||"unknown",a=e.credits?.current??0,o=V(a);return t.innerHTML=`
        <div><span class="status-indicator ${n.class}">${n.text}</span></div>
        <div class="user-name-email">
            ${e.userName||"N/A"}
            <small>${e.userId} / ${e.email||"N/A"}</small>
        </div>
        <div>${s.charAt(0).toUpperCase()+s.slice(1)}</div>
        <div>$${o.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `,t}function b(){const e=document.getElementById("user-list-container"),t=document.getElementById("user-search-input").value.toLowerCase(),n=document.getElementById("user-plan-filter").value;if(!e)return;const a=ne().filter(o=>o&&o.plan&&(n==="all"||o.plan===n)&&(!t||o.userName.toLowerCase().includes(t)||o.email.toLowerCase().includes(t)||o.userId.toLowerCase().includes(t)));e.innerHTML="",a.forEach(o=>e.appendChild(De(o)))}function F(e){B=e;const t=document.getElementById("user-detail-section");if(!t)return;t.dataset.userId=e;const n=S(e);if(!n){t.classList.add("hidden");return}let s="";if(n.plan==="master"){const l=n.subscriptionEndDate?new Date(n.subscriptionEndDate):null,d=l?Math.ceil((l-Date.now())/(1e3*60*60*24)):"N/A",i=d>0?`${d} days remaining`:"Expired";s=`
            <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <label>Master Subscription</label>
                <input type="text" value="${l?l.toLocaleDateString():"Not set"} (${i})" readonly class="read-only-display">
                <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
            </div>
        `}const a=V(n.credits.current),o=n.credits.tokenUsage||{prompt:0,completion:0};o.prompt+o.completion,t.innerHTML=`
        <h4>Details for ${n.userName} (${n.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan">
                        <option value="free" ${n.plan==="free"?"selected":""}>Free</option>
                        <option value="pro" ${n.plan==="pro"?"selected":""}>Pro</option>
                        <option value="master" ${n.plan==="master"?"selected":""}>Master</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Current Credits</label>
                    <input type="number" id="detail-user-credits" value="${n.credits.current}">
                </div>
                 <div class="form-group">
                    <label>Money Refill (USD)</label>
                    <div class="refill-presets">
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="10">$10</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="30">$30</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="50">$50</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="100">$100</button>
                    </div>
                </div>
                 <button id="detail-save-user-btn" class="btn">Save User Profile</button>
                <div>
                    ${s}
                    </div>                 
            </div>
            <div>
                <div class="form-group">
                    <label>Balance (USD Value)</label>
                    <input type="text" value="$${a.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Usage (USD Value)</label>
                    <input type="text" value="$${(n.credits.totalUsedUSD||0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Refilled (USD)</label>
                    <input type="text" value="$${(n.credits.totalRefilledUSD||0).toFixed(2)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Usage Cost (USD)</label>
                    <input type="text" value="$${(n.credits.totalUsedUSD||0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <button id="view-activity-log-btn" class="btn btn-secondary">View Activity Log</button>
                <button id="view-account-log-btn" class="btn btn-secondary">View Account Log</button>
            </div>
        </div>
        `,t.classList.remove("hidden"),b()}function Ce(){b(),document.getElementById("user-search-input")?.addEventListener("input",b),document.getElementById("user-plan-filter")?.addEventListener("change",b),document.getElementById("user-list-container")?.addEventListener("click",t=>{const n=t.target.closest(".user-list-item");if(!n)return;const s=n.dataset.userId;F(s)}),document.getElementById("add-new-user-btn")?.addEventListener("click",Te);const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",t=>{const n=t.target,s=e.dataset.userId;if(s){if(n.id==="detail-save-user-btn"&&Be(s),n.dataset.action==="refill"){const a=parseInt(n.dataset.amount,10);ee(s,a)}n.id==="view-activity-log-btn"&&Y(s),n.dataset.action==="extend-sub"&&te(s)}}),v.bus.subscribe("user:settingsUpdated",()=>{console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list."),b(),B&&F(B)})}document.getElementById("account-log-modal");document.getElementById("account-log-body");document.getElementById("account-log-title");function we(e,t){let n=`Metric,Value
`;return n+=`Gross Revenue,$${e.grossRevenue.toFixed(2)}
`,n+=`Total API Costs,$${e.totalCosts.toFixed(6)}
`,n+=`Net Profit/Loss,$${e.netProfit.toFixed(2)}
`,n+=`Active Users,${e.activeUsers}
`,n+=`Total API Calls,${e.totalApiCalls}
`,n+=`Total Tokens Processed,${e.totalTokensProcessed.toLocaleString()}

`,n+=`User,Plan,Total Refilled (USD),Total Usage (USD),Net Value (USD)
`,t.forEach(s=>{n+=`"${s.userName}",${s.plan},${s.totalRefilledUSD.toFixed(2)},${s.totalUsageUSD.toFixed(6)},${s.netValue.toFixed(2)}
`}),n}function Me(){const e=q(),t=z(),n=we(e,t),s=new Blob([n],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),o=document.createElement("a");o.setAttribute("href",a),o.setAttribute("download",`financial_report_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(o),o.click(),document.body.removeChild(o)}const R=document.getElementById("financial-report-modal"),H=document.getElementById("financial-report-body");function Pe(){R.style.display="flex"}function Fe(){R.style.display="none"}function Ne(){if(!H)return;const e=q(),n=z().map(s=>`
        <tr>
            <td>${s.userName}</td>
            <td>${s.plan}</td>
            <td>$${s.totalRefilledUSD.toFixed(2)}</td>
            <td>$${s.totalUsageUSD.toFixed(6)}</td>
            <td>$${s.netValue.toFixed(2)}</td>
        </tr>
    `).join("");H.innerHTML=`
        <h4>Overall Financial Summary</h4>
        <div class="admin-billing-grid" style="margin-bottom: 20px;">
            <div><strong>Gross Revenue:</strong> $${e.grossRevenue.toFixed(2)}</div>
            <div><strong>Total Costs:</strong> $${e.totalCosts.toFixed(6)}</div>
            <div><strong>Net Profit/Loss:</strong> $${e.netProfit.toFixed(2)}</div>
            <div><strong>Active Users:</strong> ${e.activeUsers}</div>
            <div><strong>Total API Calls:</strong> ${e.totalApiCalls.toLocaleString()}</div>
            <div><strong>Total Tokens:</strong> ${e.totalTokensProcessed.toLocaleString()}</div>
        </div>

        <h4>Per-User Breakdown</h4>
        <div class="item-list-scrollable" style="padding: 0; max-height: 40vh;">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Plan</th>
                        <th>Total Refilled</th>
                        <th>Total Usage</th>
                        <th>Net Value</th>
                    </tr>
                </thead>
                <tbody>${n}</tbody>
            </table>
        </div>
    `,Pe()}function Re(){document.getElementById("generate-report-btn")?.addEventListener("click",Ne),R?.querySelectorAll(".modal-close-btn").forEach(e=>e.addEventListener("click",Fe)),document.getElementById("export-report-csv-btn")?.addEventListener("click",Me)}function Oe(){window.addEventListener("storage",e=>{e.key==="promptPrimUserDatabase_v1"&&(console.log("Admin cross-tab sync: User database updated. Reloading services..."),re()),e.key==="promptPrimAdminBilling_v1"&&(console.log("Admin cross-tab sync: Billing data updated. Re-rendering billing info..."),L())})}async function _e(){console.log("🚀 Admin Panel Initializing..."),document.body.classList.add("admin-page"),await oe();const e=K(),t=e.providerEnabled||{};await ie({apiKey:t.openrouter!==!1?e.openrouterKey:"",ollamaBaseUrl:t.ollama!==!1?e.ollamaBaseUrl:"",isUserKey:!1}),le(),de("admin-theme-switcher"),be(),ge(),Ce(),Se(),ke(),Re(),Oe(),x(),console.log("🎉 Admin Panel Initialized Successfully.")}document.addEventListener("DOMContentLoaded",_e);
