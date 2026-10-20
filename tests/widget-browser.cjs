// Optional browser regression: NODE_PATH must contain Playwright; uses an isolated profile.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const parser=require('../plugin/lib/parser');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const fixture=parser.parseUnlockTestOutput(fs.readFileSync(path.join(__dirname,'fixtures/sgoci-output.txt'),'utf8'));
    await page.addInitScript(()=>localStorage.setItem('komari_unlock_test_widget_v1',JSON.stringify({lang:'zh-CN',ipFilter:'6'})));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/api/nodes') return route.fulfill({json:{data:[{uuid:'a',name:'SG.OCI'}]}});
      if(u.pathname==='/api/me') return route.fulfill({json:{logged_in:true}});
      if(u.pathname==='/api/plugin/unlock-test/snapshot') return route.fulfill({json:{status:'success',data:{regions:['0','11'],nodes:{a:{uuid:'a',name:'SG.OCI',services:fixture.services}},telemetry:{},activeTask:null}}});
      if(u.pathname.startsWith('/assets/')) return route.fulfill({path:path.join(__dirname,'../plugin',u.pathname),contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript'});
      if(u.pathname==='/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/widget.css"></head><body style="background:#090d16;color:#dce8f5;font:16px system-ui;padding:24px"><main><h1>节点监控</h1><div data-uuid="a">SG.OCI</div></main><script src="/assets/logos.js"></script><script src="/assets/widget.js"></script></body></html>'});
      return route.abort();
    });
    await page.goto('https://widget.test/');
    await page.waitForFunction(()=>document.querySelectorAll('.km-ul-service-card').length===33);
    assert.equal(await page.locator('[data-ip]').count(),0);
    async function label(name){return page.locator('.km-ul-service-card').filter({has:page.locator('.km-ul-service-name',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).locator('.km-ul-region-sub').innerText();}
    assert.equal(await label('Disney+'),'V6 SG');
    assert.equal(await label('Netflix'),'SG');
    assert.equal(await label('Gemini'),'V6 SG');
    for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
      await page.setViewportSize({width,height});
      await page.waitForTimeout(150);
      const box=await page.locator('#km-unlock-floating-root').boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width,JSON.stringify(box));
      assert.equal(await page.locator('.km-ul-service-card').count(),33);
      await page.screenshot({path:'/tmp/unlock-widget-'+name+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Desktop/mobile browser checks passed; legacy IPv6-only preference ignored; 33 combined cards rendered.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
