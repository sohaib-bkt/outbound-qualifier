'use client';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import AuthShell from '@/app/components/AuthShell';

export default function Signup() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [msg, setMsg] = useState('');
  const router = useRouter();
  const input = "rounded-lg border border-line bg-paper px-3 py-2.5 w-full font-mono text-sm placeholder:text-ink/40";
  return (
    <AuthShell title="Open your room." kicker="One account, one board. Your leads stay yours — row-level security on every table.">
      <p className="eyebrow text-ink/60">Sign up</p>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Create account</h2>
      <label className="block eyebrow text-ink/60 mb-1" htmlFor="signup-email">Email</label>
      <input id="signup-email" type="email" autoComplete="email" className={`${input} mb-3`} placeholder="you@company.co" value={email} onChange={e=>setEmail(e.target.value)} />
      <label className="block eyebrow text-ink/60 mb-1" htmlFor="signup-password">Password</label>
      <input id="signup-password" type="password" autoComplete="new-password" className={input} placeholder="8+ characters" value={password} onChange={e=>setPassword(e.target.value)} />
      {msg && <p role="status" className="font-mono text-xs mt-3 text-abyss">{msg}</p>}
      <button className="rounded-lg bg-signal text-white px-4 py-2.5 w-full mt-5 font-mono text-xs uppercase tracking-wider hover:brightness-110 transition" onClick={async()=>{
        const s = createBrowserSupabase();
        const { error } = await s.auth.signUp({ email, password });
        if (error) setMsg(error.message); else { setMsg('Signed up — go to login'); router.push('/login'); }
      }}>Sign up</button>
      <p className="font-mono text-xs text-ink/60 mt-4">Have an account? <a className="underline decoration-signal decoration-2 underline-offset-4 hover:text-signal" href="/login">Sign in</a></p>
    </AuthShell>
  );
}
