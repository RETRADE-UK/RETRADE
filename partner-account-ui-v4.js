/* RETRADE partner account UI v1.4.72
 * Normalises every Partner account page to one layout and one calculation path.
 * - Back + Statement are always the top navigation row.
 * - Legacy page-wide Allocate & settle is retired.
 * - The same four account-position cards render for supplier/consignment accounts.
 * - Stock and remaining potential are derived from the live item model, not
 *   whichever legacy KPI happened to be rendered for that account type.
 * - Sales, Listed stock and Unlisted stock start collapsed when no user state
 *   exists for that section.
 */
(function(){
  'use strict';

  var queued=false;
  var observer=null;

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function roundMoney(n){return Math.round((Number(n)||0)*100)/100;}
  function money(n){
    try{if(typeof fmt==='function')return fmt(roundMoney(n));}catch(_){}
    return '£'+roundMoney(n).toFixed(2);
  }
  function setText(el,value){
    if(!el)return;
    value=String(value==null?'':value);
    if(el.textContent!==value)el.textContent=value;
  }

  function normaliseBackLabel(value){
    return String(value||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/^[←‹<]\s*/, '');
  }

  function findBack(page){
    if(!page)return null;
    var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var raw=text(controls[i]).toLowerCase();
      var clean=normaliseBackLabel(raw);
      var meta=(raw+' '+String(controls[i].getAttribute('aria-label')||'')+' '+String(controls[i].getAttribute('title')||'')).toLowerCase();
      if(clean==='accounts'||clean==='account'||clean==='partners'||clean==='partner')return controls[i];
      if(raw==='back to accounts'||raw==='back to account'||raw==='back to partners'||raw==='back to partner')return controls[i];
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return controls[i];
    }
    return null;
  }

  function activePage(){
    var direct=document.getElementById('p-item');
    if(direct&&direct.classList.contains('on')&&(direct.querySelector('.account-group')||direct.querySelector('.rt-partner-summary-v3')||findBack(direct)))return direct;
    var pages=document.querySelectorAll('.page.on,[id^="p-"][class~="on"]');
    for(var i=0;i<pages.length;i++){
      if(pages[i].querySelector('.account-group')||pages[i].querySelector('.rt-partner-summary-v3'))return pages[i];
    }
    return null;
  }

  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }

  function accountFromPage(page){
    if(!page)return null;
    var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){
      var taggedId=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid');
      var taggedAcct=accountById(taggedId);if(taggedAcct)return taggedAcct;
    }
    var link=page.querySelector('.account-group [data-itemid][data-month]');
    if(link){
      try{
        var month=link.getAttribute('data-month'),itemId=link.getAttribute('data-itemid');
        var rows=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        var item=rows.find(function(x){return x&&String(x.id)===String(itemId);});
        if(item&&item.accountId!=null){var a=accountById(item.accountId);if(a)return a;}
      }catch(_){}
    }
    var heading=page.querySelector('.page-title,h1,h2,h3');
    var headingText=text(heading).toLowerCase();
    if(headingText){
      try{
        var matches=(_accounts||[]).filter(function(a){
          var name=String(a&&a.name||'').replace(/\s+/g,' ').trim().toLowerCase();
          return !!name&&(headingText===name||headingText.indexOf(name)!==-1||name.indexOf(headingText)!==-1);
        });
        if(matches.length===1)return matches[0];
      }catch(_){}
    }
    return null;
  }

  function accountItems(accountId){
    var out=[];
    try{
      (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(month){
        var rows=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        rows.forEach(function(item){if(item&&String(item.accountId)===String(accountId))out.push(item);});
      });
    }catch(_){}
    return out;
  }

  function installStyles(){
    if(document.getElementById('rt-partner-account-v4-style'))return;
    var s=document.createElement('style');
    s.id='rt-partner-account-v4-style';
    s.textContent='\
      .rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;margin:0 0 12px!important;}\
      .rt-partner-v4-navrow>.rt-partner-statement-btn{margin:0 0 0 auto!important;flex:0 0 auto!important;}\
      .rt-partner-summary-v3.rt-partner-summary-v4{margin:12px 0 16px!important;}\
      .rt-partner-summary-v4 .rt-partner-summary-v3-head{margin-bottom:9px!important;}\
      .rt-partner-summary-v4 .rt-partner-summary-v3-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;}\
      .rt-partner-summary-v4 .rt-partner-summary-v3-card[data-kind="stock"] .rt-partner-summary-v3-value{font-variant-numeric:tabular-nums;}\
      .rt-partner-v4-hidden{display:none!important;}\
      @media(max-width:760px){.rt-partner-summary-v4 .rt-partner-summary-v3-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;}}\
    ';
    document.head.appendChild(s);
  }

  function ensureTopNav(page){
    var back=findBack(page);if(!back)return;
    var row=back.closest('.rt-partner-v4-navrow');
    if(!row){
      var host=back.parentElement;if(!host)return;
      row=document.createElement('div');
      row.className='rt-partner-v4-navrow';
      host.insertBefore(row,back);
      row.appendChild(back);
    }
    var statement=page.querySelector('.rt-partner-statement-btn');
    if(statement&&statement.parentElement!==row)row.appendChild(statement);
    if(statement)statement.style.setProperty('margin-left','auto','important');
    page.querySelectorAll('.rt-partner-statement-fallback').forEach(function(el){if(!el.children.length)el.remove();});
  }

  function removeLegacyAllocate(page){
    page.querySelectorAll('button,a').forEach(function(el){
      if(el.closest('.account-group,.rt-partner-v2-selection'))return;
      var label=text(el).toLowerCase();
      var action=String(el.getAttribute('onclick')||'').toLowerCase();
      if(/^allocate\s*&\s*settle\b/.test(label)||action.indexOf('_openconsignmentsettlementbuilder')!==-1||action.indexOf('settleallforaccount')!==-1){
        var parent=el.parentElement;
        el.remove();
        if(parent&&parent!==page&&parent.children.length===0&&!text(parent))parent.remove();
      }
    });
  }

  function ensureDefaultCollapsedGroups(page){
    var allowed={sales:true,listed:true,unlisted:true};
    page.querySelectorAll('.account-group-head').forEach(function(head){
      var onclick=head.getAttribute('onclick')||'';
      var m=onclick.match(/_toggleAccountGroup\('([^']*)','([^']*)'/);
      if(!m||!allowed[m[2]])return;
      var stateKey=String(m[1])+':'+String(m[2]);
      var shouldCollapse=false;
      try{
        if(typeof _accountGroupState!=='undefined'&&_accountGroupState&&!Object.prototype.hasOwnProperty.call(_accountGroupState,stateKey)){
          _accountGroupState[stateKey]=true;
          shouldCollapse=true;
        }
      }catch(_){shouldCollapse=true;}
      if(!shouldCollapse)return;
      var group=head.closest('.account-group');
      if(group)group.classList.add('collapsed');
      head.setAttribute('aria-expanded','false');
    });
  }

  function itemState(item){return String(item&&item.state||'').toLowerCase();}
  function isScrapped(item){return !!(item&&(item.scrappedAt||item.scrapped_at));}
  function isCurrentStock(item){
    if(!item||isScrapped(item))return false;
    var state=itemState(item);
    return state==='listed'||state==='sourced'||state==='returned';
  }
  function itemPartsCost(item){
    try{if(typeof calcPartsCost==='function')return Number(calcPartsCost(item))||0;}catch(_){}
    return (Array.isArray(item&&item.parts)?item.parts:[]).reduce(function(sum,p){return sum+(Number(p&&p.cost)||0);},0);
  }
  function positiveFirst(){
    for(var i=0;i<arguments.length;i++){
      var n=Number(arguments[i]);if(isFinite(n)&&n>0)return n;
    }
    return 0;
  }
  function accountTypeFor(item,acct){
    try{if(typeof _itemAccountType==='function')return String(_itemAccountType(item)||'').toLowerCase();}catch(_){}
    return String((item&&item.accountType)||(acct&&acct.accountType)||'supplier').toLowerCase();
  }

  function stockInfo(acct){
    var items=accountItems(acct.id).filter(isCurrentStock);
    var listed=items.filter(function(i){return itemState(i)==='listed';});
    var unlisted=items.filter(function(i){return itemState(i)==='sourced';});
    var returned=items.filter(function(i){return itemState(i)==='returned';});
    var stockCost=roundMoney(items.reduce(function(sum,item){
      return sum+(Number(item.costPrice)||0)+itemPartsCost(item);
    },0));
    return {items:items,total:items.length,listed:listed.length,unlisted:unlisted.length,returned:returned.length,stockCost:stockCost};
  }

  function potentialInfo(acct,items){
    var total=0,priced=0,listedPriced=0,estimatedPriced=0;
    (items||[]).forEach(function(item){
      var state=itemState(item),price=0;
      if(state==='listed')price=positiveFirst(item.salePrice,item.estSalePrice);
      else if(state==='sourced')price=positiveFirst(item.estSalePrice);
      if(!(price>0))return;

      var revenue=price+(Number(item.postage)||0);
      var shipping=Math.max(0,Number(item.shippingCost)||0);
      var packaging=Math.max(0,Number(item.packagingCost)||0);
      var listingFee=Math.max(0,Number(item.listingFee)||0);
      var promoPct=Math.max(0,Number(item.promoPercent)||0);
      if(promoPct>1)promoPct=promoPct/100;
      var promo=price*promoPct;
      var parts=itemPartsCost(item);
      var type=accountTypeFor(item,acct);
      var fixed=item.accountPaidAmount!=null&&item.accountPaidAmount!==''?Math.max(0,Number(item.accountPaidAmount)||0):null;
      var purchaseCost=type==='supplier'?(fixed!=null?fixed:Math.max(0,Number(item.costPrice)||0)):Math.max(0,Number(item.costPrice)||0);
      var pool=revenue-purchaseCost-shipping-packaging-listingFee-promo-parts;
      var retrade=pool;

      if(type!=='supplier'){
        var partner=0;
        if(fixed!=null){
          partner=fixed;
        }else{
          var pct=item.accountSplitPercent!=null?Number(item.accountSplitPercent):Number(acct&&acct.defaultSplitPercent);
          if(isFinite(pct))partner=Math.max(0,pool)*Math.max(0,Math.min(100,pct))/100;
        }
        retrade=pool-partner;
      }

      total+=Math.max(0,retrade);
      priced++;
      if(state==='listed')listedPriced++;else estimatedPriced++;
    });

    if(!priced)return {value:null,note:'No priced unsold items available for a reliable estimate'};
    var note='Estimated RETRADE profit from ';
    if(listedPriced&&estimatedPriced)note+=listedPriced+' listed + '+estimatedPriced+' estimated unlisted item'+(estimatedPriced===1?'':'s');
    else if(listedPriced)note+=listedPriced+' listed item'+(listedPriced===1?'':'s')+' at current asking price'+(listedPriced===1?'':'s');
    else note+=estimatedPriced+' estimated unlisted item'+(estimatedPriced===1?'':'s');
    return {value:roundMoney(total),note:note};
  }

  function paidInfo(acct){
    var paid=0,count=0;
    try{
      (acct.settlements||[]).forEach(function(tx){if(tx&&tx.paid===true){paid+=Number(tx.partnerAmount)||0;count++;}});
    }catch(_){}
    return {value:roundMoney(paid),count:count};
  }

  function findCard(summary,label,kind){
    var cards=summary.querySelectorAll('.rt-partner-summary-v3-card');
    label=String(label||'').toLowerCase();
    for(var i=0;i<cards.length;i++){
      var l=cards[i].querySelector('.rt-partner-summary-v3-label');
      if((kind&&cards[i].getAttribute('data-kind')===kind)||text(l).toLowerCase()===label)return cards[i];
    }
    return null;
  }

  function setCard(card,label,value,sub,kind){
    if(!card)return;
    setText(card.querySelector('.rt-partner-summary-v3-label'),label);
    setText(card.querySelector('.rt-partner-summary-v3-value'),value==null?'—':value);
    setText(card.querySelector('.rt-partner-summary-v3-sub'),sub||'');
    if(card.getAttribute('data-kind')!==(kind||''))card.setAttribute('data-kind',kind||'');
  }

  function normaliseSummary(page,acct){
    var summary=page.querySelector('.rt-partner-summary-v3');if(!summary||!acct)return;
    summary.classList.add('rt-partner-summary-v4');

    var info=stockInfo(acct);
    var potential=potentialInfo(acct,info.items);
    var paid=paidInfo(acct);
    var stockCard=findCard(summary,'Paid to partner','paid')||findCard(summary,'Stock on hand','stock');
    var potentialCard=findCard(summary,'Potential remaining','potential');
    var outstanding=findCard(summary,'Partner outstanding','outstanding');

    var bits=[info.listed+' listed',info.unlisted+' unlisted'];
    if(info.returned)bits.push(info.returned+' returned');
    if(Math.abs(info.stockCost)>0.009)bits.push('cost '+money(info.stockCost));
    setCard(stockCard,'Stock on hand',String(info.total),bits.join(' · '),'stock');
    setCard(potentialCard,'Potential remaining',potential.value==null?null:money(potential.value),potential.note,'potential');

    if(outstanding&&paid.value>0){
      var sub=outstanding.querySelector('.rt-partner-summary-v3-sub');
      var base=text(sub).replace(/\s*·\s*£[\d,.]+\s+paid$/i,'');
      setText(sub,base+' · '+money(paid.value)+' paid');
    }
  }

  function smallestMatch(page,re,maxLen){
    var all=page.querySelectorAll('div,section,article');
    var best=null,bestLen=Infinity;
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow'))continue;
      var t=text(el);
      if(!re.test(t)||t.length>(maxLen||240))continue;
      if(t.length<bestLen){best=el;bestLen=t.length;}
    }
    return best;
  }

  function hideLegacyStock(page){
    page.querySelectorAll('.account-stock-kpi,.account-stock-money').forEach(function(el){el.classList.add('rt-partner-v4-hidden');});
    var stock=smallestMatch(page,/\bstock on hand\b/i,210);
    var strip=smallestMatch(page,/\bstock cost\b.*\blisted asking\b/i,300);
    [stock,strip].forEach(function(el){if(el)el.classList.add('rt-partner-v4-hidden');});
  }

  function fix(){
    queued=false;
    installStyles();
    var page=activePage();if(!page)return;
    removeLegacyAllocate(page);
    ensureTopNav(page);
    ensureDefaultCollapsedGroups(page);
    var acct=accountFromPage(page);
    if(acct)normaliseSummary(page,acct);
    hideLegacyStock(page);
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(function(){requestAnimationFrame(fix);});
  }

  function start(){
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