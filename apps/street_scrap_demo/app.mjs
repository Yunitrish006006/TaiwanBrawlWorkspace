import {initialState,apply,validState} from './model.mjs';
const $=s=>document.querySelector(s), KEY='street-scrap-art-demo-v1';
let state=initialState(),rules,pending=[],storage=true;
function status(message){$('#status').textContent=message+(storage?'':'（瀏覽器無法保存，目前只存於記憶體。）');}
function save(){try{localStorage.setItem(KEY,JSON.stringify({state,pending}));}catch{storage=false;}}
function tier(q){return q<40?'粗劣':q<70?'普通':q<90?'良好':'優良';}
const name=i=>rules.items.find(d=>d.id===i.type)?.name??'材料束';
function run(action){try{state=apply(state,action,rules);save();render();status('操作完成 · '+(storage?'已保存至此瀏覽器':'暫存於記憶體'));return true;}catch(e){status(e.message);return false;}}
function render(){
  const board=$('#board');board.replaceChildren();
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const cell=document.createElement('button');cell.className='cell';cell.style.gridArea=`${y+1} / ${x+1}`;cell.setAttribute('aria-label',`移到第 ${y+1} 列第 ${x+1} 格`);
    cell.onclick=()=>run({type:'move',x,y});cell.ondragover=e=>e.preventDefault();cell.ondrop=e=>{e.preventDefault();run({type:'move',x,y});};board.append(cell);
  }
  for(const i of state.items){
    const b=document.createElement('button');b.className='item'+(state.selected===i.id?' selected':'');b.style.gridArea=`${i.y+1} / ${i.x+1} / span ${i.h} / span ${i.w}`;b.draggable=true;
    b.setAttribute('aria-label',`${name(i)}，${i.origin}，${i.parts?'保留個別品質':tier(i.q)}，${i.w}乘${i.h}格`);b.setAttribute('aria-pressed',String(state.selected===i.id));
    b.onclick=()=>run({type:'select',id:i.id});b.ondragstart=e=>{state=apply(state,{type:'select',id:i.id},rules);e.dataTransfer.setData('text/plain',i.id);};
    const sprite=i.type==='wood.rod'?'rod':i.type==='wood.board'?(i.origin==='加工'?'crafted':'board'):i.type==='metal.nail_bundle'?'nails':i.parts?'bundle':i.type==='paper.scrap'?'paper':'cloth';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href',`/art.svg#${sprite}`);svg.append(use);
    if((sprite==='rod'||sprite==='bundle')&&i.w>i.h || (sprite==='board'||sprite==='crafted')&&i.h>i.w)svg.style.transform='rotate(90deg)';
    const label=document.createElement('span');label.textContent=name(i);const origin=document.createElement('span');origin.className='origin';origin.textContent=i.parts?'束':i.origin==='加工'?'作':'原';b.append(svg,label,origin);board.append(b);
  }
  $('#capacity').textContent=`${state.items.reduce((n,i)=>n+i.w*i.h,0)} / 16 格`;
  $('#energy').textContent=`體力 ${state.stamina} / 60`;
  $('#order-count').textContent=`${state.delivered} / 2`;
  $('#quick').disabled=!state.mastered;
  const i=state.items.find(i=>i.id===state.selected),panel=$('#inspection');panel.replaceChildren();
  const title=document.createElement('h3');title.textContent=i?name(i):'先選一件物品';panel.append(title);
  const p=document.createElement('p');p.textContent=i?`${i.origin} · ${i.parts?'各件品質保留，拆包後可用':tier(i.q)} · ${i.w} × ${i.h} 格`:'原生木板有完整木紋；加工木板保留接縫與釘點。用途相同，品質不同。';panel.append(p);
  if(i){const detail=document.createElement('small');detail.textContent=i.trait??(i.parts?i.parts.map(x=>tier(x.q)).join('／'):i.type==='wood.board'?'可交付同一木板委託。品質影響成品耐久；不改變占格。':'可旋轉、移動；加工需先備妥完整材料。');panel.append(detail);}
}
function progress(){
  document.querySelectorAll('[data-nail]').forEach(b=>b.disabled=pending.includes(Number(b.dataset.nail)));
  $('#craft-progress').textContent=pending.length?`已落釘 ${pending.length} / 3；離開後可接續，不退回材料承諾。`:'尚未落釘，取消不耗材料。';
  $('#cancel-craft').textContent=pending.length?'放棄並結算失手':'取消';
}
function finish(score){if(run({type:'craft',score})){pending=[];save();$('#craft-dialog').close();}}
$('#craft').onclick=()=>{try{apply(state,{type:'craft',score:2},rules);progress();$('#craft-dialog').showModal();}catch(e){status(e.message);}};
document.querySelectorAll('[data-nail]').forEach(b=>b.onclick=()=>{pending.push(Number(b.dataset.nail));save();progress();if(pending.length===3)finish(pending.filter((n,i)=>n===i+1).length);});
function cancel(){if(pending.length)finish(0);else $('#craft-dialog').close();}
$('#cancel-craft').onclick=cancel;$('#craft-dialog').addEventListener('cancel',e=>{e.preventDefault();cancel();});
$('#quick').onclick=()=>run({type:'craft',quick:true});
for(const type of ['rotate','pack','unpack','deliver'])$('#'+type).onclick=()=>run({type});
document.querySelectorAll('[data-collect]').forEach(b=>b.onclick=()=>run({type:'collect',item:b.dataset.collect}));
$('#reset').onclick=()=>{if(confirm('只清除這個美術 Demo 的練習進度，重新開始？')){state=initialState();pending=[];save();render();status('練習已重設。');}};
$('#contrast').onchange=e=>document.body.classList.toggle('contrast',e.target.checked);
$('#labels').onchange=e=>document.body.classList.toggle('hide-labels',!e.target.checked);
$('#large').onchange=e=>document.body.classList.toggle('large',e.target.checked);
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!$('#craft-dialog').open&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();run({type:'rotate'});}});
try{
  const response=await fetch('/design.json');if(!response.ok)throw Error('設計資料讀取失敗');rules=await response.json();
  let recovered=false;
  try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(!validState(saved.state))throw Error('無效存檔');state=saved.state;if(Array.isArray(saved.pending)&&saved.pending.length<=3&&new Set(saved.pending).size===saved.pending.length&&saved.pending.every(n=>[1,2,3].includes(n)))pending=saved.pending;else throw Error('無效操作進度');recovered=true;}}catch{status('無法讀取舊練習進度，已使用初始背包。');state=initialState();pending=[];}
  render();status(recovered?'已恢復這個瀏覽器的練習進度。':'Demo 已就緒。先選拾得木板查看，或試著把紙屑打包。');
  if(pending.length===3)finish(pending.filter((n,i)=>n===i+1).length);else if(pending.length){progress();$('#craft-dialog').showModal();}
}catch(e){status('無法啟動：'+e.message+'。請確認本機預覽伺服器仍在運作。');document.querySelectorAll('button').forEach(b=>b.disabled=true);}
