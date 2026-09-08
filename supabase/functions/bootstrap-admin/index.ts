import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Check if admin already exists
    const { data: existing } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "rnd")
      .limit(1)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ message: "Admin already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: "rnd@inventaris.com",
      password: "rnd123456",
      email_confirm: true,
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: newUser.user.id,
      full_name: "Admin RND",
      division: "RND",
      role: "rnd",
      is_active: true,
    })

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ success: true, email: "rnd@inventaris.com", password: "rnd123456" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
