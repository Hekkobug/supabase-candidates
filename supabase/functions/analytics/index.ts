import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🧠 Xác thực qua Bearer token
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

    // Kết nối Supabase bằng service role key
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

    // 🔐 Xác thực token của user
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

    // 🚀 Thực hiện tất cả queries song song để tối ưu hiệu năng
    const [
      totalCountResult,
      statusData,
      positionData,
      recentCandidatesResult
    ] = await Promise.all([
      // 1️⃣ Tổng số ứng viên
      supabase
        .from("candidates")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),

      // 2️⃣ Dữ liệu trạng thái và vị trí (một query duy nhất)
      supabase
        .from("candidates")
        .select("status, applied_position")
        .eq("user_id", user.id),

      // 3️⃣ Dữ liệu vị trí riêng để tính top positions
      supabase
        .from("candidates")
        .select("applied_position")
        .eq("user_id", user.id)
        .not("applied_position", "is", null),

      // 4️⃣ Ứng viên mới trong 7 ngày
      supabase
        .from("candidates")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50) // Giới hạn để tránh dữ liệu quá lớn
    ]);

    // 🛑 Xử lý lỗi từ các queries
    if (totalCountResult.error) throw totalCountResult.error;
    if (statusData.error) throw statusData.error;
    if (positionData.error) throw positionData.error;
    if (recentCandidatesResult.error) throw recentCandidatesResult.error;

    const totalCount = totalCountResult.count || 0;

    // ========== 2️⃣ Tỷ lệ từng trạng thái ==========
    const statusCount: Record<string, number> = {};
    statusData.data?.forEach((c) => {
      const status = c.status || 'Unknown';
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    const statusRatio = Object.entries(statusCount).map(([status, count]) => ({
      status,
      count,
      ratio: totalCount ? Number(((count / totalCount) * 100).toFixed(1)) : 0,
    }));

    // ========== 3️⃣ Top 3 vị trí có nhiều ứng viên nhất ==========
    const positionCount: Record<string, number> = {};
    positionData.data?.forEach((c) => {
      if (c.applied_position) {
        positionCount[c.applied_position] = (positionCount[c.applied_position] || 0) + 1;
      }
    });

    const topPositions = Object.entries(positionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([position, count]) => ({ 
        position, 
        count,
        ratio: totalCount ? Number(((count / totalCount) * 100).toFixed(1)) : 0 
      }));

    // ========== 4️⃣ Thống kê theo tuần ==========
    const weeklyStats = calculateWeeklyStats(statusData.data || []);

    // ✅ Trả về kết quả
    const result = {
      totalCount,
      statusRatio,
      topPositions,
      recentCandidates: recentCandidatesResult.data || [],
      weeklyStats,
      summary: {
        newThisWeek: recentCandidatesResult.data?.length || 0,
        topPosition: topPositions[0]?.position || 'N/A',
        dominantStatus: statusRatio.length > 0 
          ? statusRatio.reduce((prev, current) => 
              (prev.count > current.count) ? prev : current
            ).status 
          : 'N/A'
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
    console.error("Analytics error:", err);
    
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

// Hàm tính toán thống kê theo tuần
function calculateWeeklyStats(candidates: any[]) {
  const weeklyData: Record<string, { total: number, statuses: Record<string, number> }> = {};
  
  candidates.forEach(candidate => {
    const week = getWeekNumber(new Date(candidate.created_at));
    const year = new Date(candidate.created_at).getFullYear();
    const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { total: 0, statuses: {} };
    }
    
    weeklyData[weekKey].total++;
    const status = candidate.status || 'Unknown';
    weeklyData[weekKey].statuses[status] = (weeklyData[weekKey].statuses[status] || 0) + 1;
  });
  
  return Object.entries(weeklyData)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8) // 8 tuần gần nhất
    .map(([week, data]) => ({
      week,
      total: data.total,
      statuses: data.statuses
    }));
}

// Hàm lấy số tuần trong năm
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}