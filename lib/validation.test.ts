import { describe, it, expect } from 'vitest';
import { isValidE164 } from './validation';
describe('E164', () => {
  it('accepts valid', () => { expect(isValidE164('+15551234567')).toBe(true); });
  it('rejects invalid', () => { expect(isValidE164('555123')).toBe(false); });
});
