import * as React from "react"
import {
  Search,
  Filter,
  ArrowUpFromLine,
  ArrowDownToLine,
  CheckCircle2,
  XCircle,
  Clock,
  History,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  Item,
  Location,
  Cabinet,
  Profile,
} from "@/lib/database.types"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ElementType; class: string }> = {
  pinjam: { label: "Pinjam", icon: ArrowUpFromLine, class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  titip: { label: "Titip", icon: ArrowDownToLine, class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
}

const STATUS_CONFIG: Record<TransactionStatus, { label: string; icon: React.ElementType; class: string }> = {
  menunggu_approval: { label: "Menunggu", icon: Clock, class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400" },
  disetujui: { label: "Disetujui", icon: CheckCircle2, class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
  ditolak: { label: "Ditolak", icon: XCircle, class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400" },
}

type TxnWithRelations = Transaction & {
  requester: Profile
  reviewer: Profile | null
  location: Location & { cabinet: Cabinet }
  item: Item | null
}

export default function HistoryPage() {
  const { profile } = useAuth()
  const isRND = profile?.role === "rnd"
  const [transactions, setTransactions] = React.useState<TxnWithRelations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterType, setFilterType] = React.useState<TransactionType | "all">("all")
  const [filterStatus, setFilterStatus] = React.useState<TransactionStatus | "all">("all")
  const [filterDivision, setFilterDivision] = React.useState("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")

  const loadData = React.useCallback(async () => {
    let query = supabase
      .from("transactions")
      .select(`*, requester:profiles!transactions_requester_id_fkey(*), reviewer:profiles!transactions_reviewer_id_fkey(*), location:locations(*, cabinet:cabinets(*)), item:items(*)`)
      .order("created_at", { ascending: false })

    if (!isRND) {
      query = query.eq("requester_id", profile!.id)
    }

    const { data } = await query
    setTransactions((data ?? []) as TxnWithRelations[])
    setLoading(false)
  }, [isRND, profile])

  React.useEffect(() => { loadData() }, [loadData])

  const divisions = React.useMemo(() => {
    const divs = new Set(transactions.map((t) => t.requester?.division).filter(Boolean))
    return ["all", ...Array.from(divs)]
  }, [transactions])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter((t) => {
      const matchSearch =
        t.item_name.toLowerCase().includes(q) ||
        (t.requester?.full_name ?? "").toLowerCase().includes(q) ||
        (t.reviewer?.full_name ?? "").toLowerCase().includes(q) ||
        (t.location?.code ?? "").toLowerCase().includes(q)
      const matchType = filterType === "all" || t.type === filterType
      const matchStatus = filterStatus === "all" || t.status === filterStatus
      const matchDiv = filterDivision === "all" || t.requester?.division === filterDivision
      const txnDate = new Date(t.created_at)
      const matchFrom = !dateFrom || txnDate >= new Date(dateFrom)
      const matchTo = !dateTo || txnDate <= new Date(dateTo + "T23:59:59")
      return matchSearch && matchType && matchStatus && matchDiv && matchFrom && matchTo
    })
  }, [transactions, search, filterType, filterStatus, filterDivision, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Riwayat Transaksi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isRND
            ? "Seluruh riwayat pengajuan pinjam dan titip barang."
            : "Riwayat pengajuan pinjam dan titip barang Anda."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Cari barang, pemohon, atau reviewer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as TransactionType | "all")}>
          <SelectTrigger className="w-32">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="pinjam">Pinjam</SelectItem>
            <SelectItem value="titip">Titip</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TransactionStatus | "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="menunggu_approval">Menunggu</SelectItem>
            <SelectItem value="disetujui">Disetujui</SelectItem>
            <SelectItem value="ditolak">Ditolak</SelectItem>
          </SelectContent>
        </Select>
        {isRND && (
          <Select value={filterDivision} onValueChange={setFilterDivision}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Divisi" />
            </SelectTrigger>
            <SelectContent>
              {divisions.map((d) => (
                <SelectItem key={d} value={d}>{d === "all" ? "Semua Divisi" : d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-36"
          placeholder="Dari"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-36"
          placeholder="Sampai"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><History /></EmptyMedia>
              <EmptyTitle>Belum ada riwayat</EmptyTitle>
              <EmptyDescription>
                {search || filterType !== "all" || filterStatus !== "all" || filterDivision !== "all" || dateFrom || dateTo
                  ? "Tidak ada transaksi yang sesuai filter."
                  : "Belum ada transaksi yang tercatat."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jenis</TableHead>
                <TableHead>Barang</TableHead>
                {isRND && <TableHead>Pemohon</TableHead>}
                <TableHead>Lokasi</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_CONFIG[txn.type].class}>
                      {TYPE_CONFIG[txn.type].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{txn.item_name}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {txn.item_type === "isi" ? "Isi" : "Kosong/Box"}
                      </Badge>
                    </div>
                  </TableCell>
                  {isRND && (
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{txn.requester?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{txn.requester?.division}</p>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                        {txn.location?.cabinet?.code}
                      </Badge>
                      <span className="text-sm text-foreground">{txn.location?.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-sm">{txn.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-1">{txn.unit}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <Badge variant="outline" className={STATUS_CONFIG[txn.status].class}>
                        {STATUS_CONFIG[txn.status].label}
                      </Badge>
                      {txn.status === "ditolak" && txn.rejection_reason && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-40 truncate" title={txn.rejection_reason}>
                          {txn.rejection_reason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {txn.reviewer ? (
                      <span className="text-sm text-foreground">{txn.reviewer.full_name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(txn.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Menampilkan {filtered.length} dari {transactions.length} transaksi
        </p>
      )}
    </div>
  )
}
