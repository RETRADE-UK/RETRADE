/* RETRADE partner statement PDF export v1.4.73
 * Adds a professional PDF option beside the existing Excel/CSV exports.
 * Uses the same live sales/return/accounting engine; read-only export only.
 */
(function(){
  'use strict';
  if(window.__rtPartnerStatementPdfReady)return;
  window.__rtPartnerStatementPdfReady=true;

  var libPromise=null;

  function money(n){return +(Number(n)||0).toFixed(2);}
  function gbp(n){return '£'+money(n).toFixed(2);}
  function safeName(s){return String(s||'Partner').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Partner';}
  function account(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }
  function iso(d){
    var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function monthEnd(ym){
    var p=String(ym||'').split('-'),y=Number(p[0]),m=Number(p[1]);
    if(!y||!m)return null;
    return iso(new Date(y,m,0));
  }
  function currentMonth(){
    var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function isVisible(id){
    var el=document.getElementById(id);if(!el)return false;
    return el.style.display!=='none'&&window.getComputedStyle(el).display!=='none';
  }
  function resolvedPeriod(){
    var from='',to='',label='',slug='';
    if(isVisible('ps-fields-custom')){
      from=(document.getElementById('ps-from')||{}).value||'';
      to=(document.getElementById('ps-to')||{}).value||'';
      if(!from||!to)throw new Error('Choose both a start and end date.');
      if(from>to)throw new Error('The start date must be before the end date.');
      label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' - '+new Date(to+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      slug=from+'_to_'+to;
    }else if(isVisible('ps-fields-year')){
      var y=Number((document.getElementById('ps-year')||{}).value)||new Date().getFullYear();
      from=y+'-01-01';to=y+'-12-31';label=String(y);slug=String(y);
    }else{
      var ym=(document.getElementById('ps-month')||{}).value||currentMonth();
      if(!/^\d{4}-\d{2}$/.test(ym))throw new Error('Choose a month.');
      from=ym+'-01';to=monthEnd(ym);
      var d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,1);
      label=d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});slug=ym;
    }
    return {from:from,to:to,label:label,slug:slug};
  }

  function itemType(item,acct){
    try{if(typeof _itemAccountType==='function')return String(_itemAccountType(item)||'supplier').toLowerCase();}catch(_){}
    return String((item&&item.accountType)||(acct&&acct.accountType)||'supplier').toLowerCase();
  }
  function splitInfo(item,pool,partnerAmount,acct){
    var type=itemType(item,acct);
    if(type==='supplier')return {isSupplier:true,partnerLabel:'Supplier cost',retradeLabel:'RETRADE profit'};
    if(item&&item.accountPaidAmount!=null&&item.accountPaidAmount!=='')return {isSupplier:false,partnerLabel:'Fixed amount',retradeLabel:'Remaining profit'};
    var pct=item&&item.accountSplitPercent!=null?Number(item.accountSplitPercent):Number(acct&&acct.defaultSplitPercent);
    if(isFinite(pct)){
      pct=Math.max(0,Math.min(100,pct));
      return {isSupplier:false,partnerLabel:pct.toFixed(pct%1?1:0)+'%',retradeLabel:(100-pct).toFixed((100-pct)%1?1:0)+'%'};
    }
    var eff=pool>0?Math.max(0,Math.min(100,(Number(partnerAmount)||0)/pool*100)):null;
    return {isSupplier:false,partnerLabel:eff==null?'Not set':eff.toFixed(1)+'% effective',retradeLabel:eff==null?'—':(100-eff).toFixed(1)+'% effective'};
  }
  function settlementForItem(acct,itemId,to){
    var paid=0,paidDate=null,legacy=false;
    (acct.settlements||[]).forEach(function(tx){
      if(!tx)return;
      (tx.items||[]).forEach(function(a){
        var id=a&&(a.id!=null?a.id:a.itemId);
        if(String(id)!==String(itemId))return;
        if(tx.paid===true&&tx.date&&tx.date<=to){
          paid+=Math.max(0,Number(a.amount)||0);
          if(!paidDate||tx.date>paidDate)paidDate=tx.date;
        }
      });
    });
    if(paid===0){
      try{
        var rec=_accountItems(acct.id).find(function(i){return String(i.id)===String(itemId);});
        if(rec&&rec.accountSettled===true)legacy=true;
      }catch(_){}
    }
    return {paid:money(paid),paidDate:paidDate,legacy:legacy};
  }

  function build(accountId,period){
    var acct=account(accountId);if(!acct)throw new Error('Partner account not found.');
    if(typeof getSaleEventsInRange!=='function'||typeof _saleBreakdown!=='function')throw new Error('Reporting engine is not available yet.');

    var events=getSaleEventsInRange(period.from,period.to).filter(function(ev){return ev&&ev.item&&String(ev.item.accountId)===String(acct.id);});
    events.sort(function(a,b){return String(a.saleDate||'').localeCompare(String(b.saleDate||''));});
    var t={goods:0,postageIncome:0,platformFees:0,advertising:0,delivery:0,packaging:0,itemCost:0,parts:0,returns:0,partnerShare:0,retrade:0};
    var sales=[],adjustments=[];

    events.filter(function(ev){return !ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),revenue=money((b.salePrice||0)+(b.postage||0));
      var external=money((b.totalCosts||0)-(b.partnerSplit||0));
      var pool=money(revenue-external),split=splitInfo(ev.item,pool,b.partnerSplit||0,acct),sett=settlementForItem(acct,ev.item.id,period.to);
      var partner=split.isSupplier?Math.max(0,money(b.itemCost||0)):money(b.partnerSplit||0);
      var retrade=money(b.netProfit||0),status='—';
      if(partner>0)status=(sett.paid>=partner-0.009||sett.legacy)?'Paid':'To pay';
      else if(!split.isSupplier&&split.partnerLabel==='Not set')status='Split not set';

      t.goods+=Number(b.salePrice)||0;t.postageIncome+=Number(b.postage)||0;
      t.platformFees+=(Number(b.bpf)||0)+(Number(b.listingFee)||0);
      t.advertising+=Number(b.promoFee)||0;t.delivery+=Number(b.shipping)||0;t.packaging+=Number(b.packaging)||0;
      t.itemCost+=Number(b.itemCost)||0;t.parts+=Number(b.parts)||0;t.partnerShare+=partner;t.retrade+=retrade;
      sales.push({date:ev.saleDate||'',item:ev.item.item||'Untitled',salePrice:money(b.salePrice),postage:money(b.postage),revenue:revenue,costs:external,profit:pool,partnerLabel:split.partnerLabel,partner:partner,retrade:retrade,status:status,paidDate:sett.paidDate||'',itemId:ev.item.id});
    });

    events.filter(function(ev){return !!ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),feeCredits=money(-((Number(b.bpf)||0)+(Number(b.promoFee)||0))),impact=money(b.netProfit||0);
      t.platformFees+=(Number(b.bpf)||0)+(Number(b.listingFee)||0);
      t.advertising+=Number(b.promoFee)||0;t.delivery+=Number(b.shipping)||0;t.packaging+=Number(b.packaging)||0;
      t.itemCost+=Number(b.itemCost)||0;t.parts+=Number(b.parts)||0;
      t.returns+=(Number(b.returnRefund)||0)+(Number(b.returnPostage)||0)+(Number(b.partialRefund)||0);
      adjustments.push({date:ev.saleDate||'',item:ev.item.item||'Untitled',refund:money(b.returnRefund||0),returnPostage:money(b.returnPostage||0),feeCredits:feeCredits,profitImpact:impact});
    });

    Object.keys(t).forEach(function(k){t[k]=money(t[k]);});
    t.revenue=money(t.goods+t.postageIncome);
    t.totalCosts=money(t.platformFees+t.advertising+t.delivery+t.packaging+t.itemCost+t.parts+t.returns);
    t.profitPool=money(t.revenue-t.totalCosts);

    var payments=[],paidInPeriod=0;
    (acct.settlements||[]).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(tx){
      if(!tx||!tx.date||tx.date<period.from||tx.date>period.to)return;
      var amount=money(tx.partnerAmount||0);if(tx.paid===true)paidInPeriod+=amount;
      payments.push({date:tx.date,amount:amount,status:tx.paid===true?'Paid':'Unpaid',items:(tx.items||[]).length,note:tx.note||''});
    });
    paidInPeriod=money(paidInPeriod);

    var due=0;
    sales.forEach(function(r){
      if(r.partner<=0)return;
      var sett=settlementForItem(acct,r.itemId,period.to);
      var paidAgainst=sett.legacy?r.partner:Math.min(r.partner,sett.paid);
      due+=Math.max(0,r.partner-paidAgainst);
    });

    return {account:acct,period:period,sales:sales,adjustments:adjustments,payments:payments,totals:t,paidInPeriod:paidInPeriod,due:money(due)};
  }

  function loadScript(id,src,test){
    return new Promise(function(resolve,reject){
      if(test()){resolve();return;}
      var old=document.getElementById(id);
      if(old){
        old.addEventListener('load',function(){test()?resolve():reject(new Error('PDF library did not initialise'));},{once:true});
        old.addEventListener('error',reject,{once:true});
        return;
      }
      var s=document.createElement('script');s.id=id;s.src=src;s.async=true;s.crossOrigin='anonymous';
      s.onload=function(){test()?resolve():reject(new Error('PDF library did not initialise'));};
      s.onerror=reject;document.head.appendChild(s);
    });
  }
  function ensureLibraries(){
    if(libPromise)return libPromise;
    libPromise=loadScript('rt-jspdf-lib','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',function(){return !!(window.jspdf&&window.jspdf.jsPDF);})
      .then(function(){return loadScript('rt-jspdf-autotable-lib','https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',function(){return !!(window.jspdf&&window.jspdf.jsPDF&&window.jspdf.jsPDF.prototype.autoTable);});})
      .catch(function(err){libPromise=null;throw err;});
    return libPromise;
  }

  function writePdf(s){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var navy=[12,20,36],gold=[247,183,55],muted=[101,110,126],line=[221,225,232],pageW=210;
    function heading(label,y){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor.apply(doc,navy);doc.text(label,14,y);return y+4;}
    function addBrand(pageTitle){
      doc.setFillColor.apply(doc,navy);doc.rect(0,0,pageW,24,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor.apply(doc,gold);doc.text('RETRADE',14,15);
      doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text(pageTitle||'PARTNER STATEMENT',196,14,{align:'right'});
    }
    function table(opts){
      var base={theme:'grid',margin:{left:14,right:14},styles:{font:'helvetica',fontSize:8,cellPadding:2.2,lineColor:line,lineWidth:.2,textColor:navy,overflow:'linebreak'},headStyles:{fillColor:navy,textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[248,249,251]},didDrawPage:function(data){if(data.pageNumber>1)addBrand('PARTNER STATEMENT');}};
      Object.keys(opts||{}).forEach(function(k){base[k]=opts[k];});doc.autoTable(base);return doc.lastAutoTable.finalY;
    }

    addBrand('PARTNER STATEMENT');
    doc.setFont('helvetica','bold');doc.setFontSize(19);doc.setTextColor.apply(doc,navy);doc.text(String(s.account.name||'Partner'),14,36);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor.apply(doc,muted);
    doc.text(s.period.label+'  ·  '+String(s.account.accountType||'supplier').replace(/^./,function(c){return c.toUpperCase();}),14,42);
    doc.text('Generated '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),196,42,{align:'right'});

    var supplier=String(s.account.accountType||'supplier').toLowerCase()==='supplier',t=s.totals;
    var cards=[
      ['Revenue',gbp(t.revenue)],
      [supplier?'RETRADE profit':'Profit to split',gbp(supplier?t.retrade:t.profitPool)],
      [supplier?'Supplier amount':'Partner earned',gbp(supplier?t.itemCost:t.partnerShare)],
      ['Still owed',gbp(s.due)]
    ];
    var x=14,w=43.5,g=2.5;
    cards.forEach(function(c,idx){
      var cx=x+idx*(w+g);doc.setDrawColor.apply(doc,line);doc.setFillColor(248,249,251);doc.roundedRect(cx,49,w,22,2,2,'FD');
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor.apply(doc,muted);doc.text(c[0],cx+3,56);
      doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor.apply(doc,navy);doc.text(c[1],cx+3,65);
    });

    var y=80;y=heading('Financial summary',y);
    var summaryBody=[
      ['Sales made',gbp(t.goods)],['Postage charged',gbp(t.postageIncome)],['Total revenue',gbp(t.revenue)],
      ['Selling & listing fees',gbp(t.platformFees)],['Advertising',gbp(t.advertising)],['Delivery postage',gbp(t.delivery)],['Packaging',gbp(t.packaging)]
    ];
    if(Math.abs(t.itemCost)>0.009)summaryBody.push([supplier?'Supplier / stock cost':'Item cost',gbp(t.itemCost)]);
    if(Math.abs(t.parts)>0.009)summaryBody.push(['Parts & repairs',gbp(t.parts)]);
    if(Math.abs(t.returns)>0.009)summaryBody.push(['Refunds & return postage',gbp(t.returns)]);
    summaryBody.push(['Total costs',gbp(t.totalCosts)]);
    if(!supplier)summaryBody.push(['Profit to split',gbp(t.profitPool)],['Partner earned',gbp(t.partnerShare)],['RETRADE earned',gbp(t.retrade)]);
    else summaryBody.push(['RETRADE profit after costs',gbp(t.retrade)]);
    summaryBody.push(['Paid to partner in period',gbp(s.paidInPeriod)],['Still owed on sales in statement',gbp(s.due)]);
    y=table({startY:y,head:[['Summary','Amount']],body:summaryBody,columnStyles:{0:{cellWidth:125},1:{halign:'right',cellWidth:43}}})+9;

    if(y>235){doc.addPage();addBrand('PARTNER STATEMENT');y=32;}
    y=heading('Sold items',y);
    if(s.sales.length){
      y=table({startY:y,head:[['Date','Item','Sold for',supplier?'Supplier':'Partner','RETRADE','Status']],body:s.sales.map(function(r){return [r.date,r.item,gbp(r.salePrice),gbp(r.partner),gbp(r.retrade),r.status];}),styles:{font:'helvetica',fontSize:7.2,cellPadding:1.8,lineColor:line,lineWidth:.2,textColor:navy,overflow:'linebreak'},columnStyles:{0:{cellWidth:20},1:{cellWidth:74},2:{cellWidth:23,halign:'right'},3:{cellWidth:23,halign:'right'},4:{cellWidth:23,halign:'right'},5:{cellWidth:25}}})+9;
    }else{
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor.apply(doc,muted);doc.text('No sold items in this period.',14,y+5);y+=14;
    }

    if(s.payments.length||s.adjustments.length){
      if(y>235){doc.addPage();addBrand('PARTNER STATEMENT');y=32;}
      y=heading('Payments & adjustments',y);
      var pa=[];
      s.payments.forEach(function(p){pa.push([p.date,'Payment',(p.items||0)+' item'+(p.items===1?'':'s'),gbp(p.amount),p.status+(p.note?' · '+p.note:'')]);});
      s.adjustments.forEach(function(a){pa.push([a.date,'Return / refund',a.item,gbp(a.refund+a.returnPostage),gbp(a.profitImpact)+' profit impact']);});
      table({startY:y,head:[['Date','Type','Details','Amount','Status / impact']],body:pa,styles:{font:'helvetica',fontSize:7.4,cellPadding:1.8,lineColor:line,lineWidth:.2,textColor:navy,overflow:'linebreak'},columnStyles:{0:{cellWidth:22},1:{cellWidth:28},2:{cellWidth:70},3:{cellWidth:26,halign:'right'},4:{cellWidth:38}}});
    }

    var pages=doc.getNumberOfPages();
    for(var p=1;p<=pages;p++){
      doc.setPage(p);doc.setDrawColor.apply(doc,line);doc.line(14,286,196,286);
      doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor.apply(doc,muted);
      doc.text('RETRADE partner statement · figures use the live RETRADE accounting engine',14,291);
      doc.text('Page '+p+' of '+pages,196,291,{align:'right'});
    }
    var filename='RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.pdf';
    doc.save(filename);
    try{toast('Partner statement PDF downloaded');}catch(_){}
  }

  function generatePdf(){
    var period,s;
    try{period=resolvedPeriod();s=build((window.__rtPartnerStatementAccountId||''),period);}catch(err){
      try{toast(err.message||'Could not generate PDF statement','error');}catch(_){alert(err.message||err);}return;
    }
    try{toast('Preparing PDF statement…');}catch(_){}
    ensureLibraries().then(function(){writePdf(s);}).catch(function(err){
      console.warn('[RETRADE] PDF statement exporter failed',err);
      try{toast('Could not load the PDF exporter. Excel and CSV are still available.','error');}catch(_){}
    });
  }

  function decoratePanel(accountId){
    window.__rtPartnerStatementAccountId=accountId;
    var excel=document.querySelector('button[onclick="_partnerStatementExcel()"]');
    var csv=document.querySelector('button[onclick="_partnerStatementCsv()"]');
    if(!excel||!csv)return;
    var host=excel.parentElement;if(!host)return;
    host.style.gridTemplateColumns='1fr 1fr';
    var pdf=host.querySelector('.rt-partner-statement-pdf');
    if(!pdf){
      pdf=document.createElement('button');pdf.type='button';pdf.className='btn btn-primary rt-partner-statement-pdf';pdf.style.cssText='width:100%;grid-column:1/-1;';
      pdf.textContent='Generate PDF';pdf.addEventListener('click',generatePdf);host.insertBefore(pdf,excel);
    }
    excel.classList.remove('btn-primary');excel.classList.add('btn-secondary');
    var info=host.previousElementSibling;
    if(info&&/Easy to read:/i.test(info.textContent||'')){
      info.innerHTML='<strong style="color:var(--text);">Easy to share:</strong> PDF creates a clean partner-facing statement with the financial summary, sold items and payment/return activity. Excel keeps the detailed worksheets and CSV provides the raw portable export.';
    }
  }

  var baseOpen=window.openPartnerStatement;
  if(typeof baseOpen==='function'){
    window.openPartnerStatement=function(accountId){
      window.__rtPartnerStatementAccountId=accountId;
      var result=baseOpen.apply(this,arguments);
      requestAnimationFrame(function(){requestAnimationFrame(function(){decoratePanel(accountId);});});
      return result;
    };
  }
  window._partnerStatementPdf=generatePdf;
  console.info('[RETRADE] v1.4.73 partner PDF statements loaded');
})();