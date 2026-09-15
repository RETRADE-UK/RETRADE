/* RETRADE navigation + spatial stability v1.4.97
 * Live behaviour hardening only — deliberately contains no gesture work.
 *
 * Goals:
 * - navigation is spatially predictable: render + scroll restoration complete
 *   before the next paint instead of changing underneath the user's finger
 * - Partner list -> Partner detail -> Back restores the same list position
 * - Partner detail -> Item -> Back restores the same detail position
 * - remove the paint-first fake account shell which could strand placeholder cards
 * - keep account-list presentation transforms in the same paint as the base render
 * - stop whole-page translate/fade motion and accidental page zoom
 */
(function(){
  'use strict';
  if(window.__rtNavigationStability1497)return;
  window.__rtNavigationStability1497=true;

  function scrollY(){
    return Math.max(0,Number(window.scrollY||window.pageYOffset||0)||0);
  }
  function pageName(page){
    var id=page&&page.id||'';
    return id.indexOf('p-')===0?id.slice(2):'';
  }
  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}
  }

  try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(_){}

  /* App-like viewport behaviour. The meta update covers browsers that honour a
     runtime viewport change; touch-action is the second line of defence and still
     permits normal one-finger page scrolling. */
  try{
    var viewport=document.querySelector('meta[name="viewport"]');
    if(viewport)viewport.setAttribute('content','width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  }catch(_){}

  (function installStyles(){
    if(document.getElementById('rt-navigation-stability-1497-style'))return;
    var style=document.createElement('style');
    style.id='rt-navigation-stability-1497-style';
    style.textContent='\
      html,body,#app-root,#app-shell,.page,.page-scroll{overflow-anchor:none!important;}\
      html,body{touch-action:pan-x pan-y;}\
      .page.on{animation:none!important;transform:none!important;}\
      #p-item .rt-account-lazy-row,#p-item .account-group-body,#p-accounts .rt-acct-op-row{content-visibility:visible!important;contain-intrinsic-size:auto!important;}\
      .rt-account-transition-shell{display:none!important;}\
    ';
    document.head.appendChild(style);
  })();

  /* Scroll restoration was intentionally two frames late in the core. That makes
     the target page paint at Y=0 and then jump. All page renderers used by Back are
     synchronous, so restoring in the same task is both safe and visually stable. */
  try{
    if(typeof _restoreTabScroll==='function'&&!_restoreTabScroll.__rtStable1497){
      _restoreTabScroll=function(tab){
        var y=0;
        try{y=Number(_scrollMap&&_scrollMap[tab])||0;}catch(_){}
        window.scrollTo(0,Math.max(0,y));
      };
      _restoreTabScroll.__rtStable1497=true;
    }
  }catch(_){}

  /* The core goToTab used to activate the TARGET page and only then call
     _saveTabScroll(), so the source scroll position was accidentally stored under
     the destination key. It also deliberately deferred the render until a later
     frame. Wrap only navigation: filters/charts can keep their own deferred work. */
  try{
    var baseGoToTab=typeof goToTab==='function'?goToTab:window.goToTab;
    if(typeof baseGoToTab==='function'&&!baseGoToTab.__rtStable1497){
      var stableGoToTab=function(name,sourceEl){
        try{
          var current=document.querySelector('.page.on');
          var from=pageName(current);
          if(from&&from!=='item'&&typeof _scrollMap!=='undefined')_scrollMap[from]=scrollY();
        }catch(_){}

        var saveFn=null,queueFn=null,restoreFn=null;
        try{saveFn=_saveTabScroll;_saveTabScroll=function(){};}catch(_){}
        try{queueFn=_queueInteractionRender;_queueInteractionRender=function(fn){if(typeof fn==='function')fn();};}catch(_){}
        try{
          restoreFn=_restoreTabScroll;
          _restoreTabScroll=function(tab){
            var y=0;try{y=Number(_scrollMap&&_scrollMap[tab])||0;}catch(_){}
            window.scrollTo(0,Math.max(0,y));
          };
        }catch(_){}

        try{return baseGoToTab.apply(this,arguments);}
        finally{
          try{if(saveFn)_saveTabScroll=saveFn;}catch(_){}
          try{if(queueFn)_queueInteractionRender=queueFn;}catch(_){}
          try{if(restoreFn)_restoreTabScroll=restoreFn;}catch(_){}
        }
      };
      stableGoToTab.__rtStable1497=true;
      stableGoToTab.__rtBase=baseGoToTab;
      window.goToTab=stableGoToTab;
      try{goToTab=stableGoToTab;}catch(_){}
    }
  }catch(err){console.warn('[RETRADE] stable tab navigation install failed',err);}

  /* partner-account-experience-v2 inserted a three-card placeholder, painted it,
     then waited two frames before rendering the real account. That is the exact
     shell visible in the reported screenshot. Bypass that wrapper while keeping
     all of the account renderer/polish wrappers underneath it. */
  var authoritativeOpenAccount=null;
  try{
    authoritativeOpenAccount=window.openAccountPage||null;
    if(authoritativeOpenAccount&&authoritativeOpenAccount.__rtPaintFirst1491&&authoritativeOpenAccount.__rtBase){
      authoritativeOpenAccount=authoritativeOpenAccount.__rtBase;
    }
    if(typeof authoritativeOpenAccount==='function'){
      var stableOpenAccount=function(accountId){
        try{
          var accounts=document.getElementById('p-accounts');
          if(accounts&&accounts.classList.contains('on')&&typeof _scrollMap!=='undefined')_scrollMap.accounts=scrollY();
        }catch(_){}
        var result=authoritativeOpenAccount.apply(this,arguments);
        /* Account detail is a new surface, so it starts at the top. Do this in the
           same task as the render — never one or two frames afterwards. */
        try{window.scrollTo(0,0);}catch(_){}
        return result;
      };
      stableOpenAccount.__rtStable1497=true;
      stableOpenAccount.__rtBase=authoritativeOpenAccount;
      window.openAccountPage=stableOpenAccount;
      try{openAccountPage=stableOpenAccount;}catch(_){}
    }
  }catch(err){console.warn('[RETRADE] stable account open install failed',err);}

  /* The account Back control should use the same stable tab path rather than the
     old async render/restore sequence. */
  try{
    var stableBackToAccounts=function(){
      try{_acctSelectMode=false;}catch(_){}
      try{if(_acctSelected&&typeof _acctSelected.clear==='function')_acctSelected.clear();}catch(_){}
      if(typeof goToTab==='function')return goToTab('accounts',document.querySelector('[data-tab="accounts"]'));
    };
    stableBackToAccounts.__rtStable1497=true;
    window.backToAccountsList=stableBackToAccounts;
    try{backToAccountsList=stableBackToAccounts;}catch(_){}
  }catch(_){}

  /* Same principle one level deeper: preserve the account's exact scroll position
     before opening one of its items, and rebuild + restore synchronously on Back. */
  var accountItemReturn=null;
  try{
    var baseOpenAccountItem=window.openAccountItemPage;
    if(typeof baseOpenAccountItem==='function'&&!baseOpenAccountItem.__rtStable1497){
      var stableOpenAccountItem=function(month,itemId,accountId){
        accountItemReturn={accountId:accountId,scrollY:scrollY()};
        return baseOpenAccountItem.apply(this,arguments);
      };
      stableOpenAccountItem.__rtStable1497=true;
      stableOpenAccountItem.__rtBase=baseOpenAccountItem;
      window.openAccountItemPage=stableOpenAccountItem;
      try{openAccountItemPage=stableOpenAccountItem;}catch(_){}
    }

    var baseExitItem=typeof exitItemPage==='function'?exitItemPage:window.exitItemPage;
    if(typeof baseExitItem==='function'&&!baseExitItem.__rtStable1497){
      var stableExitItem=function(){
        try{
          if(accountItemReturn&&typeof _itemPageOrigin!=='undefined'&&_itemPageOrigin==='p-account-detail'){
            var ctx=accountItemReturn;
            var acct=accountById(ctx.accountId);
            if(acct){
              accountItemReturn=null;
              _itemPageOrigin='p-accounts';
              if(typeof _renderAccountPage==='function')_renderAccountPage(acct);
              window.scrollTo(0,Math.max(0,Number(ctx.scrollY)||0));
              try{if(typeof handleNavResize==='function')handleNavResize();}catch(_){}
              try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
              return;
            }
          }
        }catch(err){console.warn('[RETRADE] stable account-item back failed',err);}
        accountItemReturn=null;
        return baseExitItem.apply(this,arguments);
      };
      stableExitItem.__rtStable1497=true;
      stableExitItem.__rtBase=baseExitItem;
      window.exitItemPage=stableExitItem;
      try{exitItemPage=stableExitItem;}catch(_){}
    }
  }catch(err){console.warn('[RETRADE] stable account-item navigation install failed',err);}

  /* The Accounts presentation modules historically transform the freshly rendered
     list two animation frames later (sort dropdown -> compact Filter/Sort, row
     simplification, debt strip). Do the structural part in the mutation microtask
     instead, so the browser only ever paints the final geometry. */
  (function installSynchronousAccountListPolish(){
    var FILTERS={all:'All accounts',due:'Outstanding',fixed:'Fixed cost',share:'Profit share',settled:'Settled'};
    var SORTS={owed:'Outstanding · high to low','owed-asc':'Outstanding · low to high',name:'Alphabetical · A–Z','name-desc':'Alphabetical · Z–A',recent:'Recent activity'};
    var scheduled=false,defaultSortHandled=false;

    function escHtml(v){
      try{if(typeof esc==='function')return esc(String(v==null?'':v));}catch(_){}
      return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
    }
    function money(v){
      try{return typeof fmt==='function'?fmt(Number(v)||0):'£'+(Number(v)||0).toFixed(2);}catch(_){return '£'+(Number(v)||0).toFixed(2);}
    }
    function arrangementMeta(a){
      var fixed=String(a&&a.accountType||'supplier').toLowerCase()==='supplier';
      try{if(typeof _rtArrangementForAccount==='function')fixed=_rtArrangementForAccount(a)==='fixed_cost';}catch(_){}
      if(fixed){
        var timing=String(a&&((a.paymentTiming||a.paymentTerms)||'upfront')).toLowerCase();
        return {type:'Fixed cost',kind:'fixed',term:timing==='on_sale'?'After sale':'Upfront'};
      }
      var p=a&&a.defaultSplitPercent!=null?Number(a.defaultSplitPercent):null;
      return {type:'Profit share',kind:'share',term:p!=null&&isFinite(p)?((p%1?p.toFixed(1):p.toFixed(0))+'% split'):'Split set per item'};
    }
    function totalDue(){
      var due=0;
      try{(_accounts||[]).forEach(function(a){var s=typeof _accountStats==='function'?_accountStats(a.id):{};due+=Number(s.dueNow)||0;});}catch(_){}
      return due;
    }
    function ensureStrip(page,controls){
      var strip=page.querySelector('.rt-acct-compact-strip');
      if(!strip){
        strip=document.createElement('div');strip.className='rt-acct-compact-strip';strip.innerHTML='<span>Outstanding</span><strong></strong>';
        if(controls&&controls.parentNode)controls.parentNode.insertBefore(strip,controls);
      }
      var strong=strip.querySelector('strong'),desired=money(totalDue());
      if(strong&&strong.textContent!==desired)strong.textContent=desired;
    }
    function simplifyRows(page){
      page.querySelectorAll('.rt-acct-op-row[data-account-id]').forEach(function(row){
        var id=row.getAttribute('data-account-id'),a=accountById(id);if(!a)return;
        var s=typeof _accountStats==='function'?_accountStats(id):{},due=Number(s.dueNow)||0;
        var count=Number(s.unsettledCount)||Number(s.unsettledSoldCount)||0;
        var meta=arrangementMeta(a);
        var name=row.querySelector('.rt-acct-op-name');
        var nameHtml='<span class="rt-acct-snapshot-name">'+escHtml(a.name||'Unnamed account')+'</span>';
        if(name&&name.innerHTML!==nameHtml)name.innerHTML=nameHtml;
        var terms=row.querySelector('.rt-acct-op-terms');
        var termsHtml='<span class="rt-acct-op-badge '+meta.kind+'">'+escHtml(meta.type)+'</span><span class="rt-acct-snapshot-term">'+escHtml(meta.term)+'</span>';
        if(terms&&terms.innerHTML!==termsHtml)terms.innerHTML=termsHtml;
        ['.rt-acct-op-actions','.rt-acct-op-stock','.rt-acct-op-activity'].forEach(function(sel){
          var el=row.querySelector(sel);if(el&&el.style.display!=='none')el.style.display='none';
        });
        var box=row.querySelector('.rt-acct-op-money');
        var moneyHtml='<strong class="rt-acct-op-due'+(due>0?' hot':'')+'">'+money(due)+'</strong><span>'+(due>0?(count+' item'+(count===1?'':'s')+' outstanding'):'Settled')+'</span>';
        if(box&&box.innerHTML!==moneyHtml)box.innerHTML=moneyHtml;
      });
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
    function stabilise(){
      var page=document.getElementById('p-accounts');if(!page)return;
      var controls=page.querySelector('.rt-acct-op-controls');if(!controls)return;

      var nativeSort=controls.querySelector('select[aria-label="Sort accounts"]');
      if(!defaultSortHandled&&nativeSort&&nativeSort.value==='attention'&&typeof window._rtAcctOpSort==='function'){
        defaultSortHandled=true;
        window._rtAcctOpSort('owed');
        return;
      }
      defaultSortHandled=true;

      page.querySelectorAll('.rt-acct-op-overview').forEach(function(el){if(el.style.display!=='none')el.style.display='none';});
      page.querySelectorAll('.rt-acct-op-selectbar').forEach(function(el){el.remove();});
      ensureStrip(page,controls);

      var existing=controls.querySelector('.rt-acct-combined-dd');
      if(!existing){
        var filterSel=controls.querySelector('select[aria-label="Filter accounts"]');
        var sortSel=controls.querySelector('select[aria-label="Sort accounts"]');
        var filter=(filterSel&&FILTERS[filterSel.value])?filterSel.value:'all';
        var sort=(sortSel&&SORTS[sortSel.value])?sortSel.value:'owed';
        controls.querySelectorAll('.rt-acct-op-sort-dd').forEach(function(el){el.remove();});
        if(sortSel)sortSel.remove();
        if(filterSel)filterSel.remove();
        Array.prototype.slice.call(controls.querySelectorAll('button')).forEach(function(btn){
          if(/^(select|cancel)$/i.test(String(btn.textContent||'').trim()))btn.remove();
        });
        controls.appendChild(combinedControl(filter,sort));
      }
      if(!controls.classList.contains('rt-acct-compact-controls'))controls.classList.add('rt-acct-compact-controls');
      var search=controls.querySelector('.rt-acct-op-search');if(search&&search.style.minWidth!=='0px')search.style.minWidth='0';
      simplifyRows(page);
    }
    function schedule(){
      if(scheduled)return;scheduled=true;
      Promise.resolve().then(function(){scheduled=false;try{stabilise();}catch(err){console.warn('[RETRADE] synchronous account-list polish failed',err);}});
    }
    var page=document.getElementById('p-accounts');
    if(page){
      try{new MutationObserver(schedule).observe(page,{childList:true,subtree:true});}catch(_){}
      schedule();
    }
  })();

  /* If an older wrapper managed to paint its placeholder before this enhancement
     finished loading, repair it immediately instead of leaving three blank cards. */
  function repairStrandedAccountShell(){
    try{
      var page=document.getElementById('p-item');
      if(!page||!page.classList.contains('on')||!page.querySelector('.rt-account-transition-shell'))return;
      var title=page.querySelector('.page-title');
      var name=String(title&&title.textContent||'').trim();
      var acct=(_accounts||[]).find(function(a){return a&&String(a.name||'').trim()===name;});
      if(acct&&typeof authoritativeOpenAccount==='function'){
        page.removeAttribute('data-rt-account-transition');
        authoritativeOpenAccount(acct.id);
        window.scrollTo(0,0);
      }
    }catch(_){}
  }
  repairStrandedAccountShell();
  window.addEventListener('pageshow',repairStrandedAccountShell);

  console.info('[RETRADE] v1.4.97 navigation + spatial stability loaded');
})();