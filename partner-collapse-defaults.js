/* RETRADE partner collapse defaults — v1.4.78
 *
 * Keeps account detail pages compact on first view. Every account row/group starts
 * collapsed for the session, including Returns, Payment/Settlement history and the
 * transaction-repair Unsettled items section. Once the user opens/closes a section,
 * that choice is preserved for the rest of the current app session.
 *
 * Presentation only: does not change items, payments, settlements or cashflow.
 */
(function(){
  'use strict';
  if(window.__rtPartnerCollapseDefaultsReady)return;
  window.__rtPartnerCollapseDefaultsReady=true;

  var groupState=Object.create(null);
  var unsettledState=Object.create(null);
  var queued=false;
  var observer=null;

  function norm(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function page(){
    var p=document.getElementById('p-item');
    return p&&p.classList.contains('on')?p:null;
  }
  function searchActive(p){
    var input=p&&p.querySelector('.rt-partner-v2-search input');
    return !!(input&&norm(input.value));
  }
  function accountIdentity(p){
    var tagged=p&&p.querySelector('[data-account-id],[data-accountid]');
    if(tagged){
      var id=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid');
      if(id)return String(id);
    }
    var h=p&&p.querySelector('.page-title,h1,h2,h3');
    return norm(h&&h.textContent).toLowerCase()||'account';
  }
  function groupIdentity(head,p,index){
    var action=String(head&&head.getAttribute('onclick')||'');
    var m=action.match(/_toggleAccountGroup\('([^']*)','([^']*)'/);
    if(m)return {key:String(m[1])+':'+String(m[2]),coreKey:String(m[1])+':'+String(m[2])};
    var title=norm((head&&head.querySelector('.account-group-title'))?head.querySelector('.account-group-title').textContent:head&&head.textContent).toLowerCase();
    return {key:accountIdentity(p)+':group:'+(title||index),coreKey:null};
  }
  function syncCore(coreKey,closed){
    if(!coreKey)return;
    try{
      if(typeof _accountGroupState!=='undefined'&&_accountGroupState)_accountGroupState[coreKey]=!!closed;
    }catch(_){}
  }
  function applyGroup(group,head,key,coreKey,closed){
    group.classList.toggle('collapsed',!!closed);
    if(head)head.setAttribute('aria-expanded',closed?'false':'true');
    syncCore(coreKey,closed);
  }
  function bindGroups(p){
    var searching=searchActive(p);
    Array.prototype.forEach.call(p.querySelectorAll('.account-group'),function(group,index){
      var head=group.querySelector('.account-group-head');
      if(!head)return;
      var ident=groupIdentity(head,p,index),key=ident.key;
      if(!Object.prototype.hasOwnProperty.call(groupState,key))groupState[key]=true;

      /* Live search deliberately expands item groups so matches remain visible. */
      if(!searching)applyGroup(group,head,key,ident.coreKey,groupState[key]);

      if(head.getAttribute('data-rt-collapse-default-bound')==='1')return;
      head.setAttribute('data-rt-collapse-default-bound','1');
      head.addEventListener('click',function(){
        groupState[key]=!groupState[key];
        syncCore(ident.coreKey,groupState[key]);
      },true);
    });
  }
  function bindUnsettled(p){
    var box=p.querySelector('.rt-payalloc2');
    if(!box)return;
    var key=accountIdentity(p)+':unsettled';
    if(!Object.prototype.hasOwnProperty.call(unsettledState,key))unsettledState[key]=true;
    box.classList.toggle('closed',!!unsettledState[key]);
    var head=box.querySelector('.rt-payalloc2-head');
    if(head)head.setAttribute('aria-expanded',unsettledState[key]?'false':'true');
    if(!head||head.getAttribute('data-rt-collapse-default-bound')==='1')return;
    head.setAttribute('data-rt-collapse-default-bound','1');
    head.addEventListener('click',function(){unsettledState[key]=!unsettledState[key];},true);
  }
  function enhance(){
    queued=false;
    var p=page();if(!p)return;
    bindGroups(p);
    bindUnsettled(p);
  }
  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(enhance);
  }

  schedule();
  observer=new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      if(muts[i].type==='childList'&&(muts[i].addedNodes.length||muts[i].removedNodes.length)){schedule();return;}
    }
  });
  try{observer.observe(document.body,{childList:true,subtree:true});}catch(_){}

  window.addEventListener('retrade:motion-ready',schedule);
  console.info('[RETRADE] v1.4.78 partner sections default collapsed');
})();