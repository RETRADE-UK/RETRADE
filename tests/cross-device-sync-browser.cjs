/* Two independent sessions running the real loader, writer, outbox and clock.
 * All HTTP requests are local fixtures or blocked. Never contacts production. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),copy=v=>JSON.parse(JSON.stringify(v));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function client(){
  const session={user:{id:'sync-test',email:'sync@example.test'},expires_at:Math.floor(Date.now()/1000)+3600};
  window.__channels=[];
  window.supabase={createClient(){return {
    auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table){
      const request={table,op:'select',filters:[]};
      const q={select(fields){request.fields=fields;return q;},eq(k,v){request.filters.push([k,v]);return q;},in(k,v){request.filters.push([k,v,'in']);return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},single(){request.single=true;return q;},maybeSingle(){request.single=true;return q;},update(v){request.op='update';request.value=v;return q;},insert(v){request.op='insert';request.value=v;return q;},upsert(v){request.op='upsert';request.value=v;return q;},delete(){request.op='delete';return q;},then(resolve,reject){return window.__query(request).then(resolve,reject);}};
      return q;
    },
    channel(){const ch={on(event,filter,callback){if(event==='postgres_changes')ch.receive=callback;return ch;},subscribe(callback){ch.status=callback;window.__channels.push(ch);setTimeout(()=>callback('SUBSCRIBED'),0);return ch;}};return ch;},
    removeChannel(ch){window.__channels=window.__channels.filter(x=>x!==ch);}
  };}};
  localStorage.setItem('retrade_backfill_dsar_v1','1');
}
async function until(fn,label,ms=5000){const start=Date.now();while(!await fn()){if(Date.now()-start>ms)throw Error('Timed out: '+label);await pause(25);}}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
  const pages=[],errors=[],writes=[],messages=[];let revision=1,broadcast=true,blockedTable=null,hold=null;
  const tables={items:['one','two'].map(id=>({id,user_id:'sync-test',item:'Camera '+id,month:'OCT-26',state:'listed',date_listed:'2026-10-01',date_sourced:'2026-10-01',sale_price:100,cost_price:40,notes:'original',revision:1,updated_at:'2026-10-01T10:00:00Z'}))};
  async function signal(){if(broadcast)await Promise.all(pages.map(p=>p.evaluate(rev=>(window.__channels||[]).forEach(ch=>ch.receive({new:{revision:rev}})),revision)));}
  async function query(request,page){
    const {table,op,filters,value,single}=request;
    if(table==='retrade_meta')return {data:single?{value:'2026-09-01-v1.4.5'}:[{value:'2026-09-01-v1.4.5'}]};
    if(table==='retrade_sync_clock')return {data:{revision}};
    const rows=tables[table]||(tables[table]=[]),matches=row=>filters.every(([k,v,type])=>type==='in'?v.includes(row[k]):row[k]===v);
    if(op==='select'){
      const data=copy(rows.filter(matches));
      if(hold&&hold.page===page&&hold.table===table){const h=hold;hold=null;h.started();await h.wait;}
      return {data:single?(data[0]||null):data,error:null};
    }
    if(table===blockedTable)return {data:null,error:{message:'Synthetic write failure'}};
    writes.push({table,op});let affected=[];
    if(op==='delete'){affected=rows.filter(matches);tables[table]=rows.filter(row=>!matches(row));}
    else if(op==='update'){affected=rows.filter(matches);affected.forEach(row=>Object.assign(row,value));}
    else for(const v of Array.isArray(value)?value:[value]){
      let row=op==='upsert'?rows.find(row=>row.id===v.id):null;
      if(row)Object.assign(row,v);else{row=copy(v);rows.push(row);}affected.push(row);
    }
    if(table==='items'&&op!=='delete')affected.forEach(row=>{row.revision=(row.revision||0)+1;row.updated_at=new Date().toISOString();});
    if(affected.length){revision++;await signal();}
    return {data:copy(affected),error:null};
  }
  async function open(mobile){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(/sync|failed|conflict|cloud/i.test(message.text()))messages.push(message.text());});
    await page.exposeFunction('__query',request=>query(request,page));
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.includes('/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:'('+client.toString()+')();'});
      if(url.origin!=='http://retrade.test')return route.abort();
      const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
      let body=fs.readFileSync(file);if(url.pathname==='/')body=body.toString().replace(/ integrity="[^"]*"/g,'');
      return route.fulfill({contentType:type,body});
    });
    await page.goto('http://retrade.test/');
    await page.waitForFunction(()=>window.__rtFeaturesReady&&window.__rtLaunchSettled&&_realtimeSyncConnected&&!_cloudRefreshBusy&&!_dbLoading);
    return page;
  }
  const item=(page,id)=>page.evaluate(id=>_findItemRecordById(id)?.item,id);
  const edit=(page,id,notes)=>page.evaluate(({id,notes})=>{_findItemRecordById(id).item.notes=notes;saveDB();},{id,notes});
  try{
    const desktop=await open(false),phone=await open(true);
    await desktop.evaluate(()=>goToTab('stock'));await phone.evaluate(()=>goToTab('stock'));
    const start=Date.now();await edit(desktop,'one','from desktop');
    await until(async()=>(await item(phone,'one')).notes==='from desktop','desktop -> phone',3000);
    const latency=Date.now()-start;assert(latency<2000,'Normal propagation stays below 2 seconds in isolated sessions');
    await edit(phone,'two','from phone');await until(async()=>(await item(desktop,'two')).notes==='from phone','phone -> desktop');
    // Repeated notifications must not starve the first refresh.
    tables.items[0].notes='burst';tables.items[0].revision++;
    let during=false;
    for(let n=0;n<12;n++){revision++;await signal();await pause(50);if((await item(phone,'one')).notes==='burst')during=true;}
    assert(during,'Incoming state applies before a continuous burst ends');
    // One rejected local write must not freeze the incoming dataset.
    blockedTable='expenses';
    await phone.evaluate(()=>{DB.expenses.push({id:'pending-expense',date:'2026-10-01',description:'Keep me',amount:7});saveDB();});
    await until(()=>phone.evaluate(()=>!_persistPromise&&_outboxPendingCount()>0),'failed expense retained');
    await edit(desktop,'one','remote with pending');
    await until(async()=>(await item(phone,'one')).notes==='remote with pending','incoming despite pending');
    assert.equal(await phone.evaluate(()=>DB.expenses.find(x=>x.id==='pending-expense').amount),7);
    assert(await phone.evaluate(()=>!!_outboxRead()['exp:pending-expense']));
    blockedTable=null;await phone.evaluate(()=>_waitForSync());
    await until(()=>phone.evaluate(()=>!_cloudRefreshBusy&&!_persistPromise&&!_cloudLoadPromise),'idle before race');
    // Freeze one cloud read, edit locally, then release the stale response.
    let release,started;const waiting=new Promise(r=>started=r),wait=new Promise(r=>release=r);
    hold={page:phone,table:'items',started,wait};
    await phone.evaluate(()=>{window.__refreshResult=_refreshCloudOnResume(true);});await waiting;
    await edit(phone,'two','edited during read');await pause(250);
    assert.notEqual(tables.items[1].notes,'edited during read','Writer waits for the read commit');
    release();await phone.evaluate(()=>window.__refreshResult);
    await until(()=>tables.items[1].notes==='edited during read','concurrent edit reaches server');
    assert.equal((await item(phone,'two')).notes,'edited during read');
    // Reconnect with a missed event; same channel is re-subscribed.
    broadcast=false;tables.items[0].notes='missed while sleeping';tables.items[0].revision++;revision++;
    await phone.evaluate(()=>window.__channels.forEach(ch=>ch.status('SUBSCRIBED')));
    await until(async()=>(await item(phone,'one')).notes==='missed while sleeping','reconnect catch-up',2000);
    tables.items[0].notes='poll only';tables.items[0].revision++;revision++;
    await until(async()=>(await item(phone,'one')).notes==='poll only','missed event poll',4000);
    // Explicit refresh reads current server state and does not re-upload it.
    await phone.evaluate(()=>_waitForSync());await pause(100);const before=writes.length;
    tables.items[0].notes='authoritative refresh';tables.items[0].revision++;revision++;
    assert.equal(await phone.evaluate(()=>retradeForceResync()),true);
    assert.equal((await item(phone,'one')).notes,'authoritative refresh');
    assert.equal(writes.length,before,'Resync does not re-upload clean rows');
    await phone.reload();await phone.waitForFunction(()=>_realtimeSyncConnected&&!_dbLoading);
    assert.equal((await item(phone,'one')).notes,'authoritative refresh','Hard refresh takes cloud state');
    assert.deepEqual(errors,[]);
    console.log('PASS two-session real sync: '+latency+'ms; bidirectional, bursts, pending-write isolation, concurrent edits, reconnect, polling, safe resync and reload');
  }catch(e){
    console.error('Synthetic sync failure diagnostics',JSON.stringify({writes,items:tables.items,errors,messages:messages.slice(-25),sessions:await Promise.all(pages.map(p=>p.evaluate(()=>({uid:_currentUserId,preview:_previewMode,visibility:document.visibilityState,error:_lastSyncError,readError:_lastCloudRefreshError,pending:_outboxRead(),busy:_cloudRefreshBusy,writer:!!_persistPromise,clock:[_syncClockAppliedRevision,_syncClockTargetRevision],notes:allDBKeys().flatMap(k=>DB[k].map(i=>({id:i.id,notes:i.notes})))})).catch(()=>null)))}));
    throw e;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
