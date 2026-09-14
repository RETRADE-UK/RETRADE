/* RETRADE Accounts compact operations controls v1.4.83
 * Removes dashboard-style KPI cards in favour of one slim operational strip.
 * Combines filtering and sorting into one familiar RETRADE dropdown and keeps
 * Select compact beside Search.
 */
(function(){
  'use strict';
  if(window.__rtAccountsCompact1483)return;
  window.__rtAccountsCompact1483=true;

  var queued=false,customSort='';
  var FILTERS={all:'All accounts',attention:'Needs attention',due:'Money due',fixed:'Fixed cost',share:'Profit share',settled:'Settled'};
  var SORTS={attention:'Priority',owed:'Outstanding · high to low','owed-asc':'Outstanding · low to high',name:'Alphabetical · A–Z','name-desc':'Alphabetical · Z–A',recent:'Recent activity',stock:'Stock on hand'};
  var baseSort=window._rtAcctOpSort;

  function money(v){try{return typeof fmt==='function'?fmt(Number(v)||0):'£'+(Number(v)||0).toFixed(2);}catch(_){return '£'+(Number(v)||0).toFixed(2);}}
  function rowsData(){
    var out=[];
    try{(_accounts||[]).forEach(function(a){var s=typeof _accountStats==='function'?_accountStats(a.id):{};out.push({a:a,s:s,due:Number(s.dueNow)||0,unsettled:Number(s.unsettledSoldCount)||0,returned:Number(s.returnedCount)||0,unlisted:Number(s.unlistedCount)||0});});}catch(_){}
    return out;
  }
  function summaryStrip(){
    var rows=rowsData(),due=0,actions=0,unsettled=0;
    rows.forEach(function(r){due+=r.due;unsettled+=r.unsettled;if(r.due>0||r.unsettled>0||r.returned>0||r.unlisted>0)actions++;});
    var el=document.createElement('div');el.className='rt-acct-compact-strip';
    el.innerHTML='<div class="rt-acct-strip-main"><span>Outstanding</span><strong>'+money(due)+'</strong></div>'+
      '<div class="rt-acct-strip-note">'+(actions?actions+' account'+(actions===1?'':'s')+' need attention':'No account actions due')+(unsettled?' · '+unsettled+' unsettled sold':'')+'</div>';
    return el;
  }
  function inferSort(controls){
    if(customSort)return customSort;
    var sel=controls.querySelector('select[aria-label="Sort accounts"]');if(sel&&SORTS[sel.value])return sel.value;
    var act=controls.querySelector('.rt-acct-op-sort-menu .filter-pill-dd-opt.active');
    if(act){var oc=String(act.getAttribute('onclick')||''),m=oc.match(/_rtAcctOpSort\('([^']+)'\)/);if(m&&SORTS[m[1]])return m[1];}
    return 'attention';
  }
  function reorderCustom(){
    if(!customSort)return;
    var page=document.getElementById('p-accounts'),list=page&&page.querySelector('.rt-acct-op-list');if(!list)return;
    var nodes=Array.prototype.slice.call(list.querySelectorAll('.rt-acct-op-row[data-account-id]'));
    nodes.sort(function(x,y){
      var xid=x.getAttribute('data-account-id'),yid=y.getAttribute('data-account-id'),xa=null,ya=null;
      try{xa=(_accounts||[]).find(function(a){return String(a.id)===String(xid);});ya=(_accounts||[]).find(function(a){return String(a.id)===String(yid);});}catch(_){}
      var xn=String(xa&&xa.name||'').toLowerCase(),yn=String(ya&&ya.name||'').toLowerCase();
      if(customSort==='name-desc')return yn.localeCompare(xn);
      if(customSort==='owed-asc'){
        var xs=typeof _accountStats==='function'?_accountStats(xid):{},ys=typeof _accountStats==='function'?_accountStats(yid):{};
        var xd=Number(xs.dueNow)||0,yd=Number(ys.dueNow)||0;return xd-yd||xn.localeCompare(yn);
      }
      return 0;
    });
    nodes.forEach(function(n){list.appendChild(n);});
  }
  function icon(){return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="18" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>';}
  function combinedControl(controls,filter,sort){
    var wrap=document.createElement('div');wrap.className='filter-pill-dd rt-acct-combined-dd';wrap.id='rt-acct-filter-sort';
    var filterOpts=Object.keys(FILTERS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===filter?' active':'')+'" type="button" onclick="_rtAcctCompactFilter(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===filter?'✓':'')+'</span>'+FILTERS[k]+'</button>';}).join('');
    var sortOpts=Object.keys(SORTS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===sort?' active':'')+'" type="button" onclick="_rtAcctCompactSort(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===sort?'✓':'')+'</span>'+SORTS[k]+'</button>';}).join('');
    wrap.innerHTML='<div class="filter-pill-dd-backdrop" onclick="closeFilterPill(\'rt-acct-filter-sort\')"></div>'+
      '<button class="filter-pill-dd-btn rt-acct-combined-btn" type="button" onclick="event.stopPropagation();toggleFilterPill(\'rt-acct-filter-sort\')">'+icon()+'<span>Filter / Sort</span><span class="fpdd-chev">▾</span></button>'+
      '<div class="filter-pill-dd-menu rt-acct-combined-menu" onclick="event.stopPropagation()"><div class="rt-acct-fs-title">Filter</div>'+filterOpts+'<div class="rt-acct-fs-sep"></div><div class="rt-acct-fs-title">Sort</div>'+sortOpts+'</div>';
    return wrap;
  }
  function patch(){
    queued=false;
    var page=document.getElementById('p-accounts');if(!page||!page.classList.contains('on'))return;
    page.querySelectorAll('.rt-acct-op-overview').forEach(function(el){el.style.display='none';});
    var controls=page.querySelector('.rt-acct-op-controls');if(!controls)return;
    var strip=page.querySelector('.rt-acct-compact-strip');if(strip)strip.remove();controls.parentNode.insertBefore(summaryStrip(),controls);

    var filterSel=controls.querySelector('select[aria-label="Filter accounts"]');
    var filter=filterSel&&FILTERS[filterSel.value]?filterSel.value:'all';
    var sort=inferSort(controls);
    controls.querySelectorAll('.rt-acct-op-sort-dd,.rt-acct-combined-dd').forEach(function(el){el.remove();});
    var sortSel=controls.querySelector('select[aria-label="Sort accounts"]');if(sortSel)sortSel.remove();
    if(filterSel)filterSel.remove();
    var search=controls.querySelector('.rt-acct-op-search');
    var selectBtn=Array.prototype.slice.call(controls.querySelectorAll('button')).find(function(b){return /^(select|cancel)$/i.test(String(b.textContent||'').trim());});
    if(selectBtn)selectBtn.classList.add('rt-acct-compact-select');
    var combo=combinedControl(controls,filter,sort);
    if(selectBtn)controls.insertBefore(combo,selectBtn);else controls.appendChild(combo);
    controls.classList.add('rt-acct-compact-controls');
    if(search)search.style.minWidth='0';
    reorderCustom();
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(patch);});}

  window._rtAcctCompactFilter=function(v){customSort=customSort||'';try{closeFilterPill('rt-acct-filter-sort');}catch(_){}if(typeof window._rtAcctOpFilter==='function')window._rtAcctOpFilter(v);};
  window._rtAcctCompactSort=function(v){
    try{closeFilterPill('rt-acct-filter-sort');}catch(_){}
    if(v==='name-desc'){customSort=v;if(typeof baseSort==='function')baseSort('name');setTimeout(schedule,0);return;}
    if(v==='owed-asc'){customSort=v;if(typeof baseSort==='function')baseSort('owed');setTimeout(schedule,0);return;}
    customSort='';if(typeof baseSort==='function')baseSort(v);setTimeout(schedule,0);
  };

  function styles(){if(document.getElementById('rt-accounts-compact-v2-style'))return;var s=document.createElement('style');s.id='rt-accounts-compact-v2-style';s.textContent='\
    .rt-acct-compact-strip{display:flex;align-items:center;gap:12px;min-height:42px;padding:8px 12px;margin:0 0 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);font-size:11.5px}.rt-acct-strip-main{display:flex;align-items:baseline;gap:8px;white-space:nowrap}.rt-acct-strip-main span,.rt-acct-strip-note{color:var(--text-secondary)}.rt-acct-strip-main strong{font-size:15px;color:var(--accent);font-variant-numeric:tabular-nums}.rt-acct-strip-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
    .rt-acct-op-controls.rt-acct-compact-controls{display:flex!important;align-items:stretch!important;gap:8px!important}.rt-acct-compact-controls .rt-acct-op-search{flex:1 1 auto!important}.rt-acct-combined-dd{flex:0 0 auto;min-width:0}.rt-acct-combined-btn{height:100%;min-height:40px;display:flex!important;align-items:center;gap:7px;padding:0 11px!important;white-space:nowrap}.rt-acct-combined-menu{right:0;left:auto;min-width:230px;max-height:min(520px,75vh);overflow:auto}.rt-acct-fs-title{padding:8px 10px 5px;font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}.rt-acct-fs-sep{height:1px;background:var(--border);margin:6px 8px}.rt-acct-fs-check{display:inline-flex;width:17px;justify-content:center;margin-right:6px;color:var(--accent);font-weight:800}.rt-acct-compact-select{flex:0 0 auto!important;width:auto!important;min-width:68px!important;padding-left:12px!important;padding-right:12px!important}\
    @media(max-width:640px){.rt-acct-compact-strip{gap:8px;padding:7px 10px}.rt-acct-strip-note{font-size:10px}.rt-acct-combined-btn span:nth-child(2){display:none}.rt-acct-combined-btn{width:42px;justify-content:center;padding:0!important}.rt-acct-combined-btn .fpdd-chev{display:none}.rt-acct-compact-select{min-width:58px!important;padding-left:9px!important;padding-right:9px!important}}\
  ';document.head.appendChild(s);}
  function start(){styles();var page=document.getElementById('p-accounts');if(page)new MutationObserver(schedule).observe(page,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('hashchange',schedule);schedule();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.83 compact Accounts operations controls loaded');
})();