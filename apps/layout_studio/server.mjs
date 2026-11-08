import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const files=new Map([
  ['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/app.mjs','app.mjs'],['/layout_schema.mjs','layout_schema.mjs'],['/layout_state.mjs','layout_state.mjs'],['/layout_import.mjs','layout_import.mjs'],
]);
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const port=Number(process.env.LAYOUT_STUDIO_PORT??9080);
http.createServer(async(req,res)=>{
  const url=new URL(req.url??'/',`http://127.0.0.1:${port}`);
  const name=files.get(url.pathname);
  if(!name){res.writeHead(404);res.end('Not found');return}
  try{const body=await readFile(join(root,name));res.writeHead(200,{'Content-Type':contentTypes[name.slice(name.lastIndexOf('.'))],'Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(500);res.end('Unable to load layout studio')}
}).listen(port,'127.0.0.1',()=>console.log(`Layout Studio: http://127.0.0.1:${port}`));
