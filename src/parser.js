'use strict';
const YAML = require('yaml');
function parseSource(source,language){
 if(language==='json')return {data:JSON.parse(source),documents:1};
 const docs=YAML.parseAllDocuments(source,{uniqueKeys:true,keepSourceTokens:true,intAsBigInt:false});
 for(const [i,doc] of docs.entries())if(doc.errors.length)throw Error(`Document ${i+1}: ${doc.errors.map(e=>e.message).join('; ')}`);
 // Preserve full stream, including multiple documents, without expanding aliases into JS.
 const comments=Object.create(null);
 docs.forEach((d,i)=>collectComments(d.contents,docs.length>1?[String(i)]:[],comments));
 return {data:docs.length===1?viewNode(docs[0].contents):docs.map((d,i)=>viewNode(d.contents)),documents:docs.length,multi:docs.length>1,comments};
}

function cleanComment(...parts){
 return parts.filter(Boolean).map(x=>String(x).split('\n').map(line=>line.replace(/^\s*#?\s?/,'').trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n');
}
function collectComments(node,path,out){
 if(!node)return;
 if(YAML.isMap(node)){
  for(const pair of node.items){
   const key=YAML.isScalar(pair.key)?String(pair.key.value):String(pair.key?.toString()||'<complex key>');
   const p=[...path,key];
   const comment=cleanComment(pair.key?.commentBefore,pair.value?.commentBefore,pair.comment,pair.value?.comment);
   if(comment)out[JSON.stringify(p)]=comment;
   collectComments(pair.value,p,out);
  }
 }else if(YAML.isSeq(node)){
  node.items.forEach((item,i)=>{
   const p=[...path,String(i)];
   const comment=cleanComment(item?.commentBefore,item?.comment);
   if(comment)out[JSON.stringify(p)]=comment;
   collectComments(item,p,out);
  });
 }
}

function viewNode(node,seen=new Set(),depth=0){
 if(!node)return null;
 if(depth>100)return '[maximum nesting depth]';
 if(YAML.isAlias(node))return `*${node.source}`;
 if(YAML.isScalar(node))return typeof node.value==='bigint'?node.value.toString():node.value;
 if(YAML.isSeq(node))return node.items.map(n=>viewNode(n,seen,depth+1));
 if(YAML.isMap(node)){
  const obj=Object.create(null);
  for(const pair of node.items){const key=YAML.isScalar(pair.key)?String(pair.key.value):String(pair.key?.toString()||'<complex key>');obj[key]=viewNode(pair.value,seen,depth+1);}
  return obj;
 }
 return String(node);
}
function parseDocument(source,language){return parseSource(source,language).data;}
module.exports={parseSource,parseDocument};
