/* RETRADE partner account cleanup v1.4.73
 * Removes legacy supplier-only stock KPI blocks once the unified four-card
 * account position is present. No accounting data is changed.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountCleanupLoaded)return;
  window.__rtPartnerAccountCleanupLoaded=true;

  var queued=false,observer=null;

  function txt(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function activePage(){
    var page=document.getElementById('p-item');
    return page&&page.classList.contains('on')?page:null;
  }
  function mark(el){
    if(!el||el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow'))return;
    el.classList.add('rt-partner-legacy-stock-hidden');
  }
  function nearestLegacyCard(el,pattern,maxChars){
    if(!el)return null;
    var explicit=el.closest('.account-stock-kpi,.account-stock-money,.kpi-card,.stat-card,.metric-card,.summary-card,[class*="stock-kpi"],[class*="stock-summary"]');
    if(explicit&&!explicit.closest('.rt-partner-summary-v3'))return explicit;
    var node=el,best=el;
    for(var depth=0;depth<5&&node&&node.parentElement;depth++){
      var parent=node.parentElement;
      if(parent.classList&&parent.classList.contains('rt-partner-summary-v3'))break;
      if(parent.classList&&parent.classList.contains('account-group'))break;
      var t=txt(parent);
      if(!pattern.test(t)||t.length>(maxChars||260))break;
      best=parent;node=parent;
    }
    return best;
  }
  function clean(){
    queued=false;
    var page=activePage();
    if(!page||!page.querySelector('.rt-partner-summary-v3'))return;

    page.querySelectorAll('.account-stock-kpi,.account-stock-money').forEach(mark);

    var all=page.querySelectorAll('div,section,article,span');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow'))continue;
      var t=txt(el);
      if(/^stock on hand$/i.test(t)){
        mark(nearestLegacyCard(el,/\bstock on hand\b/i,220));
      }else if(/^stock cost\b/i.test(t)||(/\bstock cost\b/i.test(t)&&/\blisted asking\b/i.test(t))){
        mark(nearestLegacyCard(el,/\bstock cost\b/i,340));
      }
    }
  }
  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(function(){requestAnimationFrame(clean);});
  }
  function start(){
    if(!document.getElementById('rt-partner-account-cleanup-style')){
      var s=document.createElement('style');
      s.id='rt-partner-account-cleanup-style';
      s.textContent='.rt-partner-legacy-stock-hidden{display:none!important;}';
      document.head.appendChild(s);
    }
    schedule();
    if(observer)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('popstate',schedule);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();