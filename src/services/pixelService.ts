import { supabase } from '../lib/supabase';

export const pixelService = {
  async loadAllPixels() {
    const { data, error } = await supabase
      .from('pixels')
      .select('x, y, color_idx');
    if (error) console.error('Error loading pixels:', error);
    return data || [];
  },

  async placePixel(x: number, y: number, color_idx: number, userId: string) {
    const { error } = await supabase
      .from('pixels')
      .upsert({ x, y, color_idx, updated_by: userId });
    if (error) console.error('Error placing pixel:', error);
  },

  async placePixelsBatch(pixels: {x: number, y: number, color_idx: number}[], userId: string) {
    const payload = pixels.map(p => ({ ...p, updated_by: userId }));
    const { error } = await supabase
      .from('pixels')
      .upsert(payload);
    if (error) console.error('Error placing batch pixels:', error);
  },

  subscribeToPixels(onUpdate: (payload: { x: number, y: number, color_idx: number }) => void) {
    const channel = supabase.channel('public:pixels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pixels' },
        (payload) => {
          const newRow = payload.new as { x: number, y: number, color_idx: number };
          if (newRow) onUpdate(newRow);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }
};