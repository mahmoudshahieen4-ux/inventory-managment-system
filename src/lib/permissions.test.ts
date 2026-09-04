import { describe, expect, it } from 'vitest'

import { canAccessView } from './permissions'

describe('canAccessView', () => {
  it('allows the ADMIN to open every view', () => {
    expect(canAccessView('ADMIN', 'inventory')).toBe(true)
    expect(canAccessView('ADMIN', 'pos')).toBe(true)
    expect(canAccessView('ADMIN', 'payroll')).toBe(true)
  })

  it('restricts the CASHIER to the POS view only', () => {
    expect(canAccessView('CASHIER', 'pos')).toBe(true)
    expect(canAccessView('CASHIER', 'inventory')).toBe(false)
    expect(canAccessView('CASHIER', 'payroll')).toBe(false)
  })
})
