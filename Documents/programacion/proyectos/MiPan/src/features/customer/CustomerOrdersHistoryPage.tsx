import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchWeeklyOrdersForUser } from '../../services/orders'
import type { WeeklyOrder } from '../../types/database'
import { formatWeekRangeEs } from '../../lib/week'
import { AppNavbar } from '../../components/layout/AppNavbar'
import { Loader } from '../../components/ui/Loader'

export function CustomerOrdersHistoryPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<WeeklyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchWeeklyOrdersForUser(user.id)
      setOrders(rows)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-svh pb-12 font-sans text-ink">
      <AppNavbar />

      <main className="mx-auto max-w-xl px-4 py-6 sm:max-w-2xl sm:px-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Mis pedidos</h1>
        <p className="mt-2 text-sm text-muted">
          Semanas en las que ya tienes un pedido (borrador o confirmado). Abre una para ver o editar
          según el estado.
        </p>

        {error && (
          <p className="mt-6 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-900 shadow-sm">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader label="Cargando historial…" />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-12 text-center">
            <p className="text-sm text-muted">
              Aún no hay pedidos guardados. Ve a{' '}
              <Link to="/app/pedido" className="font-semibold text-accent underline-offset-2 hover:underline">
                Pedido semanal
              </Link>{' '}
              para armar tu primera semana.
            </p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/app/pedido?semana=${encodeURIComponent(o.week_start)}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-card p-4 shadow-sm transition hover:border-amber-200/90 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-ink">{formatWeekRangeEs(o.week_start)}</p>
                    <p className="text-xs text-muted">Lunes {o.week_start}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        o.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80'
                          : 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80'
                      }`}
                    >
                      {o.status === 'confirmed' ? 'Confirmado' : 'Borrador'}
                    </span>
                    <span className="text-sm font-semibold text-accent">Ver →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
