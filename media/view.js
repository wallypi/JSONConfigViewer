'use strict';
const vscode=acquireVsCodeApi();const savedUiState=vscode.getState()||{};
let current=null,selected=[],version=-1,language='yaml',expanded=new Set(['[]']),dirty=false,collapsedSections=new Set(),comments={},schema=null,schemaSource=null,schemaManual=false;
let showDescriptions=savedUiState.showDescriptions!==false;
const $=id=>document.getElementById(id), pid=p=>JSON.stringify(p), scalar=v=>v===null||['string','number','boolean'].includes(typeof v), typeOf=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const get=(obj,path)=>path.reduce((a,k)=>a?.[k],obj);
const titleCase=s=>String(s).replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const humanize=s=>titleCase(s).replace(/\bAi\b/g,'AI').replace(/\bApi\b/g,'API').replace(/\bId\b/g,'ID').replace(/\bUrl\b/g,'URL').replace(/\bBaw\b/g,'BAW').replace(/\bMcp\b/g,'MCP');
const INLINE_DEPTH=3;
function schemaAt(path){
 function resolve(node,seen=new Set()){
  if(!node||typeof node!=='object')return null;
  if(node.$ref&&typeof node.$ref==='string'&&node.$ref.startsWith('#/')){
   if(seen.has(node.$ref))return node;
   const target=node.$ref.slice(2).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))
    .reduce((v,k)=>v&&v[k],schema);
   if(target)return {...resolve(target,new Set([...seen,node.$ref])),...node,$ref:undefined};
  }
  if(Array.isArray(node.allOf)){
   const parts=node.allOf.map(x=>resolve(x,seen)).filter(Boolean);
   return {...parts.reduce((acc,p)=>({...acc,...p,properties:{...(acc.properties||{}),...(p.properties||{})},'x-ui':{...(acc['x-ui']||{}),...(p['x-ui']||{})}}),{}),...node};
  }
  return node;
 }
 let node=resolve(schema);
 for(const part of path){
  if(!node)return null;
  if(node.type==='array'||node.items&&/^\d+$/.test(String(part))){node=resolve(node.items);continue;}
  if(node.properties&&Object.prototype.hasOwnProperty.call(node.properties,part)){
   node=resolve(node.properties[part]);continue;
  }
  if(node.patternProperties){
   const entry=Object.entries(node.patternProperties).find(([pattern])=>{try{return new RegExp(pattern).test(String(part));}catch{return false;}});
   if(entry){node=resolve(entry[1]);continue;}
  }
  node=null;
 }
 return resolve(node);
}
function fieldMeta(path,key){
 const sc=schemaAt(path);
 return {title:sc?.title||humanize(key),description:sc?.description||'',comment:comments[pid(path)]||'',schema:sc};
}
function addFieldHelp(label,path,key){
 const m=fieldMeta(path,key);label.textContent=m.title;
 return m;
}

function descriptionText(path,key){
 const m=fieldMeta(path,key);
 return [m.description,m.comment].filter(Boolean).join('\n\n');
}
function descriptionNode(path,key){
 if(!showDescriptions)return null;
 const txt=descriptionText(path,key);
 if(!txt)return null;
 const d=document.createElement('div');d.className='field-description';d.textContent=txt;return d;
}
function attachDescription(row,path,key){
 const d=descriptionNode(path,key);if(d)row.append(d);
}

