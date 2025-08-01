import{a3 as F,a as m,a4 as j,s as y,a5 as X,l as H,E as V,a6 as Z,a7 as S,f as $,C as ee,a8 as te,a9 as ne,A as q,aa as se,ab as ae,ac as z,ad as J,D as oe,ae as ie,F as le,z as de,N as re}from"./core.theme-C6739qJg.js";function ce(e){const n=document.getElementById("admin-preset-selector"),t=document.getElementById("admin-preset-name-input"),s=n.value,a=t.value.trim();if(!a){m("Preset name cannot be empty.","Error");return}const o=a.toLowerCase().replace(/\s+/g,"_"),l=F();if(o!==s&&l[o]){m(`A preset named "${a}" already exists.`,"Error");return}s!=="--new--"&&s!==o&&delete l[s],l[o]={name:a,modelIds:Array.from(e)},j(l),m(`Master Preset "${a}" saved!`,"Success"),y.bus.publish("admin:presetsChanged")}function ue(){try{const e=F(),n=JSON.stringify(e,null,2),t=new Blob([n],{type:"application/json"}),s=URL.createObjectURL(t),a=document.createElement("a");a.href=s,a.download=`promptprim_master_presets_${new Date().toISOString().slice(0,10)}.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(s)}catch(e){m("Error exporting presets."),console.error(e)}}function me(e){const n=e.target.files[0];if(!n)return;const t=new FileReader;t.onload=s=>{try{const a=JSON.parse(s.target.result);if(a&&Object.values(a).every(o=>o.name&&Array.isArray(o.modelIds)))confirm("This will overwrite your current master presets. Are you sure?")&&(j(a),y.bus.publish("admin:presetsChanged"),m("Master presets imported successfully!","Success"));else throw new Error("Invalid preset file format.")}catch(a){m(`Error loading preset file: ${a.message}`),console.error(a)}},t.readAsText(n),e.target.value=""}let r=new Set,E=-1;function U(){const e=document.getElementById("admin-preset-included-list");if(!e)return;const n=y.getState().systemProviderModels||[];e.innerHTML="";const t=document.createElement("div");if(t.className="included-models-count",t.textContent=`Included: ${r.size} models`,e.appendChild(t),r.size===0){e.innerHTML+='<p class="no-items-message">Select models from the list on the left.</p>';return}n.filter(a=>r.has(a.id)).forEach(a=>{const o=document.createElement("div");o.className="model-manager-item",o.innerHTML=`<label>${a.name} &nbsp;•&nbsp; <small>${a.id}</small></label>`,e.appendChild(o)})}function D(){const e=document.getElementById("admin-model-master-list"),n=document.getElementById("admin-model-search-input"),t=document.getElementById("admin-filter-selected-toggle");if(!e||!n||!t)return;let a=y.getState().systemProviderModels||[];const o=n.value.toLowerCase(),l=t.checked;e.innerHTML="",l&&(a=a.filter(i=>r.has(i.id))),a.filter(i=>i.name.toLowerCase().includes(o)||i.id.toLowerCase().includes(o)).forEach((i,p)=>{const g=r.has(i.id),u=document.createElement("div");u.className="model-manager-item",u.innerHTML=`
            <input type="checkbox" id="admin-model-cb-${i.id}" data-model-id="${i.id}" data-index="${p}" ${g?"checked":""}>
            <label for="admin-model-cb-${i.id}">
                ${i.name} &nbsp;•&nbsp; <small>${i.id}</small>
            </label>
        `,e.appendChild(u)})}function x(){const e=F(),n=document.getElementById("admin-preset-selector"),t=document.getElementById("admin-preset-name-input");if(!n||!t)return;const s=n.value;n.innerHTML='<option value="--new--">-- Create New Master Preset --</option>';for(const o in e)n.add(new Option(e[o].name,o));e[s]&&(n.value=s);const a=n.value;a==="--new--"?(t.value="",r.clear()):e[a]&&(t.value=e[a].name,r=new Set(e[a].modelIds)),D(),U()}function pe(){const e=document.getElementById("admin-save-preset-btn"),n=document.getElementById("admin-delete-preset-btn"),t=document.getElementById("admin-preset-selector"),s=document.getElementById("admin-model-master-list"),a=document.getElementById("admin-model-search-input"),o=document.getElementById("admin-filter-selected-toggle"),l=document.getElementById("admin-select-all-btn"),d=document.getElementById("admin-deselect-all-btn"),i=document.getElementById("import-presets-btn"),p=document.getElementById("export-presets-btn"),g=document.createElement("input");g.type="file",g.accept=".json",g.style.display="none",i?.addEventListener("click",()=>g.click()),p?.addEventListener("click",ue),g.addEventListener("change",me),e?.addEventListener("click",()=>ce(r)),n?.addEventListener("click",void 0),t?.addEventListener("change",x),a?.addEventListener("input",D),o?.addEventListener("change",D),l?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(c=>{c.checked=!0,r.add(c.dataset.modelId)}),U()}),d?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(c=>{c.checked=!1,r.delete(c.dataset.modelId)}),U()}),s?.addEventListener("click",u=>{const c=u.target.closest('input[type="checkbox"]');if(!c)return;const I=Array.from(s.querySelectorAll('input[type="checkbox"]')),A=I.indexOf(c);if(u.altKey||u.metaKey){u.preventDefault();const v=c.dataset.modelId,T=r.has(v)&&r.size===1;r.clear(),T||r.add(v),I.forEach(f=>f.checked=r.has(f.dataset.modelId))}else if(u.shiftKey&&E>-1){u.preventDefault();const v=Math.min(A,E),T=Math.max(A,E);for(let f=v;f<=T;f++)I[f].checked=!0,r.add(I[f].dataset.modelId)}else{const v=c.dataset.modelId;c.checked?r.add(v):r.delete(v)}E=A,U()}),y.bus.subscribe("models:loaded",x),y.bus.subscribe("admin:presetsChanged",x)}const G="promptPrimAdminBilling_v1";function Y(){const e=localStorage.getItem(G);return e?JSON.parse(e):{balanceUSD:10,usedUSD:0,markupRate:2.5}}function ge(e){const n=Y();n.balanceUSD=parseFloat(e.balanceUSD)||0,n.markupRate=parseFloat(e.markupRate)||1,localStorage.setItem(G,JSON.stringify(n))}function ye(){const e=V(),n=document.getElementById("admin-api-key"),t=document.getElementById("admin-ollama-url");n&&(n.value=e.openrouterKey||""),t&&(t.value=e.ollamaBaseUrl||"")}function L(){const e=Y(),n=Z(),t=document.getElementById("billing-balance-usd"),s=document.getElementById("billing-used-usd"),a=document.getElementById("billing-remaining-usd"),o=document.getElementById("billing-markup-rate"),l=document.getElementById("billing-distributable-credits"),d=document.getElementById("billing-issued-credits"),i=document.getElementById("billing-warning-message"),p=(e.balanceUSD||0)-(e.usedUSD||0),g=e.markupRate||1,u=p*g*1e6,c=n/(g*1e6);if(t&&(t.value=(e.balanceUSD||0).toFixed(2)),o&&(o.value=g),s&&(s.value=(e.usedUSD||0).toFixed(6)),a&&(a.value=p.toFixed(8)),l&&(l.value=u.toLocaleString("en-US",{maximumFractionDigits:0})),d&&(d.value=`$${c.toFixed(2)}`),i)if(c>p){const I=c-p;i.innerHTML=`⚠️ **Warning:** You have issued credits worth ~$${c.toFixed(2)}, but only have ~$${p.toFixed(2)} remaining. You have a deficit of <strong>$${I.toFixed(2)}</strong>.`,i.classList.remove("hidden","billing-safe"),i.classList.add("billing-warning")}else i.textContent="✅ Credit pool is sufficient to cover all issued credits.",i.classList.remove("hidden","billing-warning"),i.classList.add("billing-safe")}function ve(){const e=document.getElementById("billing-balance-usd").value,n=document.getElementById("billing-markup-rate").value;ge({balanceUSD:e,markupRate:n}),m("Billing settings saved!","Success"),L()}function fe(){ye(),document.getElementById("save-system-settings-btn")?.addEventListener("click",()=>{const e=document.getElementById("admin-api-key").value,n=document.getElementById("admin-ollama-url").value;if(!e){m("Please enter an OpenRouter API Key.","Error");return}X({openrouter:e,ollamaBaseUrl:n}),m("System API settings saved!","Success"),console.log("API Keys saved, triggering model refresh..."),H({apiKey:e,isUserKey:!1})}),L(),document.getElementById("save-billing-btn")?.addEventListener("click",ve),y.bus.subscribe("user:settingsUpdated",L)}function be(e){const n=`Timestamp,Model,PromptTokens,CompletionTokens,TotalTokens,CostUSD,Speed(TPS)
`,t=e.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),o=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A";return[`"${$(s.timestamp)}"`,`"${s.model}"`,s.promptTokens||0,s.completionTokens||0,a,(s.costUSD||0).toFixed(8),o].join(",")}).join(`
`);return n+t}function he(e){const n=S(e);if(!n||!n.activityLog||n.activityLog.length===0){alert("No activity to export.");return}const t=be(n.activityLog),s=new Blob([t],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),o=document.createElement("a");o.setAttribute("href",a),o.setAttribute("download",`activity_log_${n.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(o),o.click(),document.body.removeChild(o)}const k=document.getElementById("activity-log-modal"),C=document.getElementById("activity-log-body"),R=document.getElementById("activity-log-title");let M=null;function O(){k.style.display="flex"}function Ie(){k.style.display="none"}function W(e){M=e;const n=S(e);if(!n||!C||!R)return;if(R.textContent=`Activity Log for ${n.userName}`,!n.activityLog||n.activityLog.length===0){C.innerHTML="<p>No activity recorded for this user.</p>",O();return}const t=n.activityLog.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),o=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A",l=(s.costUSD||0).toFixed(8),d=s.usageIsEstimated?'<span class="estimate-indicator" title="This is an estimate.">*</span>':"";return`
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
                    ${t}
                </tbody>
            </table>
        </div>
    `,O()}function $e(){const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",n=>{if(n.target.id==="view-activity-log-btn"){const t=e.dataset.userId;W(t)}}),k?.querySelectorAll(".modal-close-btn")?.forEach(n=>{n.addEventListener("click",Ie)}),k?.querySelector("#export-activity-csv-btn")?.addEventListener("click",()=>{M&&he(M)})}const h=document.getElementById("account-log-modal"),w=document.getElementById("account-log-body"),K=document.getElementById("account-log-title");let Q=null;function Se(){h&&(h.style.display="flex")}function Ee(){h&&(h.style.display="none")}function Ue(){const e=S(Q);if(!e||!e.logs)return;const n=`Timestamp,Event,Details,Amount (USD),Balance After (USD)
`,t=[...e.logs].reverse().map(d=>{let i;return typeof d.event=="string"?i=[`"${$(d.timestamp)}"`,`"${d.event}"`,`"${d.details}"`,d.amountUSD||0,d.balanceAfterUSD||0]:i=[`"${$(d.timestamp)}"`,`"${d.action}"`,"","",""],i.join(",")}).join(`
`),s=n+t,a=new Blob([s],{type:"text/csv;charset=utf-8;"}),o=URL.createObjectURL(a),l=document.createElement("a");l.setAttribute("href",o),l.setAttribute("download",`account_log_${e.userName}.csv`),document.body.appendChild(l),l.click(),document.body.removeChild(l)}function xe(e){Q=e;const n=S(e);if(!(!n||!h||!K||!w)){if(K.textContent=`Account Log for ${n.userName}`,!n.logs||n.logs.length===0)w.innerHTML="<p>No account activity recorded.</p>";else{const t=[...n.logs].reverse().map(s=>{if(typeof s.event=="string"){const a=parseFloat(s.amountUSD)||0,o=parseFloat(s.balanceAfterUSD).toFixed(6),l=a>=0?"color: var(--success-color);":"color: var(--error-color);",d=`${a>=0?"+":""}${a.toFixed(a>=0?2:8)}`;return`
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
                    <tbody>${t}</tbody>
                </table>
            </div>
        `}Se()}}function Le(){document.getElementById("user-detail-section")?.addEventListener("click",n=>{if(n.target.id==="view-account-log-btn"){const t=n.currentTarget.dataset.userId;t&&xe(t)}}),h?.querySelectorAll(".modal-close-btn").forEach(n=>n.addEventListener("click",Ee)),h?.querySelector("#export-account-log-csv-btn")?.addEventListener("click",Ue)}let B=null;function ke(e){const n=S(e);if(!n){m(`Error: User ${e} not found.`,"Error");return}const t=JSON.parse(JSON.stringify(n)),s=document.getElementById("detail-user-plan").value,a=parseInt(document.getElementById("detail-user-credits").value,10);t.plan!==s&&(t.logs.push({timestamp:Date.now(),action:`Admin changed plan from ${t.plan} to ${s}.`}),t.plan=s),t.credits.current=a,t.plan==="pro"&&t.credits.current>0&&t.planStatus!=="active"&&(t.planStatus="active",t.gracePeriodStartDate=null,t.logs.push({timestamp:Date.now(),action:"Account status reactivated by admin."})),ae(t),m(`User ${t.userName} updated successfully!`,"Success"),b(),P(e)}function Be(){const e=prompt("Enter the new user's name:");if(!e)return;const n=prompt(`Enter the email for ${e}:`);if(!n)return;const t=se(e,n);t?(m(`Successfully created user: ${e} (ID: ${t.userId})`,"User Created"),b()):m("Failed to create user. Please check the console.","Error")}function Ae(e){if(!e||!e.plan)return{text:"Error",class:"status-blocked"};const n=e.credits?.current??0;return e.plan==="master"?{text:"Master",class:"status-active"}:e.plan==="free"?n>0?{text:"Free",class:"status-free"}:{text:"Blocked",class:"status-blocked"}:e.plan==="pro"?e.planStatus==="active"&&n>0?{text:"Active",class:"status-active"}:e.planStatus==="grace_period"?{text:"Grace Period",class:"status-grace"}:{text:"Blocked",class:"status-blocked"}:{text:"Unknown",class:""}}function Te(e){const n=document.createElement("div");n.className="user-list-item",e.userId===B&&n.classList.add("active"),n.dataset.userId=e.userId;const t=Ae(e),s=e.plan||"unknown",a=e.credits?.current??0,o=q(a);return n.innerHTML=`
        <div><span class="status-indicator ${t.class}">${t.text}</span></div>
        <div class="user-name-email">
            ${e.userName||"N/A"}
            <small>${e.userId} / ${e.email||"N/A"}</small>
        </div>
        <div>${s.charAt(0).toUpperCase()+s.slice(1)}</div>
        <div>$${o.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `,n}function b(){const e=document.getElementById("user-list-container"),n=document.getElementById("user-search-input").value.toLowerCase(),t=document.getElementById("user-plan-filter").value;if(!e)return;const a=ne().filter(o=>o&&o.plan&&(t==="all"||o.plan===t)&&(!n||o.userName.toLowerCase().includes(n)||o.email.toLowerCase().includes(n)||o.userId.toLowerCase().includes(n)));e.innerHTML="",a.forEach(o=>e.appendChild(Te(o)))}function P(e){B=e;const n=document.getElementById("user-detail-section");if(!n)return;n.dataset.userId=e;const t=S(e);if(!t){n.classList.add("hidden");return}let s="";if(t.plan==="master"){const d=t.subscriptionEndDate?new Date(t.subscriptionEndDate):null,i=d?Math.ceil((d-Date.now())/(1e3*60*60*24)):"N/A",p=i>0?`${i} days remaining`:"Expired";s=`
            <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <label>Master Subscription</label>
                <input type="text" value="${d?d.toLocaleDateString():"Not set"} (${p})" readonly class="read-only-display">
                <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
            </div>
        `}const a=q(t.credits.current),o=t.credits.tokenUsage||{prompt:0,completion:0},l=o.prompt+o.completion;n.innerHTML=`
        <h4>Details for ${t.userName} (${t.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan">
                        <option value="free" ${t.plan==="free"?"selected":""}>Free</option>
                        <option value="pro" ${t.plan==="pro"?"selected":""}>Pro</option>
                        <option value="master" ${t.plan==="master"?"selected":""}>Master</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Current Credits</label>
                    <input type="number" id="detail-user-credits" value="${t.credits.current}">
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
                    <input type="text" value="$${(t.credits.totalUsedUSD||0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Credit Spend</label>
                    <input type="text" value="${t.credits.totalUsage.toLocaleString()}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Token Spend</label>
                    <input type="text" value="${l.toLocaleString()}" readonly class="read-only-display">
                </div>
                <button id="view-activity-log-btn" class="btn btn-secondary">View Activity Log</button>
                <button id="view-account-log-btn" class="btn btn-secondary">View Account Log</button>
            </div>
        </div>
        `,n.classList.remove("hidden"),b()}function Ce(){b(),document.getElementById("user-search-input")?.addEventListener("input",b),document.getElementById("user-plan-filter")?.addEventListener("change",b),document.getElementById("user-list-container")?.addEventListener("click",n=>{const t=n.target.closest(".user-list-item");if(!t)return;const s=t.dataset.userId;P(s)}),document.getElementById("add-new-user-btn")?.addEventListener("click",Be);const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",n=>{const t=n.target,s=e.dataset.userId;if(s){if(t.id==="detail-save-user-btn"&&ke(s),t.dataset.action==="refill"){const a=parseInt(t.dataset.amount,10);ee(s,a)}t.id==="view-activity-log-btn"&&W(s),t.dataset.action==="extend-sub"&&te(s)}}),y.bus.subscribe("user:settingsUpdated",()=>{console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list."),b(),B&&P(B)})}document.getElementById("account-log-modal");document.getElementById("account-log-body");document.getElementById("account-log-title");function we(e,n){let t=`Metric,Value
`;return t+=`Gross Revenue,$${e.grossRevenue.toFixed(2)}
`,t+=`Total API Costs,$${e.totalCosts.toFixed(6)}
`,t+=`Net Profit/Loss,$${e.netProfit.toFixed(2)}
`,t+=`Active Users,${e.activeUsers}
`,t+=`Total API Calls,${e.totalApiCalls}
`,t+=`Total Tokens Processed,${e.totalTokensProcessed.toLocaleString()}

`,t+=`User,Plan,Total Refilled (USD),Total Usage (USD),Net Value (USD)
`,n.forEach(s=>{t+=`"${s.userName}",${s.plan},${s.totalRefilledUSD.toFixed(2)},${s.totalUsageUSD.toFixed(6)},${s.netValue.toFixed(2)}
`}),t}function De(){const e=z(),n=J(),t=we(e,n),s=new Blob([t],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),o=document.createElement("a");o.setAttribute("href",a),o.setAttribute("download",`financial_report_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(o),o.click(),document.body.removeChild(o)}const N=document.getElementById("financial-report-modal"),_=document.getElementById("financial-report-body");function Me(){N.style.display="flex"}function Pe(){N.style.display="none"}function Fe(){if(!_)return;const e=z(),t=J().map(s=>`
        <tr>
            <td>${s.userName}</td>
            <td>${s.plan}</td>
            <td>$${s.totalRefilledUSD.toFixed(2)}</td>
            <td>$${s.totalUsageUSD.toFixed(6)}</td>
            <td>$${s.netValue.toFixed(2)}</td>
        </tr>
    `).join("");_.innerHTML=`
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
                <tbody>${t}</tbody>
            </table>
        </div>
    `,Me()}function Ne(){document.getElementById("generate-report-btn")?.addEventListener("click",Fe),N?.querySelectorAll(".modal-close-btn").forEach(e=>e.addEventListener("click",Pe)),document.getElementById("export-report-csv-btn")?.addEventListener("click",De)}function Re(){window.addEventListener("storage",e=>{e.key==="promptPrimUserDatabase_v1"&&(console.log("Admin cross-tab sync: User database updated. Reloading services..."),re()),e.key==="promptPrimAdminBilling_v1"&&(console.log("Admin cross-tab sync: Billing data updated. Re-rendering billing info..."),L())})}async function Oe(){console.log("🚀 Admin Panel Initializing..."),document.body.classList.add("admin-page"),await oe(),await ie();const e=V().openrouterKey;e?await H({apiKey:e,isUserKey:!1}):console.warn("Admin startup: No system API key found."),le(),de("admin-theme-switcher"),fe(),pe(),Ce(),$e(),Le(),Ne(),Re(),x(),console.log("🎉 Admin Panel Initialized Successfully.")}document.addEventListener("DOMContentLoaded",Oe);
