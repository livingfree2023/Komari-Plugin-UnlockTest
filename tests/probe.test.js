// Offline regression tests: fake RPC responses/timers are test-only, never shipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const parser = require('../plugin/lib/parser');
const source = fs.readFileSync(path.join(__dirname, '../plugin/lib/probe.js'), 'utf8');
const output = fs.readFileSync(path.join(__dirname, 'fixtures/sgoci-output.txt'), 'utf8');

function harness(t, options = {}) {
  const dir = options.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'unlock-test-'));
  if (!options.dir) t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  let now = Date.parse('2026-10-20T06:04:00Z');
  let seq = 0;
  const timers = new Map(), calls = [], crons = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({
    module: {exports:{}}, require: name => name === './parser.js' ? parser : name === 'fs' && options.fs ? options.fs : require(name),
    __storageDir__: dir, Date: Clock, console: {info(){}, warn(){}, error(){}},
    setTimeout(fn, delay) { const id = ++seq; timers.set(id, {fn, at:now+delay}); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source, context);
  const lib = context.module.exports;
  const clients = options.clients || [{uuid:'a', name:'SG'}];
  const server = {
    getConfig: async () => options.config || {},
    cron(spec, callback) { crons.push({spec, callback}); },
    async call(method, params) {
      calls.push({method, params});
      if (options.call) {
        const response = await options.call(method, params);
        if (response !== undefined) return response;
      }
      if (method === 'admin:listClients') return clients;
      if (method === 'common:getNodesLatestStatus') return Object.fromEntries(clients.map(n => [n.uuid, {online:true}]));
      if (method === 'admin:exec') return {task_id:'task-' + calls.filter(c => c.method === method).length};
      if (method === 'admin:getTaskById') return {results:[]};
      throw Error(method);
    }
  };
  const manager = lib.createProbeManager(server);
  return {lib, manager, dir, calls, crons, timers,
    snapshot: () => manager.loadSnapshotFromDisk(),
    async tick(advance = 3000) {
      now += advance;
      const ready = [...timers.entries()].filter(([,timer]) => timer.at <= now);
      for (const [id,timer] of ready) { if (timers.delete(id)) await timer.fn(); }
    }
  };
}
const result = uuid => ({client:uuid, result:output, exit_code:0, finished_at:'2026-10-20T06:04:20Z'});

test('actual pasted output parses 58 stack results into 33 services', () => {
  const parsed = parser.parseUnlockTestOutput(output);
  assert.equal(parsed.services.length, 33);
  assert.equal(parsed.services.filter(s => s.ipv4).length, 33);
  assert.equal(parsed.services.filter(s => s.ipv6).length, 25);
  const disney = parsed.services.find(s => s.name === 'Disney+');
  assert.equal(disney.ipv4.unlocked, false);
  assert.equal(disney.ipv6.unlocked, true);
  assert.equal(disney.unlocked, true);
});

test('RPC completion persists the parsed snapshot', async t => {
  const h = harness(t, {call: m => m === 'admin:getTaskById' ? {results:[result('a')]} : undefined});
  await h.manager.triggerProbe(); await h.tick();
  assert.equal(h.snapshot().activeTask, null);
  assert.equal(h.snapshot().nodes.a.services.length, 33);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'snapshot.json'))).nodes.a.services.length, 33);
});

test('simultaneous triggers and active-task triggers dispatch only once', async t => {
  const h = harness(t);
  const responses = await Promise.all([h.manager.triggerProbe(), h.manager.triggerProbe()]);
  assert.equal(responses.filter(r => r.triggered).length, 1);
  assert.equal((await h.manager.triggerProbe()).reason, 'already_running');
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 1);
});

test('reload resumes persisted task even with existing node data and unchanged configuration', async t => {
  const h = harness(t);
  await h.manager.triggerProbe();
  h.snapshot().nodes.a = {uuid:'a',services:[]};
  h.manager.saveSnapshotToDisk(h.snapshot()); h.manager.shutdown();
  const resumed = harness(t, {dir:h.dir, call:m => m === 'admin:getTaskById' ? {results:[result('a')]} : undefined});
  await resumed.manager.syncConfigAndMaybeProbe(); await resumed.tick();
  assert.equal(resumed.calls.filter(c => c.method === 'admin:exec').length, 0);
  assert.equal(resumed.snapshot().nodes.a.services.length, 33);
  assert.equal(resumed.snapshot().activeTask, null);
});