function displayName(obj,index){
 if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
  for(const k of ['name','title','id','key','type'])if(scalar(obj[k])&&obj[k]!==null&&String(obj[k]).trim())return String(obj[k]);
 }
 const n=Number(index);
 return Number.isInteger(n)&&String(index).trim()!==''?`Item ${n+1}`:humanize(index);
}
function pathDisplayName(path){
 if(!path.length)return 'Configuration';
 const parent=get(current,path.slice(0,-1)),key=path.at(-1),value=get(current,path);
 return Array.isArray(parent)?displayName(value,key):fieldMeta(path,key).title;
}
function treeLabel(parent,key,value){return Array.isArray(parent)?displayName(value,key):key;}function preview(v){if(v===null)return 'null';if(typeof v==='boolean')return v?'true':'false';return String(v).replace(/\s+/g,' ').slice(0,34);}
function searchNode(label,v,q){if(String(label).toLowerCase().includes(q))return true;if(v&&typeof v==='object')return Object.entries(v).some(([k,b])=>searchNode(treeLabel(v,k,b),b,q));return preview(v).toLowerCase().includes(q);}
function treeNode(label,value,path,depth,filter){const nested=value!==null&&typeof value==='object', children=nested?Object.entries(value):[], matches=String(label).toLowerCase().includes(filter)||(!nested&&preview(value).toLowerCase().includes(filter)), descendants=filter&&nested&&children.some(([k,v])=>searchNode(treeLabel(value,k,v),v,filter));if(filter&&!matches&&!descendants)return null;const wrap=document.createElement('div'),btn=document.createElement('button');btn.className='node'+(pid(path)===pid(selected)?' active':'');btn.style.paddingLeft=(6+depth*13)+'px';const open=expanded.has(pid(path))||Boolean(filter);const caret=nested?(open?'⌄':'›'):' ';btn.innerHTML=`<span class="caret">${caret}</span><span class="node-label"></span>${nested?`<span class="count">${Array.isArray(value)?value.length:Object.keys(value).length}</span>`:`<span class="preview"></span>`}`;btn.querySelector('.node-label').textContent=label;if(!nested)btn.querySelector('.preview').textContent=preview(value);btn.onclick=()=>{if(nested){open?expanded.delete(pid(path)):expanded.add(pid(path));}selected=path;render();};wrap.append(btn);if(nested&&open){const box=document.createElement('div');for(const [k,v] of children){const n=treeNode(treeLabel(value,k,v),v,[...path,k],depth+1,filter);if(n)box.append(n);}wrap.append(box);}return wrap;}
function breadcrumb(){const b=$('breadcrumb');b.replaceChildren();const paths=[[]];for(let i=0;i<selected.length;i++)paths.push(selected.slice(0,i+1));paths.forEach((p,i)=>{if(i){const sep=document.createElement('span');sep.textContent='›';sep.className='crumb-sep';b.append(sep);}const x=document.createElement('button');x.textContent=i===0?'Configuration':pathDisplayName(p);x.onclick=()=>{selected=p;render();};b.append(x);});}
function scalarInput(parent,key,v,base){
 const kind=typeOf(v),fieldPath=(parent===null&&key==='value'&&base.length)?base:[...base,key],sc=schemaAt(fieldPath);
 let input;
 if(Array.isArray(sc?.enum)&&sc.enum.every(x=>scalar(x))){
  input=document.createElement('select');
  sc.enum.forEach(option=>{const o=document.createElement('option');o.value=JSON.stringify(option);o.textContent=String(option);if(option===v)o.selected=true;input.append(o);});
 }else{
  const ui=sc?.['x-ui']||{};
  const multiline=kind==='string'&&(ui.widget==='textarea'||(ui.widget!=='password'&&ui.widget!=='text'&&ui.widget!=='input'&&String(v).includes('\n')));
  if(multiline){
   input=document.createElement('textarea');input.className='configview-textarea';
   const rows=Number(ui.rows);input.rows=Number.isInteger(rows)&&rows>=2&&rows<=40?rows:Math.min(12,Math.max(3,String(v).split('\n').length+1));
   input.value=String(v);
  }else{
   input=document.createElement('input');input.type=kind==='boolean'?'checkbox':kind==='number'?'number':(kind==='string'&&ui.widget==='password'?'password':'text');
   if(kind==='number'){input.step=sc?.multipleOf||'any';if(Number.isFinite(sc?.minimum))input.min=sc.minimum;if(Number.isFinite(sc?.maximum))input.max=sc.maximum;}
   if(kind==='boolean')input.checked=v;else input.value=v===null?'null':String(v);input.disabled=kind==='null';
  }
  if(kind==='string'){
   if(typeof ui.placeholder==='string')input.placeholder=ui.placeholder;
   if(Number.isInteger(sc?.maxLength)&&sc.maxLength>=0)input.maxLength=sc.maxLength;
   if(Number.isInteger(sc?.minLength)&&sc.minLength>=0)input.minLength=sc.minLength;
  }
  if(ui.readOnly===true)input.disabled=true;
 }
 const commit=()=>{
  let next;
  if(input.tagName==='SELECT')next=JSON.parse(input.value);
  else next=kind==='boolean'?input.checked:kind==='number'?Number(input.value):input.value;
  if(kind==='number'&&input.tagName!=='SELECT'&&(!input.value.trim()||!Number.isFinite(next))){$('status').textContent='Invalid number';return;}
  if(next===v)return;input.disabled=true;vscode.postMessage({type:'edit',path:fieldPath,value:next,version});
 };
 input.addEventListener('change',commit);return input;
}
function defaultListValue(list){if(!list.length)return '';const v=list[0];if(typeof v==='string')return '';if(typeof v==='number')return 0;if(typeof v==='boolean')return false;if(Array.isArray(v))return [];if(v&&typeof v==='object')return {};return '';}
function renderList(list){
 const form=$('form'),allScalar=list.every(scalar);
 const head=document.createElement('div');head.className='list-summary';
 const summary=document.createElement('span');summary.textContent=`${list.length} ${list.length===1?'item':'items'}`;
 const actions=document.createElement('div');actions.className='list-actions';
 if(!allScalar){const hint=document.createElement('span');hint.className='hint';hint.textContent='Select an item to edit';actions.append(hint);}
 const add=document.createElement('button');add.className='add-item';add.textContent='+ Add item';add.title='Add a new item to this list';
 add.onclick=()=>vscode.postMessage({type:'addItem',path:selected,value:defaultListValue(list),version});
 actions.append(add);head.append(summary,actions);form.append(head);
 if(!list.length){const e=document.createElement('div');e.className='empty-card';e.textContent='This list is empty. Add an item to start.';form.append(e);return;}

 list.forEach((v,i)=>{
  const row=document.createElement('div');row.className='list-row'+(allScalar?' scalar-edit-row':'');
  const itemPath=[...selected,String(i)];
  if(allScalar){
   const idx=document.createElement('span');idx.className='list-index';idx.textContent=String(i+1);
   let input;
   if(typeof v==='boolean'){
    input=document.createElement('input');input.type='checkbox';input.checked=v;
    input.onchange=()=>sendEdit(itemPath,input.checked);
   }else{
    input=document.createElement('input');input.className='list-inline-input';
    input.type=typeof v==='number'?'number':'text';input.value=v??'';
    const commit=()=>{let nv=input.value;if(typeof v==='number'){nv=Number(nv);if(Number.isNaN(nv))return;}if(nv!==v)sendEdit(itemPath,nv);};
    input.onchange=commit;
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}if(e.key==='Escape'){input.value=v??'';input.blur();}};
   }
   const del=document.createElement('button');del.className='delete';del.textContent='×';del.title=`Remove item ${i+1}`;
   del.onclick=()=>vscode.postMessage({type:'deleteItem',path:itemPath,version});
   row.append(idx,input,del);
  }else{
   const main=document.createElement('button');main.className='list-main';
   const name=displayName(v,i);const detail=Array.isArray(v)?`${v.length} items`:`${Object.keys(v).length} fields`;
   main.innerHTML='<span class="list-name"></span><span class="list-detail"></span><span class="chevron">›</span>';
   main.querySelector('.list-name').textContent=name;main.querySelector('.list-detail').textContent=detail;
   main.onclick=()=>{selected=itemPath;expanded.add(pid(selected));render();};
   const del=document.createElement('button');del.className='delete';del.textContent='×';del.title=`Remove ${name}`;
   del.onclick=e=>{e.stopPropagation();vscode.postMessage({type:'deleteItem',path:itemPath,version});};
   row.append(main,del);
  }
  form.append(row);
 });
}
function scalarRow(key,v,path,indent){
 const row=document.createElement('div');row.className='field';row.style.paddingLeft=(indent*10)+'px';
 const name=document.createElement('label');addFieldHelp(name,path,key);row.append(name);
 const cell=document.createElement('div');cell.className='value';
 cell.append(scalarInput(null,key,v,path.slice(0,-1)));row.append(cell);attachDescription(row,path,key);return row;
}
function navigateRow(key,v,path,indent){
 const row=document.createElement('div');row.className='field';row.style.paddingLeft=(indent*10)+'px';
 const name=document.createElement('label');addFieldHelp(name,path,key);row.append(name);
 const cell=document.createElement('div');cell.className='value';const b=document.createElement('button');b.className='navigate';
 const isList=Array.isArray(v);b.innerHTML='<span>'+(isList?'List':'Object')+'</span><span class="subtle">'+(isList?v.length:Object.keys(v).length)+' '+(isList?'items':'fields')+'</span><span>›</span>';
 b.onclick=()=>{selected=path;expanded.add(pid(path));render();};cell.append(b);row.append(cell);attachDescription(row,path,key);return row;
}
function appendObject(container,obj,basePath,depth){
 Object.entries(obj).forEach(([key,v])=>{
  const path=[...basePath,key],kind=typeOf(v);
  if(kind==='array'){
   // Scalar arrays get a compact read-only preview in the form.
   // Editing still happens in the existing List View after clicking the row.
   const scalarList=v.every(item=>item===null||['string','number','boolean'].includes(typeof item));
   if(scalarList){
    const row=document.createElement('div');row.className='field';row.style.paddingLeft=(Math.max(0,depth-1)*10)+'px';
    const name=document.createElement('label');addFieldHelp(name,path,key);row.append(name);
    const cell=document.createElement('div');cell.className='value';
    const b=document.createElement('button');b.className='navigate scalar-list-preview';b.title='Open list editor';
    const preview=document.createElement('span');preview.className='scalar-list-values';
    if(v.length===0){
      const empty=document.createElement('span');empty.className='scalar-list-empty';empty.textContent='Empty list';preview.append(empty);
    }else{
      v.slice(0,5).forEach(item=>{
        const chip=document.createElement('span');chip.className='scalar-chip';
        const raw=item===null?'null':String(item);
        chip.textContent=raw.length>24?raw.slice(0,23)+'…':raw;
        chip.title=raw;
        preview.append(chip);
      });
      if(v.length>5){const more=document.createElement('span');more.className='scalar-list-more';more.textContent='+'+(v.length-5);preview.append(more);}
    }
    const arrow=document.createElement('span');arrow.className='scalar-list-arrow';arrow.textContent='›';
    b.append(preview,arrow);
    b.onclick=()=>{selected=path;expanded.add(pid(path));render();};
    cell.append(b);row.append(cell);attachDescription(row,path,key);container.append(row);return;
   }
   container.append(navigateRow(key,v,path,Math.max(0,depth-1)));return;
  }
  if(kind==='object'&&v!==null){
   if(depth>INLINE_DEPTH){container.append(navigateRow(key,v,path,depth-1));return;}
   const section=document.createElement('div');section.className='object-section';
   const sid=pid(path),collapsed=collapsedSections.has(sid);
   const head=document.createElement('button');head.className='section-head';
   const caret=document.createElement('span');caret.className='section-caret';caret.textContent=collapsed?'›':'⌄';
   const title=document.createElement('span');title.className='section-title';const meta=fieldMeta(path,key);title.textContent=meta.title;
   const count=document.createElement('span');count.className='section-count';count.textContent=Object.keys(v).length+' fields';
   head.append(caret,title,count);
   head.onclick=()=>{if(collapsed)collapsedSections.delete(sid);else collapsedSections.add(sid);render();};
   section.append(head);
   const sectionDescription=descriptionNode(path,key);if(sectionDescription){sectionDescription.classList.add('section-description');section.append(sectionDescription);}
   if(!collapsed){const body=document.createElement('div');body.className='section-body';appendObject(body,v,path,depth+1);section.append(body);}
   container.append(section);return;
  }
  container.append(scalarRow(key,v,path,Math.max(0,depth-1)));
 });
}
function renderObject(value){
 const form=$('form'),entries=Object.entries(value);
 if(!entries.length){const e=document.createElement('div');e.className='empty-card';e.textContent='This object is empty.';form.append(e);return;}
 appendObject(form,value,selected,1);
}
function render(){if(current===null)return;let value=get(current,selected);if(value===undefined){selected=[];value=current;}const filter=$('search').value.trim().toLowerCase();const t=treeNode('Configuration',current,[],0,filter);$('tree').replaceChildren(...(t?[t]:[]));breadcrumb();$('heading').textContent=selected.length?pathDisplayName(selected):'Configuration';$('kind').textContent=Array.isArray(value)?'LIST':value&&typeof value==='object'?'OBJECT':typeOf(value).toUpperCase();const form=$('form');form.replaceChildren();
 $('showDescriptions').checked=showDescriptions;if(Array.isArray(value))renderList(value);else if(value!==null&&typeof value==='object')renderObject(value);else{const row=document.createElement('div');row.className='field single';const name=document.createElement('label');if(selected.length){const key=selected.at(-1),parent=get(current,selected.slice(0,-1));if(Array.isArray(parent)){name.textContent='Value';}else addFieldHelp(name,selected,key);}else name.textContent='Value';row.append(name);const cell=document.createElement('div');cell.className='value';cell.append(scalarInput(null,'value',value,selected));row.append(cell);if(selected.length){const key=selected.at(-1);attachDescription(row,selected,key);}form.append(row);}updateActions();}
