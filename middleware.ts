import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supa = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (k: string) => req.cookies.get(k)?.value, set: (k, v, o) => res.cookies.set(k, v, o), remove: (k, o) => res.cookies.set(k, '', o) },
  });
  const { data } = await supa.auth.getUser();
  if (!data.user && (req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/leads'))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}
export const config = { matcher: ['/', '/leads/:path*'] };
