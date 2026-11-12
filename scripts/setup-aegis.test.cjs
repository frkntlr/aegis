const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const {parseOptions,runSetup,runChild}=require('./setup-aegis.cjs');
const {configureAntigravity,installUserShims}=require('./setup-aegis-config.cjs');

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aegis setup space '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const engine=path.join(root,'engine checkout');
  const project=path.join(root,'target project');
  fs.mkdirSync(engine,{recursive:true});fs.mkdirSync(project);
  fs.writeFileSync(path.join(project,'package.json'),'{}');
  fs.mkdirSync(path.join(engine,'templates/skills/aegis'),{recursive:true});
  fs.writeFileSync(path.join(engine,'templates/skills/aegis/SKILL.md'),'Aegis Antigravity Skill');
  return {root,engine,project};
}

function fakeRunner(engine, calls, fail) {
  return (command,args,cwd)=>{
    calls.push({command,args,cwd});
    if(fail&&args.includes(fail))throw new Error('child failed');
    if(args.includes('build')){
      const cli=path.join(engine,'packages/cli/dist/bin/aegis.js');
      fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'// fixture');
    }
    if(args.includes('codex:setup')) {
      const project=args.at(-1);
      for(const relative of ['.codex/config.toml','AGENTS.md','.agents/skills/aegis/SKILL.md']){
        const file=path.join(project,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');
      }
    }
    return '';
  };
}

test('setup parser accepts both value forms and rejects ambiguous options',()=>{
  const options=parseOptions(['--client=codex','--project','project with spaces','--user']);
  assert.equal(options.client,'codex');assert.equal(options.user,true);
  assert.ok(options.project.endsWith('project with spaces'));
  assert.equal(parseOptions(['--client=antigravity','--user']).user,true);
  for(const args of [['--client=unknown'],['--project'],['--user','--user'],['--mystery']])assert.throws(()=>parseOptions(args));
});

test('dry-run needs no installed dependencies and never starts subprocesses or writes settings',t=>{
  const f=fixture(t);const before=fs.readdirSync(f.project);
  runSetup({...f,client:'both',user:true,dryRun:true},{run:()=>{throw new Error('must not run');},log:()=>{}});
  assert.deepEqual(fs.readdirSync(f.project),before);
  assert.ok(!fs.existsSync(path.join(f.engine,'node_modules')));
});

test('Codex setup checks build, configuration, MCP and status with exact project argument',t=>{
  const f=fixture(t),calls=[],logs=[];
  runSetup({...f,client:'codex',user:false},{npm:['npm',[]],dependenciesMissing:()=>true,
    run:fakeRunner(f.engine,calls),log:line=>logs.push(line)});
  assert.deepEqual(calls[0].args,['install','--no-audit','--no-fund']);
  assert.ok(calls.some(call=>call.args.includes('codex:setup')&&call.args.at(-1)===f.project&&call.cwd===f.project));
  assert.ok(calls.some(call=>call.args.some(arg=>arg.endsWith('verify-codex-mcp.cjs'))));
  assert.equal(calls.at(-1).args.at(-1),'status');
  assert.ok(!fs.existsSync(path.join(f.project,'.gemini')));
  assert.ok(logs.some(line=>line.includes('setup complete')));
});

test('failed build stops before client writes and never prints completion',t=>{
  const f=fixture(t),calls=[],logs=[];
  assert.throws(()=>runSetup({...f,client:'both',user:false},{npm:['npm',[]],dependenciesMissing:()=>false,
    run:fakeRunner(f.engine,calls,'build'),log:line=>logs.push(line)}),/child failed/);
  assert.equal(calls.length,1);assert.ok(!fs.existsSync(path.join(f.project,'.codex')));
  assert.ok(!logs.some(line=>line.includes('setup complete')));
});

test('missing child outputs cannot be reported as successful installation',t=>{
  const f=fixture(t),logs=[];
  assert.throws(()=>runSetup({...f,client:'codex',user:false},{npm:['npm',[]],dependenciesMissing:()=>false,
    run:()=>'',log:line=>logs.push(line)}),/Build did not produce/);
  assert.ok(!logs.some(line=>line.includes('setup complete')));
});

