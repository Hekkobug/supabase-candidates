// supabase/functions/recommend-candidates/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecommendationRequest {
  position: string;
  limit?: number;
}

interface Candidate {
  id: string;
  full_name: string;
  applied_position: string;
  status: string;
  resume_url: string;
  skills: string[];
  matching_score: number;
  created_at: string;
}

interface JobRequirement {
  id: string;
  title: string;
  required_skills: string[];
}

interface ScoredCandidate extends Candidate {
  recommendation_score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_percentage: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 🧠 Xác thực request
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

    // 🔐 Kiểm tra environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !serviceKey) {
      console.error("Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🚀 Khởi tạo Supabase client
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 👤 Xác thực user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError) {
      console.error("User authentication error:", userError);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }), 
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 📥 Parse request body
    let body: RecommendationRequest;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { position, limit = 3 } = body;

    if (!position || typeof position !== 'string') {
      return new Response(
        JSON.stringify({ error: "Position is required" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (limit > 10) {
      return new Response(
        JSON.stringify({ error: "Limit cannot exceed 10" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🔍 Tìm job requirement phù hợp
    const { data: jobs, error: jobError } = await supabase
      .from("job_requirements")
      .select("id, title, required_skills")
      .or(`title.ilike.%${position}%,title.ilike.%${position.split(' ').join('%')}%`)
      .limit(1);

    if (jobError) {
      console.error("Job requirement query error:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to find job requirements" }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No job requirements found for this position" }), 
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const job = jobs[0] as JobRequirement;
    const requiredSkills = job.required_skills || [];
    
    if (requiredSkills.length === 0) {
      return new Response(
        JSON.stringify({ error: "Job requirement has no required skills defined" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 👥 Lấy tất cả candidates của user
    const { data: candidates, error: candidatesError } = await supabase
      .from("candidates")
      .select("id, full_name, applied_position, status, resume_url, skills, matching_score, created_at")
      .eq("user_id", user.id)
      .not("skills", "is", null);

    if (candidatesError) {
      console.error("Candidates query error:", candidatesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch candidates" }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: "No candidates with skills found" }), 
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🎯 Tính toán recommendation scores
    const scoredCandidates: ScoredCandidate[] = candidates.map(candidate => {
      const candidateSkills = candidate.skills || [];
      
      // Chuẩn hóa skills để so sánh
      const normalizedCandidateSkills = candidateSkills.map(skill => 
        skill.toLowerCase().trim()
      );
      const normalizedRequiredSkills = requiredSkills.map(skill => 
        skill.toLowerCase().trim()
      );

      // Tìm skills khớp
      const matched_skills = normalizedRequiredSkills.filter(requiredSkill =>
        normalizedCandidateSkills.some(candidateSkill =>
          candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)
        )
      );

      // Tìm skills thiếu
      const missing_skills = normalizedRequiredSkills.filter(requiredSkill =>
        !normalizedCandidateSkills.some(candidateSkill =>
          candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)
        )
      );

      // Tính match percentage
      const match_percentage = normalizedRequiredSkills.length > 0 
        ? Math.round((matched_skills.length / normalizedRequiredSkills.length) * 100)
        : 0;

      // Tính recommendation score (có thể tùy chỉnh thuật toán)
      let recommendation_score = match_percentage;

      // Bonus points cho status phù hợp
    //   const statusBonus = {
    //     'New': 10,
    //     'Screening': 5,
    //     'Interviewing': 0,
    //     'Hired': -20, // Trừ điểm nếu đã hired
    //     'Rejected': -50 // Trừ điểm nếu đã rejected
    //   }[candidate.status] || 0;

    //   recommendation_score += statusBonus;

      // Bonus points cho recency (ứng viên mới hơn)
      const candidateAge = Date.now() - new Date(candidate.created_at).getTime();
      const daysOld = candidateAge / (1000 * 60 * 60 * 24);
      const recencyBonus = Math.max(0, 10 - (daysOld / 7)); // Giảm dần theo tuần
      recommendation_score += recencyBonus;

      // Bonus points nếu applied_position khớp
      if (candidate.applied_position && 
          candidate.applied_position.toLowerCase().includes(position.toLowerCase())) {
        recommendation_score += 15;
      }

      return {
        ...candidate,
        recommendation_score: Math.max(0, Math.min(100, recommendation_score)), // Giới hạn 0-100
        matched_skills,
        missing_skills,
        match_percentage
      };
    });

    // 📊 Sắp xếp theo recommendation score
    const topCandidates = scoredCandidates
      .sort((a, b) => b.recommendation_score - a.recommendation_score)
      .slice(0, limit);

    // 📈 Tính statistics
    const stats = {
      total_candidates: candidates.length,
      candidates_with_skills: candidates.filter(c => c.skills && c.skills.length > 0).length,
      average_match_percentage: Math.round(
        scoredCandidates.reduce((sum, c) => sum + c.match_percentage, 0) / scoredCandidates.length
      ),
      job_requirements: {
        title: job.title,
        required_skills: requiredSkills,
        total_required_skills: requiredSkills.length
      }
    };

    // ✅ Success response
    return new Response(
      JSON.stringify({ 
        recommendations: topCandidates,
        statistics: stats,
        job_requirement: {
          id: job.id,
          title: job.title,
          required_skills: requiredSkills
        }
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err: any) {
    console.error("Recommendation error:", err);
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});