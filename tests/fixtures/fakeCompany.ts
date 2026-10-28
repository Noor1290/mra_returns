// A FAKE company and saved run in the format the dashboard sends (mra-batch `load`), with figures
// chosen to hit the same rounding cases as a real month: 281.25, 562.50, 187.50, 278.19 + 556.38,
// 266.175 saved as 266.18, 907.69, 4.5 % of 17745 = 798.525. Invented names and IDs.
import type { CompanyForFile } from '../../src/lib/returnFile'

export const ABC: CompanyForFile = {
  name: 'ABC Co Ltd',
  brn: 'C1234567',
  address: '1 Fake Street, Port Louis',
  mra: { ern: '001234', telephone: '2000000', mobile: '52000000', declarant: 'JANE SAMPLE' },
  email: 'returns@example.org',
}

interface Pay {
  id: string
  surname: string
  otherNames: string
  type: string
  basic: number
  increment: number
  travelling: number
  employeeCsg: number
  csg: number
  employeeNsf: number
  nsf: number
  paye: number
  started: string
}

const row = (pay: Pay) => {
  const newBasic = pay.basic + pay.increment
  return {
    ID: pay.id,
    Surname: pay.surname,
    'Other names': pay.otherNames,
    'Basic Salary': pay.basic,
    'Govt Increment': pay.increment,
    'New Basic Salary': newBasic,
    'Full time / Part time': pay.type,
    Allowances: 0,
    Emoluments: newBasic,
    Travelling: pay.travelling,
    'Gross Pay': newBasic + pay.travelling,
    'Age 60+': 'No',
    CSG: pay.csg,
    NSF: pay.nsf,
    PAYE: pay.paye,
    'Employee CSG': pay.employeeCsg,
    'Employee NSF': pay.employeeNsf,
    'Company Name': 'ABC Co Ltd',
    BRN: 'C1234567',
    'Date of Employment': pay.started,
  }
}

export const FAKE_EMPLOYEES = [
  row({ id: 'X0000000000001', surname: 'DOE', otherNames: 'JANE ANN', type: 'Full Time', basic: 18115, increment: 635, travelling: 0, employeeCsg: 281.25, csg: 562.5, employeeNsf: 187.5, nsf: 468.75, paye: 0, started: '2020-02-01' }),
  row({ id: 'X0000000000002', surname: 'ROE', otherNames: 'RICHARD', type: 'part time', basic: 17911, increment: 635, travelling: 0, employeeCsg: 278.19, csg: 556.38, employeeNsf: 185.46, nsf: 463.65, paye: 0, started: '2021-01-01' }),
  row({ id: 'X0000000000003', surname: 'POE', otherNames: 'ALEX  LEE', type: 'Full Time ', basic: 56000, increment: 0, travelling: 14000, employeeCsg: 1680, csg: 3360, employeeNsf: 297.1, nsf: 742.75, paye: 907.69, started: '2023-02-01' }),
  // No pay this month: left out of both files.
  { ...row({ id: 'X0000000000004', surname: 'LEFT', otherNames: 'OUT', type: 'Full Time', basic: 0, increment: 0, travelling: 0, employeeCsg: 0, csg: 0, employeeNsf: 0, nsf: 0, paye: 0, started: '2019-05-01' }), 'Gross Pay': 0 },
  row({ id: 'X0000000000005', surname: 'KOE', otherNames: 'KIM', type: 'Full Time', basic: 17110, increment: 635, travelling: 0, employeeCsg: 266.18, csg: 532.35, employeeNsf: 177.45, nsf: 443.63, paye: 0, started: '2026-01-04' }),
]

const e = '\u00e9'
const CSG_EMPLOYEE_HEADINGS = `Employee ID,Surname of Employee,Other Names of Employee,Wage Bill excluding Wage Relativity Adjustment (MUR),Wage Relativity Adjustment (MUR),Total Wage Bill (MUR),Contribution Code,Pay Code,Frequency ,Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on Wage Bill (MUR),National Savings Fund Amount (NSF) (MUR),LEVY Applicable? (Y/N),Emoluments excluding travelling,Full Time Employment (Y/N),PAYE for Income Tax (MUR),PAYE for Solidarity Levy (MUR),End of Year Bonus (MUR),Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on End-of-Year Bonus (MUR),Emoluments excluding Exempt Emoluments and Statutory End-of-Year Bonus (MUR)`
const EMPLOYER_HEADINGS = 'Employer Registration Number,Employer Business Registration Number ,Employer Name,Tax Period,Telephone Number,Mobile Number,Name of Declarant,Email Address'

/** The CSG file of ABC Co Ltd for August 2026, line by line, as the MRA wants it. */
export const EXPECTED_CSG = [
  `MRA,PACO,V1.0${','.repeat(16)}`,
  `${EMPLOYER_HEADINGS}${','.repeat(11)}`,
  `001234,C1234567,ABC CO LTD,2608,2000000,52000000,JANE SAMPLE,returns@example.org${','.repeat(11)}`,
  CSG_EMPLOYEE_HEADINGS,
  'X0000000000001,DOE,JANE ANN,18750,0,18750,S,M,1,844,657,Y,18750,Y,0,0,0,0,18750',
  'X0000000000002,ROE,RICHARD,18546,0,18546,S,M,1,834,649,Y,18546,N,0,0,0,0,18546',
  'X0000000000003,POE,ALEX  LEE,56000,0,56000,S,M,1,5040,1040,Y,56000,Y,908,0,0,0,56000',
  'X0000000000005,KOE,KIM,17745,0,17745,S,M,1,798,621,Y,17745,Y,0,0,0,0,17745',
]

/** The PRGF file of ABC Co Ltd for August 2026. */
export const EXPECTED_PRGF = [
  `MRA,PRGF,V1.0${','.repeat(9)}`,
  `${EMPLOYER_HEADINGS},,,,`,
  '001234,C1234567,ABC CO LTD,2608,2000000,52000000,JANE SAMPLE,returns@example.org,,,,',
  'Employee ID,Surname of Employee,Other Names of Employee,Pension Scheme,Full Time Employment,Start Date of Employment,Monthly basic wage or salary (MUR),Allowances (MUR),Commission (MUR),Total Remuneration on which PRGF contribution amount is calculated (MUR) (MUR),PRGF Contribution Amount (MUR),Reason for no remuneration',
  'X0000000000001,DOE,JANE ANN,N,Y,20200201,18750,0,0,18750,844,',
  'X0000000000002,ROE,RICHARD,N,N,20210101,18546,0,0,18546,835,',
  'X0000000000003,POE,ALEX  LEE,N,Y,20230201,56000,0,0,56000,2520,',
  'X0000000000005,KOE,KIM,N,Y,20260104,17745,0,0,17745,799,',
]

/** Lines as the bytes of a Windows-1252 file with CRLF after every line, the last one too. */
export function cp1252Bytes(lines: readonly string[]): Uint8Array {
  const text = lines.map((line) => `${line}\r\n`).join('')
  return Uint8Array.from([...text], (character) => {
    const code = character.codePointAt(0)!
    if (code > 0xff) throw new Error('not Latin-1')
    return code
  })
}
