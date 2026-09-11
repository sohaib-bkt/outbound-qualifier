export async function dialLead(phone: string, name: string): Promise<string> {
  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId: process.env.VAPI_ASSISTANT_ID,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phone, name },
      serverUrl: `${process.env.APP_BASE_URL}/api/webhooks/vapi`,
    }),
  });
  if (!res.ok) throw new Error(`vapi dial failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.id as string;
}
