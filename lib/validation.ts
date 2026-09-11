export const E164_REGEX = /^\+[1-9]\d{7,14}$/;
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}
export type LeadCsvRow = { name: string; phone: string; email?: string; company?: string };
