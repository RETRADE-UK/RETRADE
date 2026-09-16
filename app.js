/* RETRADE app entrypoint.
 *
 * Cold-start is intentionally staged:
 *   1) launch coordinator + production core
 *   2) give the browser one real paint opportunity
 *   3) load feature/presentation refinements in deterministic order
 *   4) release the boot skeleton only after the final motion layer is installed
 *
 * This keeps the large core authoritative while avoiding a long back-to-back
 * chain of secondary JavaScript evaluation before the first useful frame.
 */
(function(){
  'use strict';
  var v='20260916-v1498';
  window.__rtBuildId=v;
  var motionReady=false;
  var motionFallbackTimer=0;

  window.__rtMotionStackReady=false;
  document.documentElement.classList.add('rt-app-cold','rt-motion-prep');

  if(!document.getElementById('rt-motion-preflight')){
    var pre=document.createElement('style');pre.id='rt-motion-preflight';
    pre.textContent='html.rt-motion-prep #monthly-profitability-svg{opacity:0!important}#monthly-profitability-svg{transition:opacity 120ms cubic-bezier(.22,.61,.36,1)}@media(prefers-reduced-motion:reduce){html.rt-motion-prep #monthly-profitability-svg{opacity:1!important}#monthly-profitability-svg{transition:none!important}}';
    document.head.appendChild(pre);
  }

  function markMotionReady(reason){
    if(motionReady)return;
    motionReady=true;
    window.__rtMotionStackReady=true;
    if(motionFallbackTimer){clearTimeout(motionFallbackTimer);motionFallbackTimer=0;}
    document.documentElement.classList.remove('rt-motion-prep');
    try{window.dispatchEvent(new CustomEvent('retrade:motion-ready',{detail:{reason:reason||'ready'}}));}catch(_){}
  }

  motionFallbackTimer=setTimeout(function(){motionFallbackTimer=0;markMotionReady('fallback');},3000);
  setTimeout(function(){
    if(!document.body||!document.body.classList.contains('rt-real-layout-loading'))document.documentElement.classList.remove('rt-app-cold');
  },5000);

  function append(src,priority,onload){
    var s=document.createElement('script');
    s.src=src+'?v='+v;
    s.async=false;
    try{s.fetchPriority=priority||'auto';}catch(_){}
    if(onload)s.onload=onload;
    s.onerror=function(){
      console.error('[RETRADE] startup script failed:',src);
      if(src==='./launch-experience.js')document.documentElement.classList.remove('rt-app-cold');
      if(src==='./motion-system.js')markMotionReady('motion-system-error');
    };
    document.head.appendChild(s);
    return s;
  }

  function loadEnhancements(){
    var files=[
      './performance-system.js',
      './app-lifecycle.js',
      './sales-defaults.js',
      './bundle-orders.js',
      './bundle-panel.js',
      './bundle-row-polish.js',
      './cashflow-liabilities.js',
      './cashflow-dashboard-v2.js',
      './cashflow-movement-card-polish.js',
      './partner-item-navigation.js',
      './partner-actions-v2.js',
      './partner-statement-action.js',
      './partner-account-ui-v3.js',
      './partner-account-ui-v4.js',
      './partner-account-cleanup.js',
      './partner-row-menu-popover.js',
      './item-account-adjustments.js',
      './partner-arrangements-v2.js',
      './partner-account-finalise.js',
      './partner-account-legacy-hero-cleanup.js',
      './partner-account-adjustments.js',
      './partner-account-adjustments-hardening.js',
      './partner-payment-allocations-v2.js',
      './partner-account-transaction-ui.js',
      './partner-transaction-breakdown-guard.js',
      './partner-collapse-defaults.js',
      './accounts-operations-dashboard.js',
      './accounts-sort-polish.js',
      './accounts-operations-compact-v2.js',
      './partner-account-experience-v2.js',
      './chart-polish.js',
      './chart-motion.js',
      './chart-finalize.js',
      './chart-reveal.js',
      './sales-chart-sequence.js',
      './chart-forecast-sequence.js',
      './motion-system.js'
    ];
    files.forEach(function(src,index){
      append(src,index<3?'auto':'low',index===files.length-1?function(){markMotionReady('stack-loaded');}:null);
    });
  }

  append('./launch-experience.js','high');
  append('./app-core.js','high',function(){
    try{if(typeof window.__rtInstallLaunchCoreHooks==='function')window.__rtInstallLaunchCoreHooks();}catch(_){}
    requestAnimationFrame(function(){loadEnhancements();});
  });
})();