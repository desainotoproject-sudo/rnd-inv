export type UserRole = "rnd" | "guest"
export type ItemType = "isi" | "kosong_box"
export type StockStatus = "tersedia" | "kosong" | "dipinjam" | "menunggu_approval"
export type TransactionType = "pinjam" | "titip"
export type TransactionStatus = "menunggu_approval" | "disetujui" | "ditolak"
export type NotificationType = "new_request" | "approved" | "rejected" | "request_created"

export interface Profile {
  id: string
  full_name: string
  division: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Cabinet {
  id: string
  code: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  cabinet_id: string
  code: string
  name: string | null
  description: string | null
  created_at: string
  updated_at: string
  cabinet?: Cabinet
}

export interface Item {
  id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  item_type: ItemType
  description: string | null
  created_at: string
  updated_at: string
}

export interface StockEntry {
  id: string
  item_id: string
  location_id: string
  quantity: number
  status: StockStatus
  notes: string | null
  created_at: string
  updated_at: string
  item?: Item
  location?: Location & { cabinet?: Cabinet }
}

export interface Transaction {
  id: string
  requester_id: string
  type: TransactionType
  item_id: string | null
  item_name: string
  item_type: ItemType
  unit: string
  location_id: string
  quantity: number
  status: TransactionStatus
  rejection_reason: string | null
  reviewer_id: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  requester?: Profile
  reviewer?: Profile
  location?: Location & { cabinet?: Cabinet }
  item?: Item
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  transaction_id: string | null
  is_read: boolean
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, "created_at" | "updated_at">
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>
      }
      cabinets: {
        Row: Cabinet
        Insert: Omit<Cabinet, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Cabinet, "id" | "created_at" | "updated_at">>
      }
      locations: {
        Row: Location
        Insert: Omit<Location, "id" | "created_at" | "updated_at" | "cabinet">
        Update: Partial<Omit<Location, "id" | "created_at" | "updated_at" | "cabinet">>
      }
      items: {
        Row: Item
        Insert: Omit<Item, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Item, "id" | "created_at" | "updated_at">>
      }
      stock_entries: {
        Row: StockEntry
        Insert: Omit<StockEntry, "id" | "created_at" | "updated_at" | "item" | "location">
        Update: Partial<Omit<StockEntry, "id" | "created_at" | "updated_at" | "item" | "location">>
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, "id" | "created_at" | "updated_at" | "requester" | "reviewer" | "location" | "item">
        Update: Partial<Omit<Transaction, "id" | "created_at" | "updated_at" | "requester" | "reviewer" | "location" | "item">>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, "id" | "created_at">
        Update: Partial<Omit<Notification, "id" | "created_at">>
      }
    }
    Enums: {
      user_role: UserRole
      item_type: ItemType
      stock_status: StockStatus
      transaction_type: TransactionType
      transaction_status: TransactionStatus
      notification_type: NotificationType
    }
  }
}
