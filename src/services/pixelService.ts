import { supabase } from '../lib/supabase';
import { userService } from '../services/userService' 

export interface PixelInfo {
  color_idx: number;
  username: string | null;
  updated_at: string;
}

export const pixelService = {
  async loadAllPixels() {
    const { data, error } = await supabase
      .from('pixels')
      .select('x, y, color_idx')
      .range(0, 99999);

    if (error) {
      console.error('Error loading pixels:', error);
      return [];
    }

    return data || [];
  },

  async placePixel(x: number, y: number, color_idx: number) {
    const { error } = await supabase.rpc('place_pixel', {
      p_x: x,
      p_y: y,
      p_color_idx: color_idx,
    });

    if (error) {
      console.error('Error placing pixel:', error);
      throw error;
    }
  },

  async placePixelsBatch(pixels: { x: number; y: number; color_idx: number }[], _userId: string) {
    if (!pixels.length) return;

    const { error } = await supabase.rpc('place_pixels_batch', {
      p_pixels: pixels,
    });

    if (error) {
      console.error('Error placing pixel batch:', error);
      throw error;
    }
  },

  async getPixelInfo(x: number, y: number): Promise<PixelInfo | null> {
    try {
      const { data: pixel, error: pixelError } = await supabase
        .from('pixels')
        .select('*')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle();

      if (pixelError) throw pixelError;
      if (!pixel) return null;

      let username = null;
      if (pixel.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', pixel.user_id)
          .maybeSingle();
        
        if (profile) {
          username = profile.username;
        }
      }

      return {
        color_idx: pixel.color_idx,
        username: username,
        updated_at: pixel.updated_at || new Date().toISOString(),
      };
    } catch (err) {
      console.error('Ошибка при загрузке инфы о пикселе:', err);
      throw err;
    }
  },

  subscribeToPixels(onUpdate: (payload: { x: number; y: number; color_idx: number }) => void) {
    const channel = supabase
      .channel('public:pixels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pixels' },
        (payload) => {
          const newRow = payload.new as { x: number; y: number; color_idx: number };
          if (newRow && typeof newRow.x === 'number' && typeof newRow.y === 'number') {
            onUpdate(newRow);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};