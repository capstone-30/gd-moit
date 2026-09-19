export type AccountRole='student'|'institution';
export function accountHome(role:AccountRole) {
  return role==='institution'?'/institutions':'/home';
}
