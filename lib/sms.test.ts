import { describe, it, expect } from 'vitest';
import { buildSmsBody } from './sms';
describe('sms', () => {
  it('interpolates name', () => { expect(buildSmsBody('Alice')).toContain('Alice'); expect(buildSmsBody('Alice')).not.toContain('${name}'); expect(buildSmsBody('Alice')).not.toContain('{name}'); });
});
