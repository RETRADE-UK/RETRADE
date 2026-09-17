/* RETRADE Cashflow render performance — v1.5.12
 *
 * Performance-only layer. It does not change accounting truth:
 * - cash/KPI calculations always see the complete ledger;
 * - only the visible transaction list is paged in small batches by default;
 * - repeated cash-event and summary calculations inside one render are memoised;
 * - search/export code outside renderCash continues to see the complete snapshot.
 */
(function(){
  'use strict';
  if(window.__rtCashPerformance1509)return;
  window.__rtCashPerformance1509=true;
  if(typeof window.renderCash!=='function')return;

  var PAGE_SIZE=25;
  var visibleLimit=PAGE_SIZE;
  var renderDepth=0;
  var summaryDepth=0;
  var summaryCached=null;
  var eventsCached=null;
  var lastFullCount=0;
  var lastVisibleCount=0;
  var lastRenderMs=0;
  var renderStartedAt=0;
  var diag=window.__rtCashPerf1509=window.__rtCashPerf1509||{};

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function activeCash(){var p=document.querySelector('.page.on');return !!(p&&p.id==='p-cash');}
  function searchActive(){
    var page=document.getElementById('p-cash');if(!page)return false;
    var input=page.querySelector('.cashflow-search-field input,input[type="search"]');
    return !!(input&&String(input.value||'').trim());
  }
  function shouldWindow(){return renderDepth>0&&summaryDepth===0&&activeCash()&&!searchActive()&&isFinite(visibleLimit);}
  function cloneSnapshot(snap,rows){
    if(!snap||typeof snap!=='object')return snap;
    var out={};Object.keys(snap).forEach(function(k){out[k]=snap[k];});out.rows=rows;return out;
  }

  var baseEvents=window._cashEventsAll;
  if(typeof baseEvents==='function'){
    window._cashEventsAll=function(){
      if(renderDepth>0&&eventsCached)return eventsCached.slice();
      var v=baseEvents.apply(this,arguments);
      if(renderDepth>0&&Array.isArray(v))eventsCached=v.slice();
      return v;
    };
  }

  var baseSummary=window.calcCashSummary;
  if(typeof baseSummary==='function'){
    window.calcCashSummary=function(){
      if(renderDepth>0&&summaryCached)return summaryCached;
      summaryDepth++;
      try{
        var v=baseSummary.apply(this,arguments);
        if(renderDepth>0)summaryCached=v;
        return v;
      }finally{summaryDepth=Math.max(0,summaryDepth-1);}
    };
  }

  var baseSnapshot=window._cashflowFilteredSnapshot;
  if(typeof baseSnapshot==='function'){
    window._cashflowFilteredSnapshot=function(){
      var snap=baseSnapshot.apply(this,arguments);
      if(!snap||!Array.isArray(snap.rows))return snap;
      lastFullCount=snap.rows.length;
      if(!shouldWindow()){
        lastVisibleCount=lastFullCount;
        return snap;
      }
      /* _cashflowFilteredSnapshot is already the authoritative filtered/sorted
         result. Only cap what gets rendered; never alter the underlying ledger,
         KPI maths, filter semantics or ordering. */
      var rows=snap.rows.slice(0,Math.max(PAGE_SIZE,visibleLimit));
      lastVisibleCount=rows.length;
      return cloneSnapshot(snap,rows);
    };
  }

  function installStyles(){
    if(document.getElementById('rt-cash-performance-1509-style'))return;
    var s=document.createElement('style');s.id='rt-cash-performance-1509-style';
    s.textContent='\
#p-cash .rt-cash-history-window1509{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 10px;padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb,var(--surface2) 72%,transparent);font-size:10.5px;color:var(--text-secondary)}\
#p-cash .rt-cash-history-window1509 strong{color:var(--text);font-size:11px}\
#p-cash .rt-cash-history-window1509 button{min-height:30px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:10.5px;font-weight:700;cursor:pointer}\
#p-cash .rt-cash-history-window1509 button:hover{border-color:color-mix(in srgb,var(--accent) 46%,var(--border))}\
@media(max-width:640px){#p-cash .rt-cash-history-window1509{align-items:flex-start;flex-direction:column}#p-cash .rt-cash-history-window1509 button{width:100%}}';
    document.head.appendChild(s);
  }

  function nextWindow(){
    if(!isFinite(visibleLimit))return;
    visibleLimit+=PAGE_SIZE;
  }

  function injectWindowControl(){
    var page=document.getElementById('p-cash');if(!page||!page.classList.contains('on'))return;
    var old=page.querySelector('.rt-cash-history-window1509');if(old)old.remove();
    var heading=page.querySelector('.cashflow-list-heading');
    var ledger=page.querySelector('.rt-cash-ledger');
    if(!heading&&!ledger)return;
    var box=document.createElement('div');box.className='rt-cash-history-window1509';
    var hidden=Math.max(0,lastFullCount-lastVisibleCount);
    var text=document.createElement('span');
    text.innerHTML='<strong>Showing '+lastVisibleCount+' of '+lastFullCount+' transaction'+(lastFullCount===1?'':'s')+'</strong>'+(hidden?' · recent activity first':'');
    box.appendChild(text);
    if(hidden&&isFinite(visibleLimit)){
      var btn=document.createElement('button');btn.type='button';btn.textContent='Load '+Math.min(PAGE_SIZE,hidden)+' more';
      btn.onclick=function(){nextWindow();try{window.renderCash();}catch(_){}};
      box.appendChild(btn);
    }
    if(heading&&heading.parentNode)heading.parentNode.insertBefore(box,heading.nextSibling);
    else if(ledger&&ledger.parentNode)ledger.parentNode.insertBefore(box,ledger);
  }

  var baseRender=window.renderCash;
  window.renderCash=function(){
    var outer=renderDepth===0;
    if(outer){
      summaryCached=null;eventsCached=null;lastFullCount=0;lastVisibleCount=0;renderStartedAt=now();
    }
    renderDepth++;
    try{return baseRender.apply(this,arguments);}
    finally{
      renderDepth=Math.max(0,renderDepth-1);
      if(outer){
        lastRenderMs=now()-renderStartedAt;
        diag.lastRenderMs=Math.round(lastRenderMs*10)/10;
        diag.fullRows=lastFullCount;
        diag.visibleRows=lastVisibleCount;
        diag.visibleLimit=isFinite(visibleLimit)?visibleLimit:'all';
        summaryCached=null;eventsCached=null;
        requestAnimationFrame(injectWindowControl);
      }
    }
  };

  /* Data mutations invalidate any short-lived memo immediately. */
  if(typeof window.saveDB==='function'&&!window.saveDB.__rtCashPerf1509){
    var baseSave=window.saveDB;
    var saveWrapped=function(){summaryCached=null;eventsCached=null;return baseSave.apply(this,arguments);};
    saveWrapped.__rtCashPerf1509=true;saveWrapped.__rtBase=baseSave;window.saveDB=saveWrapped;try{saveDB=saveWrapped;}catch(_){}
  }

  window._rtCashHistoryWindow1509={
    reset:function(){visibleLimit=PAGE_SIZE;},
    showAll:function(){visibleLimit=Infinity;try{window.renderCash();}catch(_){}},
    get:function(){return visibleLimit;},
    pageSize:PAGE_SIZE
  };

  installStyles();
  requestAnimationFrame(injectWindowControl);
  console.info('[RETRADE] v1.5.12 Cashflow 25-row pagination + performance layer loaded');
})();
