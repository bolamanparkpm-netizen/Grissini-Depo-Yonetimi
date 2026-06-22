import { supabase } from '../lib/supabase'

/**
 * Audit log kaydı oluşturur.
 * Her önemli işlemden sonra çağrılır.
 */
export function useAudit() {
  const log = async ({
    userEmail,
    userId,
    action,
    tableName,
    recordId,
    oldValues,
    newValues,
  }) => {
    try {
      await supabase.from('audit_logs').insert({
        user_id:    userId,
        user_email: userEmail,
        action,
        table_name: tableName,
        record_id:  recordId,
        old_values: oldValues ? JSON.stringify(oldValues) : null,
        new_values: newValues ? JSON.stringify(newValues) : null,
      })
    } catch (err) {
      // Audit log hatası uygulamayı durdurmasın
      console.error('Audit log hatası:', err)
    }
  }

  return { log }
}