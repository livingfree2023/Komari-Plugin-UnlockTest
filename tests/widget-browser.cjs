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
    await page.addInitScript(()=>localStorage.setItem('komari_unlock_test_widget_v1',JSON.stringify({lang:'en',ipFilter:'6'})));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/api/nodes') return route.fulfill({json:{data:[{uuid:'a',name:'SG.OCI'}]}});
      if(u.pathname==='/api/me') return route.fulfill({json:{logged_in:true}});
      if(u.pathname==='/api/plugin/unlock-test/snapshot') return route.fulfill({json:{status:'success',data:{regions:['0','11'],nodes:{a:{uuid:'a',name:'SG.OCI',services:fixture.services}},telemetry:{},activeTask:null}}});
      if(u.pathname.startsWith('/assets/')) return route.fulfill({path:path.join(__dirname,'../plugin',u.pathname),contentType:u.pathname.endsWith('.css')?'text/css':'application/javascript'});
      if(u.pathname==='/') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/widget.css"><style>body{background:#f7f8fa;color:#202938;font:14px Arial,sans-serif;padding:24px}body.dark{background:#080d18;color:#ecf1f8;font:18px Georgia,serif}main{background:#eef1f5;padding:12px}body.dark main{background:#0f172a}.background-container{position:fixed;inset:0;z-index:-1}.default-background{position:absolute;inset:0;background-color:#f6f8fb;background-image:repeating-linear-gradient(90deg,rgba(29,78,137,.06) 0,rgba(29,78,137,.06) 1px,transparent 1px,transparent 12px)}body.dark .default-background{background-color:#143d72;background-image:repeating-linear-gradient(90deg,rgba(233,242,255,.06) 0,rgba(233,242,255,.06) 1px,transparent 1px,transparent 12px)}.node-card{background:#fff;color:#202938;border:1px solid #d5dbe5;border-radius:10px;box-shadow:0 5px 15px rgba(15,23,42,.12);padding:12px}body.dark .node-card{background:#1e293b;color:#f8fafc;border-color:#334155}button.primary{background:#2563eb;color:white}</style></head><body><div class="background-container"><div class="default-background"></div></div><main><h1>节点监控</h1><div class="node-card" data-uuid="a">SG.OCI</div><button class="primary">主题强调色</button></main><script src="/assets/brand-icons.js"></script><script src="/assets/logos.js"></script><script src="/assets/widget.js"></script></body></html>'});
      return route.abort();
    });
    await page.goto('https://widget.test/');
    await page.waitForFunction(()=>document.querySelectorAll('.km-ul-service-card').length===33);
    assert.equal(await page.locator('[data-ip]').count(),0);
    assert.equal(await page.locator('#km-ul-lang-btn, #km-ul-export-btn, #km-ul-import-btn, #km-ul-import-input').count(),0);
    assert.equal(await page.locator('#km-ul-title-text').innerText(),'流媒体与 AI 解锁');
    const themeVars=()=>page.locator('#km-unlock-floating-root').evaluate(el=>{
      const style=getComputedStyle(el);
      const header=el.querySelector('.km-ul-header').getBoundingClientRect();
      const select=el.querySelector('.km-ul-node-select').getBoundingClientRect();
      return {theme:el.dataset.kmUlTheme,font:style.getPropertyValue('--km-ul-sans').trim(),size:style.getPropertyValue('--km-ul-font-16').trim(),surface:style.getPropertyValue('--km-ul-bg').trim(),pageImage:style.getPropertyValue('--km-ul-bg-image').trim(),card:style.getPropertyValue('--km-ul-card').trim(),accent:style.getPropertyValue('--km-ul-cyan').trim(),borderWidth:style.getPropertyValue('--km-ul-border-width').trim(),borderStyle:style.getPropertyValue('--km-ul-border-style').trim(),radius:style.getPropertyValue('--km-ul-radius').trim(),headerBackground:getComputedStyle(el.querySelector('.km-ul-header')).backgroundColor,footerBackground:getComputedStyle(el.querySelector('.km-ul-footer')).backgroundColor,selectGap:select.top-header.bottom};
    });
    await page.waitForFunction(()=>document.querySelector('#km-unlock-floating-root')?.dataset.kmUlTheme==='light');
    const lightTheme=await themeVars();
    assert.match(lightTheme.font,/Arial/);
    assert.equal(lightTheme.size,'14.00px');
    assert.equal(lightTheme.surface,'rgb(246, 248, 251)');
    assert.match(lightTheme.pageImage,/repeating-linear-gradient/);
    assert.equal(lightTheme.card,'rgb(255, 255, 255)');
    assert.equal(lightTheme.headerBackground,'rgba(0, 0, 0, 0)');
    assert.equal(lightTheme.footerBackground,'rgba(0, 0, 0, 0)');
    assert.ok(lightTheme.selectGap>=14,`Dropdown gap: ${lightTheme.selectGap}`);
    assert.equal(lightTheme.accent,'rgb(37, 99, 235)');
    assert.equal(lightTheme.borderWidth,'1px');
    assert.equal(lightTheme.borderStyle,'solid');
    assert.equal(lightTheme.radius,'10px');
    await page.locator('body').evaluate(el=>el.classList.add('dark'));
    await page.waitForFunction(()=>document.querySelector('#km-unlock-floating-root')?.dataset.kmUlTheme==='dark');
    const darkTheme=await themeVars();
    assert.match(darkTheme.font,/Georgia/);
    assert.equal(darkTheme.size,'18.00px');
    assert.equal(darkTheme.surface,'rgb(20, 61, 114)');
    assert.match(darkTheme.pageImage,/repeating-linear-gradient/);
    assert.notEqual(darkTheme.pageImage,lightTheme.pageImage);
    assert.equal(darkTheme.card,'rgb(30, 41, 59)');
    assert.equal(darkTheme.borderWidth,'1px');
    assert.equal(darkTheme.borderStyle,'solid');
    assert.equal(darkTheme.radius,'10px');
    await page.locator('body').evaluate(el=>el.classList.remove('dark'));
    await page.waitForFunction(()=>document.querySelector('#km-unlock-floating-root')?.dataset.kmUlTheme==='light' && getComputedStyle(document.querySelector('#km-unlock-floating-root')).getPropertyValue('--km-ul-font-16').trim()==='14.00px');
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
      assert.ok(await page.locator('.km-ul-service-card .km-ul-native-icon').count()>10);
      await page.screenshot({path:'/tmp/unlock-widget-'+name+'.png'});
    }
    assert.deepEqual(errors,[]);
    console.log('Desktop/mobile and live light/dark theme checks passed; legacy IPv6-only preference ignored; 33 combined cards rendered.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