test('empty task results recover the exact run log once, then finish with an explicit error', async t => {
  const h = harness(t);
  await h.manager.triggerProbe(); const runId = h.snapshot().activeTask.runId;
  await h.tick(300000);
  assert.equal(h.snapshot().activeTask.phase, 'recovering');
  const recovery = h.calls.filter(c => c.method === 'admin:exec')[1];
  assert.ok(recovery.params.command.includes('/tmp/km-unlock-' + runId));
  await h.tick(60000);
  assert.equal(h.snapshot().activeTask, null);
  assert.match(h.snapshot().nodes.a.error, /Agent task results/);
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 2);
});

test('lost upload can be recovered without re-running unlock-test', async t => {
  const h = harness(t, {call:(m,p) => m === 'admin:getTaskById' && p.task_id === 'task-2' ? {results:[result('a')]} : undefined});
  await h.manager.triggerProbe(); await h.tick(300000); await h.tick();
  assert.equal(h.snapshot().activeTask, null);
  assert.equal(h.snapshot().nodes.a.services.length, 33);
  assert.equal(h.snapshot().nodes.a.taskId, 'task-1');
});

test('partial result arrays do not complete the whole task; completed nodes are not reprocessed', async t => {
  const h = harness(t, {clients:[{uuid:'a'},{uuid:'b'}], call:m => m === 'admin:getTaskById' ? {results:[result('a')]} : undefined});
  await h.manager.triggerProbe(); await h.tick();
  const firstUpdate = h.snapshot().nodes.a.updatedAt;
  assert.equal(h.snapshot().activeTask.finishedCount, 1);
  assert.equal(h.snapshot().activeTask.totalCount, 2);
  await h.tick(); assert.equal(h.snapshot().nodes.a.updatedAt, firstUpdate);
  await h.tick(300000); await h.tick(60000);
  assert.ok(h.snapshot().nodes.b.error);
  assert.equal(h.snapshot().nodes.a.error, null);
});

test('permanent RPC failure clears activeTask and preserves old data with error', async t => {
  const h = harness(t, {call:m => { if (m === 'admin:getTaskById') throw Error('RPC unavailable'); }});
  h.snapshot().nodes.a = {uuid:'a', services:parser.parseUnlockTestOutput(output).services};
  await h.manager.triggerProbe(); await h.tick(300000); await h.tick(60000);
  assert.equal(h.snapshot().activeTask, null);
  assert.equal(h.snapshot().nodes.a.services.length, 33);
  assert.match(h.snapshot().nodes.a.error, /RPC unavailable/);
});

test('legacy persisted tasks without a run ID terminate without reading the shared stale file', async t => {
  const h = harness(t);
  await h.manager.triggerProbe(); delete h.snapshot().activeTask.runId;
  await h.tick(300000);
  assert.equal(h.snapshot().activeTask, null);
  assert.ok(h.snapshot().nodes.a.error);
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 1);
});

test('configured cron is used and no offline fallback dispatch occurs', async t => {
  const h = harness(t, {config:{cron_spec:'15 */8 * * *'}, call:m => m === 'common:getNodesLatestStatus' ? {} : undefined});
  await h.manager.syncConfigAndMaybeProbe();
  assert.equal(h.crons[0].spec, '15 */8 * * *');
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 0);
});

test('late polling responses after unload cannot mutate snapshots', async t => {
  let resolve;
  const h = harness(t, {call:m => m === 'admin:getTaskById' ? new Promise(r => resolve = r) : undefined});
  await h.manager.triggerProbe(); const tick = h.tick();
  h.manager.shutdown(); resolve({results:[result('a')]}); await tick;
  assert.equal(h.snapshot().nodes.a, undefined);
});

