import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { Package, Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn, user, profile, loading } = useAuth()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!loading && user && profile) {
      navigate("/dashboard", { replace: true })
    }
  }, [user, profile, loading, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Email dan password wajib diisi.")
      return
    }
    setIsLoading(true)
    setError("")
    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError("Email atau password salah. Silakan coba lagi.")
      setIsLoading(false)
      return
    }
    // Success: navigation happens via the useEffect watching user+profile
    // Keep isLoading true so button stays disabled until redirect
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary">
            <Package className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Inventaris RND</h1>
            <p className="text-sm text-muted-foreground">Sistem Manajemen Inventaris</p>
          </div>
        </div>

        {/* Login card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Masuk ke Sistem</CardTitle>
            <CardDescription>
              Masukkan email dan password yang telah diberikan oleh tim RND.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isLoading}
                  aria-invalid={!!error}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isLoading}
                    aria-invalid={!!error}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="size-4 animate-spin" />}
                {isLoading ? "Memproses..." : "Masuk"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link to="/request" className="text-sm font-medium text-primary hover:underline">
            Lihat & ajukan pinjam barang (tanpa login)
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Belum punya akun? Hubungi tim RND untuk pembuatan akun.
        </p>
      </div>
    </div>
  )
}
