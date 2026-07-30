import { supabase } from '../lib/supabase'
import { userService } from '../services/userService'

export interface PixelInfo {
  color_idx: number
  username: string | null
  updated_at: string
  alliance_name?: string
  alliance_emoji?: string
}

export const pixelService = {
  async loadAllPixels() {
    const { data, error } = await supabase
      .from('pixels')
      .select('x, y, color_idx')
      .range(0, 99999)

    if (error) {
      console.error('Error loading pixels:', error)
      return []
    }

    return data || []
  },

  async placePixel(x: number, y: number, color_idx: number) {
    const { error } = await supabase.rpc('place_pixel', {
      p_x: x,
      p_y: y,
      p_color_idx: color_idx,
    })

    if (error) {
      console.error('Error placing pixel:', error)
      throw error
    }
  },

  async placePixelsBatch(
    pixels: { x: number; y: number; color_idx: number }[],
    _userId: string,
  ) {
    if (!pixels.length) return

    const { error } = await supabase.rpc('place_pixels_batch', {
      p_pixels: pixels,
    })

    if (error) {
      console.error('Error placing pixel batch:', error)
      throw error
    }
  },

  async getPixelInfo(x: number, y: number): Promise<PixelInfo | null> {
    try {
      const { data: pixel, error: pixelError } = await supabase
        .from('pixels')
        .select('*')
        .eq('x', x)
        .eq('y', y)
        .maybeSingle()

      if (pixelError) throw pixelError
      if (!pixel) return null

      let username = null
      let allianceName = undefined
      let allianceEmoji = undefined

      if (pixel.updated_by) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', pixel.updated_by)
          .maybeSingle()

        if (profile) {
          username = profile.username
        }

        const { data: memberData } = await supabase
          .from('alliance_members')
          .select('alliance_id')
          .eq('user_id', pixel.updated_by)
          .maybeSingle()

        if (memberData?.alliance_id) {
          const { data: allianceData } = await supabase
            .from('alliances')
            .select('name, emoji')
            .eq('id', memberData.alliance_id)
            .maybeSingle()

          if (allianceData) {
            allianceName = allianceData.name
            allianceEmoji = allianceData.emoji
          }
        }
      }

      return {
        color_idx: pixel.color_idx,
        username: username,
        updated_at: pixel.updated_at || new Date().toISOString(),
        alliance_name: allianceName,
        alliance_emoji: allianceEmoji,
      }
    } catch (err) {
      console.error('Ошибка при загрузке инфы о пикселе:', err)
      throw err
    }
  },

  // Админская заливка прямоугольной области одним RPC-вызовом.
  // Права проверяются на бэкенде (см. миграцию admin_fill_area.sql) — без лимитов
  // на заряды/кулдаун, но с серверным потолком на размер области.
  // Возвращает количество заполненных ячеек.
  async adminFillArea(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    colorIdx: number,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('admin_fill_area', {
      p_min_x: minX,
      p_min_y: minY,
      p_max_x: maxX,
      p_max_y: maxY,
      p_color_idx: colorIdx,
    })

    if (error) {
      console.error('Error filling area:', error)
      throw error
    }

    return (data as number) ?? 0
  },

  subscribeToPixels(
    onUpdate: (payload: { x: number; y: number; color_idx: number }) => void,
  ) {
    const channel = supabase
      .channel('public:pixels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pixels' },
        (payload) => {
          const newRow = payload.new as {
            x: number
            y: number
            color_idx: number
          }
          if (
            newRow &&
            typeof newRow.x === 'number' &&
            typeof newRow.y === 'number'
          ) {
            onUpdate(newRow)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}
