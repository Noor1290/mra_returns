// FAKE sample data for "Try with fake sample data": a saved run as the dashboard would send it
// (the keys of the payroll export, plus "Date of Employment"). Invented company, names, IDs and
// figures; nothing here belongs to a real person or company.

import type { SavedRun } from '../lib/runStore'

const company = { 'Company Name': 'ABC Co Ltd', Address: '1 Fake Street, Port Louis', BRN: 'C1234567', VAT: '' }

const employee = (id: string, surname: string, otherNames: string, basic: number, increment: number, started: string) => {
  const newBasic = basic + increment
  return {
    ID: id,
    Surname: surname,
    'Other names': otherNames,
    'Basic Salary': basic,
    'Govt Increment': increment,
    'New Basic Salary': newBasic,
    'Full time / Part time': 'Full Time',
    Allowances: 0,
    Emoluments: newBasic,
    Travelling: 0,
    'Gross Pay': newBasic,
    'Age 60+': false,
    // Employer CSG 3 % and employer NSF 2.5 % (capped at 29,710), to 2 decimals as a saved run keeps them.
    CSG: Math.round(newBasic * 3) / 100,
    NSF: Math.round(Math.min(newBasic, 29710) * 2.5) / 100,
    PAYE: 0,
    'Employee CSG': Math.round(newBasic * 1.5) / 100,
    'Employee NSF': Math.round(newBasic) / 100,
    'Total deductions': 0,
    'Net Pay': newBasic,
    Levy: 0,
    PRGF: 0,
    'Total MRA contributions': 0,
    EDF: 0,
    'EDF (monthly)': 0,
    Total: 0,
    ...company,
    'Date of Employment': started,
  }
}

export const DEMO_RUN: SavedRun = {
  brn: 'C1234567',
  name: 'ABC Co Ltd',
  address: '1 Fake Street, Port Louis',
  period: '2026-08',
  run: true,
  employees: [
    employee('X0000000000001', 'DOE', 'JANE', 18115, 635, '2020-02-01'),
    employee('X0000000000002', 'ROE', 'RICHARD', 17911, 635, '2021-01-01'),
    employee('X0000000000003', 'POE', 'ALEX', 17110, 635, '2026-01-04'),
  ],
  mra: { ern: '001234', telephone: '2000000', mobile: '52000000', declarant: 'JANE SAMPLE' },
  email: 'returns@example.org',
  templates: [],
}
