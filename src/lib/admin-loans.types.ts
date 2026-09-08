import type { TransactionType, ItemType, Item, Location, Cabinet } from "@/lib/database.types"

export interface AdminLoan {
  id: string
  borrower_name: string
  type: TransactionType
  return_date: string | null
  notes: string | null
  status: "aktif" | "selesai"
  created_by: string
  created_at: string
  updated_at: string
  items?: AdminLoanItem[]
}

export interface AdminLoanItem {
  id: string
  admin_loan_id: string
  item_id: string
  item_name: string
  item_type: ItemType
  unit: string
  location_id: string
  quantity: number
  created_at: string
  item?: Item
  location?: Location & { cabinet?: Cabinet }
}
