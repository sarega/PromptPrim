import"./modulepreload-polyfill-B5Qt9EMX.js";import{i as I,h as re,j as dt,k as ut}from"./auth.service-CyrLl83C.js";import{ba as q,bb as Ue,bc as ie,s as m,bd as ve,b as $,be as mt,bf as Ee,bg as Me,bh as pt,bi as S,bj as ft,bk as gt,i as Pe,bl as bt,bm as yt,aQ as Ne,bn as vt,bo as ht,bp as St,aJ as M,bq as At,br as Re,K as A,bs as Fe,R as O,bt as Et,aw as x,aA as oe,aC as R,az as Oe,bu as $t,aD as Ve,aG as xt,bv as kt,bw as It,bx as he,by as ze,bz as wt,aB as Ct,bA as je,bB as qe,bC as He,aM as _t,aN as Lt,aO as Bt,aP as Tt,W as Dt,U as Ut,V as Mt,aS as Pt,ay as Nt,aX as Rt}from"./backend-account-data.service-BJ_WQ4j-.js";async function Ft(e){const t=document.getElementById("admin-preset-selector"),n=document.getElementById("admin-preset-name-input"),a=t.value,s=n.value.trim();if(I()&&q()){try{const o=$.getState().systemProviderModels||[],c=await mt(a,Array.from(e),o);m(`${c.name} access saved to Supabase.`,"Success"),$.bus.publish("admin:presetsChanged")}catch(o){console.error(o),m(`Could not save backend model access: ${o.message||"Unknown error"}`,"Save Failed")}return}if(!s){m("Preset name cannot be empty.","Error");return}const r=s.toLowerCase().replace(/\s+/g,"_"),i=ie();if(r!==a&&i[r]){m(`A preset named "${s}" already exists.`,"Error");return}a!=="--new--"&&a!==r&&delete i[a],i[r]={name:s,modelIds:Array.from(e)},ve(i),m(`Plan Preset "${s}" saved!`,"Success"),$.bus.publish("admin:presetsChanged")}function Ot(){try{const e=I()&&q()?Ue():ie(),t=JSON.stringify(e,null,2),n=new Blob([t],{type:"application/json"}),a=URL.createObjectURL(n),s=document.createElement("a");s.href=a,s.download=`promptprim_plan_presets_${new Date().toISOString().slice(0,10)}.json`,document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(a)}catch(e){m("Error exporting presets."),console.error(e)}}function Vt(e){if(I()&&q()){m("Import is disabled in Supabase mode. Edit each billing plan allowlist and save it instead.","Import Disabled"),e.target.value="";return}const t=e.target.files[0];if(!t)return;const n=new FileReader;n.onload=a=>{try{const s=JSON.parse(a.target.result);if(s&&Object.values(s).every(r=>r.name&&Array.isArray(r.modelIds)))confirm("This will overwrite your current plan presets. Are you sure?")&&(ve(s),$.bus.publish("admin:presetsChanged"),m("Plan presets imported successfully!","Success"));else throw new Error("Invalid preset file format.")}catch(s){m(`Error loading preset file: ${s.message}`),console.error(s)}},n.readAsText(t),e.target.value=""}function zt(){if(I()&&q()){m("Managed billing plans cannot be deleted. Clear the plan selection and save if you want an empty allowlist.","Delete Disabled");return}const e=document.getElementById("admin-preset-selector");if(!e)return;const t=e.value;if(!t||t==="--new--"){m("Please select a preset to delete.","Info");return}const n=ie(),a=n[t]?.name||t;confirm(`Delete plan preset "${a}"?`)&&(delete n[t],ve(n),m(`Deleted preset "${a}".`,"Success"),$.bus.publish("admin:presetsChanged"))}let y=new Set,X=-1;function ee(){const e=document.getElementById("admin-preset-included-list");if(!e)return;const t=$.getState().systemProviderModels||[];e.innerHTML="";const n=document.createElement("div");if(n.className="included-models-count",n.textContent=`Included: ${y.size} models`,e.appendChild(n),y.size===0){e.innerHTML+='<p class="no-items-message">Select models from the list on the left.</p>';return}t.filter(s=>y.has(s.id)).forEach(s=>{const r=document.createElement("div");r.className="model-manager-item",r.innerHTML=`<label>${s.name} &nbsp;•&nbsp; <small>${s.id}</small></label>`,e.appendChild(r)})}function pe(){const e=document.getElementById("admin-model-plan-list"),t=document.getElementById("admin-model-search-input"),n=document.getElementById("admin-filter-selected-toggle");if(!e||!t||!n)return;let s=$.getState().systemProviderModels||[];const r=t.value.toLowerCase(),i=n.checked;e.innerHTML="",i&&(s=s.filter(c=>y.has(c.id))),s.filter(c=>c.name.toLowerCase().includes(r)||c.id.toLowerCase().includes(r)).forEach((c,p)=>{const l=y.has(c.id),d=document.createElement("div");d.className="model-manager-item",d.innerHTML=`
            <input type="checkbox" id="admin-model-cb-${c.id}" data-model-id="${c.id}" data-index="${p}" ${l?"checked":""}>
            <label for="admin-model-cb-${c.id}">
                ${c.name} &nbsp;•&nbsp; <small>${c.id}</small>
            </label>
        `,e.appendChild(d)})}function jt(){const e=I()&&q(),t=document.querySelector('label[for="admin-preset-selector"]'),n=document.querySelector('label[for="admin-preset-name-input"]'),a=document.getElementById("admin-preset-name-input"),s=document.getElementById("admin-delete-preset-btn"),r=document.getElementById("import-presets-btn"),i=document.getElementById("export-presets-btn");t&&(t.textContent=e?"Edit Plan Allowlist":"Edit Plan Preset"),n&&(n.textContent=e?"Plan Name":"Preset Name"),a&&(a.readOnly=e,a.placeholder=e?"Managed by billing plans":"e.g., pro_tier_models"),s&&(s.style.display=e?"none":""),r&&(r.style.display=e?"none":""),i&&(i.textContent=e?"Export Access":"Export")}function te(){const e=document.getElementById("admin-preset-selector"),t=document.getElementById("admin-preset-name-input");if(!e||!t)return;const n=I()&&q(),a=n?Ue():ie(),s=e.value;if(n)e.innerHTML="",Ee().forEach(i=>{e.add(new Option(i.name,i.key))});else{e.innerHTML='<option value="--new--">-- Create New Plan Preset --</option>';for(const i in a)e.add(new Option(a[i].name,i))}a[s]?e.value=s:n&&(e.value=Ee()[0]?.key||"");const r=e.value;!n&&r==="--new--"?(t.value="",y.clear()):a[r]&&(t.value=a[r].name,y=new Set(a[r].modelIds)),jt(),pe(),ee()}function qt(){const e=document.getElementById("admin-save-preset-btn"),t=document.getElementById("admin-delete-preset-btn"),n=document.getElementById("admin-preset-selector"),a=document.getElementById("admin-model-plan-list"),s=document.getElementById("admin-model-search-input"),r=document.getElementById("admin-filter-selected-toggle"),i=document.getElementById("admin-select-all-btn"),o=document.getElementById("admin-deselect-all-btn"),c=document.getElementById("import-presets-btn"),p=document.getElementById("export-presets-btn"),l=document.createElement("input");l.type="file",l.accept=".json",l.style.display="none",c?.addEventListener("click",()=>l.click()),p?.addEventListener("click",Ot),l.addEventListener("change",Vt),e?.addEventListener("click",()=>Ft(y)),t?.addEventListener("click",zt),n?.addEventListener("change",te),s?.addEventListener("input",pe),r?.addEventListener("change",pe),i?.addEventListener("click",()=>{a.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(u=>{u.checked=!0,y.add(u.dataset.modelId)}),ee()}),o?.addEventListener("click",()=>{a.querySelectorAll('.model-manager-item input[type="checkbox"]').forEach(u=>{u.checked=!1,y.delete(u.dataset.modelId)}),ee()}),a?.addEventListener("click",d=>{const u=d.target.closest('input[type="checkbox"]');if(!u)return;const v=Array.from(a.querySelectorAll('input[type="checkbox"]')),h=v.indexOf(u);if(d.altKey||d.metaKey){d.preventDefault();const f=u.dataset.modelId,g=y.has(f)&&y.size===1;y.clear(),g||y.add(f),v.forEach(b=>b.checked=y.has(b.dataset.modelId))}else if(d.shiftKey&&X>-1){d.preventDefault();const f=Math.min(h,X),g=Math.max(h,X);for(let b=f;b<=g;b++)v[b].checked=!0,y.add(v[b].dataset.modelId)}else{const f=u.dataset.modelId;u.checked?y.add(f):y.delete(f)}X=h,ee()}),$.bus.subscribe("models:loaded",()=>{console.log("Model list updated. Re-rendering Admin Model Manager."),te()}),$.bus.subscribe("admin:presetsChanged",te)}let G=null,ne=null;function V(e){return JSON.parse(JSON.stringify(e))}function Ht(e){return{user_id:e,balance_microcredits:0,monthly_credit_balance_microcredits:0,topup_credit_balance_microcredits:0,monthly_credit_expires_at:null,lifetime_purchased_microcredits:0,lifetime_consumed_microcredits:0,created_at:null,updated_at:null}}function Kt(e="free"){const t=String(e||"free").trim().toLowerCase()||"free";return{code:t,name:t.charAt(0).toUpperCase()+t.slice(1),monthly_price_usd:0,included_microcredits:0,is_active:!0}}function Jt(e,t,n){return{authUser:{id:e.id,email:e.email,role:e.role,app_metadata:{role:e.role},user_metadata:{display_name:e.display_name}},profile:e,wallet:t||Ht(e.id),plan:n||Kt(e.plan_code)}}function Gt(e){return(Array.isArray(e)?e:[]).map(n=>S(n)).filter(Boolean)}function Ke(){const e=new Map,t=n=>{const a=String(n?.userId||"").trim();!a||e.has(a)||e.set(a,n)};return Array.isArray(G)&&G.length>0&&Gt(G).forEach(t),Me().forEach(t),Array.from(e.values())}function Se(e){return ne=(Array.isArray(e)?e:[]).map(V),_()}function _(){return Array.isArray(ne)?ne.map(V):Ke().map(V)}function E(e){const t=String(e||"").trim();if(!t)return null;const n=_().find(a=>String(a?.userId||"").trim()===t);return n?V(n):null}function Je(e){const t=V(e),n=String(t?.userId||"").trim();if(!n)return _();const a=_(),s=a.findIndex(r=>String(r?.userId||"").trim()===n);return s>=0?a[s]=t:a.push(t),Se(a)}function Qt(e,t={}){const n=String(e||"").trim();if(!n)return _();const a=String(t.linkedBackendUserId||"").trim(),s=_().filter(r=>{const i=String(r?.userId||"").trim();if(!i||i===n)return!1;if(a){const o=String(r?.externalAuthUserId||r?.backendAccount?.userId||"").trim();if(o&&o===a||i===`sb_${a}`)return!1}return!0});return Se(s)}async function Wt(){if(!I())return G=null,ne=Me().map(V),_();const e=re();if(!e)throw new Error("Supabase client is not available.");const[t,n,a]=await Promise.all([e.from("profiles").select("id, email, display_name, role, status, plan_code, account_status, trial_expires_at, access_pass_expires_at, created_at, updated_at").order("created_at",{ascending:!0}),e.from("wallets").select("user_id, balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at, lifetime_purchased_microcredits, lifetime_consumed_microcredits, created_at, updated_at"),e.from("plans").select("code, name, monthly_price_usd, included_microcredits, is_active")]);if(t.error)throw t.error;if(n.error)throw n.error;if(a.error)throw a.error;const s=new Map((Array.isArray(n.data)?n.data:[]).map(o=>[o.user_id,o])),r=new Map((Array.isArray(a.data)?a.data:[]).map(o=>[o.code,o])),i=(Array.isArray(t.data)?t.data:[]).map(o=>Jt(o,s.get(o.id),r.get(o.plan_code)));return G=pt(i,{publish:!1}),Se(Ke())}const ce="promptPrimAdminBilling_v1";function $e(){return{balanceUSD:10,usedUSD:0,markupRate:2.5,providerSource:"manual",providerSyncedAt:null,providerKeyLabel:"",providerLimit:null,providerLimitRemaining:null,providerLastError:""}}function Y(){const e=localStorage.getItem(ce);return e?{...$e(),...JSON.parse(e)}:$e()}function Yt(e){const t=Y(),n=parseFloat(e.markupRate);Number.isFinite(n)&&n>0&&(t.markupRate=n),t.providerSource!=="openrouter"&&(t.balanceUSD=parseFloat(e.balanceUSD)||0),localStorage.setItem(ce,JSON.stringify(t))}function Xt(e){const t=Y();t.balanceUSD=Number(e?.credits?.totalCredits)||0,t.usedUSD=Number(e?.credits?.totalUsage)||0,t.providerSource="openrouter",t.providerSyncedAt=e?.syncedAt||new Date().toISOString(),t.providerKeyLabel=String(e?.key?.label||"").trim(),t.providerLimit=Number.isFinite(Number(e?.key?.limit))?Number(e.key.limit):null,t.providerLimitRemaining=Number.isFinite(Number(e?.key?.limitRemaining))?Number(e.key.limitRemaining):null,t.providerLastError="",localStorage.setItem(ce,JSON.stringify(t))}function Zt(e){const t=Y();t.providerLastError=String(e||"").trim(),localStorage.setItem(ce,JSON.stringify(t))}function Q(){return I()}async function en(){if(!I())throw new Error("Supabase is not configured.");const e=re();if(!e)throw new Error("Supabase client is not available.");const{data:t,error:n}=await e.auth.refreshSession();if(n)throw new Error("Your Supabase session has expired. Please sign out and sign back in.");const a=String(t?.session?.access_token||"").trim();if(!a)throw new Error("No valid Supabase access token is available. Please sign in again.");const s=String(dt()||"").trim().replace(/\/+$/,""),r=String(ut()||"").trim();if(!s||!r)throw new Error("Supabase function endpoint is not configured.");let i;try{i=await fetch(`${s}/functions/v1/openrouter-credits`,{method:"GET",headers:{apikey:r,Authorization:`Bearer ${a}`}})}catch(l){throw new Error(l instanceof Error?`Could not reach Supabase Edge Functions: ${l.message}`:"Could not reach Supabase Edge Functions.")}let o=null;try{o=await i.json()}catch{o=null}if(i.ok)return o;const c=o?.error||o?.message||"The provider sync function returned an error.",p=[];throw i.status===401&&p.push("The current Supabase session is missing or expired."),i.status===403&&p.push("The signed-in user is not being recognized as an admin."),o?.key?.isManagementKey===!1&&p.push("The configured OpenRouter key is not a management key."),typeof o?.key?.label=="string"&&o.key.label.trim()&&p.push(`OpenRouter key label: ${o.key.label.trim()}.`),new Error(p.length>0?`${c} ${p.join(" ")}`:c)}const Ge="promptPrimAdminAuditLogs_v1",tn=500;function me(){return[]}function fe(e=""){return String(e||"").trim().replace(/^sb_/,"")}function nn(){const e=Pe();return{userId:String(e?.backendAccount?.userId||e?.externalAuthUserId||e?.userId||"").trim().replace(/^sb_/,""),email:String(e?.email||"").trim(),displayName:String(e?.userName||e?.displayName||e?.email||"Admin").trim()}}function Qe(){try{const e=localStorage.getItem(Ge),t=e?JSON.parse(e):me();return Array.isArray(t)?t:me()}catch{return me()}}function an(e=[]){localStorage.setItem(Ge,JSON.stringify(e))}function sn({actionType:e="",summary:t="",targetUserId:n="",targetEmail:a="",targetDisplayName:s="",metadata:r={}}={}){const i=nn();return{id:`local_audit_${Date.now()}_${Math.random().toString(36).slice(2,10)}`,timestamp:new Date().toISOString(),adminUserId:i.userId,adminEmail:i.email,adminDisplayName:i.displayName,actionType:String(e||"").trim().toLowerCase(),summary:String(t||"").trim(),targetUserId:fe(n),targetEmail:String(a||"").trim(),targetDisplayName:String(s||"").trim(),metadata:r&&typeof r=="object"?r:{}}}function We(){return gt()}function Ye(e={}){if(We())return null;const t=sn(e);if(!t.actionType||!t.summary)return null;const n=Qe(),a=[t,...n].slice(0,tn);return an(a),t}async function Xe({limit:e=100,targetUserId:t=""}={}){const n=fe(t);return We()?{source:"backend",entries:await ft({limit:e,targetUserId:n})}:{source:"local",entries:Qe().filter(s=>n?fe(s?.targetUserId)===n:!0).slice(0,e)}}function D(e,t="info"){e&&(e.classList.remove("is-success","is-error","is-loading"),t==="success"&&e.classList.add("is-success"),t==="error"&&e.classList.add("is-error"),t==="loading"&&e.classList.add("is-loading"))}function rn(){const e=Ne(),t=document.getElementById("admin-api-key"),n=document.getElementById("admin-ollama-url");t&&(t.value=e.openrouterKey||""),n&&(n.value=e.ollamaBaseUrl||"")}function xe(e){if(!e)return"";const t=new Date(e);return Number.isNaN(t.getTime())?"":t.toLocaleString()}async function on(){const e=St(),t=_().reduce((a,s)=>a+(Number(s?.credits?.current)||0),0),n=Math.max(e,t);if(!M())return{totalIssuedMicrocredits:n,source:"local"};try{const a=await At(),s=Math.max(Number(a?.totalIssuedMicrocredits)||0,0);return{totalIssuedMicrocredits:Math.max(s,n),source:s>=n?"backend":"visible-users"}}catch(a){return console.error("Failed to load backend wallet pool summary. Falling back to local user credits.",a),{totalIssuedMicrocredits:n,source:"local"}}}async function cn(){const e=Y(),{totalIssuedMicrocredits:t,source:n}=await on(),a=document.getElementById("billing-balance-usd"),s=document.getElementById("billing-used-usd"),r=document.getElementById("billing-remaining-usd"),i=document.getElementById("billing-markup-rate"),o=document.getElementById("billing-distributable-credits"),c=document.getElementById("billing-issued-credits"),p=document.getElementById("billing-warning-message"),l=document.getElementById("billing-sync-status"),d=document.getElementById("sync-openrouter-balance-btn"),u=(e.balanceUSD||0)-(e.usedUSD||0),v=e.markupRate||1,h=u*v*1e6,f=t/(v*1e6);if(a&&(a.value=(e.balanceUSD||0).toFixed(2)),a&&(a.readOnly=e.providerSource==="openrouter"),i&&(i.value=v),s&&(s.value=(e.usedUSD||0).toFixed(6)),r&&(r.value=u.toFixed(8)),o&&(o.value=h.toLocaleString("en-US",{maximumFractionDigits:0})),c&&(c.value=`$${f.toFixed(2)}`),c&&(c.title=n==="backend"?"Calculated from the live sum of all non-admin Supabase wallet balances.":n==="visible-users"?"Calculated from the highest visible non-admin wallet total to avoid understating issued credits.":"Calculated from the local user credit cache."),d&&(d.disabled=!Q()),l)if(!Q())l.textContent="Provider sync requires Supabase auth and a deployed Edge Function.",D(l,"info");else if(e.providerLastError&&e.providerSource==="openrouter"){const g=xe(e.providerSyncedAt);l.textContent=g?`Last OpenRouter sync was ${g}. Latest sync failed: ${e.providerLastError}`:`Latest provider sync failed: ${e.providerLastError}`,D(l,"error")}else if(e.providerLastError)l.textContent=`Provider sync unavailable: ${e.providerLastError}`,D(l,"error");else if(e.providerSource==="openrouter"){const g=xe(e.providerSyncedAt),b=e.providerKeyLabel?` Key: ${e.providerKeyLabel}.`:"";l.textContent=g?`Live OpenRouter balance synced at ${g}.${b}`:`Live OpenRouter balance is active.${b}`,D(l,"success")}else l.textContent="Using local billing values until provider sync succeeds.",D(l,"info");if(p)if(f>u){const g=f-u;p.innerHTML=`⚠️ **Warning:** You have issued credits worth ~$${f.toFixed(2)}, but only have ~$${u.toFixed(2)} remaining. You have a deficit of <strong>$${g.toFixed(2)}</strong>.`,p.classList.remove("hidden","billing-safe"),p.classList.add("billing-warning")}else p.textContent="✅ Credit pool is sufficient to cover all issued credits.",p.classList.remove("hidden","billing-warning"),p.classList.add("billing-safe")}function z(){cn().catch(e=>{console.error("Failed to render admin billing info.",e)})}async function ke(){const e=document.getElementById("sync-openrouter-balance-btn"),t=document.getElementById("billing-sync-status");if(!Q()){t&&(t.textContent="Provider sync requires Supabase auth plus a deployed Edge Function.",D(t,"error"));return}e&&(e.disabled=!0,e.textContent="Syncing..."),t&&(t.textContent="Syncing live OpenRouter balance...",D(t,"loading"));try{const n=await en();Xt(n),z()}catch(n){console.error(n);const a=n instanceof Error?n.message:"Unknown sync error.";Zt(a),z()}finally{e&&(e.disabled=!Q(),e.textContent="Sync OpenRouter Balance")}}async function ln(){const e=Y(),t=e.providerSource==="openrouter"?e.balanceUSD:document.getElementById("billing-balance-usd").value,n=document.getElementById("billing-markup-rate").value,a=Number(e.markupRate)||0,s=Number(n)||0;if(vt())try{await ht(n)}catch(r){const i=r instanceof Error?r.message:"Could not save backend billing settings.";m(i,"Save Failed");return}Yt({balanceUSD:t,markupRate:n}),Ye({actionType:"billing_settings_updated",summary:`Updated billing markup rate to ${s||n}.`,metadata:{source:"local",previousMarkupRate:a,nextMarkupRate:s,balanceUSD:Number(t)||0}}),m("Billing settings saved!","Success"),z()}function dn(){rn(),document.getElementById("save-system-settings-btn")?.addEventListener("click",()=>{const e=document.getElementById("admin-api-key").value,t=document.getElementById("admin-ollama-url").value;bt({openrouter:e,ollamaBaseUrl:t}),m("System API settings saved!","Success"),console.log("API Keys saved, triggering a full model refresh..."),yt()}),z(),document.getElementById("sync-openrouter-balance-btn")?.addEventListener("click",ke),document.getElementById("save-billing-btn")?.addEventListener("click",()=>{ln().catch(e=>{console.error("Failed to save billing settings.",e)})}),$.bus.subscribe("user:settingsUpdated",z),Q()&&ke().catch(e=>{console.error("Initial provider balance sync failed.",e)})}function Ie(e){const t=`Timestamp,Model,PromptTokens,CompletionTokens,TotalTokens,CostUSD,Speed(TPS)
`,n=e.map(a=>{const s=(a.promptTokens||0)+(a.completionTokens||0),r=a.duration>0?((a.completionTokens||0)/a.duration).toFixed(1):"N/A";return[`"${A(a.timestamp)}"`,`"${a.model}"`,a.promptTokens||0,a.completionTokens||0,s,(a.costUSD||0).toFixed(8),r].join(",")}).join(`
`);return t+n}async function un(e){const t=E(e)||S(e);if(!t){alert("No activity to export.");return}if(M(t)){const i=await Re(t,{limit:500});if(i.length===0){alert("No activity to export.");return}const o=i.map(u=>({timestamp:u.timestamp,model:u.model,promptTokens:u.promptTokens,completionTokens:u.completionTokens,costUSD:u.providerCostUSD,duration:0})),c=Ie(o),p=new Blob([c],{type:"text/csv;charset=utf-8;"}),l=URL.createObjectURL(p),d=document.createElement("a");d.setAttribute("href",l),d.setAttribute("download",`activity_log_${t.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(d),d.click(),document.body.removeChild(d);return}if(!t.activityLog||t.activityLog.length===0){alert("No activity to export.");return}const n=Ie(t.activityLog),a=new Blob([n],{type:"text/csv;charset=utf-8;"}),s=URL.createObjectURL(a),r=document.createElement("a");r.setAttribute("href",s),r.setAttribute("download",`activity_log_${t.userName}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(r),r.click(),document.body.removeChild(r)}const ae=document.getElementById("activity-log-modal"),P=document.getElementById("activity-log-body"),we=document.getElementById("activity-log-title");let ge=null;function K(){ae.style.display="flex"}function mn(){ae.style.display="none"}async function Ze(e){ge=e;const t=E(e)||S(e);if(!t||!P||!we)return;if(we.textContent=`Activity Log for ${t.userName}`,M(t))try{const a=await Re(t,{limit:100});if(a.length===0){P.innerHTML="<p>No backend activity recorded for this user.</p>",K();return}const s=a.map(r=>`
                <tr>
                    <td>${A(r.timestamp)}</td>
                    <td>${r.model}</td>
                    <td>${r.promptTokens}</td>
                    <td>${r.completionTokens}</td>
                    <td>${r.totalTokens}</td>
                    <td style="text-align: right;">$${r.providerCostUSD.toFixed(6)}</td>
                    <td style="text-align: right;">$${r.chargedUSD.toFixed(6)}</td>
                    <td>${r.status}</td>
                </tr>
            `).join("");P.innerHTML=`
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
                            ${s}
                        </tbody>
                    </table>
                </div>
            `,K();return}catch(a){P.innerHTML=`<p>${a instanceof Error?a.message:"Could not load backend activity."}</p>`,K();return}if(!t.activityLog||t.activityLog.length===0){P.innerHTML="<p>No activity recorded for this user.</p>",K();return}const n=t.activityLog.map(a=>{const s=(a.promptTokens||0)+(a.completionTokens||0),r=a.duration>0?((a.completionTokens||0)/a.duration).toFixed(1):"N/A",i=(a.costUSD||0).toFixed(8),o=a.usageIsEstimated?'<span class="estimate-indicator" title="This is an estimate.">*</span>':"";return`
            <tr>
                <td>${A(a.timestamp)}</td>
                <td>${a.model}</td>
                <td>${a.promptTokens}</td>
                <td>${a.completionTokens}</td>
                <td>${s}${o}</td>
                <td style="text-align: right;">$${i}</td> <td>${r} tps</td>
            </tr>
        `}).reverse().join("");P.innerHTML=`
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
    `,K()}function pn(){const e=document.getElementById("user-detail-section");e&&e.addEventListener("click",t=>{if(t.target.id==="view-activity-log-btn"){const n=e.dataset.userId;Ze(n).catch(a=>{console.error("Could not load the activity log modal.",a)})}}),ae?.querySelectorAll(".modal-close-btn")?.forEach(t=>{t.addEventListener("click",mn)}),ae?.querySelector("#export-activity-csv-btn")?.addEventListener("click",()=>{ge&&un(ge).catch(t=>{console.error("Could not export the activity log CSV.",t)})})}const U=document.getElementById("account-log-modal"),N=document.getElementById("account-log-body"),Ce=document.getElementById("account-log-title");let be=null;function fn(){U&&(U.style.display="flex")}function gn(){U&&(U.style.display="none")}async function bn(){const e=E(be)||S(be);if(!e)return;let t="";if(M(e)){const r=await Fe(e,{limit:200});if(r.length===0)return;const i=`Timestamp,Type,Direction,AmountUSD,ProviderCostUSD,RequestId,Notes
`,o=r.map(c=>[`"${A(c.timestamp)}"`,`"${c.type}"`,c.direction,c.deltaUSD.toFixed(6),c.providerCostUSD.toFixed(6),`"${c.requestId}"`,`"${c.notes.replace(/"/g,'""')}"`].join(",")).join(`
`);t=i+o}else{if(!e.logs)return;const r=`Timestamp,Event,Details,Amount (USD),Balance After (USD)
`,i=[...e.logs].reverse().map(o=>{let c;return typeof o.event=="string"?c=[`"${A(o.timestamp)}"`,`"${o.event}"`,`"${o.details}"`,o.amountUSD||0,o.balanceAfterUSD||0]:c=[`"${A(o.timestamp)}"`,`"${o.action}"`,"","",""],c.join(",")}).join(`
`);t=r+i}const n=new Blob([t],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(n),s=document.createElement("a");s.setAttribute("href",a),s.setAttribute("download",`account_log_${e.userName}.csv`),document.body.appendChild(s),s.click(),document.body.removeChild(s)}async function et(e){be=e;const t=E(e)||S(e);if(!(!t||!U||!Ce||!N)){if(Ce.textContent=`Account Log for ${t.userName}`,M(t))try{const n=await Fe(t,{limit:100});if(n.length===0)N.innerHTML="<p>No backend wallet activity recorded.</p>";else{const a=n.map(s=>{const r=s.direction==="credit"?"+":"-",i=s.direction==="credit"?"color: var(--success-color);":"color: var(--error-color);";return`
                        <tr>
                            <td>${A(s.timestamp)}</td>
                            <td>${s.type||"-"}</td>
                            <td style="text-align: right; ${i}">${r}$${s.deltaUSD.toFixed(6)}</td>
                            <td style="text-align: right;">$${s.providerCostUSD.toFixed(6)}</td>
                            <td>${s.notes||"-"}</td>
                        </tr>
                    `}).join("");N.innerHTML=`
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
                            <tbody>${a}</tbody>
                        </table>
                    </div>
                `}}catch(n){N.innerHTML=`<p>${n instanceof Error?n.message:"Could not load backend wallet activity."}</p>`}else if(!t.logs||t.logs.length===0)N.innerHTML="<p>No account activity recorded.</p>";else{const n=[...t.logs].reverse().map(a=>{if(typeof a.event=="string"){const s=parseFloat(a.amountUSD)||0,r=parseFloat(a.balanceAfterUSD).toFixed(6),i=s>=0?"color: var(--success-color);":"color: var(--error-color);",o=`${s>=0?"+":""}${s.toFixed(s>=0?2:8)}`;return`
                    <tr>
                        <td>${A(a.timestamp)}</td>
                        <td>${a.details}</td>
                        <td style="text-align: right; ${i}">${o}</td>
                        <td style="text-align: right;">$${r}</td>
                    </tr>
                `}else return`
                    <tr>
                        <td>${A(a.timestamp)}</td>
                        <td>${a.action}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">-</td>
                    </tr>
                `}).join("");N.innerHTML=`
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
        `}fn()}}function yn(){document.getElementById("user-detail-section")?.addEventListener("click",t=>{if(t.target.id==="view-account-log-btn"){const n=t.currentTarget.dataset.userId;n&&et(n).catch(a=>{console.error("Could not load the account log modal.",a)})}}),U?.querySelectorAll(".modal-close-btn").forEach(t=>t.addEventListener("click",gn)),U?.querySelector("#export-account-log-csv-btn")?.addEventListener("click",()=>{bn().catch(t=>{console.error("Could not export the account log CSV.",t)})})}function vn(e=[]){const t=`Timestamp,Admin,Action,Target,Summary,Metadata
`,n=e.map(a=>{const s=[a.targetDisplayName||"",a.targetEmail||""].filter(Boolean).join(" ");return[`"${A(a.timestamp)}"`,`"${String(a.adminEmail||"").replace(/"/g,'""')}"`,`"${String(a.actionType||"").replace(/"/g,'""')}"`,`"${String(s||"").replace(/"/g,'""')}"`,`"${String(a.summary||"").replace(/"/g,'""')}"`,`"${JSON.stringify(a.metadata||{}).replace(/"/g,'""')}"`].join(",")}).join(`
`);return t+n}async function hn({targetUserId:e="",targetLabel:t=""}={}){const a=(await Xe({limit:500,targetUserId:e})).entries||[];if(a.length===0){alert("No audit entries to export.");return}const s=vn(a),r=new Blob([s],{type:"text/csv;charset=utf-8;"}),i=URL.createObjectURL(r),o=document.createElement("a"),c=String(t||"").trim().replace(/\s+/g,"_").toLowerCase()||"all";o.setAttribute("href",i),o.setAttribute("download",`admin_audit_log_${c}_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(o),o.click(),document.body.removeChild(o)}const j=document.getElementById("admin-audit-log-modal"),J=document.getElementById("admin-audit-log-body"),_e=document.getElementById("admin-audit-log-title");let ye="",B="";function Sn(){j&&(j.style.display="flex")}function An(){j&&(j.style.display="none")}function L(e=""){return String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function En(e=""){const t=String(e||"").trim().toLowerCase();switch(t){case"user_account_updated":return"Account Updated";case"user_account_deleted":return"User Deleted";case"billing_settings_updated":return"Billing Updated";default:return t.split("_").filter(Boolean).map(n=>n.charAt(0).toUpperCase()+n.slice(1)).join(" ")||"Audit Event"}}function $n(e=""){const t=String(e||"").trim().toLowerCase();return t.includes("deleted")?"is-danger":t.includes("billing")?"is-warning":"is-info"}function xn(e=""){const t=String(e||"").trim();if(!t)return"";const n=E(t)||S(t)||E(`sb_${t}`)||S(`sb_${t}`);return n?.userName||n?.email||""}async function tt({targetUserId:e="",targetLabel:t=""}={}){if(ye=String(e||"").trim().replace(/^sb_/,""),B=String(t||xn(e)||"").trim(),!(!j||!J||!_e)){_e.textContent=B?`Admin Audit for ${B}`:"Admin Audit Trail",J.innerHTML='<p class="admin-inline-note is-loading">Loading audit entries...</p>',Sn();try{const n=await Xe({limit:100,targetUserId:ye}),a=n.entries||[],s=n.source||"local";if(a.length===0){J.innerHTML=B?`<p>No admin audit entries found for ${L(B)}.</p>`:"<p>No admin audit entries recorded yet.</p>";return}const r=a.map(i=>{const o=[i.targetDisplayName,i.targetEmail].filter(Boolean).join(" ");return`
                <tr>
                    <td>${L(A(i.timestamp))}</td>
                    <td>${L(i.adminEmail||"Admin")}</td>
                    <td>
                        <span class="audit-action-pill ${$n(i.actionType)}">
                            ${L(En(i.actionType))}
                        </span>
                    </td>
                    <td>${L(o||"System")}</td>
                    <td class="audit-summary-cell">${L(i.summary||"-")}</td>
                </tr>
            `}).join("");J.innerHTML=`
            <div class="admin-audit-toolbar">
                <p class="admin-inline-note">
                    ${B?`Showing admin actions for ${L(B)}.`:"Showing the latest admin account and billing control changes."}
                </p>
                <p class="admin-inline-note">
                    ${s==="backend"?"Source: Supabase audit log.":"Source: local development audit log."}
                </p>
            </div>
            <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                <table class="activity-log-table admin-audit-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Admin</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Summary</th>
                        </tr>
                    </thead>
                    <tbody>${r}</tbody>
                </table>
            </div>
        `}catch(n){J.innerHTML=`<p>${L(n instanceof Error?n.message:"Could not load admin audit logs.")}</p>`}}}function kn(){document.getElementById("view-audit-log-btn")?.addEventListener("click",()=>{tt().catch(e=>{console.error("Could not load the admin audit log modal.",e)})}),j?.querySelectorAll(".modal-close-btn").forEach(e=>{e.addEventListener("click",An)}),document.getElementById("export-admin-audit-csv-btn")?.addEventListener("click",()=>{hn({targetUserId:ye,targetLabel:B||"all"}).catch(e=>{console.error("Could not export the admin audit log CSV.",e)})})}function nt(e=null){const t=e||Pe();if(!t)return"";const n=String(t.backendAccount?.userId||t.externalAuthUserId||"").trim();if(n)return n;const a=String(t.userId||"").trim();return a.startsWith("sb_")?a.slice(3):""}function at(e=null){return I()&&O(e)}async function st(e,{plan:t,credits:n,monthlyCredits:a,topupCredits:s,accountStatus:r,trialExpiresAt:i,clearTrialExpiresAt:o=!1,accessPassExpiresAt:c,clearAccessPassExpiresAt:p=!1,reason:l=""}={}){if(!at(e))throw new Error("Supabase-backed account editing is not available for this user.");const d=re();if(!d)throw new Error("Supabase client is not available.");const u=nt(e);if(!u)throw new Error("Could not resolve the Supabase user ID for this account.");const v=String(t||e?.backendAccount?.planCode||e?.plan||"free").trim().toLowerCase()||"free",h=n==null||n===""?null:Math.max(0,Number.parseInt(n,10)||0),f=a==null||a===""?null:Math.max(0,Number.parseInt(a,10)||0),g=s==null||s===""?null:Math.max(0,Number.parseInt(s,10)||0),b=String(r||"").trim().toLowerCase()||null,T=String(l||"").trim(),de=o?null:i?new Date(i).toISOString():null,ue=p?null:c?new Date(c).toISOString():null,{data:w,error:H}=await d.rpc("admin_update_user_account",{target_user_id:u,next_plan_code:v,next_balance_microcredits:h,adjustment_reason:T||null,next_monthly_credit_balance_microcredits:f,next_topup_credit_balance_microcredits:g,next_account_status:b,next_trial_expires_at:de,clear_trial_expires_at:o===!0,next_access_pass_expires_at:ue,clear_access_pass_expires_at:p===!0});if(H)throw new Error(H.message||"Could not save the Supabase user account.");return w||{}}async function In(e){if(!at(e))throw new Error("Supabase-backed account deletion is not available for this user.");const t=re();if(!t)throw new Error("Supabase client is not available.");const n=nt(e);if(!n)throw new Error("Could not resolve the Supabase user ID for this account.");const{data:a,error:s}=await t.rpc("admin_delete_user_account",{target_user_id:n});if(s)throw new Error(s.message||"Could not delete the Supabase user account.");return a||{}}let k=null,Le=0,W="";function se(e,t=0){const n=Number.parseInt(e,10);return Number.isFinite(n)&&n>=0?n:t}function rt(e="free",t="user"){if(String(t||"user").trim().toLowerCase()==="admin")return"studio_active";const a=he(e||"free");return a==="pro"?"pro_active":a==="studio"?"studio_active":"free"}function Be(e){if(!e)return"";const t=new Date(e);return Number.isNaN(t.getTime())?"":new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,16)}function Te(e){const t=document.getElementById(e);if(!t)return null;const n=String(t.value||"").trim();if(!n)return null;const a=new Date(n);return Number.isNaN(a.getTime())?null:a.toISOString()}function wn(e){const t=oe(e),n=document.getElementById("detail-user-plan"),a=document.getElementById("detail-user-account-status"),s=document.getElementById("detail-user-monthly-credits"),r=document.getElementById("detail-user-topup-credits");return{plan:x(e)?"studio":String(n?.value||e.plan||"free").trim().toLowerCase(),accountStatus:String(a?.value||"auto").trim().toLowerCase()||"auto",monthlyCredits:se(s?.value,t.monthlyMicrocredits),topupCredits:se(r?.value,t.topupMicrocredits)}}function Cn(e,t={}){if(!e)return e;const n=String(t.accountStatus||"").trim().toLowerCase(),a=x(e)?"studio":he(t.plan||e.plan||"free"),s=n&&n!=="auto"?n:rt(a,e.role);e.plan=a,e.planStatus=s==="paid_suspended"?"expired":"active",e.gracePeriodStartDate=null,t.clearTrialExpiresAt===!0?e.trialEndsAt=null:Object.prototype.hasOwnProperty.call(t,"trialExpiresAt")?e.trialEndsAt=t.trialExpiresAt||null:a==="free"&&!e.trialEndsAt?e.trialEndsAt=new Date(Date.now()+ze*24*60*60*1e3).toISOString():a!=="free"&&(e.trialEndsAt=null),t.clearAccessPassExpiresAt===!0?(e.accessPassExpiresAt=null,e.subscriptionEndDate=null):Object.prototype.hasOwnProperty.call(t,"accessPassExpiresAt")&&(e.accessPassExpiresAt=t.accessPassExpiresAt||null,e.subscriptionEndDate=t.accessPassExpiresAt||null);const r=s==="paid_suspended"?0:se(t.monthlyCredits,Number(e.credits?.monthly)||0),i=se(t.topupCredits,Number(e.credits?.topup)||0);return e.credits.monthly=r,e.credits.topup=i,e.credits.current=r+i,e.credits.monthlyExpiresAt=r>0?e.plan==="free"&&e.trialEndsAt?e.trialEndsAt:e.credits.monthlyExpiresAt||new Date(Date.now()+720*60*60*1e3).toISOString():null,(!e.backendAccount||typeof e.backendAccount!="object")&&(e.backendAccount={}),e.backendAccount.planCode=a,e.backendAccount.status=s==="paid_suspended"?"suspended":"active",e.backendAccount.accountStatus=s,e.backendAccount.balanceMicrocredits=e.credits.current,e.backendAccount.monthlyCreditBalanceMicrocredits=e.credits.monthly,e.backendAccount.topupCreditBalanceMicrocredits=e.credits.topup,e.backendAccount.monthlyCreditExpiresAt=e.credits.monthlyExpiresAt||null,e.backendAccount.accessPassExpiresAt=e.accessPassExpiresAt||null,e.backendAccount.trialEndsAt=e.trialEndsAt||null,e.backendAccount.syncedAt=new Date().toISOString(),t.reason&&e.logs.push({timestamp:Date.now(),action:t.reason}),e}function it(e=""){return String(e||"").trim()}function _n(){const e=document.getElementById("user-search-input");e&&document.activeElement!==e&&e.value!==W&&(e.value=W)}async function Ln(e={}){const t=e.force===!0,n=Date.now();if(!(!t&&n-Le<4e3))try{await Wt(),Le=Date.now()}catch(a){console.error("Could not refresh the Supabase-backed admin user directory.",a),e.showError===!0&&m(a instanceof Error?a.message:"Could not refresh users from Supabase.","Refresh Failed")}}function ot(e,t){if(!e||!t||typeof t!="object")return e;const n=x(e),a=he(t.plan_code||e.plan||"free");return e.plan=n?"studio":a,e.planStatus=n?"active":String(t.account_status||t.status||"active").trim().toLowerCase()==="paid_suspended"||String(t.status||"active").trim().toLowerCase()==="suspended"?"expired":"active",e.trialEndsAt=e.plan==="free"&&(t.trial_expires_at||e.trialEndsAt)||null,(!e.credits||typeof e.credits!="object")&&(e.credits={}),e.credits.current=Number(t.balance_microcredits)||0,e.credits.monthly=Number(t.monthly_credit_balance_microcredits)||0,e.credits.topup=Number(t.topup_credit_balance_microcredits)||0,e.credits.monthlyExpiresAt=t.monthly_credit_expires_at||null,e.credits.totalUsage=Number(t.lifetime_consumed_microcredits)||0,e.credits.totalRefilledUSD=R(Number(t.lifetime_purchased_microcredits)||0),e.credits.totalUsedUSD=R(Number(t.lifetime_consumed_microcredits)||0),e.credits.tokenUsage=e.credits.tokenUsage||{prompt:0,completion:0},e.accessPassExpiresAt=t.access_pass_expires_at||null,e.subscriptionEndDate=t.access_pass_expires_at||e.subscriptionEndDate||null,e.backendAccount={...e.backendAccount||{},planCode:String(t.plan_code||e.backendAccount?.planCode||e.plan||"free").trim().toLowerCase(),status:String(t.status||e.backendAccount?.status||"active").trim().toLowerCase(),accountStatus:String(t.account_status||e.backendAccount?.accountStatus||"").trim().toLowerCase(),balanceMicrocredits:Number(t.balance_microcredits)||0,monthlyCreditBalanceMicrocredits:Number(t.monthly_credit_balance_microcredits)||0,topupCreditBalanceMicrocredits:Number(t.topup_credit_balance_microcredits)||0,monthlyCreditExpiresAt:t.monthly_credit_expires_at||null,accessPassExpiresAt:t.access_pass_expires_at||null,walletUpdatedAt:new Date().toISOString(),profileUpdatedAt:new Date().toISOString(),syncedAt:new Date().toISOString()},e}function le(e,t,n,a={}){n&&Ye({actionType:e,summary:t,targetUserId:n.userId,targetEmail:n.email||"",targetDisplayName:n.userName||"",metadata:a})}async function ct(e,t={}){const n=E(e)||S(e);if(!n){m(`Error: User ${e} not found.`,"Error");return}const a=JSON.parse(JSON.stringify(n)),s=wn(n),r=t.plan??s.plan,i=t.accountStatus??s.accountStatus,o=t.monthlyCredits??s.monthlyCredits,c=t.topupCredits??s.topupCredits,p=o+c,l=Object.prototype.hasOwnProperty.call(t,"trialExpiresAt")?t.trialExpiresAt:Te("detail-user-trial-expires-at"),d=Object.prototype.hasOwnProperty.call(t,"accessPassExpiresAt")?t.accessPassExpiresAt:Te("detail-user-access-pass-expires-at"),u=t.clearTrialExpiresAt===!0,v=t.clearAccessPassExpiresAt===!0,h=String(t.reason||`Admin saved user account controls for ${a.userName}.`).trim();if(a.plan!==r&&(a.logs.push({timestamp:Date.now(),action:`Admin changed plan from ${a.plan} to ${r}.`}),a.plan=r),a.credits.current=p,a.credits.monthly=o,a.credits.topup=c,a.plan==="pro"&&a.credits.current>0&&a.planStatus!=="active"&&(a.planStatus="active",a.gracePeriodStartDate=null,a.logs.push({timestamp:Date.now(),action:"Account status reactivated by admin."})),O(n)){const g=x(n)?String(n.backendAccount?.planCode||"studio").trim().toLowerCase()||"studio":r;try{const b=await st(n,{plan:g,credits:p,monthlyCredits:o,topupCredits:c,accountStatus:i,trialExpiresAt:l,clearTrialExpiresAt:u,accessPassExpiresAt:d,clearAccessPassExpiresAt:v,reason:h});ot(a,b)}catch(b){m(b instanceof Error?b.message:"Could not save the Supabase user profile.","Save Failed");return}}else Cn(a,{plan:r,monthlyCredits:o,topupCredits:c,accountStatus:i,trialExpiresAt:l,clearTrialExpiresAt:u,accessPassExpiresAt:d,clearAccessPassExpiresAt:v,reason:h}),le("user_account_updated",h,a,{source:"local",nextPlanCode:r,nextAccountStatus:i,nextMonthlyCredits:o,nextTopupCredits:c,trialExpiresAt:l,clearTrialExpiresAt:u,accessPassExpiresAt:d,clearAccessPassExpiresAt:v});Ve(a),Je(a),t.showSuccess!==!1&&m(t.successMessage||`User ${a.userName} updated successfully!`,"Success"),C(),F(e)}async function Bn(e,t){const n=E(e)||S(e);if(!n){m(`Error: User ${e} not found.`,"Error");return}if(x(n)){m("Admin profiles do not use platform refill credits here.","Not Applicable");return}if(!O(n)){if(!xt(e,t,{bypassPolicy:!0})){m(`Could not add credits to ${n.userName}.`,"Refill Failed");return}const u=E(e)||S(e)||n;le("user_account_updated",`Admin refill of $${t.toFixed(2)} for ${n.userName}.`,u,{source:"local",refillAmountUSD:t}),C(),F(e),m(`Successfully added credits worth $${t.toFixed(2)} to ${n.userName}.`,"Success");return}const s=JSON.parse(JSON.stringify(n)),r=kt(),i=Number(r?.markupRate)||1,o=t*i*1e6,c=s.plan,p=oe(s),l=p.topupMicrocredits+o;s.logs.push({timestamp:Date.now(),action:`Admin refilled $${t.toFixed(2)} for ${s.userName}.`});try{const d=await st(n,{plan:c,monthlyCredits:p.monthlyMicrocredits,topupCredits:l,reason:`Admin refill of $${t.toFixed(2)} for ${s.userName}.`});ot(s,d),Ve(s),Je(s),m(`Successfully added credits worth $${t.toFixed(2)} to ${s.userName}.`,"Success")}catch(d){m(d instanceof Error?d.message:"Could not refill the Supabase user wallet.","Refill Failed");return}}async function Tn(e){const t=E(e)||S(e);if(!t){m(`Error: User ${e} not found.`,"Error");return}if(x(t)){m("Admin accounts cannot be removed here.","Protected");return}if(confirm(`Delete user "${t.userName}" (${t.email||t.userId})? This cannot be undone.`))try{const n=String(t.externalAuthUserId||t.backendAccount?.userId||"").trim();O(t)&&await In(t),It(t.userId,{removeLinkedBackendShadows:!0}),Qt(t.userId,{linkedBackendUserId:n}),O(t)||le("user_account_deleted",`Deleted user account ${t.email||t.userName||t.userId}.`,t,{source:"local",deletedUserId:t.userId}),k=null;const a=document.getElementById("user-detail-section");a&&(a.classList.add("hidden"),a.innerHTML="",a.dataset.userId=""),C(),m(`Deleted ${t.userName}.`,"User Removed")}catch(n){m(n instanceof Error?n.message:"Could not delete this user.","Delete Failed")}}function Dn(e,t){const n=oe(t),a=Date.now(),s=new Date(a+ze*24*60*60*1e3).toISOString(),r=new Date(a+720*60*60*1e3).toISOString();switch(e){case"reset-credits":return{monthlyCredits:0,topupCredits:0,reason:`Admin reset all credits for ${t.userName}.`,successMessage:`Credits reset for ${t.userName}.`};case"suspend-account":return{accountStatus:"paid_suspended",reason:`Admin suspended access for ${t.userName}.`,successMessage:`${t.userName} is now suspended.`};case"reactivate-account":return{accountStatus:"auto",reason:`Admin reactivated ${t.userName} from the current plan.`,successMessage:`${t.userName} reactivated from plan settings.`};case"reset-trial":return{plan:"free",accountStatus:"free",trialExpiresAt:s,monthlyCredits:Math.max(n.monthlyMicrocredits,wt),reason:`Admin reset the free trial for ${t.userName}.`,successMessage:`Free trial reset for ${t.userName}.`};case"expire-trial":return{plan:"free",accountStatus:"free",trialExpiresAt:new Date(a-60*1e3).toISOString(),monthlyCredits:0,reason:`Admin expired the free trial for ${t.userName}.`,successMessage:`Free trial expired for ${t.userName}.`};case"grant-access-pass":return{plan:"studio",accountStatus:"studio_active",accessPassExpiresAt:r,reason:`Admin granted a 30-day Studio Access Pass to ${t.userName}.`,successMessage:`30-day Studio Access Pass granted to ${t.userName}.`};case"expire-access-pass":return{accessPassExpiresAt:new Date(a-60*1e3).toISOString(),accountStatus:"paid_suspended",reason:`Admin expired the Studio Access Pass for ${t.userName}.`,successMessage:`Studio Access Pass expired for ${t.userName}.`};default:return null}}function Un(e,t){const n=E(e)||S(e);if(!n){m(`Error: User ${e} not found.`,"Error");return}const a=Dn(t,n);a&&ct(e,a)}function Mn(){const e=prompt("Enter the new user's name:");if(!e)return;const t=prompt(`Enter the email for ${e}:`);if(!t)return;const n=$t(e,t);n?(le("user_account_created",`Created local user account ${t}.`,n,{source:"local",createdUserId:n.userId}),m(`Successfully created user: ${e} (ID: ${n.userId})`,"User Created"),C()):m("Failed to create user. Please check the console.","Error")}function Pn(e){if(!e||!e.plan)return{text:"Error",class:"status-blocked"};const t=e.credits?.current??0,n=Oe(e);return x(e)?{text:"Admin",class:"status-active"}:n==="studio_active"?{text:"Studio",class:"status-active"}:n==="paid_suspended"?{text:"Suspended",class:"status-blocked"}:e.plan==="free"?Ct(e)?{text:"Trial Ended",class:"status-blocked"}:t>0?{text:"Free",class:"status-free"}:{text:"Blocked",class:"status-blocked"}:e.plan==="pro"?e.planStatus==="active"&&t>0?{text:"Active",class:"status-active"}:e.planStatus==="grace_period"?{text:"Grace Period",class:"status-grace"}:{text:"Blocked",class:"status-blocked"}:{text:"Unknown",class:""}}function Nn(e){const t=document.createElement("div");t.className="user-list-item",e.userId===k&&t.classList.add("active"),t.dataset.userId=e.userId;const n=Pn(e),a=x(e)?"Admin":e.plan||"unknown",s=e.credits?.current??0,r=R(s);return t.innerHTML=`
        <div><span class="status-indicator ${n.class}">${n.text}</span></div>
        <div class="user-name-email">
            ${e.userName||"N/A"}
            <small>${e.userId} / ${e.email||"N/A"}</small>
        </div>
        <div>${a.charAt(0).toUpperCase()+a.slice(1)}</div>
        <div>$${r.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `,t}function C(){const e=document.getElementById("user-list-container"),t=it(W).toLowerCase(),n=document.getElementById("user-plan-filter").value;if(!e)return;_n();const s=_().filter(r=>{if(!r||!r.plan||n!=="all"&&r.plan!==n)return!1;if(!t)return!0;const i=String(r.userName||"").toLowerCase(),o=String(r.email||"").toLowerCase(),c=String(r.userId||"").toLowerCase();return i.includes(t)||o.includes(t)||c.includes(t)});e.innerHTML="",s.forEach(r=>e.appendChild(Nn(r)))}async function Z(e={}){if(await Ln(e),C(),k)if(E(k)||S(k))F(k);else{const n=document.getElementById("user-detail-section");n&&(n.classList.add("hidden"),n.innerHTML="",n.dataset.userId=""),k=null}}function F(e){k=e;const t=document.getElementById("user-detail-section");if(!t)return;t.dataset.userId=e;const n=E(e)||S(e);if(!n){t.classList.add("hidden");return}const a=O(n),s=x(n),r=s?"disabled":"",i=x(n)?'<option value="studio" selected>Studio (Admin-managed)</option>':a?`
            <option value="free" ${n.plan==="free"?"selected":""}>Free</option>
            <option value="pro" ${n.plan==="pro"?"selected":""}>Pro</option>
            <option value="studio" ${n.plan==="studio"?"selected":""}>Studio</option>
        `:`
            <option value="free" ${n.plan==="free"?"selected":""}>Free</option>
            <option value="pro" ${n.plan==="pro"?"selected":""}>Pro</option>
            <option value="studio" ${n.plan==="studio"?"selected":""}>Studio</option>
        `;let o="";if(n.plan==="studio"&&!x(n))if(a){const w=n.backendAccount?.accessPassExpiresAt||n.accessPassExpiresAt||null;o=`
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Access</label>
                    <input type="text" value="${w?A(w):"Managed by Stripe subscription / no active access pass"}" readonly class="read-only-display">
                </div>
            `}else{const w=n.subscriptionEndDate?new Date(n.subscriptionEndDate):null,H=w?Math.ceil((w-Date.now())/(1e3*60*60*24)):"N/A",lt=H>0?`${H} days remaining`:"Expired";o=`
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Subscription</label>
                    <input type="text" value="${w?w.toLocaleDateString():"Not set"} (${lt})" readonly class="read-only-display">
                    <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
                </div>
            `}const c=oe(n),p=R(c.totalMicrocredits),l=n.credits.tokenUsage||{prompt:0,completion:0},d=l.prompt+l.completion,u=R(c.monthlyMicrocredits),v=R(c.topupMicrocredits),h=n.backendAccount?.accessPassExpiresAt||n.accessPassExpiresAt||null,f=n.trialEndsAt||n.backendAccount?.trialEndsAt||null,g=s?"studio_active":Oe(n),b=rt(n.plan,n.role),T=g===b?"auto":g,de=Be(f),ue=Be(h);t.innerHTML=`
        <h4>Details for ${n.userName} (${n.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan" ${r}>
                        ${i}
                    </select>
                </div>
                <div class="form-group">
                    <label>Account Status</label>
                    <select id="detail-user-account-status" ${r}>
                        <option value="auto" ${T==="auto"?"selected":""}>Auto From Plan</option>
                        <option value="free" ${T==="free"?"selected":""}>Free</option>
                        <option value="studio_active" ${T==="studio_active"?"selected":""}>Studio Active</option>
                        <option value="pro_active" ${T==="pro_active"?"selected":""}>Pro Active</option>
                        <option value="paid_suspended" ${T==="paid_suspended"?"selected":""}>Paid Suspended</option>
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
                    <input type="datetime-local" id="detail-user-trial-expires-at" value="${de}" ${r}>
                </div>
                <div class="form-group">
                    <label>Access Pass Expires At</label>
                    <input type="datetime-local" id="detail-user-access-pass-expires-at" value="${ue}" ${r}>
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
                    ${o}
                </div>
            </div>
            <div>
                <div class="form-group">
                    <label>Balance (USD Value)</label>
                    <input type="text" value="$${p.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Effective Account Status</label>
                    <input type="text" value="${g}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Monthly Credits (Pro)</label>
                    <input type="text" value="$${u.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Top-up Credits</label>
                    <input type="text" value="$${v.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Studio Access Pass</label>
                    <input type="text" value="${h?A(h):"Not active"}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Trial Ends</label>
                    <input type="text" value="${f?A(f):"Not active"}" readonly class="read-only-display">
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
                <button id="view-admin-audit-log-btn" class="btn btn-secondary">View Admin Audit</button>
            </div>
        </div>
    `,t.classList.remove("hidden"),C()}async function Rn(){await Z();const e=document.getElementById("user-search-input");e&&(e.setAttribute("autocomplete","off"),e.setAttribute("autocapitalize","off"),e.setAttribute("spellcheck","false"),e.value=W,e.addEventListener("input",n=>{W=it(n.target.value),C()})),document.getElementById("user-plan-filter")?.addEventListener("change",C),document.getElementById("refresh-users-btn")?.addEventListener("click",()=>{Z({force:!0,showError:!0}).catch(n=>{console.error("Could not refresh the admin user list.",n)})}),document.getElementById("user-list-container")?.addEventListener("click",n=>{const a=n.target.closest(".user-list-item");if(!a)return;const s=a.dataset.userId;F(s)}),document.getElementById("add-new-user-btn")?.addEventListener("click",Mn);const t=document.getElementById("user-detail-section");t&&t.addEventListener("click",n=>{const a=n.target,s=t.dataset.userId;if(s){if(a.id==="detail-save-user-btn"&&ct(s),a.dataset.action==="refill"){const r=parseInt(a.dataset.amount,10);Bn(s,r)}if(a.dataset.action==="quick-test"&&Un(s,a.dataset.quickAction),a.dataset.action==="delete-user"&&Tn(s),a.id==="view-activity-log-btn"&&Ze(s),a.id==="view-account-log-btn"&&et(s),a.id==="view-admin-audit-log-btn"){const r=E(s)||S(s);tt({targetUserId:s,targetLabel:r?.userName||r?.email||s})}a.dataset.action==="extend-sub"&&(Et(s),F(s))}}),$.bus.subscribe("user:settingsUpdated",()=>{console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list."),C(),k&&F(k)}),window.addEventListener("focus",()=>{Z({force:!0}).catch(n=>{console.error("Could not refresh users on window focus.",n)})}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&Z({force:!0}).catch(n=>{console.error("Could not refresh users when admin tab became visible.",n)})})}document.getElementById("account-log-modal");document.getElementById("account-log-body");document.getElementById("account-log-title");function Fn(e,t){let n=`Metric,Value
`;return n+=`Subscription Revenue,$${e.subscriptionRevenue.toFixed(2)}
`,n+=`Top-up Revenue,$${e.topupRevenue.toFixed(2)}
`,n+=`Gross Revenue,$${e.grossRevenue.toFixed(2)}
`,n+=`Total API Costs,$${e.totalCosts.toFixed(6)}
`,n+=`Net Profit/Loss,$${e.netProfit.toFixed(2)}
`,n+=`Active Users,${e.activeUsers}
`,n+=`Total API Calls,${e.totalApiCalls}
`,n+=`Total Tokens Processed,${e.totalTokensProcessed.toLocaleString()}

`,n+=`User,Plan,Subscription Revenue (USD),Top-up Revenue (USD),Total Revenue (USD),Total Usage (USD),Net Value (USD)
`,t.forEach(a=>{n+=`"${a.userName}",${a.plan},${a.subscriptionRevenueUSD.toFixed(2)},${a.topupRevenueUSD.toFixed(2)},${a.totalRevenueUSD.toFixed(2)},${a.totalUsageUSD.toFixed(6)},${a.netValue.toFixed(2)}
`}),n}async function On(){let e,t;if(M())try{const i=await je();e=i.summary,t=i.perUser}catch(i){console.error("Could not load backend report export. Falling back to local report.",i)}(!e||!t)&&(e=qe(),t=He());const n=Fn(e,t),a=new Blob([n],{type:"text/csv;charset=utf-8;"}),s=URL.createObjectURL(a),r=document.createElement("a");r.setAttribute("href",s),r.setAttribute("download",`financial_report_${new Date().toISOString().slice(0,10)}.csv`),document.body.appendChild(r),r.click(),document.body.removeChild(r)}const Ae=document.getElementById("financial-report-modal"),De=document.getElementById("financial-report-body");function Vn(){Ae.style.display="flex"}function zn(){Ae.style.display="none"}async function jn(){if(M())try{return await je()}catch(e){console.error("Could not load backend financial report. Falling back to local report.",e)}return{summary:qe(),perUser:He()}}async function qn(){if(!De)return;const e=await jn(),t=e.summary,n=e.perUser;De.innerHTML=`
        <h4>Overall Financial Summary</h4>
        <div class="admin-billing-grid" style="margin-bottom: 20px;">
            <div><strong>Subscription Revenue:</strong> $${t.subscriptionRevenue.toFixed(2)}</div>
            <div><strong>Top-up Revenue:</strong> $${t.topupRevenue.toFixed(2)}</div>
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
                        <th>Subscriptions</th>
                        <th>Top-ups</th>
                        <th>Total Revenue</th>
                        <th>Total Usage</th>
                        <th>Net Value</th>
                    </tr>
                </thead>
                <tbody>${n.map(a=>`
                    <tr>
                        <td>${a.userName}</td>
                        <td>${a.plan}</td>
                        <td>$${a.subscriptionRevenueUSD.toFixed(2)}</td>
                        <td>$${a.topupRevenueUSD.toFixed(2)}</td>
                        <td>$${a.totalRevenueUSD.toFixed(2)}</td>
                        <td>$${a.totalUsageUSD.toFixed(6)}</td>
                        <td>$${a.netValue.toFixed(2)}</td>
                    </tr>
                `).join("")}</tbody>
            </table>
        </div>
    `,Vn()}function Hn(){document.getElementById("generate-report-btn")?.addEventListener("click",()=>{qn().catch(e=>{console.error("Could not render the financial report.",e)})}),Ae?.querySelectorAll(".modal-close-btn").forEach(e=>e.addEventListener("click",zn)),document.getElementById("export-report-csv-btn")?.addEventListener("click",()=>{On().catch(e=>{console.error("Could not export the financial report CSV.",e)})})}function Kn(){window.addEventListener("storage",e=>{e.key==="promptPrimUserDatabase_v1"&&(console.log("Admin cross-tab sync: User database updated. Reloading services..."),Rt()),e.key==="promptPrimAdminBilling_v1"&&(console.log("Admin cross-tab sync: Billing data updated. Re-rendering billing info..."),z())})}async function Jn(){console.log("🚀 Admin Panel Initializing..."),document.body.classList.add("admin-page");const e=await _t({requireAdmin:!0});if(e?.redirected)return;if(await Lt(),e?.mode==="supabase"&&e.user){await Bt(e.user);try{await Tt()}catch(a){console.error("Could not sync backend billing settings in admin mode. Keeping local billing cache for this session.",a)}}const t=Ne(),n=t.providerEnabled||{};if(await Dt({apiKey:n.openrouter!==!1?t.openrouterKey:"",ollamaBaseUrl:n.ollama!==!1?t.ollamaBaseUrl:"",isUserKey:!1}),e?.mode==="supabase")try{await Ut(),($.getState().systemProviderModels||[]).length===0&&await Mt({hydrateState:!0})}catch(a){console.error("Could not load backend model access in admin mode. Keeping legacy preset behavior for this session.",a)}Pt(),Nt("admin-theme-switcher"),dn(),qt(),await Rn(),pn(),yn(),kn(),Hn(),Kn(),te(),console.log("🎉 Admin Panel Initialized Successfully.")}document.addEventListener("DOMContentLoaded",Jn);
