import * as React from "react"
import { supabase } from "@/lib/supabase"
import { useInfiniteRows } from "@/hooks/use-infinite-rows"
import { toast } from "sonner"
import {
  Search,
  Loader2,
  ClipboardList,
  PackageCheck,
  PackageX,
  Check,
  X,
  CheckCheck,
  User,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type LoanRequestItem = {
  id: string
  item_name: string
  item_sku: string | null
  quantity: number
}

type LoanRequest = {
  id: string
  code: string
  item_id: string | null
  item_name: string | null
  item_sku: string | null
  quantity: number | null
  borrower_name: string
  return_date: string | null
  status: string
  prepared: boolean
  notes: string | null
  created_at: string
  items?: LoanRequestItem[]
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  menunggu_approval: { label: "Menunggu", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  disetujui: { label: "Disetujui", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  ditolak: { label: "Ditolak", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  selesai: { label: "Dikembalikan", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
}

export default function LoanRequestsPage() {
  const [requests, setRequests] = React.useState<LoanRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<string>("all")
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    let data: unknown = null
    let errorMsg: string | null = null

    // Prefer the row with its items; fall back to the plain table if the
    // multi-item migration hasn't been applied on this project yet.
    const withItems = await supabase
      .from("loan_requests")
      .select("*, items:loan_request_items(*)")
      .order("created_at", { ascending: false })

    if (withItems.error) {
      const plain = await supabase
        .from("loan_requests")
        .select("*")
        .order("created_at", { ascending: false })
      data = plain.data
      errorMsg = plain.error?.message ?? null
    } else {
      data = withItems.data
    }

    if (errorMsg) toast.error("Gagal memuat pengajuan: " + errorMsg)
    setRequests(((data as LoanRequest[] | null) ?? []))
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      const itemNames = (r.items ?? []).map((it) => it.item_name).join(" ")
      const matchSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        (r.item_name ?? "").toLowerCase().includes(q) ||
        itemNames.toLowerCase().includes(q) ||
        r.borrower_name.toLowerCase().includes(q) ||
        (r.item_sku ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || r.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [requests, search, filterStatus])

  const { shown, hasMore, sentinelRef } = useInfiniteRows(filtered, 15)

  const patch = async (id: string, values: Partial<LoanRequest>) => {
    setBusyId(id)
    const { error } = await supabase.from("loan_requests").update(values).eq("id", id)
    if (error) {
      toast.error("Gagal memperbarui: " + error.message)
      setBusyId(null)
      return
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...values } : r)))
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <ClipboardList className="size-5 text-primary sm:size-6" />
          Pengajuan Pinjam (Publik)
        </h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Pengajuan dari halaman publik tanpa login. Tandai kesiapan barang dan setujui/tolak.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari kode, barang, atau peminjam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="menunggu_approval">Menunggu</SelectItem>
            <SelectItem value="disetujui">Disetujui</SelectItem>
            <SelectItem value="ditolak">Ditolak</SelectItem>
            <SelectItem value="selesai">Dikembalikan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="border rounded-lg">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>Belum ada pengajuan</EmptyTitle>
            <EmptyDescription>
              {search || filterStatus !== "all" ? "Tidak ada pengajuan sesuai filter." : "Pengajuan dari halaman publik akan muncul di sini."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const status = STATUS_LABEL[r.status] ?? { label: r.status, className: "" }
            return (
              <div key={r.id} className="space-y-3 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{r.code}</Badge>
                  <Badge variant="outline" className={status.className}>{status.label}</Badge>
                  <Badge
                    variant="outline"
                    className={r.prepared ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}
                  >
                    {r.prepared ? <PackageCheck className="size-3.5" /> : <PackageX className="size-3.5" />}
                    {r.prepared ? "Disiapkan" : "Belum"}
                  </Badge>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {r.items && r.items.length > 0 ? (
                      <div className="space-y-1.5">
                        {r.items.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5"
                          >
                            <span className="min-w-0 truncate text-sm font-medium">{it.item_name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">× {it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-medium">
                        {r.item_name ?? (
                          <span className="text-muted-foreground">
                            Item tidak terbaca — pastikan migrasi multi-item sudah dijalankan di Supabase.
                          </span>
                        )}
                        {r.quantity ? <span className="ml-1 text-muted-foreground">× {r.quantity}</span> : null}
                      </p>
                    )}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><User className="size-3" />{r.borrower_name}</span>
                      {r.return_date && (
                        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />Kembali: {r.return_date}</span>
                      )}
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "menunggu_approval" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => void patch(r.id, { status: "disetujui" })}
                      >
                        <Check className="size-4" />
                        <span className="hidden sm:inline">Setujui</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => void patch(r.id, { status: "ditolak" })}
                      >
                        <X className="size-4" />
                        <span className="hidden sm:inline">Tolak</span>
                      </Button>
                    </>
                  )}

                  {/* Only after approval can the item be marked as prepared */}
                  {r.status === "disetujui" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { prepared: !r.prepared })}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : r.prepared ? (
                        <PackageX className="size-4" />
                      ) : (
                        <PackageCheck className="size-4" />
                      )}
                      <span className="hidden sm:inline">{r.prepared ? "Batal siapkan" : "Tandai disiapkan"}</span>
                    </Button>
                  )}

                  {/* Return only makes sense once the item has been prepared */}
                  {r.status === "disetujui" && r.prepared && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => void patch(r.id, { status: "selesai" })}
                    >
                      <CheckCheck className="size-4" />
                      <span className="hidden sm:inline">Dikembalikan</span>
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          {filtered.length > 0 && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              {hasMore ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40" />
                  <span className="hidden sm:inline">Memuat…</span>
                </span>
              ) : (
                <span className="hidden sm:inline">Semua {filtered.length} pengajuan</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
