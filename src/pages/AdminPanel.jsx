import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import RoleGuard from '../components/RoleGuard'
import { exportToCsv } from '../utils/exportCsv'

const ROLE_LABELS = {
  uretim: '🏭 Üretim',
  kalite: '🧪 Kalite',
  depocu: '📦 Depocu',
  mudur:  '👔 Müdür',
  admin:  '⚙️ Admin',
}

export default function AdminPanel() {
  const { user, profile } = useAuth()
  const [users, setUsers] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [targets, setTargets] = useState([])
  const [tab, setTab] = useState('users')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(null)
  const [newTarget, setNewTarget] = useState({
    shift: 'sabah', target_kg: '', bonus_amount: ''
  })

  const isAuthorized = profile?.role === 'admin' || profile?.role === 'mudur'

  useEffect(() => {
    if (!isAuthorized) return
    if (tab === 'users')   fetchUsers()
    if (tab === 'logs')    fetchLogs()
    if (tab === 'targets') fetchTargets()
  }, [tab, isAuthorized]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const { data, error } = await supabase
      .from('shift_targets')
      .select('*')
      .order('shift')
      .order('target_kg')
    if (error) console.error('Hedef yükleme hatası:', error)
    setTargets(data || [])
    setLoading(false)
  }

  // Rol değişikliği — sadece local state güncelle
  const handleRoleChange = (userId, newRole) => {
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, role: newRole, _dirty: true } : u
    ))
  }

  // Rol kaydet — Supabase'e yaz
  const handleSaveRole = async (userId) => {
    const targetUser = users.find(u => u.id === userId)
    if (!targetUser) return
    setSaving(userId)
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: targetUser.role })
      .eq('id', userId)
    if (error) {
      alert('Kayıt hatası: ' + error.message)
      fetchUsers()
    } else {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, _dirty: false } : u
      ))
    }
    setSaving(null)
  }

  // Yeni hedef ekle
  const handleAddTarget = async () => {
    if (!newTarget.target_kg || !newTarget.bonus_amount) {
      alert('Hedef kg ve prim miktarını girin')
      return
    }
    const { error } = await supabase.from('shift_targets').insert({
      shift:        newTarget.shift,
      target_kg:    parseFloat(newTarget.target_kg),
      bonus_amount: parseFloat(newTarget.bonus_amount),
      valid_from:   new Date().toISOString().split('T')[0],
    })
    if (error) {
      alert('Hedef eklenemedi: ' + error.message)
      return
    }
    setNewTarget({ shift: 'sabah', target_kg: '', bonus_amount: '' })
    fetchTargets()
  }

  // Hedef sil
  const handleDeleteTarget = async (id) => {
    if (!confirm('Bu hedefi silmek istediğinize emin misiniz?')) return
    await supabase.from('shift_targets').delete().eq('id', id)
    fetchTargets()
  }

  // Logları Excel'e aktar
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
      saat:       new Date(l.created_at).toLocaleTimeString('tr-TR', {
                    hour: '2-digit', minute: '2-digit'
                  }),
      kullanici:  l.user_email || '—',
      islem:      l.action,
      tablo:      l.table_name || '—',
      yeni_deger: l.new_values
                    ? JSON.stringify(l.new_values).slice(0, 200)
                    : '—',
    }))
    exportToCsv('audit-log.csv', rows, columns)
  }

  const tabs = [
    { key: 'users',   label: '👥 Kullanıcılar' },
    { key: 'targets', label: '🎯 Vardiya Hedefleri' },
    { key: 'logs',    label: '📜 İşlem Günlüğü' },
  ]

  if (!isAuthorized) {
    return (
      <div className="p-4 max-w-2xl mx-auto text-center py-12">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-gray-500">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">⚙️ Yönetim Paneli</h2>

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
          {users.length === 0 && (
            <p className="text-center text-gray-400 py-8">Kullanıcı bulunamadı</p>
          )}
          {users.map(u => (
            <div key={u.id}
                 className={`bg-white rounded-xl border p-4
                             flex items-center justify-between gap-3
                             ${u._dirty ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.email}</p>
                <p className="text-xs text-gray-400">
                  {u.full_name || 'İsim girilmemiş'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {u._dirty && (
                  <button
                    onClick={() => handleSaveRole(u.id)}
                    disabled={saving === u.id}
                    className="text-sm bg-amber-600 hover:bg-amber-700
                               disabled:bg-amber-300 text-white font-medium
                               px-3 py-1.5 rounded-lg whitespace-nowrap"
                  >
                    {saving === u.id ? '...' : '💾 Kaydet'}
                  </button>
                )}
              </div>
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
                         font-medium py-2 rounded-lg text-sm transition-colors"
            >
              + Hedef Ekle
            </button>
          </div>

          {/* Mevcut hedefler */}
          {targets.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">
              Henüz hedef tanımlanmamış
            </p>
          ) : (
            <div className="space-y-2">
              {targets.map(t => (
                <div key={t.id}
                     className="bg-white rounded-xl border border-gray-100 p-3
                                flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">
                      {t.shift === 'sabah' ? '🌅' :
                       t.shift === 'aksam' ? '🌆' : '🌙'} {t.shift}
                    </span>
                    <span className="text-sm text-gray-600 ml-3">
                      {t.target_kg} kg → ₺{t.bonus_amount} prim
                    </span>
                  </div>
                  {profile?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteTarget(t.id)}
                      className="text-red-400 hover:text-red-600 text-sm px-2 py-1"
                    >
                      🗑️ Sil
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* İŞLEM GÜNLÜĞÜ */}
      {!loading && tab === 'logs' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={handleExportLogs}
              disabled={auditLogs.length === 0}
              className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-300
                         text-white font-medium px-3 py-2 rounded-lg"
            >
              📥 Excel'e Aktar
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">
              Henüz işlem kaydı yok
            </p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map(l => (
                <div key={l.id}
                     className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{l.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {l.user_email} · {l.table_name || '—'}
                      </p>
                      {l.new_values && (
                        <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                          {typeof l.new_values === 'string'
                            ? l.new_values.slice(0, 80)
                            : JSON.stringify(l.new_values).slice(0, 80)}
                          {JSON.stringify(l.new_values || '').length > 80 ? '...' : ''}
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
          )}
        </div>
      )}
    </div>
  )
}