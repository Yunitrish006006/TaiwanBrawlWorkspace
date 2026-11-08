const viewports={phone:[390,844],compact:[320,600],tablet:[768,1024],desktop:[1280,800]};
const componentTypes=new Set(['header','stats','category','material','action','nav','section']);
const relationTypes=new Set(['below','above','left','right','inside','align']);
const colorPattern=/^#[0-9a-fA-F]{6}$/;
const themeColors={
  pixel:{bg:'#26332b',surface:'#35483a',accent:'#d6bd80',text:'#ece9d9'},
  paper:{bg:'#d9cfb6',surface:'#eee5d2',accent:'#a76145',text:'#302b25'},
  night:{bg:'#161d20',surface:'#273338',accent:'#79a5a2',text:'#e4ece7'},
};

function validColor(value,label){
  if(typeof value!=='string'||!colorPattern.test(value))throw new Error(`${label} 顏色格式錯誤`);
  return value.toLowerCase();
}

export function parseLayoutSpec(source){
  if(typeof source!=='string'||source.length>1_000_000)throw new Error('版面規格超過可讀取大小');
  let input;
  try{input=JSON.parse(source)}catch{throw new Error('檔案不是有效的 JSON')}
  if(!input||input.schemaVersion!==1||input.project!=='street-scrap-ui-layout')throw new Error('不支援這個版面規格版本');
  if(!['sketch','visual'].includes(input.stage))throw new Error('設計階段資料無效');
  if(typeof input.viewport!=='string'||!viewports[input.viewport])throw new Error('預覽尺寸資料無效');
  if(input.theme!==undefined&&!['pixel','paper','night','custom'].includes(input.theme))throw new Error('整體風格資料無效');
  if(typeof input.screenName!=='string'||input.screenName.length>80)throw new Error('畫面名稱資料無效');
  if(!input.colors||typeof input.colors!=='object')throw new Error('整體配色資料無效');
  const baseColors={bg:validColor(input.colors.bg,'畫布'),surface:validColor(input.colors.surface,'面板'),accent:validColor(input.colors.accent,'強調')};
  const matchedTheme=Object.entries(themeColors).find(([,palette])=>
    palette.bg===baseColors.bg&&palette.surface===baseColors.surface&&palette.accent===baseColors.accent,
  )?.[0];
  const theme=input.theme??matchedTheme??'custom';
  const colors={...baseColors,text:input.colors.text===undefined
    ?themeColors[theme]?.text??themeColors.pixel.text
    :validColor(input.colors.text,'文字')};
  if(!Array.isArray(input.components)||input.components.length>80)throw new Error('元件清單無效或超過80個');
  const [screenWidth,screenHeight]=viewports[input.viewport],ids=new Set();
  const components=input.components.map((item,index)=>{
    const label=`第 ${index+1} 個元件`;
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||item.id.length>80||ids.has(item.id))throw new Error(`${label}識別碼無效或重複`);
    ids.add(item.id);
    if(!componentTypes.has(item.type))throw new Error(`${label}類型不支援`);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>32)throw new Error(`${label}名稱無效`);
    const numbers=['x','y','w','h'];
    for(const key of numbers)if(!Number.isSafeInteger(item[key]))throw new Error(`${label}的${key.toUpperCase()}必須是整數`);
    if(item.x<0||item.y<0||item.w<32||item.h<24||item.x+item.w>screenWidth||item.y+item.h>screenHeight)throw new Error(`${label}超出預覽畫布範圍`);
    if(typeof item.text!=='string'||item.text.length>120)throw new Error(`${label}文字無效`);
    const relation=item.relation??null;
    if(relation!==null&&(typeof relation!=='object'||typeof relation.targetId!=='string'||!relationTypes.has(relation.type)))throw new Error(`${label}相對關係無效`);
    const style=item.style??{};
    if(!style||typeof style!=='object'||Array.isArray(style))throw new Error(`${label}外觀資料無效`);
    const cleanStyle={};
    for(const [key,labelText] of [['background','底色'],['text','文字色'],['accent','強調色']])if(style[key]!==undefined)cleanStyle[key]=validColor(style[key],`${label}${labelText}`);
    if(style.radius!==undefined){if(!Number.isInteger(style.radius)||style.radius<0||style.radius>28)throw new Error(`${label}圓角資料無效`);cleanStyle.radius=style.radius}
    if(style.fontSize!==undefined){if(!Number.isInteger(style.fontSize)||style.fontSize<12||style.fontSize>28)throw new Error(`${label}字級資料無效`);cleanStyle.fontSize=style.fontSize}
    return {id:item.id,type:item.type,name:item.name.trim(),x:item.x,y:item.y,w:item.w,h:item.h,text:item.text,relation:relation?{targetId:relation.targetId,type:relation.type}:null,style:cleanStyle};
  });
  for(const item of components)if(item.relation&&(!ids.has(item.relation.targetId)||item.relation.targetId===item.id))throw new Error(`${item.name}的相對關係指向不存在或自身元件`);
  return {schemaVersion:1,project:'street-scrap-ui-layout',stage:input.stage,screenName:input.screenName,viewport:input.viewport,theme,colors,components};
}

export function inspectLayoutIssues(layout){
  const components=Array.isArray(layout?.components)?layout.components:[];
  const byId=new Map(components.map(component=>[component.id,component]));
  const issues=[];
  const relationLabels={below:'下方',above:'上方',left:'左側',right:'右側',inside:'包含於'};
  for(const component of components){
    const relation=component.relation;
    const target=relation?byId.get(relation.targetId):null;
    if(!target)continue;
    const outside={
      below:component.y<target.y+target.h,
      above:component.y+component.h>target.y,
      left:component.x+component.w>target.x,
      right:component.x<target.x+target.w,
      inside:component.x<target.x||component.y<target.y||component.x+component.w>target.x+target.w||component.y+component.h>target.y+target.h,
    }[relation.type];
    if(outside)issues.push({message:`「${component.name}」的座標不符合「${target.name}」的「${relationLabels[relation.type]}」關係。`,componentIds:[component.id,target.id]});
  }
  for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++){
    const a=components[i],b=components[j];
    const width=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
    const height=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    if(width<=0||height<=0)continue;
    const intentionalInside=(a.relation?.targetId===b.id&&a.relation.type==='inside'&&width===a.w&&height===a.h)||
      (b.relation?.targetId===a.id&&b.relation.type==='inside'&&width===b.w&&height===b.h);
    if(!intentionalInside)issues.push({message:`「${a.name}」與「${b.name}」重疊 ${width} × ${height} px。`,componentIds:[a.id,b.id]});
  }
  return issues;
}

export function inspectLayout(layout){return inspectLayoutIssues(layout).map(issue=>issue.message)}
