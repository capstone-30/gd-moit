export function demoEnabled(env:Record<string,string|undefined>) {
  if(env.NODE_ENV==='production'||env.DEMO_LOGIN!=='true') return false;
  try {
    const origin=new URL(env.APP_ORIGIN??''),database=new URL(env.DATABASE_URL??'');
    const local=(host:string)=>['localhost','127.0.0.1','[::1]'].includes(host);
    return origin.protocol==='http:'&&local(origin.hostname)&&local(database.hostname)&&database.pathname.endsWith('_demo');
  } catch {return false;}
}

