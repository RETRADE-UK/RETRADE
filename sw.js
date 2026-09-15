// RETRADE service worker — immutable child-script cache v20260915-v1485.
const BUILD='20260915-v1485';
const CACHE_PREFIX='retrade-static-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CHILD_SCRIPTS=[
  'launch-experience.js','app-core.js','performance-system.js','sales-defaults.js',
  'bundle-orders.js','bundle-panel.js','bundle-row-polish.js','cashflow-liabilities.js',
  'partner-item-navigation.js','partner-actions-v2.js','partner-statement-action.js',
  'partner-statements.js','partner-statements-accounting-v2.js','partner-statements-accounting-v3.js',
  'partner-account-ui-v3.js','partner-account-ui-v4.js','partner-account-cleanup.js',
  'partner-row-menu-popover.js','item-account-adjustments.js','partner-arrangements-v2.js',
  'partner-account-finalise.js','partner-account-legacy-hero-cleanup.js','partner-payment-allocations-v2.js','partner-transaction-breakdown-guard.js','partner-collapse-defaults.js',
  'accounts-operations-dashboard.js','accounts-sort-polish.js','accounts-operations-compact-v2.js',
  'chart-polish.js','chart-motion.js','chart-finalize.js','chart-reveal.js',
  'sales-chart-sequence.js','chart-forecast-sequence.js','motion-system.js'
];
const CHILD_SET=new Set(CHILD_SCRIPTS);
function buildUrl(name){return new URL('./'+name+'?v='+BUILD,self.registration.scope).href;}
async function warmStatic(){
  try{const cache=await caches.open(CACHE_NAME);await Promise.allSettled(CHILD_SCRIPTS.map(async name=>{const url=buildUrl(name);const hit=await cache.match(url,{ignoreSearch:false});if(hit)return;try{const response=await fetch(new Request(url,{credentials:'same-origin',cache:'no-store'}));if(response&&response.ok)await cache.put(url,response.clone());}catch(_){}}));}catch(_){}
}
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));}catch(_){}await self.clients.claim();})());});
self.addEventListener('message',event=>{const d=event&&event.data;if(!d||d.type!=='RT_WARM_STATIC')return;if(d.build&&d.build!==BUILD)return;if(event.waitUntil)event.waitUntil(warmStatic());else warmStatic();});
self.addEventListener('fetch',event=>{
  const request=event.request;if(!request||request.method!=='GET')return;
  let url;try{url=new URL(request.url);}catch(_){return;}if(url.origin!==self.location.origin||request.destination!=='script')return;
  const name=url.pathname.split('/').pop()||'';
  if(name==='app.js'){event.respondWith((async()=>{try{return await fetch(new Request(buildUrl('app.js'),{credentials:'same-origin',cache:'no-store'}));}catch(_){return fetch(request);}})());return;}
  if(!CHILD_SET.has(name))return;
  event.respondWith((async()=>{const current=buildUrl(name);try{const cache=await caches.open(CACHE_NAME);const hit=await cache.match(current,{ignoreSearch:false});if(hit)return hit;const response=await fetch(new Request(current,{credentials:'same-origin',cache:'no-store'}));if(response&&response.ok){try{await cache.put(current,response.clone());}catch(_){}}return response;}catch(_){return fetch(request);}})());
});