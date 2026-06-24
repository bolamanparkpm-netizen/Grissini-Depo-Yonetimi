import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAudit } from '../hooks/useAudit'
import { formatDate } from '../utils/batchUtils'
import RoleGuard from '../components/RoleGuard'

const QUALITY_LABELS = {
  pending:    { label: 'Analiz Bekliyor', color: 'bg-gray-100 text-gray-700',     icon: '⏳' },
  approved:   { label: 'Satışa Uygun',    color: 'bg-green-100 text-green-700',   icon: '✅' },
  rejected:   { label: 'Uygun Değil',     color: 'bg-red-100 text-red-700',       icon: '❌' },
  quarantine: { label: 'Karantina',       color: 'bg-orange-100 text-orange-700', icon: '🔬' },
}

export default function Quality() {
  const { user, canEdit } = useAuth()
  const { log } = useAudit()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [noteDrafts, setNoteDrafts] = useState({})
  const [actingId, setActingId] = useState(null)

  const fetchBatches = async () => {
    setLoading(true)
    let query = supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false })
    if (filterStatus !== 'all') {
      query = query.eq('quality_status', filterStatus)
    }
    const { data, error } = await query
    if (error) {
      console.error('Kalite listesi yukleme hatasi:', error)
    } else {
      setBatches(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBatches()
  }, [filterStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kalite durumu guncelle
  const handleSetStatus = async (batch, newStatus) => {
    setActingId(batch.id)
    try {
      const note = noteDrafts[batch.id] || ''

      let locationUpdate = { quality_status: newStatus, quality_notes: note || null }

      if (newStatus === 'approved') {
        locationUpdate = { ...locationUpdate, location: 'depo_b', status: 'transferred' }
      } else if (newStatus === 'quarantine') {
        locationUpdate = { ...locationUpdate, location: 'depo_karantina', status: 'quarantine' }
      } else if (newStatus === 'rejected') {
        locationUpdate = { ...locationUpdate, location: 'depo_karantina', status: 'rejected' }
      }

      const { error: updateError } = await supabase
        .from('batches')
        .update(locationUpdate)
        .eq('id', batch.id)
      if (updateError) throw updateError

      const actionMap = {
        approved:   'quality_approved',
        rejected:   'quality_rejected',
        quarantine: 'quality_quarantine',
      }

      const toLocation =
        newStatus === 'approved'   ? 'depo_b' :
        newStatus === 'quarantine' ? 'depo_karantina' :
        newStatus === 'rejected'   ? 'depo_karantina' : batch.location

      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: actionMap[newStatus],
        from_location: batch.location,
        to_location: toLocation,
        quantity_kg: batch.remaining_kg,
        performed_by: user?.email || 'sistem',
        notes: note || (
          newStatus === 'approved'   ? "Kalite onayi — Depo B'ye transfer" :
          newStatus === 'quarantine' ? 'Karantinaya alindi' :
                                       'Reddedildi — Karantina deposuna alindi'
        ),
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: `Kalite: ${newStatus} — ${batch.location} → ${toLocation}`,
        tableName: 'batches',
        recordId: batch.id,
        oldValues: { quality_status: batch.quality_status, location: batch.location },
        newValues: locationUpdate,
      })

      fetchBatches()
    } catch (err) {
      alert('Hata: ' + err.message)
    } finally {
      setActingId(null)
    }
  }

  // Imha islemi
  const handleImha = async (batch) => {
    if (!window.confirm(
      `"${batch.batch_no}" partisi imha edilecek!\n\n` +
      `Miktar: ${batch.quantity_kg} kg\n` +
      `Bu islem geri alinamaz. Onayliyor musunuz?`
    )) return

    setActingId(batch.id)
    try {
      const { error: updateError } = await supabase
        .from('batches')
        .update({
          status: 'imha_edildi',
          location: 'imha',
          remaining_kg: 0,
        })
        .eq('id', batch.id)
      if (updateError) throw updateError

      await supabase.from('movements').insert({
        batch_id: batch.id,
        action: 'imha_edildi',
        from_location: batch.location,
        to_location: 'imha',
        quantity_kg: batch.quantity_kg,
        performed_by: user?.email || 'sistem',
        notes: `Imha edildi — ${new Date().toLocaleString('tr-TR')}`,
      })

      await log({
        userId: user.id,
        userEmail: user.email,
        action: 'Parti imha edildi',
        tableName: 'batches',
        recordId: batch.id,
        oldValues: { status: batch.status, location: batch.location },
        newValues: { status: 'imha_edildi', location: 'imha', remaining_kg: 0 },
      })

      fetchBatches()
    } catch (err) {
      alert('Hata: ' + err.message)
    } finally {
      setActingId(null)
    }
  }

  const filters = [
    { key: 'pending',    label: '⏳ Bekleyen' },
    { key: 'quarantine', label: '🔬 Karantina' },
    { key: 'approved',   label: '✅ Uygun' },
    { key: 'rejected',   label: '❌ Uygun Değil' },
    { key: 'all',        label: 'Tumu' },
  ]

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">🧪 Kalite Kontrol</h2>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`flex-shrink-0 text-sm px-3 py-2 rounded-lg font-medium
                        transition-colors whitespace-nowrap
                        ${filterStatus === f.key
                          ? 'bg-amber-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent
                          rounded-full animate-spin" />
        </div>
      )}

      {!loading && batches.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Bu kategoride parti bulunamadi</p>
        </div>
      )}

      {!loading && batches.length > 0 && (
        <div className="space-y-3">
          {batches.map((batch) => {
            const q = QUALITY_LABELS[batch.quality_status] || QUALITY_LABELS.pending
            const isActing = actingId === batch.id
            return (
              <div key={batch.id}
                   className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-gray-800">
                      {batch.batch_no}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(batch.production_date)} · {batch.quantity_kg} kg
                      · {batch.location === 'depo_a'         ? 'Depo A' :
                         batch.location === 'depo_b'         ? 'Depo B' :
                         batch.location === 'depo_c'         ? 'Depo C' :
                         batch.location === 'depo_karantina' ? 'Karantina' :
                         batch.location === 'imha'           ? 'Imha Edildi' :
                         batch.location}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium
                                   whitespace-nowrap ${q.color}`}>
                    {q.icon} {q.label}
                  </span>
                </div>

                {batch.quality_notes && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                    📝 {batch.quality_notes}
                  </p>
                )}

                {/* Imha edilmisse input ve butonlar gosterme */}
                {batch.status !== 'imha_edildi' && (
                  <>
                    <input
                      type="text"
                      placeholder="Not ekle (opsiyonel)"
                      value={noteDrafts[batch.id] ?? ''}
                      onChange={(e) => setNoteDrafts({ ...noteDrafts, [batch.id]: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3
                                 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />

                    <RoleGuard allowed={canEdit('quality')}>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleSetStatus(batch, 'approved')}
                          disabled={isActing || batch.quality_status === 'approved'}
                          className="py-2 rounded-lg text-xs font-semibold transition-colors
                                     bg-green-50 text-green-700 hover:bg-green-100
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                        >✅ Uygun</button>
                        <button
                          onClick={() => handleSetStatus(batch, 'quarantine')}
                          disabled={isActing || batch.quality_status === 'quarantine'}
                          className="py-2 rounded-lg text-xs font-semibold transition-colors
                                     bg-orange-50 text-orange-700 hover:bg-orange-100
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                        >🔬 Karantina</button>
                        <button
                          onClick={() => handleSetStatus(batch, 'rejected')}
                          disabled={isActing || batch.quality_status === 'rejected'}
                          className="py-2 rounded-lg text-xs font-semibold transition-colors
                                     bg-red-50 text-red-700 hover:bg-red-100
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                        >❌ Uygun Degil</button>
                      </div>

                      {/* Imha butonu — sadece red veya karantinada olanlara */}
                      {(batch.quality_status === 'rejected' ||
                        batch.quality_status === 'quarantine') && (
                        <button
                          onClick={() => handleImha(batch)}
                          disabled={isActing}
                          className="w-full mt-2 py-2.5 rounded-lg text-xs font-semibold
                                     bg-gray-900 text-white hover:bg-black transition-colors
                                     disabled:opacity-40 disabled:cursor-not-allowed
                                     flex items-center justify-center gap-1.5"
                        >
                          🗑️ Imha Et — Stoktan Kalici Sil
                        </button>
                      )}
                    </RoleGuard>
                  </>
                )}

                {/* Imha edildi rozeti */}
                {batch.status === 'imha_edildi' && (
                  <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-gray-500 font-medium">
                      🗑️ Bu parti imha edilmistir
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}