test('remote shell matches Agent sh -s input, preserves exit code and supports exact-log recovery', t => {
  const h = harness(t);
  const bin = path.join(h.dir, 'unlock-test');
  fs.writeFileSync(bin, '#!/bin/sh\ncat >/dev/null\nprintf "fixture output\\n"\nexit 7\n', {mode:0o700});
  const runId = 'test-' + process.pid + '-' + Date.now();
  const logDir = '/tmp/km-unlock-' + runId;
  t.after(() => fs.rmSync(logDir, {recursive:true,force:true}));
  // Only replace binary discovery in this shell unit test; no provider/network requests.
  const command = h.lib.buildRemoteCommand(h.lib.normalizeConfig({}), runId)
    .replace('BIN=""', 'BIN="' + bin + '"')
    .replace(/for candidate in [\s\S]*?\ndone/, 'true');
  const executed = spawnSync('sh', ['-s'], {input:command, encoding:'utf8', timeout:5000});
  assert.equal(executed.status, 7, executed.stderr);
  assert.equal(executed.stdout, 'fixture output\n');
  const recovered = spawnSync('sh', ['-s'], {input:h.lib.buildRecoveryCommand(runId), encoding:'utf8', timeout:5000});
  assert.equal(recovered.status, 7);
  assert.equal(recovered.stdout, executed.stdout);
});

test('public snapshots exclude hidden task metadata and raw node output', async t => {
  const h = harness(t, {clients:[{uuid:'a',hidden:false},{uuid:'secret',hidden:true}]});
  await h.manager.triggerProbe();
  const publicView = JSON.stringify(h.manager.getPublicSnapshot(false));
  assert.ok(!publicView.includes('secret'));
  assert.ok(!publicView.includes('clientMeta'));
  assert.ok(JSON.stringify(h.manager.getPublicSnapshot(true)).includes('secret'));
});

