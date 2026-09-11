import twilio from 'twilio';
const DEFAULT_TEMPLATE = 'Hi ${name}, thanks for speaking with us today! We\'d love to follow up — reply YES to book a time.';
export function buildSmsBody(name: string): string {
  const tpl = process.env.SMS_FOLLOWUP_TEMPLATE || DEFAULT_TEMPLATE;
  return tpl.split('${name}').join(name);
}
export async function sendSms(to: string, body: string) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  return client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER!, body });
}
