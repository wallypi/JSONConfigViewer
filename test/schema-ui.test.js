const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../media/view.js'),'utf8');
const snippet=source.slice(source.indexOf('function schemaAt(path){'),source.indexOf('\nfunction fieldMeta('));
function at(schema,p){const ctx={schema};vm.createContext(ctx);return vm.runInContext(snippet+'\nschemaAt('+JSON.stringify(p)+')',ctx);}
const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'../samples/balanced.schema.json'),'utf8'));
test('balanced notes uses textarea',()=>assert.equal(at(schema,['modernization','notes'])['x-ui'].widget,'textarea'));
test('nested regular field has no textarea',()=>assert.equal(at(schema,['modernization','mode'])['x-ui'],undefined));
test('enum metadata is accessible',()=>assert.ok(at(schema,['reporting','format']).enum.includes('json')));
test('local refs resolve widget',()=>assert.equal(at({$defs:{long:{type:'string','x-ui':{widget:'textarea'}}},properties:{notes:{$ref:'#/$defs/long'}}},['notes'])['x-ui'].widget,'textarea'));
