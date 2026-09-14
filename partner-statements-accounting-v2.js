/* RETRADE partner statements accounting v2 — v1.4.74
 *
 * Supplier-account presentation rule:
 *   supplier stock/item cost is NOT an operating cost in the partner statement.
 *   It is the supplier's earned/payment amount.
 *
 * This lets the statement show:
 *   Revenue
 *   - selling/fulfilment/repair/return costs
 *   = Profit before supplier payment
 *   - Supplier earned (stock cost)
 *   = RETRADE earned
 *
 * Supplier and RETRADE percentages are measured against that pre-supplier
 * profit pool. Consignment statements retain the normal profit-split model.
 *
 * The module wraps the existing statement picker UI and replaces PDF/Excel/CSV
 * export actions only. It is read-only and does not alter accounting data.
 */
(function(){
  'use strict';
  if(window.__rtPartnerStatementAccountingV2Ready)return;
  window.__rtPartnerStatementAccountingV2Ready=true;

  var activeAccountId=null;
  var pdfLibPromise=null;
  var xlsxPromise=null;

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){return Math.round(n(v)*100)/100;}
  function gbp(v){return '£'+money(v).toFixed(2);}
  function pct(v){return v==null||!isFinite(v)?'—':money(v).toFixed(1)+'%';}
  function safeName(s){return String(s||'Partner').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'Partner';}
  function account(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }
  function itemType(item,acct){
    try{if(typeof _itemAccountType==='function')return String(_itemAccountType(item)||'').toLowerCase();}catch(_){}
    return String((item&&item.accountType)||(acct&&acct.accountType)||'supplier').toLowerCase();
  }
  function isSupplierAccount(acct){return String(acct&&acct.accountType||'supplier').toLowerCase()==='supplier';}
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
  function visible(id){
    var el=document.getElementById(id);if(!el)return false;
    return el.style.display!=='none'&&getComputedStyle(el).display!=='none';
  }
  function resolvedPeriod(){
    var from='',to='',label='',slug='';
    if(visible('ps-fields-custom')){
      from=(document.getElementById('ps-from')||{}).value||'';
      to=(document.getElementById('ps-to')||{}).value||'';
      if(!from||!to)throw new Error('Choose both a start and end date.');
      if(from>to)throw new Error('The start date must be before the end date.');
      label=new Date(from+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' – '+new Date(to+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      slug=from+'_to_'+to;
    }else if(visible('ps-fields-year')){
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

  function settlementForItem(acct,itemId,to){
    var paid=0,paidDate=null,legacy=false;
    (acct.settlements||[]).forEach(function(tx){
      if(!tx)return;
      (tx.items||[]).forEach(function(a){
        var id=a&&(a.id!=null?a.id:a.itemId);
        if(String(id)!==String(itemId))return;
        if(tx.paid===true&&tx.date&&tx.date<=to){
          paid+=Math.max(0,n(a.amount));
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

    var supplier=isSupplierAccount(acct);
    var events=getSaleEventsInRange(period.from,period.to).filter(function(ev){return ev&&ev.item&&String(ev.item.accountId)===String(acct.id);});
    events.sort(function(a,b){return String(a.saleDate||'').localeCompare(String(b.saleDate||''));});

    var t={goods:0,postageIncome:0,platformFees:0,advertising:0,delivery:0,packaging:0,parts:0,returns:0,otherItemCost:0,supplierEarned:0,partnerShare:0};
    var sales=[],adjustments=[];

    events.filter(function(ev){return !ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),rowSupplier=supplier||itemType(ev.item,acct)==='supplier';
      var revenue=money(n(b.salePrice)+n(b.postage));
      var supplierAmount=rowSupplier?Math.max(0,money(b.itemCost)):0;
      var partnerAmount=rowSupplier?supplierAmount:Math.max(0,money(b.partnerSplit));
      var operatingCosts;
      var preDistribution;
      var retrade;

      if(rowSupplier){
        // totalCosts already contains itemCost. Remove it from operating costs so
        // it can be shown honestly as the supplier's payment/earnings instead.
        operatingCosts=money(n(b.totalCosts)-n(b.partnerSplit)-n(b.itemCost));
        preDistribution=money(revenue-operatingCosts);
        retrade=money(preDistribution-supplierAmount);
      }else{
        operatingCosts=money(n(b.totalCosts)-n(b.partnerSplit));
        preDistribution=money(revenue-operatingCosts);
        retrade=money(n(b.netProfit));
      }

      var partnerPct=preDistribution!==0?partnerAmount/preDistribution*100:null;
      var retradePct=preDistribution!==0?retrade/preDistribution*100:null;
      var sett=settlementForItem(acct,ev.item.id,period.to);
      var status='—';
      if(partnerAmount>0)status=(sett.paid>=partnerAmount-0.009||sett.legacy)?'Paid':'To pay';
      else if(!rowSupplier&&ev.item.accountSplitPercent==null&&acct.defaultSplitPercent==null&&ev.item.accountPaidAmount==null)status='Split not set';

      t.goods+=n(b.salePrice);t.postageIncome+=n(b.postage);
      t.platformFees+=n(b.bpf)+n(b.listingFee);t.advertising+=n(b.promoFee);
      t.delivery+=n(b.shipping);t.packaging+=n(b.packaging);t.parts+=n(b.parts);
      if(rowSupplier)t.supplierEarned+=n(b.itemCost);
      else{t.otherItemCost+=n(b.itemCost);t.partnerShare+=n(b.partnerSplit);}

      sales.push({
        date:ev.saleDate||'',item:ev.item.item||'Untitled',saleNo:b.saleNo||('Sale '+ev.sale),
        revenue:revenue,operatingCosts:operatingCosts,preDistribution:preDistribution,
        partnerAmount:partnerAmount,partnerPct:partnerPct,retrade:retrade,retradePct:retradePct,
        status:status,paidDate:sett.paidDate||'',itemId:ev.item.id,rowSupplier:rowSupplier
      });
    });

    events.filter(function(ev){return !!ev.isReturnAdjustment;}).forEach(function(ev){
      var b=_saleBreakdown(ev),rowSupplier=supplier||itemType(ev.item,acct)==='supplier';
      t.platformFees+=n(b.bpf)+n(b.listingFee);t.advertising+=n(b.promoFee);
      t.delivery+=n(b.shipping);t.packaging+=n(b.packaging);t.parts+=n(b.parts);
      t.returns+=n(b.returnRefund)+n(b.returnPostage)+n(b.partialRefund);
      if(rowSupplier)t.supplierEarned+=n(b.itemCost);else t.otherItemCost+=n(b.itemCost);
      adjustments.push({
        date:ev.saleDate||'',item:ev.item.item||'Untitled',type:'Return / refund',
        amount:money(n(b.returnRefund)+n(b.returnPostage)+n(b.partialRefund)),
        profitImpact:money(n(b.netProfit))
      });
    });

    Object.keys(t).forEach(function(k){t[k]=money(t[k]);});
    t.revenue=money(t.goods+t.postageIncome);
    t.operatingCosts=supplier
      ?money(t.platformFees+t.advertising+t.delivery+t.packaging+t.parts+t.returns)
      :money(t.platformFees+t.advertising+t.delivery+t.packaging+t.parts+t.returns+t.otherItemCost);
    t.preDistribution=money(t.revenue-t.operatingCosts);
    t.partnerEarned=supplier?money(t.supplierEarned):money(t.partnerShare);
    t.retradeEarned=money(t.preDistribution-t.partnerEarned);
    t.partnerPct=t.preDistribution!==0?money(t.partnerEarned/t.preDistribution*100):null;
    t.retradePct=t.preDistribution!==0?money(t.retradeEarned/t.preDistribution*100):null;

    var payments=[],paidInPeriod=0;
    (acct.settlements||[]).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));}).forEach(function(tx){
      if(!tx||!tx.date||tx.date<period.from||tx.date>period.to)return;
      var amount=money(tx.partnerAmount||0);if(tx.paid===true)paidInPeriod+=amount;
      payments.push({date:tx.date,amount:amount,status:tx.paid===true?'Paid':'Unpaid',items:(tx.items||[]).length,note:tx.note||''});
    });

    var due=0;
    sales.forEach(function(r){
      if(r.partnerAmount<=0)return;
      var sett=settlementForItem(acct,r.itemId,period.to);
      var paidAgainst=sett.legacy?r.partnerAmount:Math.min(r.partnerAmount,sett.paid);
      due+=Math.max(0,r.partnerAmount-paidAgainst);
    });

    return {account:acct,period:period,supplier:supplier,sales:sales,adjustments:adjustments,payments:payments,totals:t,paidInPeriod:money(paidInPeriod),due:money(due)};
  }

  function summaryRows(s){
    var t=s.totals,rows=[
      ['RETRADE · PARTNER STATEMENT'],
      ['Partner',s.account.name||'Partner'],
      ['Period',s.period.label],
      ['Account type',s.supplier?'Supplier':'Consignment'],
      ['Items sold',s.sales.length],[],
      ['REVENUE','Amount (£)'],
      ['Sales made',t.goods],
      ['Postage charged to customers',t.postageIncome],
      ['TOTAL REVENUE',t.revenue],[],
      [s.supplier?'OPERATING COSTS — EXCLUDING SUPPLIER STOCK':'COSTS','Amount (£)'],
      ['Selling & listing fees',t.platformFees],
      ['Advertising',t.advertising],
      ['Delivery postage',t.delivery],
      ['Packaging',t.packaging]
    ];
    if(Math.abs(t.parts)>0.009)rows.push(['Parts & repairs',t.parts]);
    if(Math.abs(t.returns)>0.009)rows.push(['Refunds & return postage',t.returns]);
    if(!s.supplier&&Math.abs(t.otherItemCost)>0.009)rows.push(['Item / stock cost',t.otherItemCost]);
    rows.push(['TOTAL '+(s.supplier?'OPERATING COSTS':'COSTS'),t.operatingCosts],[]);

    if(s.supplier){
      rows.push(['PROFIT BEFORE SUPPLIER PAYMENT',t.preDistribution]);
      rows.push([],['WHO EARNED WHAT','Amount (£)']);
      rows.push(['Supplier earned · '+pct(t.partnerPct)+' of pre-supplier profit',t.partnerEarned]);
      rows.push(['RETRADE earned · '+pct(t.retradePct)+' of pre-supplier profit',t.retradeEarned]);
      rows.push([],['PAYMENTS','Amount (£)'],['Paid to supplier in this period',s.paidInPeriod],['Still owed on sales in this statement',s.due]);
      rows.push([],['Simple summary',gbp(t.preDistribution)+' profit before supplier payment · Supplier '+gbp(t.partnerEarned)+' ('+pct(t.partnerPct)+') · RETRADE '+gbp(t.retradeEarned)+' ('+pct(t.retradePct)+')']);
      rows.push(['Note','Supplier stock/item cost is shown as the supplier’s earnings/payment, not as an operating cost. Percentages are measured against profit before the supplier payment.']);
    }else{
      rows.push(['PROFIT TO SPLIT',t.preDistribution]);
      rows.push([],['WHO EARNED WHAT','Amount (£)']);
      rows.push(['Partner earned · '+pct(t.partnerPct),t.partnerEarned]);
      rows.push(['RETRADE earned · '+pct(t.retradePct),t.retradeEarned]);
      rows.push([],['PAYMENTS','Amount (£)'],['Paid to partner in this period',s.paidInPeriod],['Still owed on sales in this statement',s.due]);
    }
    return rows;
  }

  function soldRows(s){
    var rows=[['Date','Item','Sale','Revenue (£)',s.supplier?'Operating costs excl. supplier (£)':'Costs before partner split (£)',s.supplier?'Profit before supplier payment (£)':'Profit to split (£)',s.supplier?'Supplier earned (£)':'Partner earned (£)',s.supplier?'Supplier % of pre-supplier profit':'Partner %', 'RETRADE earned (£)',s.supplier?'RETRADE % of pre-supplier profit':'RETRADE %','Payment status','Paid date']];
    s.sales.forEach(function(r){
      rows.push([r.date,r.item,r.saleNo,r.revenue,r.operatingCosts,r.preDistribution,r.partnerAmount,r.partnerPct==null?'':money(r.partnerPct),r.retrade,r.retradePct==null?'':money(r.retradePct),r.status,r.paidDate]);
    });
    if(s.sales.length){
      rows.push([]);
      rows.push(['TOTAL','','',s.totals.revenue,s.totals.operatingCosts,s.totals.preDistribution,s.totals.partnerEarned,s.totals.partnerPct==null?'':s.totals.partnerPct,s.totals.retradeEarned,s.totals.retradePct==null?'':s.totals.retradePct,'','']);
    }
    return rows;
  }

  function paymentRows(s){
    var rows=[['Date','Type','Details','Amount (£)','Status / note']];
    s.payments.forEach(function(p){rows.push([p.date,s.supplier?'Supplier payment':'Partner payment',(p.items||0)+' item'+(p.items===1?'':'s'),p.amount,p.status+(p.note?' · '+p.note:'')]);});
    s.adjustments.forEach(function(a){rows.push([a.date,a.type,a.item,a.amount,'Profit impact '+gbp(a.profitImpact)]);});
    if(rows.length===1)rows.push(['','No payments or adjustments in this period','','','']);
    return rows;
  }

  function csvCell(value){
    var s=String(value==null?'':value);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }
  function rowsCsv(rows){return rows.map(function(r){return r.map(csvCell).join(',');}).join('\n');}
  function downloadBlob(content,type,name){
    var blob=new Blob([content],{type:type}),a=document.createElement('a'),url=URL.createObjectURL(blob);
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},0);
  }

  function currentStatement(){
    if(!activeAccountId)throw new Error('Partner account is not selected.');
    var period=resolvedPeriod();return build(activeAccountId,period);
  }

  function generateCsv(){
    try{
      var s=currentStatement(),rows=[];
      summaryRows(s).forEach(function(r){rows.push(r);});
      rows.push([],['SOLD ITEMS']);soldRows(s).forEach(function(r){rows.push(r);});
      rows.push([],['PAYMENTS & ADJUSTMENTS']);paymentRows(s).forEach(function(r){rows.push(r);});
      downloadBlob('\uFEFF'+rowsCsv(rows),'text/csv;charset=utf-8','RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.csv');
      try{toast('Partner statement CSV downloaded');}catch(_){}
    }catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){alert(err.message||err);}}
  }

  function ensureXlsx(){
    if(window.XLSX)return Promise.resolve();
    if(xlsxPromise)return xlsxPromise;
    xlsxPromise=new Promise(function(resolve,reject){
      var old=document.getElementById('rt-xlsx-lib');
      if(old){old.addEventListener('load',function(){window.XLSX?resolve():reject(new Error('Excel library did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}
      var script=document.createElement('script');script.id='rt-xlsx-lib';script.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';script.async=true;script.crossOrigin='anonymous';
      script.onload=function(){window.XLSX?resolve():reject(new Error('Excel library did not initialise'));};script.onerror=reject;document.head.appendChild(script);
    }).catch(function(err){xlsxPromise=null;throw err;});
    return xlsxPromise;
  }
  function generateExcel(){
    var s;try{s=currentStatement();}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}return;}
    ensureXlsx().then(function(){
      var wb=XLSX.utils.book_new(),sr=summaryRows(s),ir=soldRows(s),pr=paymentRows(s);
      var ws1=XLSX.utils.aoa_to_sheet(sr),ws2=XLSX.utils.aoa_to_sheet(ir),ws3=XLSX.utils.aoa_to_sheet(pr);
      ws1['!cols']=[{wch:50},{wch:28}];ws2['!cols']=[{wch:12},{wch:38},{wch:12},{wch:14},{wch:21},{wch:23},{wch:18},{wch:22},{wch:18},{wch:22},{wch:15},{wch:12}];ws3['!cols']=[{wch:12},{wch:22},{wch:40},{wch:16},{wch:30}];
      try{if(typeof _styleReportSheet==='function'){_styleReportSheet(ws1,sr,{moneyCols:[1],freezeRow:0});_styleReportSheet(ws2,ir,{headerRows:[0],moneyCols:[3,4,5,6,8],freezeRow:1});_styleReportSheet(ws3,pr,{headerRows:[0],moneyCols:[3],freezeRow:1});}}catch(_){}
      XLSX.utils.book_append_sheet(wb,ws1,'Statement');XLSX.utils.book_append_sheet(wb,ws2,'Sold Items');XLSX.utils.book_append_sheet(wb,ws3,'Payments & Adjustments');
      XLSX.writeFile(wb,'RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.xlsx');
      try{toast('Partner statement Excel downloaded');}catch(_){}
    }).catch(function(){try{toast('Could not load the Excel exporter','error');}catch(_){}});
  }

  function ensurePdf(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve();
    if(pdfLibPromise)return pdfLibPromise;
    pdfLibPromise=new Promise(function(resolve,reject){
      var old=document.getElementById('rt-jspdf-lib');
      if(old){old.addEventListener('load',function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));},{once:true});old.addEventListener('error',reject,{once:true});return;}
      var script=document.createElement('script');script.id='rt-jspdf-lib';script.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';script.async=true;script.crossOrigin='anonymous';
      script.onload=function(){window.jspdf&&window.jspdf.jsPDF?resolve():reject(new Error('PDF library did not initialise'));};script.onerror=reject;document.head.appendChild(script);
    }).catch(function(err){pdfLibPromise=null;throw err;});
    return pdfLibPromise;
  }

  function writePdf(s){
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    var navy=[12,20,36],gold=[247,183,55],muted=[101,110,126],line=[220,224,231],pale=[247,249,252];
    var L=14,R=196,W=182,y=0;
    function colour(fn,c){fn.apply(doc,c);}
    function brand(){colour(doc.setFillColor,navy);doc.rect(0,0,210,24,'F');doc.setFont('helvetica','bold');doc.setFontSize(18);colour(doc.setTextColor,gold);doc.text('RETRADE',L,15);doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text('PARTNER STATEMENT',R,14,{align:'right'});}
    function page(){doc.addPage();brand();y=32;}
    function ensure(h){if(y+h>280)page();}
    function section(label){ensure(10);doc.setFont('helvetica','bold');doc.setFontSize(10);colour(doc.setTextColor,navy);doc.text(label,L,y);y+=5;}
    function rule(){colour(doc.setDrawColor,line);doc.line(L,y,R,y);}
    function row(label,value,bold){ensure(8);if(bold){colour(doc.setFillColor,pale);doc.rect(L,y-4,W,7,'F');}doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5);colour(doc.setTextColor,navy);doc.text(label,L+2,y);doc.text(value,R-2,y,{align:'right'});y+=7;rule();}

    brand();y=36;
    doc.setFont('helvetica','bold');doc.setFontSize(19);colour(doc.setTextColor,navy);doc.text(String(s.account.name||'Partner'),L,y);y+=7;
    doc.setFont('helvetica','normal');doc.setFontSize(9);colour(doc.setTextColor,muted);doc.text(s.period.label+'  ·  '+(s.supplier?'Supplier':'Consignment'),L,y);doc.text('Generated '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),R,y,{align:'right'});y+=10;

    var cards=[['Revenue',gbp(s.totals.revenue)],[s.supplier?'Profit before supplier':'Profit to split',gbp(s.totals.preDistribution)],[s.supplier?'Supplier earned':'Partner earned',gbp(s.totals.partnerEarned)],['RETRADE earned',gbp(s.totals.retradeEarned)]];
    var cw=43.5,g=2.5;
    cards.forEach(function(c,i){var x=L+i*(cw+g);colour(doc.setFillColor,pale);colour(doc.setDrawColor,line);doc.roundedRect(x,y,cw,22,2,2,'FD');doc.setFont('helvetica','normal');doc.setFontSize(7.2);colour(doc.setTextColor,muted);doc.text(c[0],x+3,y+7);doc.setFont('helvetica','bold');doc.setFontSize(11.5);colour(doc.setTextColor,navy);doc.text(c[1],x+3,y+16);});y+=30;

    section('Revenue');row('Sales made',gbp(s.totals.goods));row('Postage charged to customers',gbp(s.totals.postageIncome));row('Total revenue',gbp(s.totals.revenue),true);y+=5;
    section(s.supplier?'Operating costs — excluding supplier stock':'Costs');row('Selling & listing fees',gbp(s.totals.platformFees));row('Advertising',gbp(s.totals.advertising));row('Delivery postage',gbp(s.totals.delivery));row('Packaging',gbp(s.totals.packaging));if(Math.abs(s.totals.parts)>0.009)row('Parts & repairs',gbp(s.totals.parts));if(Math.abs(s.totals.returns)>0.009)row('Refunds & return postage',gbp(s.totals.returns));if(!s.supplier&&Math.abs(s.totals.otherItemCost)>0.009)row('Item / stock cost',gbp(s.totals.otherItemCost));row('Total '+(s.supplier?'operating costs':'costs'),gbp(s.totals.operatingCosts),true);y+=5;

    section(s.supplier?'Distribution of profit before supplier payment':'Who earned what');
    row(s.supplier?'Profit before supplier payment':'Profit to split',gbp(s.totals.preDistribution),true);
    row((s.supplier?'Supplier':'Partner')+' earned · '+pct(s.totals.partnerPct),gbp(s.totals.partnerEarned));
    row('RETRADE earned · '+pct(s.totals.retradePct),gbp(s.totals.retradeEarned));
    row('Still owed',gbp(s.due));
    if(s.supplier){ensure(13);doc.setFont('helvetica','normal');doc.setFontSize(7.5);colour(doc.setTextColor,muted);var note=doc.splitTextToSize('Supplier stock/item cost is treated as the supplier payment, not as an operating cost. The percentages above show each party’s share of profit before that supplier payment.',W);doc.text(note,L,y+4);y+=note.length*3.6+7;}
    y+=5;

    section('Sold items');
    s.sales.forEach(function(r){
      var label=String(r.item||'Untitled'),lines=doc.splitTextToSize(label,90),h=Math.max(12,lines.length*3.6+7);ensure(h);
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);colour(doc.setTextColor,muted);doc.text(String(r.date||''),L,y+3);
      doc.setFont('helvetica','bold');colour(doc.setTextColor,navy);doc.text(lines,L+23,y+3);
      doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.text('Pre '+gbp(r.preDistribution),R-55,y+3,{align:'right'});doc.text((s.supplier?'Supplier ':'Partner ')+gbp(r.partnerAmount)+' · '+pct(r.partnerPct),R-27,y+3,{align:'right'});doc.text('RETRADE '+gbp(r.retrade)+' · '+pct(r.retradePct),R,y+3,{align:'right'});y+=h;rule();
    });
    if(!s.sales.length){doc.setFont('helvetica','normal');doc.setFontSize(8);colour(doc.setTextColor,muted);doc.text('No sold items in this period.',L,y);y+=8;}

    if(s.payments.length||s.adjustments.length){y+=6;section('Payments & adjustments');
      s.payments.forEach(function(p){ensure(8);row(p.date+' · '+(s.supplier?'Supplier payment':'Partner payment')+' · '+p.status,gbp(p.amount));});
      s.adjustments.forEach(function(a){ensure(8);row(a.date+' · Return/refund · '+a.item,gbp(a.amount));});
    }

    var pages=doc.getNumberOfPages();for(var i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);colour(doc.setTextColor,muted);doc.text('RETRADE · '+String(s.account.name||'Partner')+' · '+s.period.label,L,291);doc.text('Page '+i+' of '+pages,R,291,{align:'right'});}
    doc.save('RETRADE_'+safeName(s.account.name)+'_Statement_'+s.period.slug+'.pdf');
    try{toast('Partner statement PDF downloaded');}catch(_){}
  }
  function generatePdf(){
    var s;try{s=currentStatement();}catch(err){try{toast(err.message||'Could not generate statement','error');}catch(_){}return;}
    ensurePdf().then(function(){writePdf(s);}).catch(function(){try{toast('Could not load the PDF exporter','error');}catch(_){}});
  }

  function enhancePanel(){
    var excel=document.querySelector('button[onclick="_partnerStatementExcel()"]');
    var csv=document.querySelector('button[onclick="_partnerStatementCsv()"]');
    var host=excel&&excel.parentElement;
    if(host&&csv&&csv.parentElement===host){
      host.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
      host.innerHTML='<button type="button" class="btn btn-primary" style="width:100%;" onclick="_partnerStatementPdf()">Generate PDF</button><button type="button" class="btn btn-secondary" style="width:100%;" onclick="_partnerStatementExcel()">Generate Excel</button><button type="button" class="btn btn-secondary" style="width:100%;" onclick="_partnerStatementCsv()">Generate CSV</button>';
    }
    var acct=account(activeAccountId);
    if(acct&&isSupplierAccount(acct)){
      var pdfBtn=document.querySelector('button[onclick="_partnerStatementPdf()"]');
      var note=pdfBtn&&pdfBtn.parentElement&&pdfBtn.parentElement.previousElementSibling;
      if(note&&/easy to read/i.test(note.textContent||''))note.innerHTML='<strong style="color:var(--text);">Supplier statement:</strong> stock/item cost is treated as the supplier’s earnings, not an operating cost. The statement shows profit before supplier payment, then the supplier and RETRADE £ amounts and percentages of that profit.';
    }
  }

  var originalOpen=window.openPartnerStatement;
  if(typeof originalOpen==='function'){
    window.openPartnerStatement=function(accountId){activeAccountId=accountId;var result=originalOpen.apply(this,arguments);setTimeout(enhancePanel,0);return result;};
  }

  window._partnerStatementPdf=generatePdf;
  window._partnerStatementExcel=generateExcel;
  window._partnerStatementCsv=generateCsv;
  console.info('[RETRADE] partner statement accounting v2 loaded');
})();