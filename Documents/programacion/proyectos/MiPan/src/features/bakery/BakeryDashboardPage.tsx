import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDaysYmd, mondayFromAnyYmd, mondayWeekStart } from '../../lib/week'
import { fetchBakeryProduction, type BakeryRow } from '../../services/orders'
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '../../types/database'
import { AppNavbar } from '../../components/layout/AppNavbar'
import { Button } from '../../components/ui/Button'
import { Loader } from '../../components/ui/Loader'

function displayNombreApellido(c: {
  full_name: string | null
  given_name: string | null
  family_name: string | null
}) {
  const parts = (c.full_name?.trim() ?? '').split(/\s+/).filter(Boolean)
  const nombre = c.given_name ?? (parts[0] !== undefined ? parts[0] : null) ?? '—'
  const apellido =
    c.family_name ??
    (parts.length > 1 ? parts.slice(1).join(' ') : null) ??
    '—'
  return { nombre, apellido }
}

function aggregateByProduct(rows: BakeryRow[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.product_name, (map.get(r.product_name) ?? 0) + r.quantity)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function groupByCustomer(rows: BakeryRow[]) {
  const map = new Map<
    string,
    {
      user_id: string
      full_name: string | null
      given_name: string | null
      family_name: string | null
      email: string | null
      phone: string | null
      address: string | null
      lines: { product_name: string; quantity: number }[]
    }
  >()
  for (const r of rows) {
    const key = r.user_id
    if (!map.has(key)) {
      map.set(key, {
        user_id: r.user_id,
        full_name: r.full_name,
        given_name: r.given_name,
        family_name: r.family_name,
        email: r.email,
        phone: r.phone,
        address: r.address,
        lines: [],
      })
    }
    map.get(key)!.lines.push({ product_name: r.product_name, quantity: r.quantity })
  }
  return [...map.values()].sort((a, b) =>
    (a.full_name ?? a.user_id).localeCompare(b.full_name ?? b.user_id),
  )
}

export function BakeryDashboardPage() {
  const [weekStart, setWeekStart] = useState(() => mondayWeekStart())
  const [day, setDay] = useState<number>(1)
  const [rows, setRows] = useState<BakeryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBakeryProduction(weekStart, day)
      setRows(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [weekStart, day])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => aggregateByProduct(rows), [rows])
  const customers = useMemo(() => groupByCustomer(rows), [rows])

  function shiftWeek(d: number) {
    setWeekStart((w) => addDaysYmd(w, d * 7))
  }

  return (
    <div className="min-h-svh font-sans text-ink">
      <AppNavbar />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Producción y reparto
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Pedidos confirmados por semana y día. Totales para hornear y detalle para el reparto.
          </p>
        </header>

        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-[var(--color-border)] bg-card p-5 shadow-md shadow-stone-900/[0.04] sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">
              Semana (lunes)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="!min-h-10 !px-3" onClick={() => shiftWeek(-1)}>
                ←
              </Button>
              <input
                type="date"
                className="min-h-10 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                value={weekStart}
                onChange={(e) => {
                  const v = e.target.value
                  if (v) setWeekStart(mondayFromAnyYmd(v))
                }}
              />
              <Button variant="secondary" className="!min-h-10 !px-3" onClick={() => shiftWeek(1)}>
                →
              </Button>
              <Button variant="ghost" className="!min-h-10 !text-sm" onClick={() => setWeekStart(mondayWeekStart())}>
                Semana actual
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted">
              Día de reparto
            </label>
            <select
              className="min-h-10 w-full min-w-[10rem] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-auto"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {WEEKDAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" className="!min-h-10 w-full sm:w-auto" onClick={load}>
            Actualizar datos
          </Button>
        </div>

        {error && (
          <p className="mb-6 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-900 shadow-sm">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader label="Cargando producción…" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--color-border)] bg-card p-5 shadow-md shadow-stone-900/[0.04] sm:p-6">
              <h2 className="font-display text-lg font-semibold text-ink">
                Totales · {WEEKDAY_LABELS[day]}
              </h2>
              <p className="mt-1 text-xs text-muted">Semana del {weekStart}</p>
              {totals.length === 0 ? (
                <p className="mt-6 text-sm text-muted">No hay unidades para este día.</p>
              ) : (
                <div className="mt-5 overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50/90">
                      <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-right">Unidades</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] bg-white">
                      {totals.map(([name, qty]) => (
                        <tr key={name} className="transition-colors hover:bg-amber-50/30">
                          <td className="px-4 py-3 font-medium text-ink">{name}</td>
                          <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-accent">
                            {qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--color-border)] bg-card p-5 shadow-md shadow-stone-900/[0.04] sm:p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink">Detalle por cliente</h2>
              <p className="mt-1 text-xs text-muted">
                {WEEKDAY_LABELS[day]} · {customers.length}{' '}
                {customers.length === 1 ? 'cliente' : 'clientes'}
              </p>
              {customers.length === 0 ? (
                <p className="mt-6 text-sm text-muted">Sin clientes con pedido este día.</p>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-border)] shadow-inner">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-stone-100/95 backdrop-blur">
                      <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                        <th className="whitespace-nowrap px-4 py-3">Nombre</th>
                        <th className="whitespace-nowrap px-4 py-3">Apellido</th>
                        <th className="whitespace-nowrap px-4 py-3">Correo</th>
                        <th className="whitespace-nowrap px-4 py-3">Teléfono</th>
                        <th className="min-w-[8rem] px-4 py-3">Dirección</th>
                        <th className="min-w-[10rem] px-4 py-3">Pedido ({WEEKDAY_LABELS[day]})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] bg-white">
                      {customers.map((c) => {
                        const { nombre, apellido } = displayNombreApellido(c)
                        return (
                          <tr key={c.user_id} className="align-top transition-colors hover:bg-stone-50/80">
                            <td className="px-4 py-3 font-medium text-ink">
                              {nombre}
                              <div className="mt-1 max-w-[10rem] truncate font-mono text-[10px] font-normal text-muted">
                                {c.user_id}
                              </div>
                            </td>
                            <td className="px-4 py-3">{apellido}</td>
                            <td className="max-w-[12rem] break-all px-4 py-3 text-muted">{c.email ?? '—'}</td>
                            <td className="whitespace-nowrap px-4 py-3">{c.phone ?? '—'}</td>
                            <td className="max-w-[14rem] px-4 py-3 text-muted">{c.address ?? '—'}</td>
                            <td className="px-4 py-3">
                              <ul className="space-y-1.5 text-ink">
                                {c.lines.map((l) => (
                                  <li
                                    key={l.product_name}
                                    className="flex items-baseline justify-between gap-2 rounded-lg bg-stone-50 px-2 py-1 text-xs"
                                  >
                                    <span>{l.product_name}</span>
                                    <span className="font-bold tabular-nums text-accent">{l.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
