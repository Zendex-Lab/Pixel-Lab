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

  // Пересчёт зарядов теперь считает сервер (по last_regen_time), а не клиент.
  // Заменяет старый updateCharges(userId, charges, max_charges).
  async syncCharges() {
    const { data, error } = await supabase.rpc('sync_charges');
    if (error) {
      console.error('Error syncing charges:', error);
      return null;
    }
    return data?.[0] ?? null;
  },

  async buyChargePack(amount: number) {
    const { data, error } = await supabase.rpc('shop_buy_charge_pack', {
      p_amount: amount,
    });
    if (error) {
      console.error('Error buying charge pack:', error);
      throw error;
    }
    return data?.[0] ?? null;
  },

  async buyLimitUpgrade() {
    const { data, error } = await supabase.rpc('shop_buy_limit_upgrade');
    if (error) {
      console.error('Error buying limit upgrade:', error);
      throw error;
    }
    return data?.[0] ?? null;
  },

  async updateAdminUserStats(targetUserId: string, charges: number, max_charges: number) {
    const { data, error } = await supabase.rpc('admin_update_user_stats', {
      p_target_id: targetUserId,
      p_charges: charges,
      p_max_charges: max_charges,
    });
    if (error) {
      console.error('Error updating admin stats:', error);
      return false;
    }
    return Boolean(data);
  },

  async resetShopCooldown(targetUserId: string) {
    const { data, error } = await supabase.rpc('admin_reset_shop_cooldown', {
      p_target_id: targetUserId,
    });
    if (error) {
      console.error('Error resetting shop cooldown:', error);
      return false;
    }
    return Boolean(data);
  }
};