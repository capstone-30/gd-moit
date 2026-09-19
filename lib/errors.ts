export class ApiError extends Error {
  constructor(public status:number, public code:string, public fields?:Record<string,string>, public retryAfter?:number) {super(code);}
}
export function requireThat(condition:unknown,status:number,code:string):asserts condition {
  if(!condition) throw new ApiError(status,code);
}
export const messages:Record<string,string> = {
  POLICY_UNRESOLVED:'대안 확정 후 시간 변경 정책이 미확정입니다.', INVALID_INPUT:'입력 형식을 확인해주세요.', UNAUTHENTICATED:'로그인이 필요합니다.', OTP_INVALID:'인증번호가 유효하지 않습니다.',
  FORBIDDEN:'요청 권한이 없습니다.', CSRF_INVALID:'화면을 새로고침하고 다시 요청해주세요.', NOT_FOUND:'찾을 수 없습니다.',
  MEETING_FULL:'정원이 찼습니다.', HOST_CANNOT_LEAVE:'개설자는 나갈 수 없습니다.', MEMBERSHIP_CONFLICT:'함께 참여할 수 없습니다.',
  CREATION_RESTRICTED:'현재 모임을 개설할 수 없습니다.', PROPOSAL_IN_PROGRESS:'시간 제안을 조율 중입니다.', PROPOSAL_STALE:'이전 제안입니다.',
  STATE_CONFLICT:'현재 상태에서는 처리할 수 없습니다.', VERSION_CONFLICT:'변경된 모임을 다시 조회해주세요.', PRECONDITION_REQUIRED:'최신 모임 버전이 필요합니다.',
  SLOT_NOT_ALLOWED:'설정된 교시를 선택해주세요.', DATE_OUT_OF_RANGE:'날짜와 교시를 확인해주세요.', NO_INTERSECTION:'가능 시간 교집합이 없습니다.',
  INTERSECTION_EXISTS:'교집합에서 시간을 확정해주세요.', TOO_FEW_MEMBERS:'참여자가 2명 이상 필요합니다.', TWO_PERSON_ACK_REQUIRED:'2인 모임 선택을 확인해주세요.',
  PAYLOAD_TOO_LARGE:'요청 크기가 너무 큽니다.', RATE_LIMITED:'잠시 후 다시 요청해주세요.', PRIVACY_VERSION_CHANGED:'개인정보 안내를 다시 확인해주세요.',
  REGISTRATION_UNAVAILABLE:'운영 준비 전에는 가입할 수 없습니다.', MAIL_UNAVAILABLE:'메일 발송에 실패했습니다.', RETRYABLE_CONFLICT:'다시 시도해주세요.', INTERNAL_ERROR:'처리에 실패했습니다. 다시 시도해주세요.',
};
