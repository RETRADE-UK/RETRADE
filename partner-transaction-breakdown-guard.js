/* RETRADE partner transaction breakdown guard v1.4.83
 * Makes one rule explicit in the UI: the settlement transaction amount is the
 * cash payment; its item allocations are only the breakdown of that payment.
 * They must never be read or totalled as additional payments.
 */
(function(){
  'use strict';
  if(window.__rtPartnerTransactionBreakdown1483)return;
  window.__rtPartnerTransactionBreakdown1483=true;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function money(v){try{return typeof fmt==='function'?fmt(round(v)):'£'+round(v).toFixed(2);}catch(_){return '£'+round(v).toFixed(2);}}
  function e(v){try{return typeof esc==='function'?esc(String(v==null?'':v)):String(v==null?'':v);}catch(_){return String(v==null?'':v);}}
  function acct(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function itemName(a){
    var id=a&&(a.id!=null?a.id:a.itemId),rec=null;
    try{if(id&&typeof _findItemRecordById==='function')rec=_findItemRecordById(id);}catch(_){}
    return (rec&&rec.item&&rec.item.item)||(a&&a.name)||'Item no longer found';
  }
  function allocTotal(tx){return round((tx&&Array.isArray(tx.items)?tx.items:[]).reduce(function(s,a){return s+Math.max(0,Number(a&&a.amount)||0);},0));}

  window._openSettlementDetail=function(accountId,settlementId){
    var a=acct(accountId);if(!a)return;
    var tx=(a.settlements||[]).find(function(t){return t&&String(t.id)===String(settlementId);});if(!tx)return;
    var total=round(tx.partnerAmount||0),allocated=allocTotal(tx),diff=round(total-allocated);
    var rows=(tx.items||[]).map(function(x){return '<div class="metric-inline rt-settle-breakdown-row"><div style="min-width:0;flex:1"><div class="metric-k">'+e(itemName(x))+'</div><div class="rt-settle-breakdown-note">Included in this payment</div></div><strong>'+e(money(x.amount||0))+'</strong></div>';}).join('');
    var note=tx.note?'<div class="rt-settle-detail-note">'+e(tx.note)+'</div>':'';
    var mismatch=Math.abs(diff)>0.009?'<div class="rt-settle-allocation-warning">'+(diff>0?e(money(diff))+' of this payment is not yet assigned to an item.':e(money(Math.abs(diff)))+' more is allocated than the payment total — review this transaction.')+'</div>':'';
    var html='<div class="rt-settle-parent"><div><span>Payment transaction</span><strong>'+e(tx.date||'Undated')+' · '+(tx.paid===true?'Paid':'Unpaid')+'</strong></div><div class="rt-settle-parent-amount">'+e(money(total))+'</div></div>'+
      '<div class="rt-settle-explain"><strong>'+e(money(total))+' is the payment.</strong> The item amounts below are allocations inside that total — they are not extra payments and must not be added again.</div>'+note+
      '<div class="rt-settle-allocation-head"><span>What this payment covered</span><strong>'+e(money(allocated))+' allocated</strong></div>'+(rows||'<div class="rt-settle-empty">No item allocations recorded yet.</div>')+mismatch+
      '<div style="margin-top:14px"><button type="button" class="btn btn-secondary" onclick="closePanel()">Close</button></div>';
    try{openPanel('Payment details · '+(a.name||'Partner'),html);}catch(_){}
  };

  function styles(){if(document.getElementById('rt-settle-breakdown-style'))return;var s=document.createElement('style');s.id='rt-settle-breakdown-style';s.textContent='\
    .rt-settle-parent{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 13px;border:1px solid var(--border);border-radius:11px;background:var(--surface2);margin-bottom:10px}.rt-settle-parent>div:first-child{display:flex;flex-direction:column;gap:3px}.rt-settle-parent span{font-size:10.5px;color:var(--text-secondary)}.rt-settle-parent strong{font-size:12px}.rt-settle-parent-amount{font-size:21px;font-weight:850;color:var(--accent);font-variant-numeric:tabular-nums}.rt-settle-explain{font-size:11px;line-height:1.5;color:var(--text-secondary);padding:10px 11px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:0 8px 8px 0;margin-bottom:12px}.rt-settle-explain strong{color:var(--text)}.rt-settle-detail-note{font-size:11px;color:var(--text-secondary);margin:0 0 12px}.rt-settle-allocation-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--text-secondary);margin:8px 0 6px}.rt-settle-allocation-head strong{color:var(--text)}.rt-settle-breakdown-row{padding-top:9px!important;padding-bottom:9px!important}.rt-settle-breakdown-note{font-size:9.5px;color:var(--text-secondary);margin-top:2px}.rt-settle-allocation-warning{margin-top:10px;padding:9px 10px;border:1px solid var(--warn);border-radius:8px;color:var(--warn);font-size:10.5px;line-height:1.45}.rt-settle-empty{padding:12px;color:var(--text-secondary);font-size:11px;border:1px solid var(--border);border-radius:8px}\
  ';document.head.appendChild(s);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',styles,{once:true});else styles();
  console.info('[RETRADE] v1.4.83 settlement allocation display guard loaded');
})();