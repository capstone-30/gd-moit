import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import ts from 'typescript';
import {sendOtp,deliverDeletions} from '../application/delivery';
import {changeAccountRole} from '../application/operations';
import type {DB,Transaction} from '../application/ports';

const root=resolve(import.meta.dirname,'../..');
async function files(directory:string):Promise<string[]> {
  const entries=await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(resolve(directory,entry.name)):entry.name.endsWith('.ts')?[resolve(directory,entry.name)]:[]))).flat();
}

test('domain/application은 외부 런타임·어댑터·SQL에 의존하지 않는다',async()=>{
  for(const layer of ['domain','application']) {
    for(const file of await files(resolve(root,'backend',layer))) {
      const source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
      const allowed=layer==='domain'?['backend/domain/','shared/']:['backend/domain/','backend/application/','shared/'];
      function inspect(node:ts.Node) {
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier) {
          assert.ok(ts.isStringLiteral(node.moduleSpecifier));
          const specifier=node.moduleSpecifier.text;
          assert.ok(specifier.startsWith('.'),`${file}: external dependency ${specifier}`);
          const target=relative(root,resolve(dirname(file),specifier));
          assert.ok(allowed.some(prefix=>target.startsWith(prefix)),`${file}: forbidden dependency ${target}`);
        }
        if(ts.isCallExpression(node)) {
          assert.notEqual(node.expression.kind,ts.SyntaxKind.ImportKeyword,`${file}: dynamic dependency`);
          assert.ok(!/^(fetch|require)$|\.query$/.test(node.expression.getText(ast)),`${file}: direct I/O`);
        }
        if(ts.isPropertyAccessExpression(node)) assert.notEqual(node.expression.getText(ast),'process',`${file}: process dependency`);
        if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)) {
          assert.ok(!/\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/is.test(node.text),`${file}: SQL belongs in an adapter`);
        }
        ts.forEachChild(node,inspect);
      }
      inspect(ast);
    }
  }
});

test('메일 실패는 포트로 전달되며 OTP 폐기 트랜잭션 완료 뒤 오류를 반환한다',async()=>{
  const events:string[]=[],failure=new Error('mail unavailable');
  const db={auth:{removeChallenge:async(values:unknown[])=>{assert.deepEqual(values,['challenge']);events.push('revoke');return {rows:[],rowCount:1};}}} as unknown as DB;
  const transaction:Transaction=async work=>{events.push('begin');const result=await work(db);events.push('commit');return result;};
  await assert.rejects(sendOtp(transaction,async()=>{events.push('send');throw failure;},{id:'challenge',email:'synthetic@example.org',code:'123456'}),error=>error===failure);
  assert.deepEqual(events,['send','begin','revoke','commit']);
  events.length=0;
  await sendOtp(transaction,async()=>{events.push('send');},{id:'challenge',email:'synthetic@example.org',code:'123456'});
  assert.deepEqual(events,['send']);
});

test('삭제 전달 실패는 완료 기록을 남기지 않고 재시도 성공 뒤에만 기록한다',async()=>{
  const events:string[]=[];
  let pending=true;
  const db={operations:{
    pendingDeletions:async()=>({rows:pending?[{id:'outbox',entity_id:'deleted',deleted_at:new Date('2026-01-01Z')}]:[],rowCount:pending?1:0}),
    markDelivered:async(values:unknown[])=>{assert.deepEqual(values,[['outbox']]);events.push('marked');pending=false;return {rows:[],rowCount:1};},
  }} as unknown as DB;
  const transaction:Transaction=async(work,write=true)=>{events.push(write?'write':'read');return work(db);};
  await assert.rejects(deliverDeletions(transaction,async()=>{throw new Error('offline');}),/offline/);
  assert.deepEqual(events,['read']);
  events.length=0;
  assert.equal(await deliverDeletions(transaction,async records=>{assert.deepEqual(records,[{entityId:'deleted',deletedAt:'2026-01-01T00:00:00.000Z'}]);events.push('delivered');}),1);
  assert.deepEqual(events,['read','delivered','write','marked']);
  assert.equal(await deliverDeletions(transaction,async()=>{assert.fail('empty outbox must not be sent');}),0);
});

test('역할 변경은 감사 실패 시 계정·세션을 변경하지 않는다',async()=>{
  const db={operations:{
    findUser:async()=>({rows:[{id:'user'}],rowCount:1}),
    changeRole:async()=>assert.fail('role changed before audit'),
    revokeSessions:async()=>assert.fail('sessions revoked before audit'),
  }} as unknown as DB;
  await assert.rejects(changeAccountRole(db,{operatorId:'operator',record:async()=>{throw new Error('audit offline');}},'user','institution','reason'),/audit offline/);
});
