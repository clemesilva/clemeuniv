import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { addDaysYmd, mondayFromAnyYmd, mondayWeekStart } from '../../lib/week'
import { fetchActiveProducts } from '../../services/products'
import {
  confirmWeeklyOrder,
  fetchWeeklyOrderWithItems,
  getOrCreateWeeklyOrder,
  upsertOrderItems,
  type ItemCell,
} from '../../services/orders'
import type { Product, WeeklyOrderItem } from '../../types/database'
import { WEEKDAY_ORDER } from '../../types/database'
import { AppNavbar } from '../../components/layout/AppNavbar'
import { Button } from '../../components/ui/Button'
import { Loader } from '../../components/ui/Loader'

/** Cantidad por día (lun–sáb, la misma) a partir de filas guardadas. */
function qtyPerDayFromItems(
  items: WeeklyOrderItem[] | undefined,
  productId: string,
): number {
  if (!items?.length) return 0
  const byDay = new Map<number, number>()
  for (const row of items) {
    if (row.product_id === productId) byDay.set(row.day_of_week, row.quantity)
  }
  if (byDay.size === 0) return 0
  const vals = WEEKDAY_ORDER.map((d) => byDay.get(d) ?? 0)
  const first = vals[0]
  if (vals.every((v) => v === first)) return first
  return byDay.get(1) ?? vals.find((v) => v > 0) ?? 0
}

