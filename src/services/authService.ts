import { supabase } from '../lib/supabase';

export const authService = {
  async signUp(email: string, password: string, username: string) {
    return await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
  },
  async signIn(email: string, password: string) {
    return await supabase.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return await supabase.auth.signOut();
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }
};