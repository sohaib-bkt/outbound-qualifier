'use client';
import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('');
  const router = useRouter();
  return (<main className="max-w-sm mx-auto p-8">
    <h1 className="text-xl font-bold mb-4">Login</h1>
    <input className="border p-2 w-full mb-2" placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
    <input className="border p-2 w-full mb-2" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
    {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
    <button className="bg-black text-white px-4 py-2 w-full" onClick={async()=>{
      const s = createBrowserSupabase();
      const { error } = await s.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message); else router.push('/');
    }}>Sign in</button>
  </main>);
}