export function CustomerWeeklyOrderPage() {
  const { user, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const semanaRaw = searchParams.get('semana')

  const [weekStart, setWeekStart] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('semana')
    return raw ? mondayFromAnyYmd(raw) : mondayWeekStart()
  })

  const [products, setProducts] = useState<Product[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'confirmed'>('draft')
  const [qtyPerDay, setQtyPerDay] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readOnly = status === 'confirmed'

  useEffect(() => {
    if (!searchParams.get('semana')) {
      setSearchParams({ semana: mondayWeekStart() }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (semanaRaw) {
      const m = mondayFromAnyYmd(semanaRaw)
      setWeekStart((prev) => (prev === m ? prev : m))
    }
  }, [semanaRaw])

  const setWeekAndUrl = useCallback(
    (ymd: string) => {
      const m = mondayFromAnyYmd(ymd)
      setWeekStart(m)
      setSearchParams({ semana: m }, { replace: true })
    },
    [setSearchParams],
  )

  const loadWeek = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [prods, order] = await Promise.all([
        fetchActiveProducts(),
        getOrCreateWeeklyOrder(user.id, weekStart),
      ])
      setProducts(prods)
      setOrderId(order.id)
      setStatus(order.status)

      const full = await fetchWeeklyOrderWithItems(order.id)
      const items = full?.weekly_order_items
      const next: Record<string, number> = {}
      for (const p of prods) {
        next[p.id] = qtyPerDayFromItems(items, p.id)
      }
      setQtyPerDay(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el pedido')
    } finally {
      setLoading(false)
    }
  }, [user, weekStart])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  function setProductQty(productId: string, value: string) {
    const n = Math.max(0, Number.parseInt(value, 10) || 0)
    setQtyPerDay((prev) => ({ ...prev, [productId]: n }))
  }

  const itemsPayload: ItemCell[] = useMemo(() => {
    const out: ItemCell[] = []
    for (const p of products) {
      const q = qtyPerDay[p.id] ?? 0
      if (q <= 0) continue
      for (const day of WEEKDAY_ORDER) {
        out.push({ product_id: p.id, day_of_week: day, quantity: q })
      }
    }
    return out
  }, [products, qtyPerDay])

  async function saveDraft() {
    if (!orderId || readOnly) return
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await upsertOrderItems(orderId, itemsPayload)
      setNotice('Borrador guardado.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function confirmOrder() {
    if (!orderId || readOnly) return
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await upsertOrderItems(orderId, itemsPayload)
      await confirmWeeklyOrder(orderId)
      setStatus('confirmed')
      setNotice('Pedido confirmado para esta semana. La panadería lo verá en su panel.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar')
    } finally {
      setSaving(false)
    }
  }

  function shiftWeek(deltaWeeks: number) {
    setWeekAndUrl(addDaysYmd(weekStart, deltaWeeks * 7))
  }

  const deliverySummary = [profile?.phone, profile?.address].filter(Boolean).join(' · ')

  if (loading && !orderId) {
    return (
      <div className="min-h-svh font-sans text-ink">
        <AppNavbar />
        <div className="flex justify-center py-24">
          <Loader label="Cargando tu semana…" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh pb-32 font-sans text-ink">
      <AppNavbar />

      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <Link
            to="/app/pedidos"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            ← Mis pedidos
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Pedido semanal
          </h1>
          <p className="mt-2 text-sm text-muted">
            Semana del{' '}
            <time dateTime={weekStart} className="font-semibold text-ink">
              {weekStart}
            </time>
            <span className="text-muted"> · </span>
            lun a sáb, misma cantidad cada día
          </p>
          <span
            className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${
              status === 'confirmed'
                ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80'
                : 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80'
            }`}
          >
            {status === 'confirmed' ? 'Confirmado' : 'Borrador'}
          </span>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-card p-3 shadow-sm sm:gap-3">
          <span className="w-full text-xs font-semibold uppercase tracking-wider text-muted sm:mb-0 sm:w-auto">
            Semana
          </span>
          <div className="flex w-full flex-1 flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              className="!min-h-10 flex-1 !px-3 !py-2 !text-sm sm:flex-none"
              onClick={() => shiftWeek(-1)}
            >
              <span className="sm:hidden">← Ant.</span>
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!min-h-10 flex-1 !px-3 !py-2 !text-sm sm:flex-none"
              onClick={() => setWeekAndUrl(mondayWeekStart())}
            >
              Esta semana
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!min-h-10 flex-1 !px-3 !py-2 !text-sm sm:flex-none"
              onClick={() => shiftWeek(1)}
            >
              <span className="sm:hidden">Sig. →</span>
              <span className="hidden sm:inline">Siguiente</span>
            </Button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-900 shadow-sm">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900 shadow-sm">
            {notice}
          </p>
        )}

        <section className="mb-8 rounded-2xl border border-[var(--color-border)] bg-card p-5 shadow-md shadow-stone-900/[0.04] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Datos de reparto</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                La panadería usa tu perfil para contactarte y llevar el pedido.
              </p>
              {deliverySummary ? (
                <p className="mt-3 text-sm text-ink">{deliverySummary}</p>
              ) : (
                <p className="mt-3 text-sm text-amber-800">Aún no has indicado teléfono ni dirección.</p>
              )}
            </div>
            <Link
              to="/app/perfil"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-accent shadow-sm transition hover:bg-accent-soft"
            >
              Editar perfil
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-card p-5 shadow-md shadow-stone-900/[0.04] sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Pan para la semana</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pensado para armar el pedido un <strong className="text-ink">domingo</strong>: eliges qué
            panes quieres y <strong className="text-ink">cuántas unidades cada día</strong> (lun–sáb,
            misma cantidad). Deja en 0 lo que no pedirás.
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-stone-50/90 to-white p-4 transition-colors hover:border-amber-200/80 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-base font-semibold text-ink">{p.name}</span>
                <label className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span className="text-sm font-medium text-muted">Unidades / día</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="h-12 w-[5.5rem] rounded-xl border border-[var(--color-border)] bg-white px-3 text-center text-lg font-semibold tabular-nums shadow-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/25"
                    value={qtyPerDay[p.id] ?? ''}
                    onChange={(e) => setProductQty(p.id, e.target.value)}
                    disabled={readOnly}
                    aria-label={`${p.name}: unidades por día`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--color-border)] bg-card/95 px-4 py-4 shadow-[0_-12px_40px_rgba(28,25,23,0.08)] backdrop-blur-md supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-xl gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={saving}
                onClick={saveDraft}
              >
                Guardar borrador
              </Button>
              <Button type="button" className="flex-1" disabled={saving} onClick={confirmOrder}>
                Confirmar semana
              </Button>
            </div>
          </div>
        )}

        {readOnly && (
          <p className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-4 text-center text-sm text-muted">
            Este pedido ya está confirmado. Si necesitas cambiarlo, contacta a la panadería.
          </p>
        )}
      </main>
    </div>
  )
}
