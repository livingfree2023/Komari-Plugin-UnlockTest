// Browser regression fixtures are isolated to tests; all network requests are intercepted.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const parser = require('../plugin/lib/parser');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await page.clock.install();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    let snap = {regions:['2','5'],nodes:{},activeTask:null,lastTask:null};
    let deny = true, unavailable = false;
    const services = parser.parseUnlockTestOutput('[ HongKong (IPv4) ] ====\nMax  YES (Region: HK)\n<img src=x onerror=window.injected=1>  YES\n[ NorthAmerica (IPv4) ] ====\nMax  NO').services;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/matrix.html')) return route.fulfill({path:path.join(__dirname,'../plugin/pages/matrix.html'),contentType:'text/html'});
      if (url.pathname.endsWith('/snapshot')) return route.fulfill({status:unavailable ? 503 : 200,json:{status:'success',data:snap}});
      if (url.pathname.endsWith('/probe')) {
        requests.push(route.request().postDataJSON());
        if (deny) return route.fulfill({status:403,json:{status:'error',message:'Administrator role required'}});
        snap.activeTask = {taskId:'test-task',clients:['a'],totalCount:1,finishedCount:0,nodeSummary:{}};
        return route.fulfill({json:{status:'success',data:{triggered:true,taskId:'test-task'}}});
      }
      return route.abort();
    });
    const url = 'https://matrix.test/api/plugin/unlock-test/pages/matrix.html';
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('statNodeCount').textContent === '0');
    assert.equal(await page.locator('#matrixBody tr[data-uuid]').count(),0);
    assert.equal(await page.getByText('SG.OCI',{exact:true}).count(),0);
    snap.nodes = {a:{name:'target',group:'group',services},b:{name:'<img src=x onerror=window.injected=2>',group:'"<img src=x onerror=window.injected=3>',services}};
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#matrixBody tr[data-uuid]').length === 2);
    assert.equal(await page.locator('.service-header-name').filter({hasText:/^Max$/}).count(),2);
    assert.equal(await page.locator('#matrixBody tr').first().locator('.cell-badge').nth(0).innerText(),'HK');
    assert.equal(await page.locator('#matrixBody tr').first().locator('.cell-badge').nth(2).innerText(),'❌');
    assert.equal(await page.locator('#matrixBody img, #headerRow img').count(),0);
    assert.equal(await page.evaluate(() => window.injected),undefined);
    await page.locator('#nodeSearchInput').fill('target');
    await page.locator('#probeVisibleBtn').click();
    await page.waitForFunction(() => document.querySelector('.probe-toast')?.textContent.includes('探测失败'));
    assert.deepEqual(requests[0],{clients:['a']});
    assert.equal(await page.locator('#probeVisibleBtn').isEnabled(),true);
    deny = false;
    await page.locator('#probeVisibleBtn').click();
    await page.waitForFunction(() => document.getElementById('probeBtnText').textContent === '后台探测中');
    assert.equal(await page.locator('#probeVisibleBtn').isDisabled(),true);
    await page.clock.fastForward(15000);
    assert.equal(await page.locator('#probeBtnText').innerText(),'后台探测中');
    assert.ok(!(await page.locator('.probe-toast').count()) || !(await page.locator('.probe-toast').innerText()).includes('探测完成'));
    snap.lastTask = {...snap.activeTask,finishedCount:1}; snap.activeTask = null;
    snap.nodes.a.services = parser.parseUnlockTestOutput('[ HongKong (IPv4) ] ====\nMax  NO\n[ NorthAmerica (IPv4) ] ====\nMax  YES (Region: US)').services;
    await page.clock.fastForward(3000);
    await page.waitForFunction(() => document.getElementById('probeBtnText').textContent === '探测当前显示节点');
    assert.equal(await page.locator('#matrixBody tr').first().locator('.cell-badge').nth(0).innerText(),'❌');
    await page.screenshot({path:'/tmp/unlock-matrix-fixed.png'});
    unavailable = true;
    await page.clock.fastForward(15000);
    await page.waitForFunction(() => document.getElementById('matrixBody').textContent.includes('503'));
    assert.equal(await page.locator('#matrixBody tr[data-uuid]').count(),0);
    assert.equal(await page.locator('#probeVisibleBtn').isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log('Matrix browser checks passed: empty snapshots, HTML injection, region identity, filtered targets, request failures, real progress and refreshed results.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
