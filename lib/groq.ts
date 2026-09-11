import Groq from 'groq-sdk';
export type QualResult = { qualification_score: number; interest_level: string; budget: string | null; timeline: string | null; call_summary: string; qualified: boolean; raw: string };
export async function analyzeTranscript(transcript: string): Promise<QualResult> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You qualify outbound sales leads. Return JSON only: {qualification_score 0-100, interest_level high|medium|low, budget string|null, timeline string|null, call_summary string, qualified boolean}. qualified=true iff score>=70.' },
      { role: 'user', content: transcript.slice(0, 12000) },
    ],
    temperature: 0.2,
  });
  const raw = completion.choices[0]?.message?.content ?? '{}';
  const j = JSON.parse(raw);
  return { qualification_score: j.qualification_score ?? 0, interest_level: j.interest_level ?? 'low', budget: j.budget ?? null, timeline: j.timeline ?? null, call_summary: j.call_summary ?? '', qualified: Boolean(j.qualified ?? (j.qualification_score ?? 0) >= 70), raw };
}