function allPaths(v,p=[]){let r=[pid(p)];if(v!==null&&typeof v==='object')for(const [k,x] of Object.entries(v))r=r.concat(allPaths(x,[...p,k]));return r;}function updateActions(){$('save').disabled=!dirty;$('revert').disabled=!dirty;$('dirty').hidden=!dirty;}
$('showDescriptions').checked=showDescriptions;$('showDescriptions').addEventListener('change',e=>{showDescriptions=e.target.checked;vscode.setState({...vscode.getState(),showDescriptions});render();});$('expandAll').onclick=()=>{if(current!==null){expanded=new Set(allPaths(current));render();}};$('collapseAll').onclick=()=>{expanded=new Set(['[]']);render();};$('searchClose').onclick=()=>{$('search').value='';render();$('search').focus();};$('search').addEventListener('input',render);$('source').onclick=()=>vscode.postMessage({type:'openText'});$('save').onclick=()=>vscode.postMessage({type:'save'});$('revert').onclick=()=>vscode.postMessage({type:'revert'});
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();vscode.postMessage({type:'save'});}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('search').focus();}});
window.addEventListener('message',e=>{const m=e.data;$('filename').textContent=m.filename||$('filename').textContent;if(m.type==='error'){current=null;$('tree').replaceChildren();$('form').textContent=m.message;$('heading').textContent='Unable to parse';$('status').textContent='⚠ '+m.message;return;}if(m.type==='editError'){$('status').textContent='⚠ '+m.message;return;}if(m.type==='saved'){$('status').textContent='✓ Saved';return;}if(m.type==='reverted'){$('status').textContent='Reverted';return;}if(m.type==='document'){current=m.data;comments=m.comments||{};schema=m.schema||null;schemaSource=m.schemaSource||null;schemaManual=Boolean(m.schemaManual);collapsedSections.clear();$('schemaPicker').textContent='Schema: '+(schemaSource||'none')+' ▾';$('schemaPicker').title='Click to choose a JSON Schema file'+(schemaManual?' (manually selected)':'');version=m.version;language=m.language;dirty=Boolean(m.dirty);if(get(current,selected)===undefined)selected=[];render();const selectedSchema=schemaAt(selected);const widget=selectedSchema?.['x-ui']?.widget;$('status').textContent=`✓ ${language.toUpperCase()} · ${dirty?'Modified':'Ready'}${schemaSource?' · Schema: '+schemaSource:''}${widget?' · Widget: '+widget:''}`;}});

$('schemaPicker').addEventListener('click',()=>vscode.postMessage({type:'chooseSchema'}));
$('schemaPicker').addEventListener('contextmenu',e=>{e.preventDefault();vscode.postMessage({type:'resetSchema'});});
