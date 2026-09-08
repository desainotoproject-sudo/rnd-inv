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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Verify caller is authenticated
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check caller is active RND
    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role, is_active, full_name")
      .eq("id", callerUser.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.role !== "rnd" || !callerProfile.is_active) {
      return new Response(JSON.stringify({ error: "Access denied: Only RND can approve/reject" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { transaction_id, action, rejection_reason } = await req.json()

    if (!transaction_id || !action || (action !== "approve" && action !== "reject")) {
      return new Response(JSON.stringify({ error: "Missing or invalid parameters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (action === "reject" && !rejection_reason) {
      return new Response(JSON.stringify({ error: "Rejection reason is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Use service role for all DB operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Fetch the transaction
    const { data: txn, error: txnError } = await adminClient
      .from("transactions")
      .select("*")
      .eq("id", transaction_id)
      .maybeSingle()

    if (txnError || !txn) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (txn.status !== "menunggu_approval") {
      return new Response(JSON.stringify({ error: "Transaction already processed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Get requester info for notification
    const { data: requester } = await adminClient
      .from("profiles")
      .select("full_name, division")
      .eq("id", txn.requester_id)
      .maybeSingle()

    if (action === "approve") {
      // === APPROVE ===
      if (txn.type === "pinjam") {
        // For pinjam: reduce stock at source location
        const { data: stock } = await adminClient
          .from("stock_entries")
          .select("id, quantity, status")
          .eq("item_id", txn.item_id)
          .eq("location_id", txn.location_id)
          .maybeSingle()

        if (!stock) {
          return new Response(JSON.stringify({ error: "Stok barang tidak ditemukan di lokasi tersebut" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }

        if (stock.quantity < txn.quantity) {
          return new Response(JSON.stringify({ error: `Stok tidak mencukupi. Tersedia: ${stock.quantity}, diminta: ${txn.quantity}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }

        const newQty = stock.quantity - txn.quantity
        const newStatus = newQty === 0 ? "kosong" : "dipinjam"

        await adminClient
          .from("stock_entries")
          .update({ quantity: newQty, status: newStatus })
          .eq("id", stock.id)
      } else {
        // For titip: add stock at destination location
        if (txn.item_id) {
          // Existing item — check if stock entry exists at location
          const { data: existingStock } = await adminClient
            .from("stock_entries")
            .select("id, quantity")
            .eq("item_id", txn.item_id)
            .eq("location_id", txn.location_id)
            .maybeSingle()

          if (existingStock) {
            await adminClient
              .from("stock_entries")
              .update({ quantity: existingStock.quantity + txn.quantity, status: "tersedia" })
              .eq("id", existingStock.id)
          } else {
            await adminClient
              .from("stock_entries")
              .insert({
                item_id: txn.item_id,
                location_id: txn.location_id,
                quantity: txn.quantity,
                status: "tersedia",
              })
          }
        } else {
          // New item (titip without existing item_id) — this shouldn't happen
          // since we require item selection, but handle gracefully
          return new Response(JSON.stringify({ error: "Barang tidak ditemukan untuk penitipan" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
      }

      // Update transaction status
      await adminClient
        .from("transactions")
        .update({
          status: "disetujui",
          reviewer_id: callerUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", transaction_id)

      // Notify the requester
      await adminClient.from("notifications").insert({
        user_id: txn.requester_id,
        type: "approved",
        title: "Pengajuan Disetujui",
        message: `Pengajuan ${txn.type === "pinjam" ? "pinjam" : "titip"} "${txn.item_name}" (${txn.quantity} ${txn.unit}) telah disetujui oleh ${callerProfile.full_name}.`,
        transaction_id: transaction_id,
      })

      return new Response(JSON.stringify({ success: true, status: "disetujui" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } else {
      // === REJECT ===
      await adminClient
        .from("transactions")
        .update({
          status: "ditolak",
          reviewer_id: callerUser.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejection_reason,
        })
        .eq("id", transaction_id)

      // Notify the requester
      await adminClient.from("notifications").insert({
        user_id: txn.requester_id,
        type: "rejected",
        title: "Pengajuan Ditolak",
        message: `Pengajuan ${txn.type === "pinjam" ? "pinjam" : "titip"} "${txn.item_name}" ditolak. Alasan: ${rejection_reason}`,
        transaction_id: transaction_id,
      })

      return new Response(JSON.stringify({ success: true, status: "ditolak" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
