export function accountHome(role:'student'|'institution') {
  return role==='institution'?'/institutions':'/meetings';
}
