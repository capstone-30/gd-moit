import test from 'node:test';
import assert from 'node:assert/strict';
import {interestValues} from '../app/components/profile-interests';

test('관심 주제 저장은 작성 중인 값도 포함하고 공백·중복을 제외한다',()=>{
  const tags=['웹 개발','디자인'];
  assert.deepEqual(interestValues(tags,'  데이터 분석  '),['웹 개발','디자인','데이터 분석']);
  assert.deepEqual(interestValues(tags,' 웹 개발 '),tags);
  assert.deepEqual(interestValues(tags,'  '),tags);
  assert.deepEqual(tags,['웹 개발','디자인']);
});
