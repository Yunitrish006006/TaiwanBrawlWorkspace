import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectLayout, inspectLayoutIssues, parseLayoutSpec } from '../apps/layout_studio/layout_schema.mjs';
import {
  importAndPersistLayout,
  layoutStorageKey,
} from '../apps/layout_studio/layout_import.mjs';
import {
  parseLayoutEditorState,
  serializeLayoutEditorState,
} from '../apps/layout_studio/layout_state.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath=join(root,'apps/layout_studio/server.mjs');

async function freePort(){
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

test('layout studio serves its two-stage editor locally and rejects unknown paths',async t=>{
  const port=await freePort();
  const child=spawn(process.execPath,[serverPath],{cwd:root,env:{...process.env,LAYOUT_STUDIO_PORT:String(port)},stdio:'ignore'});
  t.after(()=>child.kill('SIGTERM'));
  let response;
  for(let attempt=0;attempt<30;attempt++){
    try{response=await fetch(`http://127.0.0.1:${port}/`);break}catch{await new Promise(resolve=>setTimeout(resolve,50))}
  }
  assert.ok(response?.ok,'local editor server should start');
  const html=await response.text();
  assert.match(html,/01　草圖/);
  assert.match(html,/02　視覺細化/);
  const app=await fetch(`http://127.0.0.1:${port}/app.mjs`);
  const appText=await app.text();
  assert.match(appText,/street-scrap-layout\.json/);
  assert.match(appText,/inspectLayoutIssues/);
  assert.match(appText,/選取元件：/);
  assert.match(appText,/setProperty\('\-\-accent'/);
  const css=await fetch(`http://127.0.0.1:${port}/style.css`);
  assert.match(await css.text(),/var\(--widget-accent/);
  const schema=await fetch(`http://127.0.0.1:${port}/layout_schema.mjs`);
  assert.match(await schema.text(),/parseLayoutSpec/);
  const state=await fetch(`http://127.0.0.1:${port}/layout_state.mjs`);
  assert.match(await state.text(),/serializeLayoutEditorState/);
  const importer=await fetch(`http://127.0.0.1:${port}/layout_import.mjs`);
  assert.equal(importer.status,200);
  assert.match(await importer.text(),/importAndPersistLayout/);
  const htmlButton=await fetch(`http://127.0.0.1:${port}/`);
  const buttonHtml=await htmlButton.text();
  assert.match(buttonHtml,/id="importButton"/);
  assert.match(buttonHtml,/id="layoutWarnings"/);
  const missing=await fetch(`http://127.0.0.1:${port}/private-file`);
  assert.equal(missing.status,404);
});

test('saved layouts retain the selected design stage and migrate older saves',()=>{
  const parsed=parseLayoutSpec(validLayout());
  const {stage: _stage,...design}=parsed;
  for(const stage of ['sketch','visual']){
    const restored=parseLayoutEditorState(serializeLayoutEditorState(design,stage));
    assert.equal(restored.stage,stage);
    assert.deepEqual(restored.design,design);
  }
  assert.equal(parseLayoutEditorState(JSON.stringify(design)).stage,'sketch');
  assert.equal(parseLayoutEditorState('{broken'),null);
  assert.throws(()=>serializeLayoutEditorState(design,'unknown'),/stage/);
});

test('successful layout imports are persisted immediately without saving invalid data',()=>{
  const values=new Map();
  const storage={setItem:(key,value)=>values.set(key,value)};
  const imported=importAndPersistLayout(validLayout(),storage);
  assert.equal(imported.stage,'sketch');
  assert.equal(imported.design.viewport,'phone');
  assert.equal(imported.design.components.length,2);
  assert.deepEqual(
    parseLayoutEditorState(values.get(layoutStorageKey)),
    {design:imported.design,stage:'sketch'},
  );

  const previous=values.get(layoutStorageKey);
  assert.throws(()=>importAndPersistLayout('{invalid json',storage),/有效的 JSON/);
  assert.equal(values.get(layoutStorageKey),previous);
});

function validLayout(){
  return JSON.stringify({schemaVersion:1,project:'street-scrap-ui-layout',stage:'sketch',screenName:'素材圖鑑',viewport:'phone',theme:'pixel',colors:{bg:'#26332b',surface:'#35483a',accent:'#d6bd80'},components:[
    {id:'header',type:'header',name:'標題',x:0,y:0,w:390,h:64,text:'街角拾荒',relation:null,style:{}},
    {id:'material',type:'material',name:'素材卡',x:16,y:80,w:358,h:438,text:'大圖',relation:{targetId:'header',type:'below'},style:{accent:'#ff0000',radius:8}},
  ]});
}

test('layout import accepts valid components and preserves relations and style',()=>{
  const layout=parseLayoutSpec(validLayout());
  assert.equal(layout.components.length,2);
  assert.equal(layout.components[1].relation.targetId,'header');
  assert.equal(layout.components[1].style.accent,'#ff0000');
});

test('layout import infers omitted theme and preserves the supplied text color',()=>{
  const input=JSON.parse(validLayout());
  delete input.theme;
  input.colors.text='#ece9d9';
  const layout=parseLayoutSpec(JSON.stringify(input));
  assert.equal(layout.theme,'pixel');
  assert.equal(layout.colors.text,'#ece9d9');

  input.colors.bg='#112233';
  input.colors.surface='#223344';
  input.colors.accent='#d6bd80';
  input.colors.text='#f0e0d0';
  const custom=parseLayoutSpec(JSON.stringify(input));
  assert.equal(custom.theme,'custom');
  assert.equal(custom.colors.text,'#f0e0d0');
});

test('layout import rejects unsupported versions, invalid geometry, and dangling relations',()=>{
  assert.throws(()=>parseLayoutSpec('{bad json'),/有效的 JSON/);
  assert.throws(()=>parseLayoutSpec(JSON.stringify({...JSON.parse(validLayout()),schemaVersion:2})),/不支援/);
  const outside=JSON.parse(validLayout());outside.components[1].x=40;
  assert.throws(()=>parseLayoutSpec(JSON.stringify(outside)),/超出預覽畫布範圍/);
  const dangling=JSON.parse(validLayout());dangling.components[1].relation.targetId='missing';
  assert.throws(()=>parseLayoutSpec(JSON.stringify(dangling)),/不存在/);
  const unknownTheme=JSON.parse(validLayout());unknownTheme.theme='script';
  assert.throws(()=>parseLayoutSpec(JSON.stringify(unknownTheme)),/風格資料無效/);
  assert.throws(()=>parseLayoutSpec(' '.repeat(1_000_001)),/可讀取大小/);
});

test('layout diagnostics report spatial contradictions and overlaps without rejecting import',()=>{
  const layout=parseLayoutSpec(JSON.stringify({
    ...JSON.parse(validLayout()),
    components:[
      {id:'card',type:'material',name:'素材卡',x:16,y:80,w:200,h:200,text:'大圖',relation:null,style:{}},
      {id:'button',type:'action',name:'操作按鈕',x:20,y:300,w:80,h:32,text:'開始',relation:{targetId:'card',type:'inside'},style:{}},
      {id:'nav',type:'nav',name:'底部導覽',x:16,y:331,w:200,h:48,text:'導覽',relation:null,style:{}},
    ],
  }));
  const warnings=inspectLayout(layout);
  assert.equal(warnings.length,2);
  assert.match(warnings[0],/操作按鈕.*素材卡.*包含於.*關係/);
  assert.match(warnings[1],/操作按鈕.*底部導覽.*重疊 80 × 1 px/);
  assert.deepEqual(inspectLayoutIssues(layout).map(issue=>issue.componentIds),[['button','card'],['button','nav']]);
  assert.equal(layout.components.length,3,'diagnostics must not reject or remove imported components');
});

test('layout diagnostics accept a contained child and consistent spatial relations',()=>{
  const layout=JSON.parse(validLayout());
  layout.components=[
    {id:'card',type:'material',name:'素材卡',x:16,y:80,w:200,h:200,text:'大圖',relation:null,style:{}},
    {id:'button',type:'action',name:'操作按鈕',x:24,y:100,w:80,h:32,text:'開始',relation:{targetId:'card',type:'inside'},style:{}},
    {id:'nav',type:'nav',name:'底部導覽',x:16,y:288,w:200,h:48,text:'導覽',relation:{targetId:'card',type:'below'},style:{}},
  ];
  assert.deepEqual(inspectLayout(parseLayoutSpec(JSON.stringify(layout))),[]);
});
