import { createClient } from "@supabase/supabase-js";
const env = import.meta as unknown as { env: Record<string, string> };
export const configured = !!(
  env.env.VITE_SUPABASE_URL && env.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
export const supabase = configured
  ? createClient(
      env.env.VITE_SUPABASE_URL,
      env.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    )
  : null;
export async function identity() {
  if (!supabase) throw Error("ยังไม่ได้ตั้งค่า Supabase");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const r = await supabase.auth.signInAnonymously();
    if (r.error) throw r.error;
  }
}
export async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw Error("ยังไม่ได้ตั้งค่า Supabase");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Error(error.message);
  return data;
}
