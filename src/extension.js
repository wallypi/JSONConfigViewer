'use strict';
const vscode=require('vscode');const path=require('path');const crypto=require('crypto');
const {parseSource}=require('./parser');const {updateScalar,removeArrayItem,addArrayItem}=require('./edit');
async function readJsonUri(uri){
 try{return JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));}catch{return null;}
}
async function loadSchema(document,parsed,selectedSchemaUri){
 if(selectedSchemaUri){const schema=await readJsonUri(selectedSchemaUri);if(schema)return {schema,source:path.basename(selectedSchemaUri.fsPath),schemaPath:selectedSchemaUri.fsPath,manual:true};}
 const cfg=vscode.workspace.getConfiguration('configview',document.uri).get('schemaFile','').trim();
 const dir=vscode.Uri.joinPath(document.uri,'..');
 const base=path.basename(document.fileName,path.extname(document.fileName));
 const candidates=[];
 if(cfg)candidates.push(vscode.Uri.joinPath(dir,cfg));
 const declared=parsed?.data&&typeof parsed.data==='object'&&!Array.isArray(parsed.data)?parsed.data.$schema:null;
 if(typeof declared==='string'&&declared&&!/^https?:/i.test(declared))candidates.push(vscode.Uri.joinPath(dir,declared));
 candidates.push(vscode.Uri.joinPath(dir,base+'.schema.json'));
 candidates.push(vscode.Uri.joinPath(dir,path.basename(document.fileName)+'.schema.json'));
 for(const uri of candidates){const schema=await readJsonUri(uri);if(schema)return {schema,source:path.basename(uri.fsPath),schemaPath:uri.fsPath,manual:false};}
 return {schema:null,source:null,schemaPath:null,manual:false};
}
function activate(context){
 const provider={async resolveCustomTextEditor(document,panel){
  panel.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
  const nonce=crypto.randomBytes(16).toString('base64');
  const script=panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','view.js'));
  const css=panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','view.css'));
  panel.webview.html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"></head><body><header><strong>JSONConfigViewer</strong><span id="filename"></span><span id="dirty" title="Modified" hidden>●</span><span class="spacer"></span><label class="header-description-toggle"><input id="showDescriptions" type="checkbox"><span>Show descriptions</span></label><button id="revert" class="action" disabled>Revert</button><button id="save" class="action primary" disabled>Save</button><button id="source" class="action">YAML ↗</button></header><main><aside><div class="tree-head"><div class="label">STRUCTURE</div><div class="tree-tools"><button id="expandAll" class="iconbtn" title="Expand all" aria-label="Expand all">⊞</button><button id="collapseAll" class="iconbtn" title="Collapse all" aria-label="Collapse all">⊟</button></div></div><div id="searchBar"><span class="search-icon">⌕</span><input id="search" placeholder="Search structure…" aria-label="Search tree"><button id="searchClose" title="Clear search" aria-label="Clear search">×</button></div><div id="tree"></div></aside><section><div class="content-head"><div id="breadcrumb"></div><div class="title-row"><h2 id="heading">Configuration</h2><span id="kind" class="kind">OBJECT</span></div></div><div id="form"></div></section></main><footer><button id="schemaPicker" class="schema-picker" type="button" title="Choose JSON Schema file">Schema: auto ▾</button><span id="status">Loading…</span><span>Tree + Form</span></footer><script nonce="${nonce}" src="${script}"></script></body></html>`;
  let version=-1;let selectedSchemaUri=null;
  const update=async()=>{version=document.version;const sentVersion=version;const language=path.extname(document.fileName).toLowerCase()==='.json'?'json':'yaml';
   try{
    const parsed=parseSource(document.getText(),language);
    const schemaInfo=await loadSchema(document,parsed,selectedSchemaUri);
    if(document.version!==sentVersion)return update();
    panel.webview.postMessage({type:'document',filename:path.basename(document.fileName),data:parsed.data,comments:parsed.comments||{},schema:schemaInfo.schema,schemaSource:schemaInfo.source,schemaPath:schemaInfo.schemaPath,schemaManual:schemaInfo.manual,language,version:sentVersion,documents:parsed.documents,dirty:document.isDirty});
   }catch(e){panel.webview.postMessage({type:'error',filename:path.basename(document.fileName),message:String(e.message||e),version:sentVersion});}
  };
  const sub=vscode.workspace.onDidChangeTextDocument(e=>{if(e.document.uri.toString()===document.uri.toString())update();});panel.onDidDispose(()=>sub.dispose());
  panel.webview.onDidReceiveMessage(async m=>{
   if(m.type==='chooseSchema'){
    const selection=await vscode.window.showOpenDialog({
     canSelectFiles:true,canSelectFolders:false,canSelectMany:false,
     defaultUri:selectedSchemaUri||vscode.Uri.joinPath(document.uri,'..'),
     filters:{'JSON Schema':['json']},openLabel:'Use this schema'
    });
    if(!selection?.length)return;
    const chosen=selection[0];
    const parsedSchema=await readJsonUri(chosen);
    if(!parsedSchema||typeof parsedSchema!=='object'||Array.isArray(parsedSchema)){
     vscode.window.showErrorMessage('JSONConfigViewer: selected file is not a valid JSON Schema object.');return;
    }
    selectedSchemaUri=chosen;await update();return;
   }
   if(m.type==='resetSchema'){selectedSchemaUri=null;await update();return;}

   if(m.type==='openText'){await vscode.commands.executeCommand('vscode.openWith',document.uri,'default');return;}
   if(m.type==='save'){const ok=await document.save();panel.webview.postMessage({type:ok?'saved':'editError',message:ok?'':'Save failed'});update();return;}
   if(m.type==='revert'){await vscode.commands.executeCommand('workbench.action.files.revert');panel.webview.postMessage({type:'reverted'});update();return;}
   if(m.type==='addItem'){try{if(m.version!==document.version)throw Error('Document changed; retry');const language=path.extname(document.fileName).toLowerCase()==='.json'?'json':'yaml';const updated=addArrayItem(document.getText(),language,m.path,m.value);const edit=new vscode.WorkspaceEdit();const end=document.positionAt(document.getText().length);edit.replace(document.uri,new vscode.Range(new vscode.Position(0,0),end),updated);if(!await vscode.workspace.applyEdit(edit))throw Error('VS Code rejected edit');}catch(e){panel.webview.postMessage({type:'editError',message:String(e.message||e)});update();}return;}
   if(m.type==='deleteItem'){try{if(m.version!==document.version)throw Error('Document changed; retry');const language=path.extname(document.fileName).toLowerCase()==='.json'?'json':'yaml';const updated=removeArrayItem(document.getText(),language,m.path);const edit=new vscode.WorkspaceEdit();const end=document.positionAt(document.getText().length);edit.replace(document.uri,new vscode.Range(new vscode.Position(0,0),end),updated);if(!await vscode.workspace.applyEdit(edit))throw Error('VS Code rejected edit');}catch(e){panel.webview.postMessage({type:'editError',message:String(e.message||e)});update();}return;}
   if(m.type!=='edit')return;
   try{
    if(m.version!==document.version)throw Error('Document changed; retry edit');
    const language=path.extname(document.fileName).toLowerCase()==='.json'?'json':'yaml';
    const updated=updateScalar(document.getText(),language,m.path,m.value);
    const edit=new vscode.WorkspaceEdit();const end=document.positionAt(document.getText().length);
    edit.replace(document.uri,new vscode.Range(new vscode.Position(0,0),end),updated);
    if(!await vscode.workspace.applyEdit(edit))throw Error('VS Code rejected edit');
    panel.webview.postMessage({type:'editOk'});
   }catch(e){panel.webview.postMessage({type:'editError',message:String(e.message||e)});update();}
  });update();
 }};
 context.subscriptions.push(vscode.window.registerCustomEditorProvider('configview.editor',provider,{webviewOptions:{retainContextWhenHidden:true}}));
 context.subscriptions.push(vscode.commands.registerCommand('configview.openSample',async()=>{const uri=vscode.Uri.joinPath(context.extensionUri,'samples','balanced.yaml');await vscode.commands.executeCommand('vscode.openWith',uri,'configview.editor');}));
}
module.exports={activate,deactivate(){}};
