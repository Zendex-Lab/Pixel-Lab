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

  async placePixel(x: number, y: number, color_idx: number, userId: string) {
    const { error } = await supabase
      .from('pixels')
      .upsert(
        { x, y, color_idx, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: 'x,y' }
      );

    if (error) {
      console.error('Error placing pixel:', error);
    }
  },

  async placePixelsBatch(pixels: { x: number; y: number; color_idx: number }[], userId: string) {
    if (!pixels.length) return;

    const payload = pixels.map((p) => ({
      x: p.x,
      y: p.y,
      color_idx: p.color_idx,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('pixels')
      .upsert(payload, { onConflict: 'x,y' });

    if (error) {
      console.error('Error placing pixel batch:', error);
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