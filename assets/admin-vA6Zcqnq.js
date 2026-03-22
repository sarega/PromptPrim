import"./main-CLQSUiLm.js";import{ba as O,bb as ke,bc as te,s as u,bd as de,b as S,be as Ge,bf as fe,bg as Ie,bh as Qe,bi as x,bj as We,bk as Ye,aQ as we,bl as Xe,bm as Ze,bn as et,aJ as D,bo as tt,bp as Ce,K as E,bq as _e,R as K,i as nt,br as st,aw as A,aA as ne,aC as U,az as Le,bs as at,aD as Be,aG as rt,bt as ot,bu as it,bv as ue,bw as Pe,bx as ct,aB as lt,by as De,bz as Me,bA as Te,aM as dt,aN as ut,aO as mt,aP as pt,W as ft,U as bt,V as gt,aS as yt,ay as vt,aX as ht}from"./backend-account-data.service-48EFxF-5.js";import{i as k,h as se,j as St,k as Et}from"./auth.service-C6v-CwKo.js";async function At(e){const t=document.getElementById("admin-preset-selector"),n=document.getElementById("admin-preset-name-input"),s=t.value,a=n.value.trim();if(k()&&O()){try{const i=S.getState().systemProviderModels||[],c=await Ge(s,Array.from(e),i);u(`${c.name} access saved to Supabase.`,"Success"),S.bus.publish("admin:presetsChanged")}catch(i){console.error(i),u(`Could not save backend model access: ${i.message||"Unknown error"}`,"Save Failed")}return}if(!a){u("Preset name cannot be empty.","Error");return}const r=a.toLowerCase().replace(/\s+/g,"_"),o=te();if(r!==s&&o[r]){u(`A preset named "${a}" already exists.`,"Error");return}s!=="--new--"&&s!==r&&delete o[s],o[r]={name:a,modelIds:Array.from(e)},de(o),u(`Plan Preset "${a}" saved!`,"Success"),S.bus.publish("admin:presetsChanged")}function xt(){try{const e=k()&&O()?ke():te(),t=JSON.stringify(e,null,2),n=new Blob([t],{type:"application/json"}),s=URL.createObjectURL(n),a=document.createElement("a");a.href=s,a.download=`promptprim_plan_presets_${new Date().toISOString().slice(0,10)}.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(s)}catch(e){u("Error exporting presets."),console.error(e)}}function $t(e){if(k()&&O()){u("Import is disabled in Supabase mode. Edit each billing plan allowlist and save it instead.","Import Disabled"),e.target.value="";return}const t=e.target.files[0];if(!t)return;const n=new FileReader;n.onload=s=>{try{const a=JSON.parse(s.target.result);if(a&&Object.values(a).every(r=>r.name&&Array.isArray(r.modelIds)))confirm("This will overwrite your current plan presets. Are you sure?")&&(de(a),S.bus.publish("admin:presetsChanged"),u("Plan presets imported successfully!","Success"));else throw new Error("Invalid preset file format.")}catch(a){u(`Error loading preset file: ${a.message}`),console.error(a)}},n.readAsText(t),e.target.value=""}function kt(){if(k()&&O()){u("Managed billing plans cannot be deleted. Clear the plan selection and save if you want an empty allowlist.","Delete Disabled");return}const e=document.getElementById("admin-preset-selector");if(!e)return;const t=e.value;if(!t||t==="--new--"){u("Please select a preset to delete.","Info");return}const n=te(),s=n[t]?.name||t;confirm(`Delete plan preset "${s}"?`)&&(delete n[t],de(n),u(`Deleted preset "${s}".`,"Success"),S.bus.publish("admin:presetsChanged"))}let y=new Set,G=-1;function W(){const e=document.getElementById("admin-preset-included-list");if(!e)return;const t=S.getState().systemProviderModels||[];e.innerHTML="";const n=document.createElement("div");if(n.className="included-models-count",n.textContent=`Included: ${y.size} models`,e.appendChild(n),y.size===0){e.innerHTML+='<p class="no-items-message">Select models from the list on the left.</p>';return}t.filter(a=>y.has(a.id)).forEach(a=>{const r=document.createElement("div");r.className="model-manager-item",r.innerHTML=`<label>${a.name} &nbsp;•&nbsp; <small>${a.id}</small></label>`,e.appendChild(r)})}function ie(){const e=document.getElementById("admin-model-plan-list"),t=document.getElementById("admin-model-search-input"),n=document.getElementById("admin-filter-selected-toggle");if(!e||!t||!n)return;let a=S.getState().systemProviderModels||[];const r=t.value.toLowerCase(),o=n.checked;e.innerHTML="",o&&(a=a.filter(c=>y.has(c.id))),a.filter(c=>c.name.toLowerCase().includes(r)||c.id.toLowerCase().includes(r)).forEach((c,m)=>{const l=y.has(c.id),d=document.createElement("div");d.className="model-manager-item",d.innerHTML=`
            <input type="checkbox" id="admin-model-cb-${c.id}" data-model-id="${c.id}" data-index="${m}" ${l?"checked":""}>
            <label for="admin-model-cb-${c.id}">
                ${c.name} &nbsp;•&nbsp; <small>${c.id}</small>
            </label>
        `,e.appendChild(d)})}function It(){const e=k()&&O(),t=document.querySelector('label[for="admin-preset-selector"]'),n=document.querySelector('label[for="admin-preset-name-input"]'),s=document.getElementById("admin-preset-name-input"),a=document.getElementById("admin-delete-preset-btn"),r=document.getElementById("import-presets-btn"),o=document.getElementById("export-presets-btn");t&&(t.textContent=e?"Edit Plan Allowlist":"Edit Plan Preset"),n&&(n.textContent=e?"Plan Name":"Preset Name"),s&&(s.readOnly=e,s.placeholder=e?"Managed by billing plans":"e.g., pro_tier_models"),a&&(a.style.display=e?"none":""),r&&(r.style.display=e?"none":""),o&&(o.textContent=e?"Export Access":"Export")}function Y(){const e=document.getElementById("admin-preset-selector"),t=document.getElementById("admin-preset-name-input");if(!e||!t)return;const n=k()&&O(),s=n?ke():te(),a=e.value;if(n)e.innerHTML="",fe().forEach(o=>{e.add(new Option(o.name,o.key))});else{e.innerHTML='<option value="--new--">-- Create New Plan Preset --</option>';for(const o in s)e.add(new Option(s[o].name,o))}s[a]?e.value=a:n&&(e.value=fe()[0]?.key||"");const r=e.value;!n&&r==="--new--"?(t.value="",y.clear()):s[r]&&(t.value=s[r].name,y=new Set(s[r].modelIds)),It(),ie(),W()}function wt(){const e=document.getElementById("admin-save-preset-btn"),t=document.getElementById("admin-delete-preset-btn"),n=document.getElementById("admin-preset-selector"),s=document.getElementById("admin-model-plan-list"),a=document.getElementById("admin-model-search-input"),r=document.getElementById("admin-filter-selected-toggle"),o=document.getElementById("admin-select-all-btn"),i=document.getElementById("admin-deselect-all-btn"),c=document.getElementById("import-presets-btn"),m=document.getElementById("export-presets-btn"),l=document.createElement("input");l.type="file",l.accept=".json",l.style.display="none",c?.addEventListener("click",()=>l.click()),m?.addEventListener("click",xt),l.addEventListener("change",$t),e?.addEventListener("click",()=>At(y)),t?.addEventListener("click",kt),n?.addEventListener("change",Y),a?.addEventListener("input",ie),r?.addEventListener("change",ie),o?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(p=>{p.checked=!0,y.add(p.dataset.modelId)}),W()}),i?.addEventListener("click",()=>{s.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(p=>{p.checked=!1,y.delete(p.dataset.modelId)}),W()}),s?.addEventListener("click",d=>{const p=d.target.closest('input[type="checkbox"]');if(!p)return;const v=Array.from(s.querySelectorAll('input[type="checkbox"]')),h=v.indexOf(p);if(d.altKey||d.metaKey){d.preventDefault();const f=p.dataset.modelId,b=y.has(f)&&y.size===1;y.clear(),b||y.add(f),v.forEach(g=>g.checked=y.has(g.dataset.modelId))}else if(d.shiftKey&&G>-1){d.preventDefault();const f=Math.min(h,G),b=Math.max(h,G);for(let g=f;g<=b;g++)v[g].checked=!0,y.add(v[g].dataset.modelId)}else{const f=p.dataset.modelId;p.checked?y.add(f):y.delete(f)}G=h,W()}),S.bus.subscribe("models:loaded",()=>{console.log("Model list updated. Re-rendering Admin Model Manager."),Y()}),S.bus.subscribe("admin:presetsChanged",Y)}let q=null,X=null;function F(e){return JSON.parse(JSON.stringify(e))}function Ct(e){return{user_id:e,balance_microcredits:0,monthly_credit_balance_microcredits:0,topup_credit_balance_microcredits:0,monthly_credit_expires_at:null,lifetime_purchased_microcredits:0,lifetime_consumed_microcredits:0,created_at:null,updated_at:null}}function _t(e="free"){const t=String(e||"free").trim().toLowerCase()||"free";return{code:t,name:t.charAt(0).toUpperCase()+t.slice(1),monthly_price_usd:0,included_microcredits:0,is_active:!0}}function Lt(e,t,n){return{authUser:{id:e.id,email:e.email,role:e.role,app_metadata:{role:e.role},user_metadata:{display_name:e.display_name}},profile:e,wallet:t||Ct(e.id),plan:n||_t(e.plan_code)}}function Bt(e){return(Array.isArray(e)?e:[]).map(n=>x(n)).filter(Boolean)}function Ue(){const e=new Map,t=n=>{const s=String(n?.userId||"").trim();!s||e.has(s)||e.set(s,n)};return Array.isArray(q)&&q.length>0&&Bt(q).forEach(t),Ie().forEach(t),Array.from(e.values())}function me(e){return X=(Array.isArray(e)?e:[]).map(F),_()}function _(){return Array.isArray(X)?X.map(F):Ue().map(F)}function I(e){const t=String(e||"").trim();if(!t)return null;const n=_().find(s=>String(s?.userId||"").trim()===t);return n?F(n):null}function Ne(e){const t=F(e),n=String(t?.userId||"").trim();if(!n)return _();const s=_(),a=s.findIndex(r=>String(r?.userId||"").trim()===n);return a>=0?s[a]=t:s.push(t),me(s)}function Pt(e,t={}){const n=String(e||"").trim();if(!n)return _();const s=String(t.linkedBackendUserId||"").trim(),a=_().filter(r=>{const o=String(r?.userId||"").trim();if(!o||o===n)return!1;if(s){const i=String(r?.externalAuthUserId||r?.backendAccount?.userId||"").trim();if(i&&i===s||o===`sb_${s}`)return!1}return!0});return me(a)}async function Dt(){if(!k())return q=null,X=Ie().map(F),_();const e=se();if(!e)throw new Error("Supabase client is not available.");const[t,n,s]=await Promise.all([e.from("profiles").select("id, email, display_name, role, status, plan_code, account_status, trial_expires_at, access_pass_expires_at, created_at, updated_at").order("created_at",{ascending:!0}),e.from("wallets").select("user_id, balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at, lifetime_purchased_microcredits, lifetime_consumed_microcredits, created_at, updated_at"),e.from("plans").select("code, name, monthly_price_usd, included_microcredits, is_active")]);if(t.error)throw t.error;if(n.error)throw n.error;if(s.error)throw s.error;const a=new Map((Array.isArray(n.data)?n.data:[]).map(i=>[i.user_id,i])),r=new Map((Array.isArray(s.data)?s.data:[]).map(i=>[i.code,i])),o=(Array.isArray(t.data)?t.data:[]).map(i=>Lt(i,a.get(i.id),r.get(i.plan_code)));return q=Qe(o,{publish:!1}),me(Ue())}const ae="promptPrimAdminBilling_v1";function be(){return{balanceUSD:10,usedUSD:0,markupRate:2.5,providerSource:"manual",providerSyncedAt:null,providerKeyLabel:"",providerLimit:null,providerLimitRemaining:null,providerLastError:""}}function J(){const e=localStorage.getItem(ae);return e?{...be(),...JSON.parse(e)}:be()}function Mt(e){const t=J(),n=parseFloat(e.markupRate);Number.isFinite(n)&&n>0&&(t.markupRate=n),t.providerSource!=="openrouter"&&(t.balanceUSD=parseFloat(e.balanceUSD)||0),localStorage.setItem(ae,JSON.stringify(t))}function Tt(e){const t=J();t.balanceUSD=Number(e?.credits?.totalCredits)||0,t.usedUSD=Number(e?.credits?.totalUsage)||0,t.providerSource="openrouter",t.providerSyncedAt=e?.syncedAt||new Date().toISOString(),t.providerKeyLabel=String(e?.key?.label||"").trim(),t.providerLimit=Number.isFinite(Number(e?.key?.limit))?Number(e.key.limit):null,t.providerLimitRemaining=Number.isFinite(Number(e?.key?.limitRemaining))?Number(e.key.limitRemaining):null,t.providerLastError="",localStorage.setItem(ae,JSON.stringify(t))}function Ut(e){const t=J();t.providerLastError=String(e||"").trim(),localStorage.setItem(ae,JSON.stringify(t))}function j(){return k()}async function Nt(){if(!k())throw new Error("Supabase is not configured.");const e=se();if(!e)throw new Error("Supabase client is not available.");const{data:t,error:n}=await e.auth.refreshSession();if(n)throw new Error("Your Supabase session has expired. Please sign out and sign back in.");const s=String(t?.session?.access_token||"").trim();if(!s)throw new Error("No valid Supabase access token is available. Please sign in again.");const a=String(St()||"").trim().replace(/\/+$/,""),r=String(Et()||"").trim();if(!a||!r)throw new Error("Supabase function endpoint is not configured.");let o;try{o=await fetch(`${a}/functions/v1/openrouter-credits`,{method:"GET",headers:{apikey:r,Authorization:`Bearer ${s}`}})}catch(l){throw new Error(l instanceof Error?`Could not reach Supabase Edge Functions: ${l.message}`:"Could not reach Supabase Edge Functions.")}let i=null;try{i=await o.json()}catch{i=null}if(o.ok)return i;const c=i?.error||i?.message||"The provider sync function returned an error.",m=[];throw o.status===401&&m.push("The current Supabase session is missing or expired."),o.status===403&&m.push("The signed-in user is not being recognized as an admin."),i?.key?.isManagementKey===!1&&m.push("The configured OpenRouter key is not a management key."),typeof i?.key?.label=="string"&&i.key.label.trim()&&m.push(`OpenRouter key label: ${i.key.label.trim()}.`),new Error(m.length>0?`${c} ${m.join(" ")}`:c)}function B(e,t="info"){e&&(e.classList.remove("is-success","is-error","is-loading"),t==="success"&&e.classList.add("is-success"),t==="error"&&e.classList.add("is-error"),t==="loading"&&e.classList.add("is-loading"))}function Ft(){const e=we(),t=document.getElementById("admin-api-key"),n=document.getElementById("admin-ollama-url");t&&(t.value=e.openrouterKey||""),n&&(n.value=e.ollamaBaseUrl||"")}function ge(e){if(!e)return"";const t=new Date(e);return Number.isNaN(t.getTime())?"":t.toLocaleString()}async function Rt(){const e=et(),t=_().reduce((s,a)=>s+(Number(a?.credits?.current)||0),0),n=Math.max(e,t);if(!D())return{totalIssuedMicrocredits:n,source:"local"};try{const s=await tt(),a=Math.max(Number(s?.totalIssuedMicrocredits)||0,0);return{totalIssuedMicrocredits:Math.max(a,n),source:a>=n?"backend":"visible-users"}}catch(s){return console.error("Failed to load backend wallet pool summary. Falling back to local user credits.",s),{totalIssuedMicrocredits:n,source:"local"}}}async function Ot(){const e=J(),{totalIssuedMicrocredits:t,source:n}=await Rt(),s=document.getElementById("billing-balance-usd"),a=document.getElementById("billing-used-usd"),r=document.getElementById("billing-remaining-usd"),o=document.getElementById("billing-markup-rate"),i=document.getElementById("billing-distributable-credits"),c=document.getElementById("billing-issued-credits"),m=document.getElementById("billing-warning-message"),l=document.getElementById("billing-sync-status"),d=document.getElementById("sync-openrouter-balance-btn"),p=(e.balanceUSD||0)-(e.usedUSD||0),v=e.markupRate||1,h=p*v*1e6,f=t/(v*1e6);if(s&&(s.value=(e.balanceUSD||0).toFixed(2)),s&&(s.readOnly=e.providerSource==="openrouter"),o&&(o.value=v),a&&(a.value=(e.usedUSD||0).toFixed(6)),r&&(r.value=p.toFixed(8)),i&&(i.value=h.toLocaleString("en-US",{maximumFractionDigits:0})),c&&(c.value=`$${f.toFixed(2)}`),c&&(c.title=n==="backend"?"Calculated from the live sum of all non-admin Supabase wallet balances.":n==="visible-users"?"Calculated from the highest visible non-admin wallet total to avoid understating issued credits.":"Calculated from the local user credit cache."),d&&(d.disabled=!j()),l)if(!j())l.textContent="Provider sync requires Supabase auth and a deployed Edge Function.",B(l,"info");else if(e.providerLastError&&e.providerSource==="openrouter"){const b=ge(e.providerSyncedAt);l.textContent=b?`Last OpenRouter sync was ${b}. Latest sync failed: ${e.providerLastError}`:`Latest provider sync failed: ${e.providerLastError}`,B(l,"error")}else if(e.providerLastError)l.textContent=`Provider sync unavailable: ${e.providerLastError}`,B(l,"error");else if(e.providerSource==="openrouter"){const b=ge(e.providerSyncedAt),g=e.providerKeyLabel?` Key: ${e.providerKeyLabel}.`:"";l.textContent=b?`Live OpenRouter balance synced at ${b}.${g}`:`Live OpenRouter balance is active.${g}`,B(l,"success")}else l.textContent="Using local billing values until provider sync succeeds.",B(l,"info");if(m)if(f>p){const b=f-p;m.innerHTML=`⚠️ **Warning:** You have issued credits worth ~$${f.toFixed(2)}, but only have ~$${p.toFixed(2)} remaining. You have a deficit of <strong>$${b.toFixed(2)}</strong>.`,m.classList.remove("hidden","billing-safe"),m.classList.add("billing-warning")}else m.textContent="✅ Credit pool is sufficient to cover all issued credits.",m.classList.remove("hidden","billing-warning"),m.classList.add("billing-safe")}function R(){Ot().catch(e=>{console.error("Failed to render admin billing info.",e)})}async function ye(){const e=document.getElementById("sync-openrouter-balance-btn"),t=document.getElementById("billing-sync-status");if(!j()){t&&(t.textContent="Provider sync requires Supabase auth plus a deployed Edge Function.",B(t,"error"));return}e&&(e.disabled=!0,e.textContent="Syncing..."),t&&(t.textContent="Syncing live OpenRouter balance...",B(t,"loading"));try{const n=await Nt();Tt(n),R()}catch(n){console.error(n);const s=n instanceof Error?n.message:"Unknown sync error.";Ut(s),R()}finally{e&&(e.disabled=!j(),e.textContent="Sync OpenRouter Balance")}}async function Vt(){const e=J(),t=e.providerSource==="openrouter"?e.balanceUSD:document.getElementById("billing-balance-usd").value,n=document.getElementById("billing-markup-rate").value;if(Xe())try{await Ze(n)}catch(s){const a=s instanceof Error?s.message:"Could not save backend billing settings.";u(a,"Save Failed");return}Mt({balanceUSD:t,markupRate:n}),u("Billing settings saved!","Success"),R()}function zt(){Ft(),document.getElementById("save-system-settings-btn")?.addEventListener("click",()=>{const e=document.getElementById("admin-api-key").value,t=document.getElementById("admin-ollama-url").value;We({openrouter:e,ollamaBaseUrl:t}),u("System API settings saved!","Success"),console.log("API Keys saved, triggering a full model refresh..."),Ye()}),R(),document.getElementById("sync-openrouter-balance-btn")?.addEventListener("click",ye),document.getElementById("save-billing-btn")?.addEventListener("click",()=>{Vt().catch(e=>{console.error("Failed to save billing settings.",e)})}),S.bus.subscribe("user:settingsUpdated",R),j()&&ye().catch(e=>{console.error("Initial provider balance sync failed.",e)})}function ve(e){const t=`Timestamp,Model,PromptTokens,CompletionTokens,TotalTokens,CostUSD,Speed(TPS)
`,n=e.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),r=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A";return[`"${E(s.timestamp)}"`,`"${s.model}"`,s.promptTokens||0,s.completionTokens||0,a,(s.costUSD||0).toFixed(8),r].join(",")}).join(`
`);return t+n}async function qt(e){const t=I(e)||x(e);if(!t){alert("No activity to export.");return}if(D(t)){const o=await Ce(t,{limit:500});if(o.length===0){alert("No activity to export.");return}const i=o.map(p=>({timestamp:p.timestamp,model:p.model,promptTokens:p.promptTokens,completionTokens:p.completionTokens,costUSD:p.providerCostUSD,duration:0})),c=ve(i),m=new Blob([c],{type:"text/csv;charset=utf-8;"}),l=URL.createObjectURL(m),d=document.createElement("a");d.setAttribute("href",l),d.setAttribute("download",`activity_log_${t.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(d),d.click(),document.body.removeChild(d);return}if(!t.activityLog||t.activityLog.length===0){alert("No activity to export.");return}const n=ve(t.activityLog),s=new Blob([n],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),r=document.createElement("a");r.setAttribute("href",a),r.setAttribute("download",`activity_log_${t.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(r),r.click(),document.body.removeChild(r)}const Z=document.getElementById("activity-log-modal"),M=document.getElementById("activity-log-body"),he=document.getElementById("activity-log-title");let ce=null;function z(){Z.style.display="flex"}function jt(){Z.style.display="none"}async function Fe(e){ce=e;const t=I(e)||x(e);if(!t||!M||!he)return;if(he.textContent=`Activity Log for ${t.userName}`,D(t))try{const s=await Ce(t,{limit:100});if(s.length===0){M.innerHTML="<p>No backend activity recorded for this user.</p>",z();return}const a=s.map(r=>`
                <tr>
                    <td>${E(r.timestamp)}</td>
                    <td>${r.model}</td>
                    <td>${r.promptTokens}</td>
                    <td>${r.completionTokens}</td>
                    <td>${r.totalTokens}</td>
                    <td style="text-align: right;">$${r.providerCostUSD.toFixed(6)}</td>
                    <td style="text-align: right;">$${r.chargedUSD.toFixed(6)}</td>
                    <td>${r.status}</td>
                </tr>
            `).join("");M.innerHTML=`
                <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                    <table class="activity-log-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Model</th>
                                <th>Prompt Tokens</th>
                                <th>Completion Tokens</th>
                                <th>Total Tokens</th>
                                <th style="text-align: right;">Provider Cost</th>
                                <th style="text-align: right;">Charged</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${a}
                        </tbody>
                    </table>
                </div>
            `,z();return}catch(s){M.innerHTML=`<p>${s instanceof Error?s.message:"Could not load backend activity."}</p>`,z();return}if(!t.activityLog||t.activityLog.length===0){M.innerHTML="<p>No activity recorded for this user.</p>",z();return}const n=t.activityLog.map(s=>{const a=(s.promptTokens||0)+(s.completionTokens||0),r=s.duration>0?((s.completionTokens||0)/s.duration).toFixed(1):"N/A",o=(s.costUSD||0).toFixed(8),i=s.usageIsEstimated?'<span class="estimate-indicator" title="This is an estimate.">*</span>':"";return`
            <tr>
                <td>${E(s.timestamp)}</td>
                <td>${s.model}</td>
                <td>${s.promptTokens}</td>
                <td>${s.completionTokens}</td>
                <td>${a}${i}</td>
                <td style="text-align: right;">$${o}</td> <td>${r} tps</td>
            </tr>
        `}).reverse().join("");M.innerHTML=`
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
    `,z()}function Ht(){const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",t=>{if(t.target.id==="view-activity-log-btn"){const n=e.dataset.userId;Fe(n).catch(s=>{console.error("Could not load the activity log modal.",s)})}}),Z?.querySelectorAll(".modal-close-btn")?.forEach(t=>{t.addEventListener("click",jt)}),Z?.querySelector("#export-activity-csv-btn")?.addEventListener("click",()=>{ce&&qt(ce).catch(t=>{console.error("Could not export the activity log CSV.",t)})})}const P=document.getElementById("account-log-modal"),T=document.getElementById("account-log-body"),Se=document.getElementById("account-log-title");let le=null;function Kt(){P&&(P.style.display="flex")}function Jt(){P&&(P.style.display="none")}async function Gt(){const e=I(le)||x(le);if(!e)return;let t="";if(D(e)){const r=await _e(e,{limit:200});if(r.length===0)return;const o=`Timestamp,Type,Direction,AmountUSD,ProviderCostUSD,RequestId,Notes
`,i=r.map(c=>[`"${E(c.timestamp)}"`,`"${c.type}"`,c.direction,c.deltaUSD.toFixed(6),c.providerCostUSD.toFixed(6),`"${c.requestId}"`,`"${c.notes.replace(/"/g,'""')}"`].join(",")).join(`
`);t=o+i}else{if(!e.logs)return;const r=`Timestamp,Event,Details,Amount (USD),Balance After (USD)
`,o=[...e.logs].reverse().map(i=>{let c;return typeof i.event=="string"?c=[`"${E(i.timestamp)}"`,`"${i.event}"`,`"${i.details}"`,i.amountUSD||0,i.balanceAfterUSD||0]:c=[`"${E(i.timestamp)}"`,`"${i.action}"`,"","",""],c.join(",")}).join(`
`);t=r+o}const n=new Blob([t],{type:"text/csv;charset=utf-8;"}),s=URL.createObjectURL(n),a=document.createElement("a");a.setAttribute("href",s),a.setAttribute("download",`account_log_${e.userName}.csv`),document.body.appendChild(a),a.click(),document.body.removeChild(a)}async function Re(e){le=e;const t=I(e)||x(e);if(!(!t||!P||!Se||!T)){if(Se.textContent=`Account Log for ${t.userName}`,D(t))try{const n=await _e(t,{limit:100});if(n.length===0)T.innerHTML="<p>No backend wallet activity recorded.</p>";else{const s=n.map(a=>{const r=a.direction==="credit"?"+":"-",o=a.direction==="credit"?"color: var(--success-color);":"color: var(--error-color);";return`
                        <tr>
                            <td>${E(a.timestamp)}</td>
                            <td>${a.type||"-"}</td>
                            <td style="text-align: right; ${o}">${r}$${a.deltaUSD.toFixed(6)}</td>
                            <td style="text-align: right;">$${a.providerCostUSD.toFixed(6)}</td>
                            <td>${a.notes||"-"}</td>
                        </tr>
                    `}).join("");T.innerHTML=`
                    <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                        <table class="activity-log-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Type</th>
                                    <th style="text-align: right;">Amount</th>
                                    <th style="text-align: right;">Provider Cost</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>${s}</tbody>
                        </table>
                    </div>
                `}}catch(n){T.innerHTML=`<p>${n instanceof Error?n.message:"Could not load backend wallet activity."}</p>`}else if(!t.logs||t.logs.length===0)T.innerHTML="<p>No account activity recorded.</p>";else{const n=[...t.logs].reverse().map(s=>{if(typeof s.event=="string"){const a=parseFloat(s.amountUSD)||0,r=parseFloat(s.balanceAfterUSD).toFixed(6),o=a>=0?"color: var(--success-color);":"color: var(--error-color);",i=`${a>=0?"+":""}${a.toFixed(a>=0?2:8)}`;return`
                    <tr>
                        <td>${E(s.timestamp)}</td>
                        <td>${s.details}</td>
                        <td style="text-align: right; ${o}">${i}</td>
                        <td style="text-align: right;">$${r}</td>
                    </tr>
                `}else return`
                    <tr>
                        <td>${E(s.timestamp)}</td>
                        <td>${s.action}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">-</td>
                    </tr>
                `}).join("");T.innerHTML=`
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
        `}Kt()}}function Qt(){document.getElementById("user-detail-section")?.addEventListener("click",t=>{if(t.target.id==="view-account-log-btn"){const n=t.currentTarget.dataset.userId;n&&Re(n).catch(s=>{console.error("Could not load the account log modal.",s)})}}),P?.querySelectorAll(".modal-close-btn").forEach(t=>t.addEventListener("click",Jt)),P?.querySelector("#export-account-log-csv-btn")?.addEventListener("click",()=>{Gt().catch(t=>{console.error("Could not export the account log CSV.",t)})})}function Oe(e=null){const t=e||nt();if(!t)return"";const n=String(t.backendAccount?.userId||t.externalAuthUserId||"").trim();if(n)return n;const s=String(t.userId||"").trim();return s.startsWith("sb_")?s.slice(3):""}function Ve(e=null){return k()&&K(e)}async function ze(e,{plan:t,credits:n,monthlyCredits:s,topupCredits:a,accountStatus:r,trialExpiresAt:o,clearTrialExpiresAt:i=!1,accessPassExpiresAt:c,clearAccessPassExpiresAt:m=!1,reason:l=""}={}){if(!Ve(e))throw new Error("Supabase-backed account editing is not available for this user.");const d=se();if(!d)throw new Error("Supabase client is not available.");const p=Oe(e);if(!p)throw new Error("Could not resolve the Supabase user ID for this account.");const v=String(t||e?.backendAccount?.planCode||e?.plan||"free").trim().toLowerCase()||"free",h=n==null||n===""?null:Math.max(0,Number.parseInt(n,10)||0),f=s==null||s===""?null:Math.max(0,Number.parseInt(s,10)||0),b=a==null||a===""?null:Math.max(0,Number.parseInt(a,10)||0),g=String(r||"").trim().toLowerCase()||null,L=String(l||"").trim(),re=i?null:o?new Date(o).toISOString():null,oe=m?null:c?new Date(c).toISOString():null,{data:w,error:V}=await d.rpc("admin_update_user_account",{target_user_id:p,next_plan_code:v,next_balance_microcredits:h,adjustment_reason:L||null,next_monthly_credit_balance_microcredits:f,next_topup_credit_balance_microcredits:b,next_account_status:g,next_trial_expires_at:re,clear_trial_expires_at:i===!0,next_access_pass_expires_at:oe,clear_access_pass_expires_at:m===!0});if(V)throw new Error(V.message||"Could not save the Supabase user account.");return w||{}}async function Wt(e){if(!Ve(e))throw new Error("Supabase-backed account deletion is not available for this user.");const t=se();if(!t)throw new Error("Supabase client is not available.");const n=Oe(e);if(!n)throw new Error("Could not resolve the Supabase user ID for this account.");const{data:s,error:a}=await t.rpc("admin_delete_user_account",{target_user_id:n});if(a)throw new Error(a.message||"Could not delete the Supabase user account.");return s||{}}let $=null,Ee=0,H="";function ee(e,t=0){const n=Number.parseInt(e,10);return Number.isFinite(n)&&n>=0?n:t}function qe(e="free",t="user"){if(String(t||"user").trim().toLowerCase()==="admin")return"studio_active";const s=ue(e||"free");return s==="pro"?"pro_active":s==="studio"?"studio_active":"free"}function Ae(e){if(!e)return"";const t=new Date(e);return Number.isNaN(t.getTime())?"":new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,16)}function xe(e){const t=document.getElementById(e);if(!t)return null;const n=String(t.value||"").trim();if(!n)return null;const s=new Date(n);return Number.isNaN(s.getTime())?null:s.toISOString()}function Yt(e){const t=ne(e),n=document.getElementById("detail-user-plan"),s=document.getElementById("detail-user-account-status"),a=document.getElementById("detail-user-monthly-credits"),r=document.getElementById("detail-user-topup-credits");return{plan:A(e)?"studio":String(n?.value||e.plan||"free").trim().toLowerCase(),accountStatus:String(s?.value||"auto").trim().toLowerCase()||"auto",monthlyCredits:ee(a?.value,t.monthlyMicrocredits),topupCredits:ee(r?.value,t.topupMicrocredits)}}function Xt(e,t={}){if(!e)return e;const n=String(t.accountStatus||"").trim().toLowerCase(),s=A(e)?"studio":ue(t.plan||e.plan||"free"),a=n&&n!=="auto"?n:qe(s,e.role);e.plan=s,e.planStatus=a==="paid_suspended"?"expired":"active",e.gracePeriodStartDate=null,t.clearTrialExpiresAt===!0?e.trialEndsAt=null:Object.prototype.hasOwnProperty.call(t,"trialExpiresAt")?e.trialEndsAt=t.trialExpiresAt||null:s==="free"&&!e.trialEndsAt?e.trialEndsAt=new Date(Date.now()+Pe*24*60*60*1e3).toISOString():s!=="free"&&(e.trialEndsAt=null),t.clearAccessPassExpiresAt===!0?(e.accessPassExpiresAt=null,e.subscriptionEndDate=null):Object.prototype.hasOwnProperty.call(t,"accessPassExpiresAt")&&(e.accessPassExpiresAt=t.accessPassExpiresAt||null,e.subscriptionEndDate=t.accessPassExpiresAt||null);const r=a==="paid_suspended"?0:ee(t.monthlyCredits,Number(e.credits?.monthly)||0),o=ee(t.topupCredits,Number(e.credits?.topup)||0);return e.credits.monthly=r,e.credits.topup=o,e.credits.current=r+o,e.credits.monthlyExpiresAt=r>0?e.plan==="free"&&e.trialEndsAt?e.trialEndsAt:e.credits.monthlyExpiresAt||new Date(Date.now()+720*60*60*1e3).toISOString():null,(!e.backendAccount||typeof e.backendAccount!="object")&&(e.backendAccount={}),e.backendAccount.planCode=s,e.backendAccount.status=a==="paid_suspended"?"suspended":"active",e.backendAccount.accountStatus=a,e.backendAccount.balanceMicrocredits=e.credits.current,e.backendAccount.monthlyCreditBalanceMicrocredits=e.credits.monthly,e.backendAccount.topupCreditBalanceMicrocredits=e.credits.topup,e.backendAccount.monthlyCreditExpiresAt=e.credits.monthlyExpiresAt||null,e.backendAccount.accessPassExpiresAt=e.accessPassExpiresAt||null,e.backendAccount.trialEndsAt=e.trialEndsAt||null,e.backendAccount.syncedAt=new Date().toISOString(),t.reason&&e.logs.push({timestamp:Date.now(),action:t.reason}),e}function je(e=""){return String(e||"").trim()}function Zt(){const e=document.getElementById("user-search-input");e&&document.activeElement!==e&&e.value!==H&&(e.value=H)}async function en(e={}){const t=e.force===!0,n=Date.now();if(!(!t&&n-Ee<4e3))try{await Dt(),Ee=Date.now()}catch(s){console.error("Could not refresh the Supabase-backed admin user directory.",s),e.showError===!0&&u(s instanceof Error?s.message:"Could not refresh users from Supabase.","Refresh Failed")}}function He(e,t){if(!e||!t||typeof t!="object")return e;const n=A(e),s=ue(t.plan_code||e.plan||"free");return e.plan=n?"studio":s,e.planStatus=n?"active":String(t.account_status||t.status||"active").trim().toLowerCase()==="paid_suspended"||String(t.status||"active").trim().toLowerCase()==="suspended"?"expired":"active",e.trialEndsAt=e.plan==="free"&&(t.trial_expires_at||e.trialEndsAt)||null,(!e.credits||typeof e.credits!="object")&&(e.credits={}),e.credits.current=Number(t.balance_microcredits)||0,e.credits.monthly=Number(t.monthly_credit_balance_microcredits)||0,e.credits.topup=Number(t.topup_credit_balance_microcredits)||0,e.credits.monthlyExpiresAt=t.monthly_credit_expires_at||null,e.credits.totalUsage=Number(t.lifetime_consumed_microcredits)||0,e.credits.totalRefilledUSD=U(Number(t.lifetime_purchased_microcredits)||0),e.credits.totalUsedUSD=U(Number(t.lifetime_consumed_microcredits)||0),e.credits.tokenUsage=e.credits.tokenUsage||{prompt:0,completion:0},e.accessPassExpiresAt=t.access_pass_expires_at||null,e.subscriptionEndDate=t.access_pass_expires_at||e.subscriptionEndDate||null,e.backendAccount={...e.backendAccount||{},planCode:String(t.plan_code||e.backendAccount?.planCode||e.plan||"free").trim().toLowerCase(),status:String(t.status||e.backendAccount?.status||"active").trim().toLowerCase(),accountStatus:String(t.account_status||e.backendAccount?.accountStatus||"").trim().toLowerCase(),balanceMicrocredits:Number(t.balance_microcredits)||0,monthlyCreditBalanceMicrocredits:Number(t.monthly_credit_balance_microcredits)||0,topupCreditBalanceMicrocredits:Number(t.topup_credit_balance_microcredits)||0,monthlyCreditExpiresAt:t.monthly_credit_expires_at||null,accessPassExpiresAt:t.access_pass_expires_at||null,walletUpdatedAt:new Date().toISOString(),profileUpdatedAt:new Date().toISOString(),syncedAt:new Date().toISOString()},e}async function Ke(e,t={}){const n=I(e)||x(e);if(!n){u(`Error: User ${e} not found.`,"Error");return}const s=JSON.parse(JSON.stringify(n)),a=Yt(n),r=t.plan??a.plan,o=t.accountStatus??a.accountStatus,i=t.monthlyCredits??a.monthlyCredits,c=t.topupCredits??a.topupCredits,m=i+c,l=Object.prototype.hasOwnProperty.call(t,"trialExpiresAt")?t.trialExpiresAt:xe("detail-user-trial-expires-at"),d=Object.prototype.hasOwnProperty.call(t,"accessPassExpiresAt")?t.accessPassExpiresAt:xe("detail-user-access-pass-expires-at"),p=t.clearTrialExpiresAt===!0,v=t.clearAccessPassExpiresAt===!0,h=String(t.reason||`Admin saved user account controls for ${s.userName}.`).trim();if(s.plan!==r&&(s.logs.push({timestamp:Date.now(),action:`Admin changed plan from ${s.plan} to ${r}.`}),s.plan=r),s.credits.current=m,s.credits.monthly=i,s.credits.topup=c,s.plan==="pro"&&s.credits.current>0&&s.planStatus!=="active"&&(s.planStatus="active",s.gracePeriodStartDate=null,s.logs.push({timestamp:Date.now(),action:"Account status reactivated by admin."})),K(n)){const b=A(n)?String(n.backendAccount?.planCode||"studio").trim().toLowerCase()||"studio":r;try{const g=await ze(n,{plan:b,credits:m,monthlyCredits:i,topupCredits:c,accountStatus:o,trialExpiresAt:l,clearTrialExpiresAt:p,accessPassExpiresAt:d,clearAccessPassExpiresAt:v,reason:h});He(s,g)}catch(g){u(g instanceof Error?g.message:"Could not save the Supabase user profile.","Save Failed");return}}else Xt(s,{plan:r,monthlyCredits:i,topupCredits:c,accountStatus:o,trialExpiresAt:l,clearTrialExpiresAt:p,accessPassExpiresAt:d,clearAccessPassExpiresAt:v,reason:h});Be(s),Ne(s),t.showSuccess!==!1&&u(t.successMessage||`User ${s.userName} updated successfully!`,"Success"),C(),N(e)}async function tn(e,t){const n=I(e)||x(e);if(!n){u(`Error: User ${e} not found.`,"Error");return}if(A(n)){u("Admin profiles do not use platform refill credits here.","Not Applicable");return}if(!K(n)){if(!rt(e,t,{bypassPolicy:!0})){u(`Could not add credits to ${n.userName}.`,"Refill Failed");return}C(),N(e),u(`Successfully added credits worth $${t.toFixed(2)} to ${n.userName}.`,"Success");return}const a=JSON.parse(JSON.stringify(n)),r=ot(),o=Number(r?.markupRate)||1,i=t*o*1e6,c=a.plan,m=ne(a),l=m.topupMicrocredits+i;a.logs.push({timestamp:Date.now(),action:`Admin refilled $${t.toFixed(2)} for ${a.userName}.`});try{const d=await ze(n,{plan:c,monthlyCredits:m.monthlyMicrocredits,topupCredits:l,reason:`Admin refill of $${t.toFixed(2)} for ${a.userName}.`});He(a,d),Be(a),Ne(a),u(`Successfully added credits worth $${t.toFixed(2)} to ${a.userName}.`,"Success")}catch(d){u(d instanceof Error?d.message:"Could not refill the Supabase user wallet.","Refill Failed");return}}async function nn(e){const t=I(e)||x(e);if(!t){u(`Error: User ${e} not found.`,"Error");return}if(A(t)){u("Admin accounts cannot be removed here.","Protected");return}if(confirm(`Delete user "${t.userName}" (${t.email||t.userId})? This cannot be undone.`))try{const n=String(t.externalAuthUserId||t.backendAccount?.userId||"").trim();K(t)&&await Wt(t),it(t.userId,{removeLinkedBackendShadows:!0}),Pt(t.userId,{linkedBackendUserId:n}),$=null;const s=document.getElementById("user-detail-section");s&&(s.classList.add("hidden"),s.innerHTML="",s.dataset.userId=""),C(),u(`Deleted ${t.userName}.`,"User Removed")}catch(n){u(n instanceof Error?n.message:"Could not delete this user.","Delete Failed")}}function sn(e,t){const n=ne(t),s=Date.now(),a=new Date(s+Pe*24*60*60*1e3).toISOString(),r=new Date(s+720*60*60*1e3).toISOString();switch(e){case"reset-credits":return{monthlyCredits:0,topupCredits:0,reason:`Admin reset all credits for ${t.userName}.`,successMessage:`Credits reset for ${t.userName}.`};case"suspend-account":return{accountStatus:"paid_suspended",reason:`Admin suspended access for ${t.userName}.`,successMessage:`${t.userName} is now suspended.`};case"reactivate-account":return{accountStatus:"auto",reason:`Admin reactivated ${t.userName} from the current plan.`,successMessage:`${t.userName} reactivated from plan settings.`};case"reset-trial":return{plan:"free",accountStatus:"free",trialExpiresAt:a,monthlyCredits:Math.max(n.monthlyMicrocredits,ct),reason:`Admin reset the free trial for ${t.userName}.`,successMessage:`Free trial reset for ${t.userName}.`};case"expire-trial":return{plan:"free",accountStatus:"free",trialExpiresAt:new Date(s-60*1e3).toISOString(),monthlyCredits:0,reason:`Admin expired the free trial for ${t.userName}.`,successMessage:`Free trial expired for ${t.userName}.`};case"grant-access-pass":return{plan:"studio",accountStatus:"studio_active",accessPassExpiresAt:r,reason:`Admin granted a 30-day Studio Access Pass to ${t.userName}.`,successMessage:`30-day Studio Access Pass granted to ${t.userName}.`};case"expire-access-pass":return{accessPassExpiresAt:new Date(s-60*1e3).toISOString(),accountStatus:"paid_suspended",reason:`Admin expired the Studio Access Pass for ${t.userName}.`,successMessage:`Studio Access Pass expired for ${t.userName}.`};default:return null}}function an(e,t){const n=I(e)||x(e);if(!n){u(`Error: User ${e} not found.`,"Error");return}const s=sn(t,n);s&&Ke(e,s)}function rn(){const e=prompt("Enter the new user's name:");if(!e)return;const t=prompt(`Enter the email for ${e}:`);if(!t)return;const n=at(e,t);n?(u(`Successfully created user: ${e} (ID: ${n.userId})`,"User Created"),C()):u("Failed to create user. Please check the console.","Error")}function on(e){if(!e||!e.plan)return{text:"Error",class:"status-blocked"};const t=e.credits?.current??0,n=Le(e);return A(e)?{text:"Admin",class:"status-active"}:n==="studio_active"?{text:"Studio",class:"status-active"}:n==="paid_suspended"?{text:"Suspended",class:"status-blocked"}:e.plan==="free"?lt(e)?{text:"Trial Ended",class:"status-blocked"}:t>0?{text:"Free",class:"status-free"}:{text:"Blocked",class:"status-blocked"}:e.plan==="pro"?e.planStatus==="active"&&t>0?{text:"Active",class:"status-active"}:e.planStatus==="grace_period"?{text:"Grace Period",class:"status-grace"}:{text:"Blocked",class:"status-blocked"}:{text:"Unknown",class:""}}function cn(e){const t=document.createElement("div");t.className="user-list-item",e.userId===$&&t.classList.add("active"),t.dataset.userId=e.userId;const n=on(e),s=A(e)?"Admin":e.plan||"unknown",a=e.credits?.current??0,r=U(a);return t.innerHTML=`
        <div><span class="status-indicator ${n.class}">${n.text}</span></div>
        <div class="user-name-email">
            ${e.userName||"N/A"}
            <small>${e.userId} / ${e.email||"N/A"}</small>
        </div>
        <div>${s.charAt(0).toUpperCase()+s.slice(1)}</div>
        <div>$${r.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `,t}function C(){const e=document.getElementById("user-list-container"),t=je(H).toLowerCase(),n=document.getElementById("user-plan-filter").value;if(!e)return;Zt();const a=_().filter(r=>{if(!r||!r.plan||n!=="all"&&r.plan!==n)return!1;if(!t)return!0;const o=String(r.userName||"").toLowerCase(),i=String(r.email||"").toLowerCase(),c=String(r.userId||"").toLowerCase();return o.includes(t)||i.includes(t)||c.includes(t)});e.innerHTML="",a.forEach(r=>e.appendChild(cn(r)))}async function Q(e={}){if(await en(e),C(),$)if(I($)||x($))N($);else{const n=document.getElementById("user-detail-section");n&&(n.classList.add("hidden"),n.innerHTML="",n.dataset.userId=""),$=null}}function N(e){$=e;const t=document.getElementById("user-detail-section");if(!t)return;t.dataset.userId=e;const n=I(e)||x(e);if(!n){t.classList.add("hidden");return}const s=K(n),a=A(n),r=a?"disabled":"",o=A(n)?'<option value="studio" selected>Studio (Admin-managed)</option>':s?`
            <option value="free" ${n.plan==="free"?"selected":""}>Free</option>
            <option value="pro" ${n.plan==="pro"?"selected":""}>Pro</option>
            <option value="studio" ${n.plan==="studio"?"selected":""}>Studio</option>
        `:`
            <option value="free" ${n.plan==="free"?"selected":""}>Free</option>
            <option value="pro" ${n.plan==="pro"?"selected":""}>Pro</option>
            <option value="studio" ${n.plan==="studio"?"selected":""}>Studio</option>
        `;let i="";if(n.plan==="studio"&&!A(n))if(s){const w=n.backendAccount?.accessPassExpiresAt||n.accessPassExpiresAt||null;i=`
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Access</label>
                    <input type="text" value="${w?E(w):"Managed by Stripe subscription / no active access pass"}" readonly class="read-only-display">
                </div>
            `}else{const w=n.subscriptionEndDate?new Date(n.subscriptionEndDate):null,V=w?Math.ceil((w-Date.now())/(1e3*60*60*24)):"N/A",Je=V>0?`${V} days remaining`:"Expired";i=`
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Subscription</label>
                    <input type="text" value="${w?w.toLocaleDateString():"Not set"} (${Je})" readonly class="read-only-display">
                    <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
                </div>
            `}const c=ne(n),m=U(c.totalMicrocredits),l=n.credits.tokenUsage||{prompt:0,completion:0},d=l.prompt+l.completion,p=U(c.monthlyMicrocredits),v=U(c.topupMicrocredits),h=n.backendAccount?.accessPassExpiresAt||n.accessPassExpiresAt||null,f=n.trialEndsAt||n.backendAccount?.trialEndsAt||null,b=a?"studio_active":Le(n),g=qe(n.plan,n.role),L=b===g?"auto":b,re=Ae(f),oe=Ae(h);t.innerHTML=`
        <h4>Details for ${n.userName} (${n.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan" ${r}>
                        ${o}
                    </select>
                </div>
                <div class="form-group">
                    <label>Account Status</label>
                    <select id="detail-user-account-status" ${r}>
                        <option value="auto" ${L==="auto"?"selected":""}>Auto From Plan</option>
                        <option value="free" ${L==="free"?"selected":""}>Free</option>
                        <option value="studio_active" ${L==="studio_active"?"selected":""}>Studio Active</option>
                        <option value="pro_active" ${L==="pro_active"?"selected":""}>Pro Active</option>
                        <option value="paid_suspended" ${L==="paid_suspended"?"selected":""}>Paid Suspended</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Monthly Credits (Microcredits)</label>
                    <input type="number" id="detail-user-monthly-credits" min="0" value="${c.monthlyMicrocredits}" ${r}>
                </div>
                <div class="form-group">
                    <label>Top-up Credits (Microcredits)</label>
                    <input type="number" id="detail-user-topup-credits" min="0" value="${c.topupMicrocredits}" ${r}>
                </div>
                <div class="form-group">
                    <label>Trial Expires At</label>
                    <input type="datetime-local" id="detail-user-trial-expires-at" value="${re}" ${r}>
                </div>
                <div class="form-group">
                    <label>Access Pass Expires At</label>
                    <input type="datetime-local" id="detail-user-access-pass-expires-at" value="${oe}" ${r}>
                </div>
                <div class="form-group">
                    <label>Money Refill (USD)</label>
                    <div class="refill-presets">
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="5" ${r}>$5</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="10" ${r}>$10</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="30" ${r}>$30</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="50" ${r}>$50</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="100" ${r}>$100</button>
                    </div>
                </div>
                <button id="detail-save-user-btn" class="btn" ${r}>Save Account Controls</button>
                <div class="admin-test-controls">
                    <label>Quick Test Controls</label>
                    <div class="admin-quick-action-grid">
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reset-credits" ${r}>Reset Credits</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="suspend-account" ${r}>Suspend</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reactivate-account" ${r}>Reactivate</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reset-trial" ${r}>Reset Trial</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="expire-trial" ${r}>Expire Trial</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="grant-access-pass" ${r}>Grant Access Pass</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="expire-access-pass" ${r}>Expire Access Pass</button>
                        <button class="btn btn-small btn-danger" data-action="delete-user" ${r}>Delete User</button>
                    </div>
                </div>
                <div>
                    ${i}
                </div>
            </div>
            <div>
                <div class="form-group">
                    <label>Balance (USD Value)</label>
                    <input type="text" value="$${m.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Effective Account Status</label>
                    <input type="text" value="${b}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Monthly Credits (Pro)</label>
                    <input type="text" value="$${p.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Top-up Credits</label>
                    <input type="text" value="$${v.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Studio Access Pass</label>
                    <input type="text" value="${h?E(h):"Not active"}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Trial Ends</label>
                    <input type="text" value="${f?E(f):"Not active"}" readonly class="read-only-display">
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
                <div class="form-group">
                    <label>Total Tokens</label>
                    <input type="text" value="${d.toLocaleString()}" readonly class="read-only-display">
                </div>
                <button id="view-activity-log-btn" class="btn btn-secondary">View Activity Log</button>
                <button id="view-account-log-btn" class="btn btn-secondary">View Account Log</button>
            </div>
        </div>
    `,t.classList.remove("hidden"),C()}async function ln(){await Q();const e=document.getElementById("user-search-input");e&&(e.setAttribute("autocomplete","off"),e.setAttribute("autocapitalize","off"),e.setAttribute("spellcheck","false"),e.value=H,e.addEventListener("input",n=>{H=je(n.target.value),C()})),document.getElementById("user-plan-filter")?.addEventListener("change",C),document.getElementById("refresh-users-btn")?.addEventListener("click",()=>{Q({force:!0,showError:!0}).catch(n=>{console.error("Could not refresh the admin user list.",n)})}),document.getElementById("user-list-container")?.addEventListener("click",n=>{const s=n.target.closest(".user-list-item");if(!s)return;const a=s.dataset.userId;N(a)}),document.getElementById("add-new-user-btn")?.addEventListener("click",rn);const t=document.getElementById("user-detail-section");t&&t.addEventListener("click",n=>{const s=n.target,a=t.dataset.userId;if(a){if(s.id==="detail-save-user-btn"&&Ke(a),s.dataset.action==="refill"){const r=parseInt(s.dataset.amount,10);tn(a,r)}s.dataset.action==="quick-test"&&an(a,s.dataset.quickAction),s.dataset.action==="delete-user"&&nn(a),s.id==="view-activity-log-btn"&&Fe(a),s.id==="view-account-log-btn"&&Re(a),s.dataset.action==="extend-sub"&&(st(a),N(a))}}),S.bus.subscribe("user:settingsUpdated",()=>{console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list."),C(),$&&N($)}),window.addEventListener("focus",()=>{Q({force:!0}).catch(n=>{console.error("Could not refresh users on window focus.",n)})}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&Q({force:!0}).catch(n=>{console.error("Could not refresh users when admin tab became visible.",n)})})}document.getElementById("account-log-modal");document.getElementById("account-log-body");document.getElementById("account-log-title");function dn(e,t){let n=`Metric,Value
`;return n+=`Gross Revenue,$${e.grossRevenue.toFixed(2)}
`,n+=`Total API Costs,$${e.totalCosts.toFixed(6)}
`,n+=`Net Profit/Loss,$${e.netProfit.toFixed(2)}
`,n+=`Active Users,${e.activeUsers}
`,n+=`Total API Calls,${e.totalApiCalls}
`,n+=`Total Tokens Processed,${e.totalTokensProcessed.toLocaleString()}

`,n+=`User,Plan,Total Refilled (USD),Total Usage (USD),Net Value (USD)
`,t.forEach(s=>{n+=`"${s.userName}",${s.plan},${s.totalRefilledUSD.toFixed(2)},${s.totalUsageUSD.toFixed(6)},${s.netValue.toFixed(2)}
`}),n}async function un(){let e,t;if(D())try{const o=await De();e=o.summary,t=o.perUser}catch(o){console.error("Could not load backend report export. Falling back to local report.",o)}(!e||!t)&&(e=Me(),t=Te());const n=dn(e,t),s=new Blob([n],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(s),r=document.createElement("a");r.setAttribute("href",a),r.setAttribute("download",`financial_report_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(r),r.click(),document.body.removeChild(r)}const pe=document.getElementById("financial-report-modal"),$e=document.getElementById("financial-report-body");function mn(){pe.style.display="flex"}function pn(){pe.style.display="none"}async function fn(){if(D())try{return await De()}catch(e){console.error("Could not load backend financial report. Falling back to local report.",e)}return{summary:Me(),perUser:Te()}}async function bn(){if(!$e)return;const e=await fn(),t=e.summary,s=e.perUser.map(a=>`
        <tr>
            <td>${a.userName}</td>
            <td>${a.plan}</td>
            <td>$${a.totalRefilledUSD.toFixed(2)}</td>
            <td>$${a.totalUsageUSD.toFixed(6)}</td>
            <td>$${a.netValue.toFixed(2)}</td>
        </tr>
    `).join("");$e.innerHTML=`
        <h4>Overall Financial Summary</h4>
        <div class="admin-billing-grid" style="margin-bottom: 20px;">
            <div><strong>Gross Revenue:</strong> $${t.grossRevenue.toFixed(2)}</div>
            <div><strong>Total Costs:</strong> $${t.totalCosts.toFixed(6)}</div>
            <div><strong>Net Profit/Loss:</strong> $${t.netProfit.toFixed(2)}</div>
            <div><strong>Active Users:</strong> ${t.activeUsers}</div>
            <div><strong>Total API Calls:</strong> ${t.totalApiCalls.toLocaleString()}</div>
            <div><strong>Total Tokens:</strong> ${t.totalTokensProcessed.toLocaleString()}</div>
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
                <tbody>${s}</tbody>
            </table>
        </div>
    `,mn()}function gn(){document.getElementById("generate-report-btn")?.addEventListener("click",()=>{bn().catch(e=>{console.error("Could not render the financial report.",e)})}),pe?.querySelectorAll(".modal-close-btn").forEach(e=>e.addEventListener("click",pn)),document.getElementById("export-report-csv-btn")?.addEventListener("click",()=>{un().catch(e=>{console.error("Could not export the financial report CSV.",e)})})}function yn(){window.addEventListener("storage",e=>{e.key==="promptPrimUserDatabase_v1"&&(console.log("Admin cross-tab sync: User database updated. Reloading services..."),ht()),e.key==="promptPrimAdminBilling_v1"&&(console.log("Admin cross-tab sync: Billing data updated. Re-rendering billing info..."),R())})}async function vn(){console.log("🚀 Admin Panel Initializing..."),document.body.classList.add("admin-page");const e=await dt({requireAdmin:!0});if(e?.redirected)return;if(await ut(),e?.mode==="supabase"&&e.user){await mt(e.user);try{await pt()}catch(s){console.error("Could not sync backend billing settings in admin mode. Keeping local billing cache for this session.",s)}}const t=we(),n=t.providerEnabled||{};if(await ft({apiKey:n.openrouter!==!1?t.openrouterKey:"",ollamaBaseUrl:n.ollama!==!1?t.ollamaBaseUrl:"",isUserKey:!1}),e?.mode==="supabase")try{await bt(),(S.getState().systemProviderModels||[]).length===0&&await gt({hydrateState:!0})}catch(s){console.error("Could not load backend model access in admin mode. Keeping legacy preset behavior for this session.",s)}yt(),vt("admin-theme-switcher"),zt(),wt(),await ln(),Ht(),Qt(),gn(),yn(),Y(),console.log("🎉 Admin Panel Initialized Successfully.")}document.addEventListener("DOMContentLoaded",vn);
