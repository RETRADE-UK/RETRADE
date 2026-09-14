/* RETRADE partner account UI v1.4.71
 * Tightens the account-detail hierarchy without touching accounting logic.
 * - Back + Statement share one navigation row.
 * - Exactly four primary KPIs appear at the top.
 * - Stock replaces the low-value Paid-to-partner primary card; paid amount is
 *   retained as secondary context under Partner outstanding.
 * - Legacy standalone stock KPI/strip are folded into the four-card summary.
 * - Sales, Listed stock and Unlisted stock start collapsed on account entry.
 */
(function(){
  'use strict';

  var queued=false;
  var observer=null;

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}

  function activePage(){
    var direct=document.getElementById('p-item');
    if(direct&&direct.classList.contains('on')&&findBack(direct)&&(direct.querySelector('.account-group')||direct.querySelector('.rt-partner-summary-v3')))return direct;
    var pages=document.querySelectorAll('.page.on,[id^="p-"][class~="on"]');
    for(var i=0;i<pages.length;i++){
      if(findBack(pages[i])&&(pages[i].querySelector('.account-group')||pages[i].querySelector('.rt-partner-summary-v3')))return pages[i];
    }
    return null;
  }

  function findBack(page){
    if(!page)return null;
    var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var t=text(controls[i]).toLowerCase();
      var meta=(t+' '+String(controls[i].getAttribute('aria-label')||'')+' '+String(controls[i].getAttribute('title')||'')).toLowerCase();
      if(t==='back to accounts'||t==='back to account'||t==='back to partners'||t==='back to partner')return controls[i];
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return controls[i];
    }
    return null;
  }

  function installStyles(){
    if(document.getElementById('rt-partner-account-v4-style'))return;
    var s=document.createElement('style');
    s.id='rt-partner-account-v4-style';
    s.textContent='\
      .rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;margin:0!important;}\
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

  function pinStatement(page){
    var back=findBack(page);if(!back)return;
    var statement=page.querySelector('.rt-partner-statement-btn');
    if(!statement)return;
    var row=back.parentElement;if(!row)return;
    row.classList.add('rt-partner-v4-navrow');
    row.style.setProperty('display','flex','important');
    row.style.setProperty('align-items','center','important');
    row.style.setProperty('justify-content','space-between','important');
    row.style.setProperty('width','100%','important');
    if(statement.parentElement!==row)row.appendChild(statement);
    statement.style.setProperty('margin-left','auto','important');
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

  function smallestMatch(page,re,maxLen){
    var all=page.querySelectorAll('div,section,article');
    var best=null,bestLen=Infinity;
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.closest('.rt-partner-summary-v3,.account-group'))continue;
      var t=text(el);
      if(!re.test(t)||t.length>(maxLen||220))continue;
      if(t.length<bestLen){best=el;bestLen=t.length;}
    }
    return best;
  }

  function pounds(t,labelRe){
    var m=String(t||'').match(new RegExp(labelRe.source+'\\s*£\\s*(-?\\d[\\d,]*(?:\\.\\d{1,2})?)',labelRe.flags.replace('g','')));
    return m?'£'+Number(m[1].replace(/,/g,'')).toFixed(2):null;
  }

  function stockInfo(page){
    var stock=smallestMatch(page,/\bstock on hand\b/i,190);
    var strip=smallestMatch(page,/\bstock cost\b.*\blisted asking\b/i,260);
    var st=text(stock),ss=text(strip);
    function count(re){var m=st.match(re);return m?Number(m[1]):null;}
    return {
      stockEl:stock,
      stripEl:strip,
      total:count(/stock on hand\s*(\d+)/i),
      listed:count(/(\d+)\s+listed\b/i),
      unlisted:count(/(\d+)\s+unlisted\b/i),
      returned:count(/(\d+)\s+returned\b/i),
      stockCost:pounds(ss,/stock cost/i),
      asking:pounds(ss,/listed asking/i),
      potential:pounds(ss,/est\.?\s*potential/i)
    };
  }

  function findCard(summary,label){
    var cards=summary.querySelectorAll('.rt-partner-summary-v3-card');
    label=label.toLowerCase();
    for(var i=0;i<cards.length;i++){
      var l=cards[i].querySelector('.rt-partner-summary-v3-label');
      if(text(l).toLowerCase()===label)return cards[i];
    }
    return null;
  }

  function setCard(card,label,value,sub,kind){
    if(!card)return;
    var l=card.querySelector('.rt-partner-summary-v3-label');
    var v=card.querySelector('.rt-partner-summary-v3-value');
    var s=card.querySelector('.rt-partner-summary-v3-sub');
    if(l)l.textContent=label;
    if(v)v.textContent=value==null?'—':String(value);
    if(s)s.textContent=sub||'';
    card.setAttribute('data-kind',kind||'');
  }

  function foldStockIntoSummary(page,summary){
    var info=stockInfo(page);
    var paid=findCard(summary,'Paid to partner');
    var outstanding=findCard(summary,'Partner outstanding');
    var potential=findCard(summary,'Potential remaining');
    var paidValue=paid?text(paid.querySelector('.rt-partner-summary-v3-value')):'';
    var outstandingSub=outstanding?text(outstanding.querySelector('.rt-partner-summary-v3-sub')):'';
    if(outstanding&&paidValue&&paidValue!=='—'){
      var os=outstanding.querySelector('.rt-partner-summary-v3-sub');
      if(os&&!/\bpaid\b/i.test(outstandingSub))os.textContent=(outstandingSub?outstandingSub+' · ':'')+paidValue+' paid';
    }
    if(paid){
      var bits=[];
      if(info.listed!=null)bits.push(info.listed+' listed');
      if(info.unlisted!=null)bits.push(info.unlisted+' unlisted');
      if(info.returned!=null)bits.push(info.returned+' returned');
      if(info.stockCost)bits.push('cost '+info.stockCost);
      setCard(paid,'Stock on hand',info.total==null?'—':String(info.total),bits.join(' · '),'stock');
    }
    if(potential&&info.potential){
      var psub=[];
      if(info.asking)psub.push('Listed asking '+info.asking);
      if(info.stockCost)psub.push('Stock cost '+info.stockCost);
      setCard(potential,'Potential remaining',info.potential,psub.join(' · '),'potential');
    }
    [info.stockEl,info.stripEl].forEach(function(el){if(el)el.classList.add('rt-partner-v4-hidden');});
  }

  function moveSummaryUp(page,summary){
    var allocate=null;
    var buttons=page.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      if(/allocate\s*&?\s*settle/i.test(text(buttons[i]))){allocate=buttons[i];break;}
    }
    var stock=smallestMatch(page,/\bstock on hand\b/i,190);
    var anchor=allocate||stock;
    if(anchor&&anchor.parentNode){
      var node=anchor;
      if(anchor.parentElement&&anchor.parentElement!==page&&anchor.parentElement.children.length===1)node=anchor.parentElement;
      node.parentNode.insertBefore(summary,node);
      return;
    }
    var firstGroup=page.querySelector('.account-group');
    if(firstGroup&&firstGroup.parentNode)firstGroup.parentNode.insertBefore(summary,firstGroup);
  }

  function fix(){
    queued=false;
    installStyles();
    var page=activePage();if(!page)return;
    pinStatement(page);
    ensureDefaultCollapsedGroups(page);
    var summary=page.querySelector('.rt-partner-summary-v3');if(!summary)return;
    summary.classList.add('rt-partner-summary-v4');
    moveSummaryUp(page,summary);
    foldStockIntoSummary(page,summary);
  }

  function schedule(){
    if(queued)return;queued=true;
    requestAnimationFrame(function(){requestAnimationFrame(fix);});
  }

  function start(){
    schedule();
    if(observer)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('popstate',schedule);
    document.addEventListener('click',function(){setTimeout(schedule,0);},true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
