import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDesign } from '../../../taiwan_brawl_front/packages/games/street_scrap/tool/audit-street-scrap-design.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const allowed=new Set(['index.html','style.css','app.mjs','model.mjs','art.svg','street.svg','preview.html']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/design.json') {const {spec,recipes}=loadDesign();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...spec,recipes}));return;}
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(name)]);res.end(fs.readFileSync(path.join(root,name)));
}).listen(8093,'127.0.0.1',()=>console.log('Street Scrap pixel-art demo: http://127.0.0.1:8093'));
