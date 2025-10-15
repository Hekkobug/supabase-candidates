// supabase/functions/get-candidates/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaginationParams {
  cursor?: string;
  limit?: number;
  direction: 'forward' | 'backward';
  sortBy: 'created_at' | 'id';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing access token" }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Xác thực user
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const user = userData.user;
    const { cursor, limit = 10, direction = 'forward', sortBy = 'created_at' }: PaginationParams = await req.json();

    // Validate parameters
    if (limit > 100) {
      return new Response(
        JSON.stringify({ error: "Limit cannot exceed 100" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let query = supabase
      .from("candidates")
      .select("*")
      .eq("user_id", user.id);

    // Cursor-based pagination logic
    if (cursor) {
      if (direction === 'forward') {
        // Load next page - records after cursor
        query = query.lt(sortBy, cursor);
      } else {
        // Load previous page - records before cursor
        query = query.gt(sortBy, cursor);
      }
    }

    // Always order by sortBy descending for consistent pagination
    query = query.order(sortBy, { ascending: false }).limit(limit);

    const { data: candidates, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate pagination metadata
    const hasNextPage = candidates.length === limit;
    const hasPreviousPage = !!cursor;
    
    const startCursor = candidates.length > 0 ? candidates[0][sortBy] : null;
    const endCursor = candidates.length > 0 ? candidates[candidates.length - 1][sortBy] : null;

    const result = {
      candidates,
      pagination: {
        hasNextPage,
        hasPreviousPage,
        startCursor,
        endCursor,
        totalCount: candidates.length,
        sortBy,
        direction
      }
    };

    return new Response(
      JSON.stringify(result), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (err: any) {
    console.error("Pagination error:", err);
    
    return new Response(
      JSON.stringify({ 
        error: err?.message ?? "Unknown error",
        details: err?.details || null 
      }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});