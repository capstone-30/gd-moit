'use client';
import Popup from './popup';
import {api,Form} from './client';

export default function AccountControls() {
  return <section className="account-controls"><h2>계정 관리</h2><Form submit={async()=>{await api('auth/sessions/current',{method:'DELETE'});return '/login';}} label="로그아웃"><h3>이 기기에서 로그아웃</h3><p className="help">현재 로그인만 종료해요. 다시 학교 이메일로 로그인할 수 있어요.</p></Form><Popup className="profile-danger-zone" title="탈퇴 및 개인정보 삭제"><Form danger label="탈퇴하고 삭제" submit={async f=>{await api('me',{method:'DELETE',body:{confirmDeletion:f.get('confirmDeletion')==='on'}});return '/login';}}><p>계정과 관련 데이터·개설 모임을 삭제하고 모든 세션을 종료합니다. 되돌릴 수 없습니다.</p><label className="check-line"><input name="confirmDeletion" type="checkbox" required/>삭제 내용을 확인했습니다.</label></Form></Popup></section>;
}
