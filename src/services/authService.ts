import { supabase } from '../lib/supabase';

export const authService = {
  async signUp(email: string, password: string, username: string) {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        // Куда попадёт пользователь после клика по ссылке подтверждения почты
        emailRedirectTo: `${window.location.origin}/auth/confirm`
      }
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
  },
  async resetPasswordForEmail(email: string) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
  },
  async updatePassword(newPassword: string) {
    return await supabase.auth.updateUser({ password: newPassword });
  }
};