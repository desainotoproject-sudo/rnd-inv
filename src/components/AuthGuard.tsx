import * as React from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2 } from "lucide-react"

interface Props {
  children: React.ReactNode
  requireRole?: "rnd" | "guest"
}

export default function AuthGuard({ children, requireRole }: Props) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-lg font-semibold text-foreground">Akun Dinonaktifkan</p>
          <p className="text-sm text-muted-foreground">
            Akun Anda telah dinonaktifkan. Hubungi tim RND untuk informasi lebih lanjut.
          </p>
        </div>
      </div>
    )
  }

  if (requireRole && profile.role !== requireRole) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
