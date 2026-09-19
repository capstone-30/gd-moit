import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ProfileInterests,{interestValues} from '../app/components/profile-interests';

test('관심 주제 저장은 작성 중인 값도 포함하고 공백·중복을 제외한다',()=>{
  const tags=['웹 개발','디자인'];
  assert.deepEqual(interestValues(tags,'  데이터 분석  '),['웹 개발','디자인','데이터 분석']);
  assert.deepEqual(interestValues(tags,' 웹 개발 '),tags);
  assert.deepEqual(interestValues(tags,'  '),tags);
  assert.deepEqual(tags,['웹 개발','디자인']);
});

test('관심 주제는 구분자 문자열 대신 각각의 폼 값으로 제출한다',()=>{
  const values=['웹 개발','SQL, PostgreSQL','C++'];
  const html=renderToStaticMarkup(createElement(ProfileInterests,{initial:values}));
  const form=new FormData();
  for(const [,value] of html.matchAll(/type="hidden" name="interests" value="([^"]*)"/g))form.append('interests',value);
  assert.deepEqual(form.getAll('interests'),values);
});
