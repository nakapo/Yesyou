import { createClient } from "@supabase/supabase-js";
// Keep direct import.meta.env access: Vite replaces these at build time.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!(url && publishableKey);
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null;
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
