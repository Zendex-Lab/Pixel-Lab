import { supabase } from '../lib/supabase'

export interface Alliance {
  id: string
  name: string
  description: string | null
  emoji: string
  created_at: string
  owner_id: string
  member_count?: number
}

export interface AllianceMember {
  alliance_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  user_profiles?: {
    username: string
  }
}

export const allianceService = {
  // RPC Calls
  async createAlliance(
    name: string,
    description: string,
    emoji: string,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_alliance', {
      p_name: name,
      p_description: description,
      p_emoji: emoji,
    })
    if (error) throw error
    return data
  },

  async joinAlliance(allianceId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('join_alliance', {
      p_alliance_id: allianceId,
    })
    if (error) throw error
    return data
  },

  async leaveAlliance(): Promise<boolean> {
    const { data, error } = await supabase.rpc('leave_alliance')
    if (error) throw error
    return data
  },

  async transferOwnership(targetUserId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('transfer_alliance_ownership', {
      p_target_user_id: targetUserId,
    })
    if (error) throw error
    return data
  },

  async kickMember(targetUserId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('kick_alliance_member', {
      p_target_user_id: targetUserId,
    })
    if (error) throw error
    return data
  },

  // Queries
  async searchAlliances(query: string = ''): Promise<Alliance[]> {
    // Basic prefix search or list all
    let req = supabase
      .from('alliances')
      .select('id, name, description, emoji, created_at, owner_id')
    if (query) {
      req = req.ilike('name', `%${query}%`)
    }
    const { data, error } = await req
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('Error searching alliances:', error)
      return []
    }

    // Since mock client might return empty arrays, default to []
    if (!data) return []

    // As a workaround to get member counts without a dedicated RPC/View for now,
    // we can either map through them or just not show exact counts efficiently.
    // For this task, we will fetch exact counts if needed, but for list let's just do a basic map if required.
    // Given the mock constraints, we return as is. The UI can handle missing member counts.

    // Try to get member counts for each
    const alliancesWithCounts = await Promise.all(
      data.map(async (alliance) => {
        const { count } = await supabase
          .from('alliance_members')
          .select('*', { count: 'exact', head: true })
          .eq('alliance_id', alliance.id)
        return { ...alliance, member_count: count ?? 1 } as Alliance
      }),
    )

    return alliancesWithCounts
  },

  async getUserAlliance(
    userId: string,
  ): Promise<{ alliance: Alliance; role: 'owner' | 'member' } | null> {
    // Find the member record
    const { data: memberData, error: memberError } = await supabase
      .from('alliance_members')
      .select('alliance_id, role')
      .eq('user_id', userId)
      .maybeSingle()

    if (memberError || !memberData) return null

    // Find the alliance details
    const { data: allianceData, error: allianceError } = await supabase
      .from('alliances')
      .select('*')
      .eq('id', memberData.alliance_id)
      .maybeSingle()

    if (allianceError || !allianceData) return null

    return {
      alliance: allianceData as Alliance,
      role: memberData.role as 'owner' | 'member',
    }
  },

  async getAllianceMembers(allianceId: string): Promise<AllianceMember[]> {
    const { data, error } = await supabase
      .from('alliance_members')
      .select(
        `
        alliance_id,
        user_id,
        role,
        joined_at,
        user_profiles(username)
      `,
      )
      .eq('alliance_id', allianceId)
      .order('role', { ascending: false }) // 'owner' comes before 'member' typically

    if (error) {
      console.error('Error fetching alliance members:', error)
      return []
    }

    return (data || []) as any as AllianceMember[]
  },
}
