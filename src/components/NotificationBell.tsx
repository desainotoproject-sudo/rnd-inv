import * as React from "react"
import { Bell, CheckCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type { Notification } from "@/lib/database.types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { toast } from "sonner"

export default function NotificationBell() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)

  const loadNotifications = React.useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20)
    setNotifications(data ?? [])
    setLoading(false)
  }, [profile])

  React.useEffect(() => {
    loadNotifications()
    // Poll for new notifications every 30s
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [loadNotifications])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markAllRead = async () => {
    if (!profile || unreadCount === 0) return
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .eq("is_read", false)
    await loadNotifications()
    toast.success("Semua notifikasi ditandai dibaca")
  }

  const markRead = async (id: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
    await loadNotifications()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-0.5 -right-0.5 size-4 justify-center rounded-full p-0 text-[10px] bg-destructive text-destructive-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Notifikasi</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">{unreadCount} baru</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
              <CheckCheck className="size-3" />
              Tandai dibaca
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : notifications.length === 0 ? (
            <Empty className="border-none py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                <EmptyTitle>Belum ada notifikasi</EmptyTitle>
                <EmptyDescription>Notifikasi akan muncul di sini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                >
                  {!n.is_read && <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  {n.is_read && <div className="mt-1.5 size-2 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
