export const VERSION = 1;
export function initialState() {
  return { version: VERSION, revision: 0, stamina: 60, delivered: 0, mastered: false, nextId: 20, selected: null, items: [
    { id: '1', type: 'wood.rod', x: 0, y: 0, w: 1, h: 2, q: 55, origin: '加工' },
    { id: '2', type: 'wood.rod', x: 1, y: 0, w: 1, h: 2, q: 55, origin: '加工' },
    { id: '3', type: 'wood.rod', x: 2, y: 0, w: 1, h: 2, q: 55, origin: '加工' },
    { id: '4', type: 'metal.nail_bundle', x: 3, y: 0, w: 1, h: 1, q: 55, origin: '拾得' },
    ...[0, 1, 2, 3].map((x, i) => ({ id: String(5+i), type: 'paper.scrap', x, y: 2, w: 1, h: 1, q: 30+i*10, origin: '拾得' })),
    { id: '9', type: 'wood.board', x: 0, y: 3, w: 2, h: 1, q: 80, origin: '拾得' },
    { id: '10', type: 'cloth.rag_piece', x: 3, y: 1, w: 1, h: 1, q: 55, origin: '拾得' },
  ] };
}
export function fits(items, candidate, ignore = null) {
  const { x,y,w,h } = candidate;
  if (![x,y,w,h].every(Number.isInteger) || w<1 || h<1 || x<0 || y<0 || x+w>4 || y+h>4) return false;
  return !items.some(i => i.id !== ignore && x < i.x+i.w && x+w > i.x && y < i.y+i.h && y+h > i.y);
}
export function place(items, item) {
  for(const [w,h] of [[item.w,item.h],[item.h,item.w]]) for(let y=0;y<=4-h;y++) for(let x=0;x<=4-w;x++) {
    const candidate={...item,x,y,w,h}; if(fits(items,candidate)) {items.push(candidate); return candidate;}
  }
  throw Error('沒有連續空間，請先移動或旋轉物件。');
}
export function apply(state, action, rules) {
  const s=structuredClone(state);
  const selected=()=>{const i=s.items.find(i=>i.id===s.selected);if(!i)throw Error('請先選一件物品。');return i;};
  if(action.type==='select') s.selected=action.id;
  else if(action.type==='move') {const i=selected(), n={...i,x:action.x,y:action.y};if(!fits(s.items,n,i.id))throw Error('這裡放不下。原物件不會被移動。');Object.assign(i,n);}
  else if(action.type==='rotate') {const i=selected(),n={...i,w:i.h,h:i.w};if(!fits(s.items,n,i.id))throw Error('旋轉後超出邊界或碰到物件。請先換位置。');Object.assign(i,n);}
  else if(action.type==='pack') {
    const bundle=rules.bundles.find(b=>b.input==='paper.scrap');
    const parts=s.items.filter(i=>i.type===bundle.input).slice(0,bundle.count);
    if(parts.length!==bundle.count)throw Error(`需要 ${bundle.count} 張未打包的紙屑。`);
    s.items=s.items.filter(i=>!parts.includes(i));
    const b=place(s.items,{id:String(s.nextId++),type:bundle.output,w:1,h:2,q:0,origin:'收納',parts});s.selected=b.id;
  } else if(action.type==='unpack') {
    const b=selected();if(!b.parts)throw Error('請先選材料束。');s.items=s.items.filter(i=>i.id!==b.id);
    for(const part of b.parts)place(s.items,part);s.selected=null;
  } else if(action.type==='craft') {
    if(action.quick&&!s.mastered)throw Error('先手動完成一次，才能快速製作。');
    const recipe=rules.recipes.find(r=>r.id==='ss.recipe.nail_board');
    const policy=rules.recipePolicies.find(p=>p.id===recipe.id);
    const chosen=[];
    for(const input of recipe.inputGroups[0]) {
      const found=s.items.filter(i=>i.type===input.item&&!i.parts).slice(0,input.quantity);
      if(found.length!==input.quantity)throw Error('缺少材料：需要木條 3、釘件束 1。材料束必須先手動拆包。');chosen.push(...found);
    }
    const main=chosen.filter(i=>policy.primaryInputs.includes(i.type));
    const score=action.quick?2:action.score;
    if(![0,1,2,3].includes(score))throw Error('無效操作結果。');
    const q=Math.max(0,Math.min(100,Math.round(main.reduce((a,i)=>a+i.q,0)/main.length-policy.qualityLoss+(score===3?8:score>=2?0:-10))));
    s.items=s.items.filter(i=>!chosen.includes(i));
    const item=place(s.items,{id:String(s.nextId++),type:'wood.board',w:1,h:2,q,origin:'加工',trait:score===3?'釘固加強 · 支撐 +10%':score<2?'釘固偏斜 · 耐久 −10%':null});s.selected=item.id;s.mastered=true;
  } else if(action.type==='collect') {
    if(!['paper.scrap','metal.nail_bundle'].includes(action.item))throw Error('此來源未在 demo 開放。');
    const source=rules.supplies.find(i=>i.item===action.item);
    if(!source)throw Error('此來源未在 demo 開放。');if(s.stamina<source.stamina)throw Error('示範體力不足；可重設練習。');
    const def=rules.items.find(i=>i.id===action.item);
    for(let n=0;n<source.quantity;n++)place(s.items,{id:String(s.nextId++),type:action.item,w:def.footprint[0],h:def.footprint[1],q:55,origin:'拾得'});
    s.stamina-=source.stamina;
  } else if(action.type==='deliver') {
    const i=selected();if(i.type!=='wood.board')throw Error('請選取一塊木板；拾得或加工都接受。');
    if(s.delivered>=2)throw Error('示範委託已完成，可以重設練習。');s.items=s.items.filter(x=>x.id!==i.id);s.selected=null;s.delivered++;
  } else throw Error('未知操作');
  s.revision++;return s;
}
export function validState(s) {
  if(!s||s.version!==VERSION||!Array.isArray(s.items)||s.items.length>16||!Number.isSafeInteger(s.nextId)||s.nextId<20||!Number.isSafeInteger(s.revision)||s.revision<0||typeof s.mastered!=='boolean'||!Number.isFinite(s.stamina)||s.stamina<0||s.stamina>60||![0,1,2].includes(s.delivered))return false;
  const ids=new Set();
  const shapes={'wood.rod':2,'wood.board':2,'metal.nail_bundle':1,'paper.scrap':1,'cloth.rag_piece':1,'bundle.paper_scrap':2};
  const check=i=>i&&typeof i.id==='string'&&/^\d+$/.test(i.id)&&Number(i.id)<s.nextId&&!ids.has(i.id)&&Number.isFinite(i.q)&&i.q>=0&&i.q<=100&&['加工','拾得','收納'].includes(i.origin);
  for(const item of s.items){
    if(!check(item)||!fits(s.items,item,item.id)||!Object.hasOwn(shapes,item.type)||item.w*item.h!==shapes[item.type])return false;ids.add(item.id);
    if(item.type==='bundle.paper_scrap'){
      if(!Array.isArray(item.parts)||item.parts.length!==4)return false;
      for(const p of item.parts){if(!check(p)||p.type!=='paper.scrap'||p.parts||p.w!==1||p.h!==1)return false;ids.add(p.id);}
    }else if(item.parts)return false;
  }
  return s.selected===null||s.items.some(i=>i.id===s.selected);
}
