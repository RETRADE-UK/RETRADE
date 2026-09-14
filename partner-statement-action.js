/* RETRADE partner statement action v1.4.67
 *
 * Keeps the period statement entry point attached to the live Partner account
 * header after account-control re-renders. The statement engine itself stays in
 * partner-statements.js and remains read-only.
 */
(function(){
  'use strict';

  var activeAccountId=null;
  var statementLoader=null;
  var repairQueued=false;
  var observer=null;

  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }

  function findBackControl(page){
    if(!page)return null;
    var controls=page.querySelectorAll('button,a');
    var fallback=null;
    for(var i=0;i<controls.length;i++){
      var el=controls[i];
      var text=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      var meta=(text+' '+String(el.getAttribute('aria-label')||'')+' '+String(el.getAttribute('title')||'')).toLowerCase();
      if(text==='back to accounts'||text==='back to account'||text==='back to partners'||text==='back to partner')return el;
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta)&&!fallback)fallback=el;
    }
    return fallback;
  }

  function isAccountDetail(page){
    if(!page||!page.classList.contains('on'))return false;
    try{if(typeof _itemPageOrigin!=='undefined'&&_itemPageOrigin==='p-account-detail')return false;}catch(_){}
    return !!(findBackControl(page)||page.querySelector('.account-group'));
  }

  function accountFromPage(page){
    var known=accountById(activeAccountId);
    if(known)return known;
    if(!page)return null;

    var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){
      var taggedId=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid');
      var taggedAcct=accountById(taggedId);if(taggedAcct)return taggedAcct;
    }

    var itemLink=page.querySelector('.account-group .metric-k[data-itemid][data-month]');
    if(itemLink){
      try{
        var month=itemLink.getAttribute('data-month');
        var itemId=itemLink.getAttribute('data-itemid');
        var items=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        var item=items.find(function(x){return x&&String(x.id)===String(itemId);});
        if(item&&item.accountId!=null){
          var itemAcct=accountById(item.accountId);if(itemAcct)return itemAcct;
        }
      }catch(_){}
    }

    var heading=page.querySelector('.page-title,h1,h2,h3');
    var headingText=String(heading&&heading.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    if(headingText){
      try{
        var matches=(_accounts||[]).filter(function(a){
          var name=String(a&&a.name||'').replace(/\s+/g,' ').trim().toLowerCase();
          return !!name&&(headingText===name||headingText.indexOf(name)!==-1);
        });
        if(matches.length===1)return matches[0];
      }catch(_){}
    }
    return null;
  }

  function navHost(back,page){
    if(!back||!page)return null;
    var node=back.parentElement;
    var fallback=node;
    for(var depth=0;node&&node!==page&&depth<5;depth++,node=node.parentElement){
      try{
        var display=window.getComputedStyle(node).display;
        if(display==='flex'||display==='inline-flex'||display==='grid'||display==='inline-grid')return node;
      }catch(_){}
    }
    return fallback;
  }

  function loadStatements(done){
    if(typeof window.openPartnerStatement==='function'){
      done();
      return;
    }
    if(statementLoader){
      statementLoader.then(done).catch(function(){try{toast('Could not load partner statements','error');}catch(_){}});
      return;
    }
    statementLoader=new Promise(function(resolve,reject){
      var existing=document.getElementById('rt-partner-statements-script');
      if(existing&&typeof window.openPartnerStatement!=='function'){
        try{existing.remove();}catch(_){}
      }
      var script=document.createElement('script');
      script.id='rt-partner-statements-script';
      script.src='./partner-statements.js?v=20260914-v1467';
      script.async=true;
      script.onload=function(){
        if(typeof window.openPartnerStatement==='function')resolve();
        else reject(new Error('Partner statement module did not initialise'));
      };
      script.onerror=reject;
      document.head.appendChild(script);
    });
    statementLoader.then(done).catch(function(err){
      statementLoader=null;
      console.warn('[RETRADE] partner statement module failed to load',err);
      try{toast('Could not load partner statements','error');}catch(_){}
    });
  }

  function makeButton(acct){
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='btn btn-secondary rt-partner-statement-btn';
    btn.setAttribute('data-rt-statement-owner','v1467');
    btn.title='Statement by month, year or custom date range';
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h5l3 3V13.5H4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 2.5v3h3M6 8h4M6 10.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Statement</span>';
    btn.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      var accountId=btn.dataset.accountId;
      loadStatements(function(){
        try{window.openPartnerStatement(accountId);}catch(err){
          console.warn('[RETRADE] partner statement open failed',err);
          try{toast('Could not open partner statement','error');}catch(_){}
        }
      });
    });
    btn.dataset.accountId=acct.id;
    return btn;
  }

  function placeStatementAction(acct){
    var page=document.getElementById('p-item');
    if(!acct||!isAccountDetail(page))return;
    activeAccountId=acct.id;

    var btn=page.querySelector('.rt-partner-statement-btn');
    if(!btn)btn=makeButton(acct);
    btn.dataset.accountId=acct.id;
    btn.style.display='inline-flex';
    btn.style.alignItems='center';
    btn.style.justifyContent='center';
    btn.style.gap='5px';
    btn.style.fontSize='12px';
    btn.style.padding='7px 10px';
    btn.style.minHeight='36px';
    btn.style.whiteSpace='nowrap';

    var back=findBackControl(page);
    var host=navHost(back,page);
    if(host){
      if(btn.parentElement!==host)host.appendChild(btn);
      var display='';
      try{display=window.getComputedStyle(host).display;}catch(_){}
      btn.style.marginLeft=(display==='flex'||display==='inline-flex'||display==='grid'||display==='inline-grid')?'auto':'8px';
      return;
    }

    // Fallback for an account shell without the standard Back row: keep the
    // action visible directly above Search / Select rather than losing it.
    var toolbar=page.querySelector('.rt-partner-v2-toolbar');
    if(toolbar&&toolbar.parentNode){
      var fallback=page.querySelector('.rt-partner-statement-fallback');
      if(!fallback){
        fallback=document.createElement('div');
        fallback.className='rt-partner-statement-fallback';
        fallback.style.cssText='display:flex;justify-content:flex-end;margin:0 0 10px;';
        toolbar.parentNode.insertBefore(fallback,toolbar);
      }
      fallback.appendChild(btn);
      btn.style.marginLeft='0';
    }
  }

  function repair(){
    repairQueued=false;
    var page=document.getElementById('p-item');
    if(!isAccountDetail(page))return;
    var acct=accountFromPage(page);
    if(acct)placeStatementAction(acct);
  }

  function scheduleRepair(acct){
    if(acct&&acct.id!=null)activeAccountId=acct.id;
    if(repairQueued)return;
    repairQueued=true;
    requestAnimationFrame(repair);
  }

  if(typeof _renderAccountPage==='function'){
    var baseRenderAccountPage=_renderAccountPage;
    _renderAccountPage=function(acct){
      if(acct&&acct.id!=null)activeAccountId=acct.id;
      var result=baseRenderAccountPage.apply(this,arguments);
      scheduleRepair(acct);
      return result;
    };
  }

  var page=document.getElementById('p-item');
  if(page){
    try{
      observer=new MutationObserver(function(){scheduleRepair();});
      observer.observe(page,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    }catch(_){}
  }
  scheduleRepair();
  console.info('[RETRADE] v1.4.67 persistent partner Statement action loaded');
})();
