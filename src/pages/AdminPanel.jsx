import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import RoleGuard from '../components/RoleGuard'
import { exportToCsv } from '../utils/exportCsv'

const ROLE_LABELS = {
  uretim:  '🏭 Üretim',
  kalite:  '🧪 Kalite',
  depocu:  '📦 Depocu',
  mudur:   '👔 Müdür',
  admin:   '⚙️ Admin',
}

export default function AdminPanel() {
  const { profile, canEdit } = useAuth()
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [targets, setTargets] = useState([])
  const [tab, setTab] = useState('users')
  const [loading, setLoading] = useState(false)
  const [newTarget, setNewTarget] = useState({ shift: 'sabah', target_kg: '', bonus_amount: '' })

  useEffect(() => {
    if (tab === 'users')   fetchUsers()
    if (tab === 'logs')    fetchLogs()
    if (tab === 'targets') fetchTargets()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setAuditLogs(data || [])
    setLoading(false)
  }

  const fetchTargets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('shift_targets')
      .select('*')
      .order('shift')
      .order('target_kg')
    setTargets(data || [])
    setLoading(false)
  }

  const handleRoleChange = async (userId, newRole) => {
    await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)
    fetchUsers()
  }

  const handleAddTarget = async () => {
    if (!newTarget.target_kg || !newTarget.bonus_amount) return
    await supabase.from('shift_targets').insert({
      shift:        newTarget.shift,
      target_kg:    parseFloat(newTarget.target_kg),
      bonus_amount: parseFloat(newTarget.bonus_amount),
      valid_from:   new Date().toISOString().split('T')[0],
    })
    setNewTarget({ shift: 'sabah', target_kg: '', bonus_amount: '' })
    fetchTargets()
  }

  const handleDeleteTarget = async (id) => {
    if (!confirm('Bu hedefi silmek istediğinize emin misiniz?')) return
    await supabase.from('shift_targets').delete().eq('id', id)
    fetchTargets()
  }

  const handleExportLogs = () => {
    const columns = [
      { key: 'tarih',      label: 'Tarih' },
      { key: 'saat',       label: 'Saat' },
      { key: 'kullanici',  label: 'Kullanıcı' },
      { key: 'islem',      label: 'İşlem' },
      { key: 'tablo',      label: 'Tablo' },
      { key: 'yeni_deger', label: 'Yeni Değer' },
    ]
    const rows = auditLogs.map(l => ({
      tarih:      new Date(l.created_at).toLocaleDateString('tr-TR'),
      saat:       new Date(l.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      kullanici:  l.user_email || '—',
      islem:      l.action,
      tablo:      l.table_name || '—',
      yeni_deger: l.new_values ? JSON.stringify(l.new_values) : '—',
    }))
    exportToCsv('audit-log.csv', rows, columns)
  }

  const tabs = [
    { key: 'users',   label: '👥 Kullanıcılar' },
    { key: 'targets', label: '🎯 Vardiya Hedefleri' },
    { key: 'logs',    label: '📜 İşlem Günlüğü' },
  ]

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">⚙️ Yönetim Paneli</h2>

      <RoleGuard allowed={canEdit('production') === false && (profile?.role === 'admin' || profile?.role === 'mudur')
        || profile?.role === 'admin' || profile?.role === 'mudur'}>

        {/* Tab menüsü */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium
                          transition-colors
                          ${tab === t.key
                            ? 'bg-amber-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent
                            rounded-full animate-spin" />
          </div>
        )}

        {/* KULLANICILAR */}
        {!loading && tab === 'users' && (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id}
                   className="bg-white rounded-xl border border-gray-100 p-4
                              flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{u.email}</p>
                  <p className="text-xs text-gray-400">{u.full_name || 'İsim girilmemiş'}</p>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  disabled={profile?.role !== 'admin'}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-amber-500
                             disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* VARDİYA HEDEFLERİ */}
        {!loading && tab === 'targets' && (
          <div>
            {/* Yeni hedef ekle */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-amber-800 mb-3">Yeni Hedef Ekle</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <select
                  value={newTarget.shift}
                  onChange={(e) => setNewTarget({ ...newTarget, shift: e.target.value })}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="sabah">🌅 Sabah</option>
                  <option value="aksam">🌆 Akşam</option>
                  <option value="gece">🌙 Gece</option>
                </select>
                <input
                  type="number"
                  placeholder="Hedef (kg)"
                  value={newTarget.target_kg}
                  onChange={(e) => setNewTarget({ ...newTarget, target_kg: e.target.value })}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="number"
                  placeholder="Prim (₺)"
                  value={newTarget.bonus_amount}
                  onChange={(e) => setNewTarget({ ...newTarget, bonus_amount: e.target.value })}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <button
                onClick={handleAddTarget}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white
                           font-medium py-2 rounded-lg text-sm"
              >
                + Hedef Ekle
              </button>
            </div>

            {/* Mevcut hedefler */}
            <div className="space-y-2">
              {targets.map(t => (
                <div key={t.id}
                     className="bg-white rounded-xl border border-gray-100 p-3
                                flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">
                      {t.shift === 'sabah' ? '🌅' : t.shift === 'aksam' ? '🌆' : '🌙'} {t.shift}
                    </span>
                    <span className="text-sm text-gray-600 ml-3">
                      {t.target_kg} kg → ₺{t.bonus_amount} prim
                    </span>
                  </div>
                  {profile?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteTarget(t.id)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      Sil
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* İŞLEM GÜNLÜĞÜ */}
        {!loading && tab === 'logs' && (
          <div>
            <div className="flex justify-end mb-3">
              <button
                onClick={handleExportLogs}
                className="text-sm bg-green-600 hover:bg-green-700 text-white
                           font-medium px-3 py-2 rounded-lg"
              >
                📥 Excel'e Aktar
              </button>
            </div>
            <div className="space-y-2">
              {auditLogs.map(l => (
                <div key={l.id}
                     className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{l.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {l.user_email} · {l.table_name || '—'}
                      </p>
                      {l.new_values && (
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">
                          {typeof l.new_values === 'string'
                            ? l.new_values.slice(0, 80)
                            : JSON.stringify(l.new_values).slice(0, 80)}
                          {JSON.stringify(l.new_values).length > 80 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">
                        {new Date(l.created_at).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(l.created_at).toLocaleTimeString('tr-TR', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </RoleGuard>
    </div>
  )
}