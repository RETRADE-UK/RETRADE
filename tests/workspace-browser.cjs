/* Collection UX regression: globally ordered sourcing runs, stable search and
   compact headers. All data/requests use the isolated browser harness. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
  for(const mobile of [true,false]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
   // Realistic five-chip Stock controls must fit beside the desktop sidebar.
   for(const width of [768,1024]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>{goToTab('stock');STOCK_STATE_FILTER='listed';renderStock();});
    await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
    const clipped=await page.locator('#p-stock .rt-list-controls').evaluate(el=>[...el.querySelectorAll('input,button,select')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible').some(e=>{const r=e.getBoundingClientRect();return r.x<0||r.right>innerWidth+1;}));
    assert(!clipped,'Stock toolbar remains visible at '+width);
   }
   await page.evaluate(()=>{
    _activeSourcingRun=null;window._RUNS_SEARCH='';window._RUNS_SORT='newest';
    _sourcingRuns=[
     {id:'old',name:'Hook summer sale',location:'Hook',status:'ended',dateStarted:'2026-05-02',dateEnded:'2026-05-02'},
     {id:'new',name:'Reading autumn run',location:'Reading',status:'ended',dateStarted:'2026-09-22',dateEnded:'2026-09-22T15:00:00.000Z'},
     {id:'middle',name:'Basingstoke sale',location:'Basingstoke',status:'ended',dateStarted:'2026-07-01',dateEnded:'2026-07-01'},
     {id:'free',name:'Free stock collection',location:'Hook',status:'ended',dateStarted:'2026-06-01',dateEnded:'2026-06-01'}
    ];
    const item=(id,run,price,cost,state='sold')=>({id,item:id,sourcingRunId:run,state,dateSourced:'2026-05-01',dateListed:'2026-09-01',dateSold:state==='sold'?'2026-09-23':null,salePrice:price,costPrice:cost,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,parts:[],returnHistory:[],salePlatform:'fb'});
    DB={'SEP-26':[item('Camera','old',300,100),item('Lens','old',200,50),item('Laptop','new',150,200),item('Speaker','middle',50,10),item('Gift','free',10,0),item('Unlisted adapter','middle',0,5,'sourced')],trips:[],expenses:[]};
    _accounts=[];goToTab('runs');renderRunsPage();
   });
   await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
   const dataBefore=await page.evaluate(()=>JSON.stringify(DB));
   const ids=()=>page.locator('#p-runs .run-history-row:visible').evaluateAll(es=>es.map(e=>e.dataset.runid));
   const sorts={newest:['new','middle','free','old'],oldest:['old','free','middle','new'],items:['middle','old','new','free'],spend:['new','old','middle','free'],profit:['old','middle','free','new'],roi:['middle','old','new','free']};
   for(const [sort,expected] of Object.entries(sorts)){
    await page.getByLabel('Sort sourcing runs').selectOption(sort);
    assert.deepEqual(await ids(),expected,sort+' reorders across months');
    assert.equal(await page.evaluate(()=>localStorage.getItem(_SK.runsSort)),sort,'Sort preference persists');
   }
   await page.getByLabel('Search sourcing runs').fill('Hook');
   assert.deepEqual(await ids(),['old','free']);
   assert(await page.getByLabel('Search sourcing runs').evaluate(e=>e===document.activeElement),'Search keeps focus');
   await page.getByLabel('Sort sourcing runs').selectOption('newest');
   assert.equal(await page.getByLabel('Search sourcing runs').inputValue(),'Hook');
   assert.deepEqual(await ids(),['free','old']);
   await page.getByLabel('Search sourcing runs').fill('no match');
   assert(await page.locator('#runs-empty-search').isVisible());
   await page.getByLabel('Search sourcing runs').fill('');
   assert.equal(await page.evaluate(()=>JSON.stringify(DB)),dataBefore,'Inspecting/sorting/searching never writes business data');
   await page.locator('[data-runid="old"]').press('Enter');
   assert(await page.locator('#p-item').evaluate(e=>e.classList.contains('on')),'Keyboard opens source run');
   assert((await page.locator('#p-item').innerText()).includes('Hook summer sale'));

   for(const width of mobile?[320,390,768]:[1024,1440]){
    await page.setViewportSize({width,height:900});
    for(const tab of ['summary','yearly','accounts','tax','monthly','stock']){
     await page.evaluate(t=>{if(t==='yearly'){goToTab('monthly');backToMonthlyGrid(false);}else if(t==='monthly'){goToTab('monthly');MONTHLY_VIEW='detail';SELECTED_MONTH='SEP-26';renderMonth();}else goToTab(t);},tab);
     await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab+' fits '+width);
     if(width<=390&&['summary','yearly','accounts'].includes(tab)){
      const geometry=await page.evaluate(()=>{
       const p=document.querySelector('.page.on');const title=p.querySelector('.summary-title,.page-title');
       const controls=p.querySelector('.summary-period-sel,.page-actions,.page-header>.btn');
       const r=document.createRange();r.selectNodeContents(title);const t=r.getBoundingClientRect(),c=controls.getBoundingClientRect();
       return {overlap:t.right>c.left+1,sameRow:t.top<c.bottom&&t.bottom>c.top};
      });
      assert(!geometry.overlap,tab+' title has room at '+width);assert(geometry.sameRow,tab+' header stays on one row at '+width);
     }
     if(tab==='monthly'){
      assert(await page.getByLabel('Choose sales month').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Full month title fits '+width);
      await page.getByLabel('Search sales').fill('Camera');
      assert.equal(await page.locator('#month-list .item-row').count(),1);
      await page.getByLabel('Search sales').fill('');
      await page.locator('#p-monthly .select-toggle').click();
      await page.locator('#month-list input[type=checkbox]').first().check();
      assert(await page.locator('#sel-totals-bar').isVisible(),'Selection summary still works');
      await page.locator('#p-monthly .sel-exit').click();
      await page.getByLabel('Choose sales month').click();
      assert(await page.locator('#month-picker-list').isVisible(),'Month picker works');
      await page.getByLabel('Choose sales month').click();
     }
    }
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS workspace ordering, saved sort, search, details and headers',mobile?'mobile/tablet':'desktop');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
