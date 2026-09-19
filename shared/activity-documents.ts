export type DocumentsInput={content:string;outcome:string;expenses:{date:string;description:string;amount:number}[]};
export type DocumentRequirements={activity:boolean;expenses:boolean};
export type DocumentsSubmission={content?:string;outcome?:string;expenses?:DocumentsInput['expenses']};
export function documentsComplete(requirements:DocumentRequirements,documents:{activitySubmitted:boolean;expensesSubmitted:boolean}|null) {
  return (requirements.activity||requirements.expenses)&&(!requirements.activity||Boolean(documents?.activitySubmitted))&&(!requirements.expenses||Boolean(documents?.expensesSubmitted));
}
