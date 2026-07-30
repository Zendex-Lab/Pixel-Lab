export interface Database {
  public: {
    Tables: {
      pixels: {
        Row: {
          x: number
          y: number
          color_idx: number
          updated_by: string
          updated_at: string
        }
        Insert: {
          x: number
          y: number
          color_idx: number
          updated_by?: string
          updated_at?: string
        }
        Update: {
          color_idx?: number
          updated_by?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          username: string
          charges: number
          max_charges: number
          last_regen_time: string
        }
        Update: {
          charges?: number
          max_charges?: number
          last_regen_time?: string
        }
      }
    }
  }
}
