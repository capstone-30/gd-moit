export const meetingTypes = {study:'모각공',coffee:'커피챗',lunch:'런치챗',reflection:'회고'} as const;
export type MeetingType = keyof typeof meetingTypes;
