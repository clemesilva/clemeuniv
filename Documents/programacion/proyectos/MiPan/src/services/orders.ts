import { supabase } from '../lib/supabaseClient'
import type { WeeklyOrder, WeeklyOrderItem } from '../types/database'

export type OrderWithItems = WeeklyOrder & {
  weekly_order_items: WeeklyOrderItem[]
}

export async function getOrCreateWeeklyOrder(
  userId: string,
  weekStart: string,
): Promise<WeeklyOrder> {
  const { data: existing, error: findErr } = await supabase
    .from('weekly_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (findErr) throw findErr
  if (existing) return existing as WeeklyOrder

  const { data: created, error: insErr } = await supabase
    .from('weekly_orders')
    .insert({ user_id: userId, week_start: weekStart, status: 'draft' })
    .select()
    .single()

  if (insErr) throw insErr
  return created as WeeklyOrder
}

/** Todas las semanas del usuario con fila en `weekly_orders` (más recientes primero). */
export async function fetchWeeklyOrdersForUser(userId: string): Promise<WeeklyOrder[]> {
  const { data, error } = await supabase
    .from('weekly_orders')
    .select('*')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })

  if (error) throw error
  return (data ?? []) as WeeklyOrder[]
}

export async function fetchWeeklyOrderWithItems(
  orderId: string,
): Promise<OrderWithItems | null> {
  const { data, error } = await supabase
    .from('weekly_orders')
    .select('*, weekly_order_items(*)')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  return data as OrderWithItems | null
}

export type ItemCell = {
  product_id: string
  day_of_week: number
  quantity: number
}

export async function upsertOrderItems(
  weeklyOrderId: string,
  items: ItemCell[],
): Promise<void> {
  const rows = items
    .filter((i) => i.quantity > 0)
    .map((i) => ({
      weekly_order_id: weeklyOrderId,
      product_id: i.product_id,
      day_of_week: i.day_of_week,
      quantity: i.quantity,
    }))

  const { error: delErr } = await supabase
    .from('weekly_order_items')
    .delete()
    .eq('weekly_order_id', weeklyOrderId)

  if (delErr) throw delErr

  if (rows.length === 0) return

  const { error: insErr } = await supabase.from('weekly_order_items').insert(rows)
  if (insErr) throw insErr
}

export async function confirmWeeklyOrder(orderId: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_orders')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'draft')

  if (error) throw error
}

export type BakeryRow = {
  order_id: string
  user_id: string
  full_name: string | null
  given_name: string | null
  family_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  product_id: string
  product_name: string
  day_of_week: number
  quantity: number
}

export async function fetchBakeryProduction(
  weekStart: string,
  dayOfWeek: number,
): Promise<BakeryRow[]> {
  const { data: orders, error: ordErr } = await supabase
    .from('weekly_orders')
    .select('id, user_id')
    .eq('week_start', weekStart)
    .eq('status', 'confirmed')

  if (ordErr) throw ordErr
  if (!orders?.length) return []

  const orderIds = orders.map((o) => o.id)
  const userIds = [...new Set(orders.map((o) => o.user_id))]

  const [{ data: profiles, error: profErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, given_name, family_name, email, phone, address')
        .in('id', userIds),
      supabase
        .from('weekly_order_items')
        .select(
          `
          quantity,
          day_of_week,
          product_id,
          weekly_order_id,
          products ( id, name )
        `,
        )
        .in('weekly_order_id', orderIds)
        .eq('day_of_week', dayOfWeek),
    ])

  if (profErr) throw profErr
  if (itemsErr) throw itemsErr

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p as {
        full_name: string | null
        given_name: string | null
        family_name: string | null
        email: string | null
        phone: string | null
        address: string | null
      },
    ]),
  )
  const orderMeta = new Map(orders.map((o) => [o.id, o.user_id]))

  type ItemRow = {
    quantity: number
    day_of_week: number
    product_id: string
    weekly_order_id: string
    products: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const normalized = (items ?? []) as ItemRow[]

  return normalized.map((row) => {
    const prod = Array.isArray(row.products) ? row.products[0] : row.products
    const uid = orderMeta.get(row.weekly_order_id) ?? ''
    const prof = profileById.get(uid)
    return {
      order_id: row.weekly_order_id,
      user_id: uid,
      full_name: prof?.full_name ?? null,
      given_name: prof?.given_name ?? null,
      family_name: prof?.family_name ?? null,
      email: prof?.email ?? null,
      phone: prof?.phone ?? null,
      address: prof?.address ?? null,
      product_id: prod?.id ?? row.product_id,
      product_name: prod?.name ?? '',
      day_of_week: row.day_of_week,
      quantity: row.quantity,
    }
  })
}
