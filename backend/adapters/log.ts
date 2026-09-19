export function logError(code:string,requestId?:string) {
  console.error(JSON.stringify({...(requestId?{requestId}:{}),code,at:new Date().toISOString()}));
}
