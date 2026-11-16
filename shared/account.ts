export type AccountRole='student'|'institution';
export function accountHome(role:AccountRole) {
  return role==='institution'?'/institutions':'/home';
}

export function accountDestination(role:AccountRole,next?:string|null) {
  if(!next||/[\\\x00-\x20\x7f]/.test(next)) return accountHome(role);
  const path=next.split(/[?#]/)[0];
  const allowed=role==='institution'
    ?/^\/institutions(?:\/(?:esg|settings|projects\/new|meetings(?:\/(?:all|[\w-]+|projects\/[\w-]+))?))?$/
    :/^\/(?:home|profile|meetings(?:\/(?:new|[\w-]+|manage(?:\/[\w-]+)?|institution(?:\/[\w-]+)?))?)$/;
  return allowed.test(path)?next:accountHome(role);
}

export function loginPath(next:string) {
  return `/login?${new URLSearchParams({next})}`;
}
