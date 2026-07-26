import { supabase } from '../lib/supabase';

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