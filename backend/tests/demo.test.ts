import test from 'node:test';
import assert from 'node:assert/strict';
import {demoEnabled} from '../application/demo';

test('인증번호 표시 데모는 명시적 개발 설정·루프백 앱·별도 로컬 데모 DB에서만 활성화',()=>{
  const env={NODE_ENV:'development',DEMO_LOGIN:'true',APP_ORIGIN:'http://127.0.0.1:3000',DATABASE_URL:'postgresql://localhost/moit_demo'};
  assert.equal(demoEnabled(env),true);
  for(const change of [
    {NODE_ENV:'production'},{DEMO_LOGIN:'false'},{DEMO_LOGIN:''},
    {APP_ORIGIN:'https://moit.example'},{APP_ORIGIN:'http://127.0.0.1.evil.example'},
    {DATABASE_URL:'postgresql://localhost/moit'},
    {DATABASE_URL:'postgresql://db.example/moit_demo'},
    {DATABASE_URL:'invalid'},
  ]) assert.equal(demoEnabled({...env,...change}),false,JSON.stringify(change));
});
