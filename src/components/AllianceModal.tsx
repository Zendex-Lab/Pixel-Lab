import React, { useState, useEffect } from 'react'
import {
  Shield,
  X,
  Users,
  LogOut,
  Plus,
  Search,
  Crown,
  Trash2,
} from 'lucide-react'
import {
  allianceService,
  type Alliance,
  type AllianceMember,
} from '../services/allianceService'

interface AllianceModalProps {
  onClose: () => void
  currentUserId: string
}

export default function AllianceModal({
  onClose,
  currentUserId,
}: AllianceModalProps) {
  const [loading, setLoading] = useState(true)
  const [userAlliance, setUserAlliance] = useState<{
    alliance: Alliance
    role: 'owner' | 'member'
  } | null>(null)

  // Browsing State
  const [searchQuery, setSearchQuery] = useState('')
  const [alliances, setAlliances] = useState<Alliance[]>([])
  const [isCreating, setIsCreating] = useState(false)

  // Create State
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createEmoji, setCreateEmoji] = useState('🛡️')
  const [createError, setCreateError] = useState('')

  // Members State (when in an alliance)
  const [members, setMembers] = useState<AllianceMember[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const uAlliance = await allianceService.getUserAlliance(currentUserId)
      setUserAlliance(uAlliance)

      if (uAlliance) {
        const mems = await allianceService.getAllianceMembers(
          uAlliance.alliance.id,
        )
        setMembers(mems)
      } else {
        const results = await allianceService.searchAlliances(searchQuery)
        setAlliances(results)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, isCreating])

  useEffect(() => {
    if (!userAlliance && !isCreating) {
      const delaySearch = setTimeout(async () => {
        const results = await allianceService.searchAlliances(searchQuery)
        setAlliances(results)
      }, 300)
      return () => clearTimeout(delaySearch)
    }
  }, [searchQuery, userAlliance, isCreating])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    if (!createName.trim()) return setCreateError('Name is required')
    if (!createEmoji.trim()) return setCreateError('Emoji is required')

    try {
      await allianceService.createAlliance(
        createName.trim(),
        createDescription.trim(),
        createEmoji.trim(),
      )
      setIsCreating(false)
      await loadData()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create alliance')
    }
  }

  const handleJoin = async (allianceId: string) => {
    try {
      await allianceService.joinAlliance(allianceId)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to join alliance')
    }
  }

  const handleLeave = async () => {
    if (!userAlliance) return

    if (userAlliance.role === 'owner') {
      if (members.length > 1) {
        alert(
          'You must transfer ownership or kick members first before leaving.',
        )
        return
      }
      if (!confirm('Are you sure you want to disband this alliance?')) return
    } else {
      if (!confirm('Are you sure you want to leave this alliance?')) return
    }

    try {
      await allianceService.leaveAlliance()
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to leave alliance')
    }
  }

  const handleKick = async (targetId: string) => {
    if (!confirm('Kick this member?')) return
    try {
      await allianceService.kickMember(targetId)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to kick member')
    }
  }

  const handleTransfer = async (targetId: string) => {
    if (!confirm('Transfer ownership? You will become a regular member.'))
      return
    try {
      await allianceService.transferOwnership(targetId)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to transfer ownership')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="glass-strong w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-[var(--glass-border)] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--glass-bg)] z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 border-b border-[var(--glass-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Альянсы</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {userAlliance
                  ? 'Ваш альянс и участники'
                  : 'Найдите альянс или создайте свой'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
              Загрузка...
            </div>
          ) : userAlliance ? (
            // === USER IS IN AN ALLIANCE ===
            <div className="space-y-6 animate-in fade-in">
              {/* Alliance Header */}
              <div className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-8xl opacity-5 pointer-events-none blur-sm">
                  {userAlliance.alliance.emoji}
                </div>

                <div className="h-16 w-16 rounded-2xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center text-3xl shadow-inner shrink-0 z-10">
                  {userAlliance.alliance.emoji}
                </div>

                <div className="flex-1 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-xl font-bold">
                      {userAlliance.alliance.name}
                    </h4>
                    {userAlliance.role === 'owner' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <Crown className="h-3 w-3" /> Владелец
                      </span>
                    )}
                  </div>
                  {userAlliance.alliance.description && (
                    <p className="text-sm text-[var(--muted-foreground)] mb-2">
                      {userAlliance.alliance.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <Users className="h-3.5 w-3.5" />
                    <span>Участников: {members.length}</span>
                  </div>
                </div>

                <div className="z-10 self-start">
                  <button
                    onClick={handleLeave}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors text-sm font-semibold border border-red-500/20"
                  >
                    <LogOut className="h-4 w-4" />
                    {userAlliance.role === 'owner' && members.length === 1
                      ? 'Распустить'
                      : 'Покинуть'}
                  </button>
                </div>
              </div>

              {/* Members List */}
              <div>
                <h5 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[var(--muted-foreground)] uppercase tracking-wider">
                  <Users className="h-4 w-4" /> Список участников
                </h5>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center border ${member.role === 'owner' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-[var(--glass-bg-strong)] border-[var(--glass-border)] text-[var(--muted-foreground)]'}`}
                        >
                          {member.role === 'owner' ? (
                            <Crown className="h-4 w-4" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-bold flex items-center gap-2">
                            {member.user_profiles?.username || 'Unknown'}
                            {member.user_id === currentUserId && (
                              <span className="text-[10px] bg-[var(--primary)]/20 text-[var(--primary)] px-1.5 py-0.5 rounded font-medium">
                                Вы
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            Присоединился{' '}
                            {new Date(member.joined_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {userAlliance.role === 'owner' &&
                        member.user_id !== currentUserId && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTransfer(member.user_id)}
                              className="p-2 rounded-lg bg-[var(--glass-bg)] hover:bg-amber-500/10 text-[var(--muted-foreground)] hover:text-amber-500 transition-colors border border-[var(--glass-border)]"
                              title="Передать права владельца"
                            >
                              <Crown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleKick(member.user_id)}
                              className="p-2 rounded-lg bg-[var(--glass-bg)] hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-500 transition-colors border border-[var(--glass-border)]"
                              title="Исключить"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : isCreating ? (
            // === CREATE ALLIANCE ===
            <form
              onSubmit={handleCreate}
              className="space-y-5 animate-in slide-in-from-right-4 fade-in"
            >
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-4"
              >
                ← Назад к списку
              </button>

              <h4 className="text-xl font-bold mb-4">Создание альянса</h4>

              {createError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  {createError}
                </div>
              )}

              <div className="flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                    Название (до 24 симв.)
                  </label>
                  <input
                    type="text"
                    maxLength={24}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] focus:border-[var(--primary)] outline-none transition-colors"
                    placeholder="Название"
                    required
                  />
                </div>
                <div className="w-24 space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                    Эмодзи
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={createEmoji}
                    onChange={(e) => setCreateEmoji(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] focus:border-[var(--primary)] outline-none transition-colors text-center text-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Описание (необязательно, до 200 симв.)
                </label>
                <textarea
                  maxLength={200}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] focus:border-[var(--primary)] outline-none transition-colors resize-none h-24"
                  placeholder="Опишите ваш альянс..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)] mt-2"
              >
                Создать альянс
              </button>
            </form>
          ) : (
            // === BROWSE ALLIANCES ===
            <div className="space-y-5 animate-in fade-in">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск альянсов..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] focus:border-[var(--primary)] outline-none transition-colors text-sm"
                  />
                </div>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-bold hover:opacity-90 active:scale-95 transition-all shrink-0"
                >
                  <Plus className="h-5 w-5" />
                  Создать
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {alliances.length === 0 ? (
                  <div className="text-center py-10 text-[var(--muted-foreground)] text-sm">
                    Альянсы не найдены.
                  </div>
                ) : (
                  alliances.map((alliance) => (
                    <div
                      key={alliance.id}
                      className="flex items-center p-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] transition-colors group"
                    >
                      <div className="h-12 w-12 rounded-xl bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] flex items-center justify-center text-2xl mr-4 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        {alliance.emoji}
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="text-base font-bold truncate">
                          {alliance.name}
                        </h4>
                        {alliance.description && (
                          <p className="text-xs text-[var(--muted-foreground)] truncate max-w-[90%]">
                            {alliance.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-semibold">
                          <Users className="h-3 w-3" />
                          <span>
                            Участников: {alliance.member_count ?? '?'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleJoin(alliance.id)}
                        className="px-4 py-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] font-bold transition-all text-sm shrink-0"
                      >
                        Вступить
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
