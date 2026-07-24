import { supabase } from '../lib/supabase';

export const userService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) console.error('Error loading profile:', error);
    return data;
  },

  async updateCharges(userId: string, charges: number, max_charges: number) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ charges, max_charges, last_regen_time: new Date().toISOString() })
      .eq('id', userId);
    if (error) console.error('Error updating charges:', error);
  },

  async recordShopPurchase(userId: string, charges: number, max_charges: number) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ 
        charges, 
        max_charges, 
        last_regen_time: new Date().toISOString(),
        last_shop_purchase_at: new Date().toISOString()
      })
      .eq('id', userId);
    if (error) console.error('Error recording shop purchase:', error);
  },

  // ===== ADMIN METHODS =====

  async updateAdminUserStats(targetUserId: string, charges: number, max_charges: number) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ charges, max_charges })
      .eq('id', targetUserId);
    if (error) {
      console.error('Error updating admin stats:', error);
      return false;
    }
    return true;
  },

  async resetShopCooldown(targetUserId: string) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ last_shop_purchase_at: null })
      .eq('id', targetUserId);
    if (error) {
      console.error('Error resetting shop cooldown:', error);
      return false;
    }
    return true;
  }
};