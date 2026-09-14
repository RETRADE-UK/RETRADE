/* RETRADE Accounts compact operations controls v1.4.84
 * Keeps Partners operational and compact:
 * - no dashboard KPI cards
 * - one mobile-safe Outstanding / Attention / Unsettled strip
 * - one compact Filter / Sort control beside Search
 * - no account-list selection mode
 * - delegated account-card navigation for reliable touch/click behaviour
 */
(function(){
  'use strict';
  if(window.__rtAccountsCompact1484)return;
  window.__rtAccountsCompact1484=true;

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
    el.innerHTML='<div class="rt-acct-strip-stat primary"><span>Outstanding</span><strong>'+money(due)+'</strong></div>'+
      '<div class="rt-acct-strip-stat"><span>Attention</span><strong>'+actions+'</strong></div>'+
      '<div class="rt-acct-strip-stat"><span>Unsettled</span><strong>'+unsettled+'</strong></div>';
    return el;
  }
  function inferSort(controls){
    if(customSort)return customSort;
    var sel=controls.querySelector('select[aria-label="Sort accounts"]');if(sel&&SORTS[sel.value])return sel.value;
    var act=controls.querySelector('.rt-acct-op-sort-menu .filter-pill-dd-opt.active');
    if(act){var oc=String(act.getAttribute('onclick')||''),m=oc.match(/_rtAcctOpSort\('([^']+)'\)/);if(m&&SORTS[m[1]])return m[1];}
    return 'attention';
  }
  function inferFilter(controls){
    var sel=controls.querySelector('select[aria-label="Filter accounts"]');
    if(sel&&FILTERS[sel.value])return sel.value;
    var act=controls.querySelector('.rt-acct-combined-menu [data-filter].active');
    return act&&FILTERS[act.getAttribute('data-filter')]?act.getAttribute('data-filter'):'all';
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
  function icon(){return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/><circle cx="18" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>';}
  function combinedControl(filter,sort){
    var wrap=document.createElement('div');wrap.className='filter-pill-dd rt-acct-combined-dd';wrap.id='rt-acct-filter-sort';
    var filterOpts=Object.keys(FILTERS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===filter?' active':'')+'" type="button" data-filter="'+k+'" onclick="_rtAcctCompactFilter(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===filter?'✓':'')+'</span>'+FILTERS[k]+'</button>';}).join('');
    var sortOpts=Object.keys(SORTS).map(function(k){return '<button class="filter-pill-dd-opt'+(k===sort?' active':'')+'" type="button" data-sort="'+k+'" onclick="_rtAcctCompactSort(\''+k+'\')"><span class="rt-acct-fs-check">'+(k===sort?'✓':'')+'</span>'+SORTS[k]+'</button>';}).join('');
    wrap.innerHTML='<div class="filter-pill-dd-backdrop" onclick="closeFilterPill(\'rt-acct-filter-sort\')"></div>'+
      '<button class="filter-pill-dd-btn rt-acct-combined-btn" type="button" aria-label="Filter and sort accounts" title="Filter and sort" onclick="event.stopPropagation();toggleFilterPill(\'rt-acct-filter-sort\')">'+icon()+'<span class="rt-acct-combined-label">Filter / Sort</span><span class="fpdd-chev">▾</span></button>'+
      '<div class="filter-pill-dd-menu rt-acct-combined-menu" onclick="event.stopPropagation()"><div class="rt-acct-fs-title">Filter</div>'+filterOpts+'<div class="rt-acct-fs-sep"></div><div class="rt-acct-fs-title">Sort</div>'+sortOpts+'</div>';
    return wrap;
  }
  function patch(){
    queued=false;
    var page=document.getElementById('p-accounts');if(!page||!page.classList.contains('on'))return;
    page.querySelectorAll('.rt-acct-op-overview').forEach(function(el){el.style.display='none';});
    page.querySelectorAll('.rt-acct-op-selectbar').forEach(function(el){el.remove();});
    var controls=page.querySelector('.rt-acct-op-controls');if(!controls)return;

    var oldStrip=page.querySelector('.rt-acct-compact-strip');if(oldStrip)oldStrip.remove();
    controls.parentNode.insertBefore(summaryStrip(),controls);

    /* If a previous Select mode somehow survived a hot update, exit it once.
       Normal v1.4.84 renders never expose Select on this page. */
    var selectBtn=Array.prototype.slice.call(controls.querySelectorAll('button')).find(function(b){return /^(select|cancel)$/i.test(String(b.textContent||'').trim());});
    if(selectBtn&&/^cancel$/i.test(String(selectBtn.textContent||'').trim())&&typeof window._rtAcctOpSelectMode==='function'){
      window._rtAcctOpSelectMode();return;
    }

    var existing=controls.querySelector('.rt-acct-combined-dd');
    if(existing){
      if(selectBtn)selectBtn.remove();
      controls.classList.add('rt-acct-compact-controls');
      reorderCustom();return;
    }

    var filter=inferFilter(controls),sort=inferSort(controls);
    controls.querySelectorAll('.rt-acct-op-sort-dd').forEach(function(el){el.remove();});
    var sortSel=controls.querySelector('select[aria-label="Sort accounts"]');if(sortSel)sortSel.remove();
    var filterSel=controls.querySelector('select[aria-label="Filter accounts"]');if(filterSel)filterSel.remove();
    if(selectBtn)selectBtn.remove();
    controls.appendChild(combinedControl(filter,sort));
    controls.classList.add('rt-acct-compact-controls');
    var search=controls.querySelector('.rt-acct-op-search');if(search)search.style.minWidth='0';
    reorderCustom();
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(patch);});}

  window._rtAcctCompactFilter=function(v){
    try{closeFilterPill('rt-acct-filter-sort');}catch(_){}
    if(typeof window._rtAcctOpFilter==='function')window._rtAcctOpFilter(v);
    setTimeout(schedule,0);
  };
  window._rtAcctCompactSort=function(v){
    try{closeFilterPill('rt-acct-filter-sort');}catch(_){}
    if(v==='name-desc'){customSort=v;if(typeof baseSort==='function')baseSort('name');setTimeout(schedule,0);return;}
    if(v==='owed-asc'){customSort=v;if(typeof baseSort==='function')baseSort('owed');setTimeout(schedule,0);return;}
    customSort='';if(typeof baseSort==='function')baseSort(v);setTimeout(schedule,0);
  };

  function installNavigation(page){
    if(!page||page.__rtAccountCardNav1484)return;
    page.__rtAccountCardNav1484=true;
    page.addEventListener('click',function(ev){
      var row=ev.target&&ev.target.closest?ev.target.closest('.rt-acct-op-row[data-account-id]'):null;
      if(!row||!page.contains(row))return;
      if(ev.target.closest&&ev.target.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
      var id=row.getAttribute('data-account-id');if(!id)return;
      ev.preventDefault();ev.stopPropagation();
      try{
        if(typeof openAccountPage==='function'){openAccountPage(id);return;}
        if(typeof window.openAccountPage==='function'){window.openAccountPage(id);return;}
        if(typeof _renderAccountPage==='function'){
          var acct=(_accounts||[]).find(function(a){return a&&String(a.id)===String(id);});
          if(acct){_itemPageOrigin='p-accounts';if(typeof _deactivatePages==='function')_deactivatePages();var p=document.getElementById('p-item');if(p)p.classList.add('on');_renderAccountPage(acct);}
        }
      }catch(err){console.warn('[RETRADE] account card navigation failed',err);try{toast('Could not open account','error');}catch(_){}}
    },true);
  }

  function styles(){if(document.getElementById('rt-accounts-compact-v2-style'))return;var s=document.createElement('style');s.id='rt-accounts-compact-v2-style';s.textContent='\
    .rt-acct-compact-strip{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.8fr) minmax(0,.8fr);align-items:center;min-height:42px;padding:0;margin:0 0 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);overflow:hidden}.rt-acct-strip-stat{min-width:0;display:flex;align-items:baseline;justify-content:center;gap:7px;padding:9px 11px;border-left:1px solid var(--border);white-space:nowrap}.rt-acct-strip-stat:first-child{border-left:0;justify-content:flex-start}.rt-acct-strip-stat span{font-size:10.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis}.rt-acct-strip-stat strong{font-size:13px;color:var(--text);font-variant-numeric:tabular-nums}.rt-acct-strip-stat.primary strong{font-size:15px;color:var(--accent)}\
    .rt-acct-op-controls.rt-acct-compact-controls{display:flex!important;align-items:stretch!important;gap:8px!important;grid-template-columns:none!important}.rt-acct-compact-controls .rt-acct-op-search{flex:1 1 auto!important;grid-column:auto!important;min-width:0}.rt-acct-combined-dd{flex:0 0 auto;min-width:0}.rt-acct-combined-btn{height:100%;min-height:40px;display:flex!important;align-items:center;gap:7px;padding:0 11px!important;white-space:nowrap}.rt-acct-combined-menu{right:0;left:auto;min-width:238px;max-height:min(520px,75vh);overflow:auto;z-index:10030}.rt-acct-fs-title{padding:8px 10px 5px;font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary)}.rt-acct-fs-sep{height:1px;background:var(--border);margin:6px 8px}.rt-acct-fs-check{display:inline-flex;width:17px;justify-content:center;margin-right:6px;color:var(--accent);font-weight:800}\
    @media(max-width:640px){.rt-acct-compact-strip{grid-template-columns:minmax(0,1.45fr) minmax(0,.72fr) minmax(0,.78fr)}.rt-acct-strip-stat{display:block;text-align:center;padding:8px 6px}.rt-acct-strip-stat:first-child{text-align:left;padding-left:10px}.rt-acct-strip-stat span{display:block;font-size:9px;line-height:1.15;margin-bottom:2px}.rt-acct-strip-stat strong{display:block;font-size:12px;line-height:1.2}.rt-acct-strip-stat.primary strong{font-size:14px}.rt-acct-combined-btn{width:44px;justify-content:center;padding:0!important}.rt-acct-combined-label,.rt-acct-combined-btn .fpdd-chev{display:none}.rt-acct-combined-menu{min-width:min(250px,calc(100vw - 32px));right:0}.rt-acct-op-controls.rt-acct-compact-controls{gap:7px!important}}\
  ';document.head.appendChild(s);}
  function start(){
    styles();
    var page=document.getElementById('p-accounts');
    if(page){
      installNavigation(page);
      /* Important: do NOT observe class attributes here. Opening a RETRADE
         filter-pill adds .open; watching that class caused the menu to rebuild
         and instantly close in v1.4.83. Child-list changes are enough to detect
         real page renders from search/filter/sort. */
      new MutationObserver(schedule).observe(page,{childList:true,subtree:true});
    }
    window.addEventListener('hashchange',schedule);schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.84 Accounts mobile interactions + compact strip loaded');
})();