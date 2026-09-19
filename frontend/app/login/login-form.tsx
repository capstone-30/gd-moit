'use client';
import {accountHome} from '../../../shared/account';
import {useEffect,useState} from 'react';
import {api,useApiData,Form,LoadFeedback,RequestError,type Config,type Me} from '../components/client';

export default function Login() {
  const state=useApiData<Config>('configuration');
  const [challenge,setChallenge]=useState<{id:string,expires:number,retry:number,demoCode?:string}>();
  const [email,setEmail]=useState('');
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{
    if(!challenge)return;
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return()=>clearInterval(timer);
  },[challenge]);
  const c=state.data?.data;
  const remaining=challenge?Math.max(0,Math.ceil((challenge.expires-clock)/1000)):0;
  const retryIn=challenge?Math.max(0,Math.ceil((challenge.retry-clock)/1000)):0;

  async function issue(address:string) {
    try {
      const {data}=await api<{challengeId:string,expiresIn:number,retryAfter:number,demoCode?:string}>('auth/otp-challenges',{method:'POST',body:{email:address}});
      setEmail(address);
      setChallenge({id:data.challengeId,demoCode:data.demoCode,expires:Date.now()+data.expiresIn*1000,retry:Date.now()+data.retryAfter*1000});
      setClock(Date.now());
    } catch(e) {
      if(e instanceof RequestError&&e.retryAfter&&challenge)setChallenge({...challenge,retry:Date.now()+e.retryAfter*1000});
      throw e;
    }
  }

  return <div className="login-layout">
    <section className="auth-panel" aria-labelledby="login-title">
      <p className="school-label">{c?.school?.name??'모잇 로그인'}</p>
      <ol className="auth-steps" aria-label="로그인 단계">
        <li aria-current={!challenge?'step':undefined}><span aria-hidden="true">{challenge?'✓':'1'}</span>학교 이메일</li>
        <li aria-current={challenge?'step':undefined}><span aria-hidden="true">2</span>인증번호 확인</li>
      </ol>
      <h1 id="login-title">{challenge?'인증번호를 입력해주세요':'학교 이메일로 시작해요'}</h1>
      <p className="muted">{challenge?(challenge.demoCode?'아래에 표시된 데모 인증번호로 시연을 계속하세요.':'이메일로 받은 6자리 번호를 입력하면 로그인이 완료됩니다.'):'학생과 대학 담당자 모두 학교 이메일로 로그인하면 등록된 계정 유형에 맞는 화면으로 이동해요.'}</p>
      {c?.demoAccounts&&<aside className="institution-notice"><strong>로컬 데모 로그인</strong><p>실제 메일 발송·이메일 소유권 인증 없이 합성 계정으로 시연합니다. 인증번호는 이 화면에 표시됩니다.</p></aside>}
      <LoadFeedback state={state}/>
      {c&&(!c.registrationAvailable?<div className="setup-state"><h3>운영 준비 중입니다</h3><p>학교 설정과 개인정보 안내·출시 검증을 마친 뒤 인증을 시작할 수 있습니다.</p><a href="/privacy">개인정보 처리 안내</a></div>:<>
        {!challenge?<Form successMessage="" submit={async f=>{await issue(String(f.get('email')));}} label="인증번호 받기">
          <label htmlFor="email">학교 이메일</label>
          {c.demoAccounts?<select id="email" name="email" defaultValue={email||c.demoAccounts[0].email}>{c.demoAccounts.map(account=><option key={account.email} value={account.email}>{account.label} · {account.email}</option>)}</select>:<input id="email" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={email} placeholder="학교 이메일을 입력해주세요"/>}
          <p className="help">비밀번호 없이 인증번호로 안전하게 로그인해요.</p>
        </Form>:<>
          <div className="auth-recipient"><div><span className="help">인증할 이메일</span><p>{email}</p></div><button className="text-button" type="button" onClick={()=>setChallenge(undefined)}>변경</button></div>
          <Form key={challenge.id} successMessage="" disabled={remaining===0} submit={async f=>{
            const {data}=await api<{user:Me}>('auth/sessions',{method:'POST',body:{challengeId:challenge.id,code:String(f.get('code')),privacyVersion:c.privacyVersion,privacyAcknowledged:f.get('privacy')==='on'}});
            return accountHome(data.user.role);
          }} label="인증하고 시작하기">
            {challenge.demoCode&&<p className="demo-code" role="status">데모 인증번호 <strong>{challenge.demoCode}</strong><span className="help">실제 메일은 발송하지 않았습니다.</span></p>}
            <label htmlFor="code">6자리 인증번호</label>
            <input id="code" className="otp-input" name="code" type="text" autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" aria-describedby="code-help" required/>
            <p id="code-help" className="help">{remaining===0?'인증번호가 만료되었습니다. 아래에서 다시 받아주세요.':`남은 시간 ${Math.floor(remaining/60)}분 ${remaining%60}초 · 오입력 5회 시 폐기`}</p>
            <label className="check-line"><input name="privacy" type="checkbox" required/><span><a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리 안내</a>를 확인했으며 필수 처리에 동의합니다. 선택 프로필 없이도 이용할 수 있습니다.</span></label>
          </Form>
          <div className="auth-resend"><Form successMessage="" disabled={retryIn>0} submit={async()=>{await issue(email);}} label={retryIn>0?`${retryIn}초 후 다시 받기`:'인증번호 다시 받기'}><p className="help">{challenge.demoCode?'새 데모 번호가 필요하면 다시 받아주세요.':'인증번호가 오지 않았나요? 스팸함도 확인해주세요.'}</p></Form></div>
        </>}
      </>)}
    </section>
    <a className="text-link" href="/">모잇 소개로 돌아가기</a>
  </div>;
}
