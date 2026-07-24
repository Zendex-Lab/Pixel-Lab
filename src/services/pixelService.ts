import { supabase } from '../lib/supabase';

export const pixelService = {
  async loadAllPixels() {
    console.log('🔍 [1. LOAD] Запрашиваем пиксели из базы данных...');
    
    const { data, error } = await supabase
      .from('pixels')
      .select('x, y, color_idx')
      .range(0, 99999);

    if (error) {
      console.error('❌ [1. LOAD ERROR] Ошибка при загрузке пикселей:', error);
      return [];
    }

    console.log(`✅ [1. LOAD OK] Успешно получено пикселей из БД: ${data?.length || 0}`, data);
    return data || [];
  },

  async placePixel(x: number, y: number, color_idx: number, userId: string) {
    console.log(`🚀 [2. PLACE SINGLE] Отправка пикселя: (${x}, ${y}), цвет: ${color_idx}, userId: ${userId}`);
    
    const { error } = await supabase
      .from('pixels')
      .upsert(
        { x, y, color_idx, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: 'x,y' }
      );
      
    if (error) {
      console.error('❌ [2. PLACE ERROR] Ошибка при сохранении одного пикселя:', error);
    } else {
      console.log('✅ [2. PLACE OK] Пиксель успешно сохранён!');
    }
  },

  async placePixelsBatch(pixels: { x: number; y: number; color_idx: number }[], userId: string) {
    if (!pixels.length) {
      console.warn('⚠️ [2. BATCH] Попытка отправить пустой массив пикселей.');
      return;
    }

    const payload = pixels.map((p) => ({
      x: p.x,
      y: p.y,
      color_idx: p.color_idx,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }));

    console.log(`🚀 [2. BATCH SAVE] Отправка батча из ${pixels.length} пикселей. UserId: "${userId}"`, payload);

    const { error } = await supabase
      .from('pixels')
      .upsert(payload, { onConflict: 'x,y' });

    if (error) {
      console.error('❌ [2. BATCH ERROR] Ошибка при сохранении пакета пикселей:', error);
    } else {
      console.log('✅ [2. BATCH OK] Пакет пикселей успешно сохранён в БД!');
    }
  },

  subscribeToPixels(onUpdate: (payload: { x: number; y: number; color_idx: number }) => void) {
    console.log('📡 [REALTIME] Подключаемся к подписке postgres_changes (таблица pixels)...');

    const channel = supabase
      .channel('public:pixels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pixels' },
        (payload) => {
          console.log('⚡ [REALTIME EVENT] Получено изменение в реальном времени:', payload);
          const newRow = payload.new as { x: number; y: number; color_idx: number };
          if (newRow && typeof newRow.x === 'number' && typeof newRow.y === 'number') {
            onUpdate(newRow);
          } else {
            console.warn('⚠️ [REALTIME WARN] Некорректный формат строки:', newRow);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 [REALTIME STATUS] Статус подписки: ${status}`);
      });

    return () => {
      console.log('🔌 [REALTIME] Отключение от канала Realtime...');
      supabase.removeChannel(channel);
    };
  },
};