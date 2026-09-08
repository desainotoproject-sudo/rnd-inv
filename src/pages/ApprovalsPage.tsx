import * as React from "react"
import {
  Check,
  X,
  ArrowUpFromLine,
  ArrowDownToLine,
  Loader2,
  Search,
  CheckCheck,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type {
  Transaction,
  TransactionType,
  Item,
  Location,
  Cabinet,
  Profile,
} from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { toast } from "sonner"

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ElementType; class: string }> = {
  pinjam: { label: "Pinjam", icon: ArrowUpFromLine, class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  titip: { label: "Titip", icon: ArrowDownToLine, class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
}

type TxnWithRelations = Transaction & {
  requester: Profile
  location: Location & { cabinet: Cabinet }
  item: Item | null
}

export default function ApprovalsPage() {
  const [transactions, setTransactions] = React.useState<TxnWithRelations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")

  const [rejectDialog, setRejectDialog] = React.useState<{ open: boolean; txn?: TxnWithRelations }>({ open: false })
  const [rejectReason, setRejectReason] = React.useState("")
  const [rejectError, setRejectError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [approvingId, setApprovingId] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    const { data } = await supabase
      .from("transactions")
      .select(`*, requester:profiles!transactions_requester_id_fkey(*), location:locations(*, cabinet:cabinets(*)), item:items(*)`)
      .eq("status", "menunggu_approval")
      .order("created_at", { ascending: false })
    setTransactions((data ?? []) as TxnWithRelations[])
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const filtered = React.useMemo(() => {
    if (!search) return transactions
    const q = search.toLowerCase()
    return transactions.filter((t) =>
      t.item_name.toLowerCase().includes(q) ||
      t.requester.full_name.toLowerCase().includes(q) ||
      t.requester.division.toLowerCase().includes(q) ||
      t.location.code.toLowerCase().includes(q)
    )
  }, [transactions, search])

  const handleApprove = async (txn: TxnWithRelations) => {
    setApprovingId(txn.id)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-approval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transaction_id: txn.id, action: "approve" }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        toast.error(result.error ?? "Gagal menyetujui pengajuan")
      } else {
        toast.success(`Pengajuan ${txn.item_name} disetujui. Stok diperbarui otomatis.`)
        await loadData()
      }
    } catch {
      toast.error("Gagal terhubung ke server")
    }
    setApprovingId(null)
  }

  const openReject = (txn: TxnWithRelations) => {
    setRejectReason("")
    setRejectError("")
    setRejectDialog({ open: true, txn })
  }

  const handleReject = async () => {
    if (!rejectDialog.txn) return
    if (!rejectReason.trim()) {
      setRejectError("Alasan penolakan wajib diisi.")
      return
    }
    setSubmitting(true)
    setRejectError("")

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-approval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transaction_id: rejectDialog.txn.id,
          action: "reject",
          rejection_reason: rejectReason.trim(),
        }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setRejectError(result.error ?? "Gagal menolak pengajuan")
        setSubmitting(false)
        return
      }
      toast.success(`Pengajuan ${rejectDialog.txn.item_name} ditolak.`)
      setRejectDialog({ open: false })
      await loadData()
    } catch {
      setRejectError("Gagal terhubung ke server")
    }
    setSubmitting(false)
  }

  const approveAll = async () => {
    if (filtered.length === 0) return
    for (const txn of filtered) {
      await handleApprove(txn)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Approval Pengajuan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tinjau dan setujui atau tolak pengajuan pinjam/titip dari Guest.
          </p>
        </div>
        {filtered.length > 0 && (
          <Button variant="outline" onClick={approveAll} disabled={!!approvingId}>
            <CheckCheck />
            Setujui Semua ({filtered.length})
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Cari pemohon, barang, atau divisi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><CheckCheck /></EmptyMedia>
              <EmptyTitle>Tidak ada pengajuan menunggu</EmptyTitle>
              <EmptyDescription>
                {search ? "Tidak ada pengajuan yang sesuai pencarian." : "Semua pengajuan sudah diproses."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pemohon</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Barang</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead className="w-32">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{txn.requester.full_name}</p>
                      <p className="text-xs text-muted-foreground">{txn.requester.division}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_CONFIG[txn.type].class}>
                      {TYPE_CONFIG[txn.type].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{txn.item_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          {txn.item_type === "isi" ? "Isi" : "Kosong/Box"}
                        </Badge>
                        {txn.notes && (
                          <span className="text-xs text-muted-foreground truncate max-w-32" title={txn.notes}>
                            — {txn.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                        {txn.location.cabinet?.code}
                      </Badge>
                      <span className="text-sm text-foreground">{txn.location.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-sm">{txn.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-1">{txn.unit}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(txn.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                    {" "}
                    {new Date(txn.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="default"
                        onClick={() => handleApprove(txn)}
                        disabled={approvingId === txn.id}
                        title="Setujui"
                      >
                        {approvingId === txn.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => openReject(txn)}
                        disabled={!!approvingId}
                        title="Tolak"
                      >
                        <X className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => setRejectDialog({ open: o })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan</DialogTitle>
            <DialogDescription>
              Tolak pengajuan <strong>{rejectDialog.txn?.item_name}</strong> dari{" "}
              <strong>{rejectDialog.txn?.requester?.full_name}</strong>. Berikan alasan agar pemohon memahami.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="r-reason">Alasan Penolakan</Label>
              <Textarea
                id="r-reason"
                placeholder="cth: Barang sedang dalam kondisi rusak, tidak bisa dipinjam..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
            {rejectError && <p className="text-sm text-destructive">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false })} disabled={submitting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Tolak Pengajuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