test('HTTP routes reject forged Bearer headers and expose dispatch failures', async () => {
  const routes = {}, calls = [];
  const server = {static(){}, route(method,url,handler){routes[method+' '+url]=handler;}, registerRPC(){}, injectHTML(){}};
  const manager = {
    loadSnapshotFromDisk(){}, getPublicSnapshot(admin){return {admin};}, getDebugInfo(){return {};},
    async triggerProbe(){calls.push(1); return {triggered:false,reason:'RPC unavailable'};}
  };
  const context = vm.createContext({
    require:name => name === 'server' ? server : {createProbeManager:()=>manager},
    setTimeout(){}, console:{info(){}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../plugin/script.js'),'utf8'), context);
  context.load();
  async function request(method,url,req) {
    const res = {setHeader(){},end(value){this.body=JSON.parse(value);}};
    await routes[method+' '+url](req,res); return res;
  }
  const forged = {headers:{authorization:'Bearer fake'}, context:{role:'guest'}};
  assert.equal((await request('POST','/api/plugin/unlock-test/probe',forged)).statusCode,403);
  assert.equal((await request('GET','/api/plugin/unlock-test/debug',forged)).statusCode,403);
  assert.equal(calls.length,0);
  const admin = {context:{principal:{roles:['admin']}}};
  assert.equal((await request('POST','/api/plugin/unlock-test/probe',admin)).statusCode,503);
  assert.equal((await request('GET','/api/plugin/unlock-test/debug',admin)).statusCode,200);
  assert.equal((await request('POST','/api/plugin/unlock-test/probe',{...admin,body:'{'})).statusCode,400);
});

test('widget distinguishes unavailable snapshot API from waiting for first probe and escapes error text', async () => {
  const elements = {
    'km-ul-grid-container':{innerHTML:''},
    'km-ul-stat-text':{textContent:''}
  };
  const context = vm.createContext({
    window:{location:{pathname:'/'},getComputedStyle(){return {};}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>elements[id] || null},
    console:{warn(){}},
    fetch:async url => ({ok:!url.endsWith('/snapshot'),status:503,json:async()=>null})
  });
  const src = fs.readFileSync(path.join(__dirname,'../plugin/assets/widget.js'),'utf8')
    .replace('  if (document.readyState === "loading") {', '  globalThis.testWidget = { fetchNodesAndSnapshot, renderServiceLogos, setError(value) { dataError=value; } };\n  if (document.readyState === "loading") {');
  vm.runInContext(src,context);
  await context.testWidget.fetchNodesAndSnapshot();
  assert.match(elements['km-ul-grid-container'].innerHTML,/Snapshot HTTP 503/);
  assert.equal(elements['km-ul-stat-text'].textContent,'探测失败');
  context.testWidget.setError('<img src=x onerror=alert(1)>');
  context.testWidget.renderServiceLogos();
  assert.ok(!elements['km-ul-grid-container'].innerHTML.includes('<img'));
  assert.match(elements['km-ul-grid-container'].innerHTML,/&lt;img/);
});

test('reload during log recovery resumes recovery without dispatching it again', async t => {
  const h = harness(t);
  await h.manager.triggerProbe(); await h.tick(300000); h.manager.shutdown();
  const resumed = harness(t, {dir:h.dir, call:m => m === 'admin:getTaskById' ? {results:[result('a')]} : undefined});
  await resumed.manager.syncConfigAndMaybeProbe(); await resumed.tick();
  assert.equal(resumed.calls.filter(c => c.method === 'admin:exec').length,0);
  assert.equal(resumed.snapshot().nodes.a.services.length,33);
});

test('missing recovery completion marker is a failure, never a partial success', t => {
  const h = harness(t);
  const runId = 'missing-' + process.pid + '-' + Date.now();
  const recovered = spawnSync('sh',['-s'],{input:h.lib.buildRecoveryCommand(runId),encoding:'utf8',timeout:5000});
  assert.equal(recovered.status,1);
  assert.match(recovered.stdout,/did not finish/);
});


test("combined labels prefer v4 and mark only v6 unlock fallbacks", () => {
  const context = vm.createContext({ window: {}, document: { readyState: "loading", addEventListener() {} } });
  const src = fs.readFileSync(path.join(__dirname, "../plugin/assets/widget.js"), "utf8")
    .replace('  if (document.readyState === "loading") {', '  globalThis.resolveLabel = resolveServiceDisplayForStack;\n  if (document.readyState === "loading") {');
  vm.runInContext(src, context);
  const v4 = { unlocked: true, region: "SG", raw: "YES (Region: SG)" };
  const v6 = { unlocked: true, region: "US", raw: "YES (Region: US)" };
  const no = { unlocked: false, region: "NO", raw: "NO" };
  assert.equal(context.resolveLabel({ ipv4: v4, ipv6: v6 }).region, "SG");
  assert.equal(context.resolveLabel({ ipv4: no, ipv6: v6 }).region, "V6 US");
  assert.equal(context.resolveLabel({ ipv4: no, ipv6: { ...v6, region: "" } }).region, "V6 YES");
  assert.equal(context.resolveLabel({ ipv6: v6 }).region, "V6 US");
  assert.equal(context.resolveLabel({ ipv4: no, ipv6: no }).region, "NO");
  assert.equal(context.resolveLabel({ ipv4: { ...no, region: "ERR" }, ipv6: no }).region, "ERR");
  const real = parser.parseUnlockTestOutput(output).services;
  assert.equal(context.resolveLabel(real.find(s => s.name === "Disney+")).region, "V6 SG");
  assert.equal(context.resolveLabel(real.find(s => s.name === "Netflix")).region, "SG");
});

test("checkNodeWebSsh detects disable_web_ssh: true and flags webSshDisabled", async t => {
  const h = harness(t, {
    call: (m, p) => {
      if (m === "admin:getAgentStartupConfig" && p.uuid === "a") {
        return { disable_web_ssh: true };
      }
    }
  });
  const active = await h.manager.checkNodeWebSsh("a");
  assert.equal(active, false);
});

test("checkNodeWebSsh returns true when web_ssh is enabled or disable_web_ssh is false", async t => {
  const h = harness(t, {
    call: (m, p) => {
      if (m === "admin:getAgentStartupConfig" && p.uuid === "a") {
        return { disable_web_ssh: false, web_ssh: true };
      }
    }
  });
  const active = await h.manager.checkNodeWebSsh("a");
  assert.equal(active, true);
});

test("pollTaskUntilDone flags webSshDisabled on node when task fails and agent has disable_web_ssh", async t => {
  const h = harness(t, {
    call: (m, p) => {
      if (m === "admin:getTaskById") {
        return { results: [{ client: "a", result: "", exit_code: -1, finished_at: "2026-10-20T06:05:00Z" }] };
      }
      if (m === "admin:getAgentStartupConfig" && p.uuid === "a") {
        return { disable_web_ssh: true };
      }
    }
  });
  await h.manager.triggerProbe();
  await h.tick();
  const node = h.snapshot().nodes.a;
  assert.equal(node.webSshDisabled, true);
  assert.match(node.error, /disable-web-ssh/);
});

test('cancel without an active task never dispatches a probe', async t => {
  const h = harness(t);
  assert.equal((await h.manager.triggerProbe({cancel:true})).cancelled, true);
  assert.equal(h.calls.length, 0);
});

test('force requests preserve tracking of the running remote process', async t => {
  const h = harness(t);
  await h.manager.triggerProbe();
  const original = h.snapshot().activeTask;
  assert.equal((await h.manager.triggerProbe({force:true})).reason, 'already_running');
  assert.equal(h.snapshot().activeTask, original);
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 1);
});

test('cancel signals only the exact remote run and waits for completion', async t => {
  const h = harness(t);
  await h.manager.triggerProbe();
  const task = h.snapshot().activeTask;
  await h.manager.triggerProbe({cancel:true});
  await h.manager.triggerProbe({cancel:true});
  assert.equal(h.snapshot().activeTask, task);
  const execs = h.calls.filter(c => c.method === 'admin:exec');
  assert.equal(execs.length, 2);
  assert.ok(execs[1].params.command.includes('/tmp/km-unlock-' + task.runId));
  assert.ok(execs[1].params.command.includes('/cancel'));
});

test('fresh visibility hides changed nodes, removes deleted nodes, and fails closed', async t => {
  const clients = [{uuid:'a',hidden:false}];
  let unavailable = false;
  const h = harness(t, {clients,call:m => {
    if (m === 'admin:listClients' && unavailable) throw Error('unavailable');
    if (m === 'admin:getTaskById') return {results:[result('a')]};
  }});
  await h.manager.triggerProbe(); await h.tick();
  assert.ok(h.manager.getPublicSnapshot(false).nodes.a);
  clients[0].hidden = true;
  await h.manager.refreshClientMetadata();
  assert.equal(h.manager.getPublicSnapshot(false).nodes.a, undefined);
  assert.ok(!JSON.stringify(h.manager.getPublicSnapshot(false).lastTask).includes('"a"'));
  clients.length = 0;
  await h.manager.refreshClientMetadata();
  assert.equal(h.manager.getPublicSnapshot(true).nodes.a, undefined);
  unavailable = true;
  await assert.rejects(h.manager.refreshClientMetadata(), /unavailable/);
  assert.equal(Object.keys(h.manager.getPublicSnapshot(false).nodes).length, 0);
});

test('explicit empty targets do not expand to every node', async t => {
  const h = harness(t);
  assert.equal((await h.manager.triggerProbe({clients:[]})).triggered, false);
  assert.equal(h.calls.filter(c => c.method === 'admin:exec').length, 0);
});

test('new nodes appear as untested without fabricated service results', async t => {
  const h = harness(t);
  await h.manager.refreshClientMetadata();
  assert.equal(h.manager.getPublicSnapshot(false).nodes.a.services.length, 0);
  assert.equal(h.manager.getPublicSnapshot(false).nodes.a.updatedAt, null);
});

test('late per-node diagnostics after unload cannot overwrite a snapshot', async t => {
  let resolve;
  const h = harness(t,{call:m => {
    if (m === 'admin:getTaskById') return {results:[{...result('a'), result:'', exit_code:1}]};
    if (m === 'admin:getAgentStartupConfig') return new Promise(r => resolve = r);
  }});
  await h.manager.triggerProbe();
  const pending = h.tick();
  await new Promise(r => setImmediate(r));
  h.manager.shutdown(); resolve({disable_web_ssh:true}); await pending;
  assert.equal(h.snapshot().nodes.a, undefined);
});

test('remote lock prevents overlap; cancellation releases it and exact logs stay isolated', async t => {
  const h = harness(t);
  const run1 = 'lock-' + process.pid + '-' + Date.now();
  const run2 = run1 + '-busy', run3 = run1 + '-next';
  const binary = path.join(h.dir,'wait-bin');
  fs.writeFileSync(binary,'#!/bin/sh\nprintf "first\\n"\ntouch "'+h.dir+'/ready"\nexec sleep 20\n',{mode:0o700});
  const lock = path.join(h.dir,'lock');
  const command = (run, bin) => h.lib.buildRemoteCommand(h.lib.normalizeConfig({}),run)
    .replace('BIN=""','BIN="'+bin+'"')
    .replace(/for candidate in [\s\S]*?\ndone/,'true')
    .replace('LOCK="/tmp/km-unlock-$(id -u).lock"','LOCK="'+lock+'"');
  const child = spawn('sh',['-s'],{stdio:['pipe','pipe','pipe']});
  t.after(() => {child.kill(); for (const run of [run1,run2,run3]) fs.rmSync('/tmp/km-unlock-'+run,{recursive:true,force:true});});
  let firstOutput=''; child.stdout.on('data',data=>firstOutput+=data);
  const finished = new Promise((resolve,reject) => {child.on('close',code=>resolve(code));child.on('error',reject);});
  child.stdin.end(command(run1,binary));
  const deadline = Date.now()+5000;
  while (!fs.existsSync(path.join(h.dir,'ready'))) {
    assert.ok(Date.now()<deadline,'first process did not start');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const busy = spawnSync('sh',['-s'],{input:command(run2,binary),encoding:'utf8',timeout:5000});
  assert.equal(busy.status,75);
  assert.match(busy.stdout,/Another unlock probe/);
  fs.writeFileSync('/tmp/km-unlock-'+run1+'/cancel','');
  assert.equal(await finished,130);
  assert.equal(firstOutput,'first\n');
  assert.equal(fs.existsSync(lock),false);
  fs.writeFileSync(binary,'#!/bin/sh\nprintf "second\\n"\n',{mode:0o700});
  const second = spawnSync('sh',['-s'],{input:command(run3,binary),encoding:'utf8',timeout:5000});
  assert.equal(second.status,0); assert.equal(second.stdout,'second\n');
  const previous = spawnSync('sh',['-s'],{input:h.lib.buildRecoveryCommand(run1),encoding:'utf8',timeout:5000});
  assert.equal(previous.status,130); assert.equal(previous.stdout,'first\n');
});

test('public snapshot HTTP route checks current visibility and rejects unavailable ACL data', async () => {
  const routes = {}; let unavailable = false, refreshed = false;
  const server = {static(){},route(method,url,handler){routes[method+' '+url]=handler;},registerRPC(){},injectHTML(){}};
  const manager = {loadSnapshotFromDisk(){}, async refreshClientMetadata(){if(unavailable) throw Error('database unavailable'); refreshed=true;},
    getPublicSnapshot(admin){assert.equal(refreshed,true); return {admin,nodes:{}};}};
  const context = vm.createContext({require:name=>name==='server'?server:{createProbeManager:()=>manager},setTimeout(){},console:{info(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../plugin/script.js'),'utf8'),context);context.load();
  const request = async () => {
    const res={setHeader(){},end(text){this.body=JSON.parse(text);}};
    await routes['GET /api/plugin/unlock-test/snapshot']({context:{role:'guest'}},res);return res;
  };
  assert.equal((await request()).body.data.admin,false);
  unavailable=true; refreshed=false;
  const failed=await request();assert.equal(failed.statusCode,503);assert.equal(failed.body.data,undefined);
});