test('Antigravity merge preserves unrelated server/settings and never configures Codex',t=>{
  const f=fixture(t),calls=[];
  const config=path.join(f.project,'.gemini/config/mcp_config.json');
  fs.mkdirSync(path.dirname(config),{recursive:true});
  fs.writeFileSync(config,JSON.stringify({custom:true,mcpServers:{other:{url:'https://example.com'},aegis:{disabled:false,env:{KEEP:'yes'},url:'https://old'}}}));
  runSetup({...f,client:'antigravity',user:false},{npm:['npm',[]],dependenciesMissing:()=>false,run:fakeRunner(f.engine,calls),log:()=>{}});
  const value=JSON.parse(fs.readFileSync(config,'utf8'));
  assert.equal(value.custom,true);assert.equal(value.mcpServers.other.url,'https://example.com');
  assert.equal(value.mcpServers.aegis.cwd,f.project);assert.equal(value.mcpServers.aegis.env.KEEP,'yes');
  assert.equal(value.mcpServers.aegis.url,undefined);
  assert.deepEqual(value.mcpServers.aegis.args,[path.join(f.engine,'packages/cli/dist/bin/aegis.js'),'mcp']);
  assert.ok(!fs.existsSync(path.join(f.project,'.codex')));
  assert.ok(!calls.some(call=>call.args.includes('codex:setup')));
  const count=fs.readdirSync(path.dirname(config)).length;
  configureAntigravity(f.engine,f.project);
  assert.equal(fs.readdirSync(path.dirname(config)).length,count,'unchanged install should not create backups');
});

test('malformed Antigravity JSON is preserved before any configuration write',t=>{
  const f=fixture(t);const file=path.join(f.project,'.gemini/config/mcp_config.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'broken JSON');
  assert.throws(()=>configureAntigravity(f.engine,f.project));
  assert.equal(fs.readFileSync(file,'utf8'),'broken JSON');
  assert.ok(!fs.existsSync(path.join(f.project,'.gemini/settings.json')));
});

test('user shims preserve argument boundaries and route tw/tr aliases',t=>{
  const f=fixture(t),prefix=path.join(f.root,'user npm prefix');
  const files=installUserShims(f.engine,prefix);
  assert.ok(files.every(file=>fs.existsSync(file)));
  const tw=path.join(prefix,process.platform==='win32'?'tw.ps1':'bin/tw');
  const content=fs.readFileSync(tw,'utf8');
  assert.match(content,process.platform==='win32'?/'tw' @args/:/tw "\$@"/);
  const cli=path.join(f.engine,'packages/cli/dist/bin/aegis.js');
  fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(cli,'console.log(JSON.stringify(process.argv.slice(2)))');
  const args=['an objective with spaces','$(should-not-run)'];
  const output=process.platform==='win32'?
    cp.execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',tw,...args],{encoding:'utf8',windowsHide:true}):
    cp.execFileSync(tw,args,{encoding:'utf8'});
  assert.deepEqual(JSON.parse(output),['tw',...args]);
});

test('subprocess exit failures are propagated instead of converted into success',()=>{
  assert.throws(()=>runChild(process.execPath,['-e','process.exit(7)'],process.cwd(),true),/Setup step failed \(7\)/);
});

test('Antigravity user install adds CLI shims without installing Codex routing',t=>{
  const f=fixture(t),calls=[],prefix=path.join(f.root,'global prefix');
  const runner=fakeRunner(f.engine,calls);
  runSetup({...f,client:'antigravity',user:true},{npm:['npm',[]],dependenciesMissing:()=>false,
    run:(command,args,cwd)=>args.includes('prefix')?prefix:runner(command,args,cwd),log:()=>{}});
  assert.ok(!calls.some(call=>call.args.some(arg=>arg.endsWith('install-codex-commands.cjs'))));
  assert.ok(fs.existsSync(path.join(prefix,process.platform==='win32'?'aegis.cmd':'bin/aegis')));
  assert.ok(!fs.existsSync(path.join(f.project,'.codex')));
});

test('both clients keep their distinct skills and preserve custom project instructions',t=>{
  const f=fixture(t),calls=[];
  runSetup({...f,client:'both',user:false},{npm:['npm',[]],dependenciesMissing:()=>false,
    run:fakeRunner(f.engine,calls),log:()=>{}});
  assert.ok(fs.existsSync(path.join(f.project,'.agents/skills/aegis/SKILL.md')));
  assert.equal(fs.readFileSync(path.join(f.project,'.gemini/config/plugins/aegis/skills/aegis/SKILL.md'),'utf8'),'Aegis Antigravity Skill');
});

test('replacing an existing symlink shim never overwrites its CLI target',t=>{
  const f=fixture(t),prefix=path.join(f.root,'symlink prefix');
  const target=path.join(f.root,'old-cli.js');fs.writeFileSync(target,'preserve original CLI');
  const shim=path.join(prefix,'bin/aegis');fs.mkdirSync(path.dirname(shim),{recursive:true});
  try{fs.symlinkSync(target,shim,'file');}catch(error){if(error.code==='EPERM'){t.skip('file symlinks require platform permission');return;}throw error;}
  installUserShims(f.engine,prefix,'linux');
  assert.equal(fs.readFileSync(target,'utf8'),'preserve original CLI');
  assert.equal(fs.lstatSync(shim).isSymbolicLink(),false);
  const backup=fs.readdirSync(path.dirname(shim)).find(file=>file.startsWith('aegis.backup-'));
  assert.ok(backup);assert.equal(fs.lstatSync(path.join(path.dirname(shim),backup)).isSymbolicLink(),true);
});
