'use client';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import AuthShell from '@/app/components/AuthShell';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  const router = useRouter();
  const input = "rounded-lg border border-line bg-paper px-3 py-2.5 w-full font-mono text-sm placeholder:text-ink/40";
  return (
    <AuthShell title="Back on the line." kicker="Sign in to check the board — who's queued, who's calling, who converted.">
      <p className="eyebrow text-ink/60">Sign in</p>
      <h2 className="font-display text-2xl font-bold tracking-tight mt-2 mb-6">Welcome back</h2>
      <label className="block eyebrow text-ink/60 mb-1" htmlFor="login-email">Email</label>
      <input id="login-email" type="email" autoComplete="email" className={`${input} mb-3`} placeholder="you@company.co" value={email} onChange={e=>setEmail(e.target.value)} />
      <label className="block eyebrow text-ink/60 mb-1" htmlFor="login-password">Password</label>
      <input id="login-password" type="password" autoComplete="current-password" className={input} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} />
      {err && <p role="alert" className="font-mono text-xs text-signal mt-3">{err}</p>}
      <button className="rounded-lg bg-ink text-paper px-4 py-2.5 w-full mt-5 font-mono text-xs uppercase tracking-wider hover:bg-signal transition-colors" onClick={async()=>{
        const s = createBrowserSupabase();
        const { error } = await s.auth.signInWithPassword({ email, password });
        if (error) setErr(error.message); else router.push('/');
      }}>Sign in</button>
      <p className="font-mono text-xs text-ink/60 mt-4">No account? <a className="underline decoration-signal decoration-2 underline-offset-4 hover:text-signal" href="/signup">Sign up</a></p>
    </AuthShell>
  );
}
