export type UserRole = 'customer' | 'bakery_admin'
export type OrderStatus = 'draft' | 'confirmed'

export type Profile = {
  id: string
  role: UserRole
  /** Nombre para mostrar (OAuth o manual) */
  full_name: string | null
  given_name: string | null
  family_name: string | null
  email: string | null
  avatar_url: string | null
  phone: string | null
  address: string | null
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  name: string
  sort_order: number
  active: boolean
}

export type WeeklyOrder = {
  id: string
  user_id: string
  week_start: string
  status: OrderStatus
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export type WeeklyOrderItem = {
  id: string
  weekly_order_id: string
  product_id: string
  day_of_week: number
  quantity: number
}

/** 1 = lunes … 6 = sábado */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
}

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6] as const
