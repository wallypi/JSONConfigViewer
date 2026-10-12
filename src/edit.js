'use strict';
const YAML=require('yaml');
const {parseSource}=require('./parser');
function updateScalar(source,language,path,value){
 if(!Array.isArray(path)||!path.length||path.some(p=>typeof p!=='string'))throw Error('Invalid path');
 if(language==='json'){
  const data=JSON.parse(source);let parent=data;
  for(const key of path.slice(0,-1)){if(parent===null||typeof parent!=='object'||!(key in parent))throw Error('Path not found');parent=parent[key];}
  const key=path.at(-1);if(parent===null||typeof parent!=='object'||!(key in parent))throw Error('Path not found');
  if(parent[key]===null||typeof parent[key]!==typeof value||typeof value==='object')throw Error('Only existing scalar values of same type are editable');
  parent[key]=value;return JSON.stringify(data,null,2)+'\n';
 }
 const docs=YAML.parseAllDocuments(source,{uniqueKeys:true,keepSourceTokens:true});
 for(const doc of docs)if(doc.errors.length)throw Error(doc.errors[0].message);
 let doc=docs[0],segments=path;
 if(docs.length>1){const i=Number(path[0]);if(!Number.isInteger(i)||i<0||i>=docs.length)throw Error('Invalid document index');doc=docs[i];segments=path.slice(1);}
 if(!segments.length)throw Error('Select a scalar');
 let node=doc.contents;
 for(const part of segments){
  if(YAML.isMap(node)){const pair=node.items.find(p=>YAML.isScalar(p.key)&&String(p.key.value)===part);if(!pair)throw Error('Path not found');node=pair.value;}
  else if(YAML.isSeq(node)){const index=Number(part);if(!Number.isInteger(index)||index<0||index>=node.items.length)throw Error('Invalid array index');node=node.items[index];}
  else throw Error('Path not found');
 }
 if(!YAML.isScalar(node)||node.tag&&!['tag:yaml.org,2002:str','tag:yaml.org,2002:int','tag:yaml.org,2002:float','tag:yaml.org,2002:bool'].includes(node.tag))throw Error('Complex or tagged values are read-only');
 if(node.value===null||typeof node.value!==typeof value||!['string','number','boolean'].includes(typeof value))throw Error('Unsupported scalar type change');
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid number');
 node.value=value;
 // Document serialization retains AST comments, anchors and styles, but may normalize whitespace.
 const result=docs.map(d=>d.toString()).join('');
 const check=parseSource(result,'yaml');if(!check)throw Error('Roundtrip failed');
 return result;
}
function removeArrayItem(source,language,path){
 if(!Array.isArray(path)||!path.length)throw Error('Invalid path');
 if(language==='json'){
  const data=JSON.parse(source);let parent=data;
  for(const key of path.slice(0,-1)){if(parent===null||typeof parent!=='object'||!(key in parent))throw Error('Path not found');parent=parent[key];}
  const index=Number(path.at(-1));if(!Array.isArray(parent)||!Number.isInteger(index)||index<0||index>=parent.length)throw Error('List item not found');
  parent.splice(index,1);return JSON.stringify(data,null,2)+'\n';
 }
 const docs=YAML.parseAllDocuments(source,{uniqueKeys:true,keepSourceTokens:true});for(const doc of docs)if(doc.errors.length)throw Error(doc.errors[0].message);
 let doc=docs[0],segments=path;if(docs.length>1){const i=Number(path[0]);if(!Number.isInteger(i)||i<0||i>=docs.length)throw Error('Invalid document index');doc=docs[i];segments=path.slice(1);}
 let node=doc.contents;
 for(const part of segments.slice(0,-1)){if(YAML.isMap(node)){const pair=node.items.find(p=>YAML.isScalar(p.key)&&String(p.key.value)===part);if(!pair)throw Error('Path not found');node=pair.value;}else if(YAML.isSeq(node)){const i=Number(part);if(!Number.isInteger(i)||i<0||i>=node.items.length)throw Error('Invalid array index');node=node.items[i];}else throw Error('Path not found');}
 const index=Number(segments.at(-1));if(!YAML.isSeq(node)||!Number.isInteger(index)||index<0||index>=node.items.length)throw Error('List item not found');node.items.splice(index,1);
 const result=docs.map(d=>d.toString()).join('');parseSource(result,'yaml');return result;
}
function addArrayItem(source,language,path,value){
 if(!Array.isArray(path))throw Error('Invalid path');
 if(language==='json'){
  const data=JSON.parse(source);let list=data;
  for(const key of path){if(list===null||typeof list!=='object'||!(key in list))throw Error('Path not found');list=list[key];}
  if(!Array.isArray(list))throw Error('Target is not a list');list.push(value);return JSON.stringify(data,null,2)+'\n';
 }
 const docs=YAML.parseAllDocuments(source,{uniqueKeys:true,keepSourceTokens:true});for(const doc of docs)if(doc.errors.length)throw Error(doc.errors[0].message);
 let doc=docs[0],segments=path;if(docs.length>1){const i=Number(path[0]);if(!Number.isInteger(i)||i<0||i>=docs.length)throw Error('Invalid document index');doc=docs[i];segments=path.slice(1);}
 let node=doc.contents;
 for(const part of segments){if(YAML.isMap(node)){const pair=node.items.find(p=>YAML.isScalar(p.key)&&String(p.key.value)===part);if(!pair)throw Error('Path not found');node=pair.value;}else if(YAML.isSeq(node)){const i=Number(part);if(!Number.isInteger(i)||i<0||i>=node.items.length)throw Error('Invalid array index');node=node.items[i];}else throw Error('Path not found');}
 if(!YAML.isSeq(node))throw Error('Target is not a list');node.add(value);
 const result=docs.map(d=>d.toString()).join('');parseSource(result,'yaml');return result;
}
module.exports={updateScalar,removeArrayItem,addArrayItem};
