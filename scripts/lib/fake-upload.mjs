// FAKE upload for the browser checks; never real data.
/** A FAKE CSG return file, as downloaded from the MRA portal: Windows-1252, CRLF, 19 fields a line. */
const e = String.fromCharCode(0xe9)
export const FAKE_CSG_UPLOAD = Buffer.from(
  [
    `MRA,PACO,V1.0${','.repeat(16)}`,
    `Employer Registration Number,Employer Business Registration Number ,Employer Name,Tax Period,Telephone Number,Mobile Number,Name of Declarant,Email Address${','.repeat(11)}`,
    `009999,C9999999,UPLOADED CO LTD,2607,,59999999,EXAMPLE PERSON,example@example.org${','.repeat(11)}`,
    `Employee ID,Surname of Employee,Other Names of Employee,Wage Bill excluding Wage Relativity Adjustment (MUR),Wage Relativity Adjustment (MUR),Total Wage Bill (MUR),Contribution Code,Pay Code,Frequency ,Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on Wage Bill (MUR),National Savings Fund Amount (NSF) (MUR),LEVY Applicable? (Y/N),Emoluments excluding travelling,Full Time Employment (Y/N),PAYE for Income Tax (MUR),PAYE for Solidarity Levy (MUR),End of Year Bonus (MUR),Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on End-of-Year Bonus (MUR),Emoluments excluding Exempt Emoluments and Statutory End-of-Year Bonus (MUR)`,
    'Y9999999,EXAMPLE,UPLOADED,1000,0,1000,S,M,1,45,25,Y,1000,Y,0,0,0,0,1000',
    'Y9999998,EXAMPLE,SECOND,1000,0,1000,S,M,1,45,25,Y,1000,Y,0,0,0,0,1000',
  ]
    .map((line) => `${line}\r\n`)
    .join(''),
  'latin1',
)
