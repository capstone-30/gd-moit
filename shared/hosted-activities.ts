export const hostedActivities={
  general:{label:'빈 템플릿',description:'필요한 안내와 제출 서류를 직접 구성해요.',poster:null,requirements:{activity:false,expenses:false}},
  plogging:{label:'플로깅',description:'함께 걸으며 캠퍼스 주변 환경을 가꾸는 활동',poster:'/posters/plogging.jpg',requirements:{activity:true,expenses:false}},
  mentoring:{label:'멘토링',description:'선후배가 대학 생활과 학습 경험을 나누는 활동',poster:'/posters/mentoring.png',requirements:{activity:true,expenses:true}},
  learning:{label:'학습공동체',description:'공통 주제를 함께 공부하고 배움을 기록하는 활동',poster:'/posters/learning.png',requirements:{activity:true,expenses:true}},
} as const;
export type HostedActivityType=keyof typeof hostedActivities;
