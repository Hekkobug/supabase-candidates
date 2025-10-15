import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CandidateData {
  full_name: string;
  applied_position?: string;
  status?: string;
  resume_url: string;
  skills?: string[];
}

interface JobRequirement {
  required_skills: string[];
  title: string;
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

    // 📥 Parse và validate request body
    let body: CandidateData;
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

    const {
      full_name,
      applied_position,
      status = "New",
      resume_url,
      skills = [],
    } = body;

    // ✅ Validation chi tiết
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "full_name is required and must be a non-empty string" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!resume_url || typeof resume_url !== 'string') {
      return new Response(
        JSON.stringify({ error: "resume_url is required and must be a string" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate URL format
    try {
      new URL(resume_url);
    } catch {
      return new Response(
        JSON.stringify({ error: "resume_url must be a valid URL" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate skills array
    if (skills && !Array.isArray(skills)) {
      return new Response(
        JSON.stringify({ error: "skills must be an array" }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate status
    const validStatuses = ["New", "Screening", "Interviewing", "Hired", "Rejected"];
    if (status && !validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🎯 Tính matching score nếu có applied_position và skills
    let matching_score = 0;
    
    if (applied_position && skills.length > 0) {
      try {
        // Tìm job requirement với fuzzy matching
        const { data: jobs, error: jobError } = await supabase
          .from("job_requirements")
          .select("id, title, required_skills")
          .or(`title.ilike.%${applied_position}%,title.ilike.%${applied_position.split(' ').join('%')}%`)
          .limit(1);

        if (jobError) {
          console.error("Job requirement query error:", jobError);
          // Không throw error, tiếp tục với matching_score = 0
        } else if (jobs && jobs.length > 0) {
          const job = jobs[0] as JobRequirement;
          const requiredSkills = job.required_skills || [];
          
          if (requiredSkills.length > 0) {
            // Chuẩn hóa skills để so sánh (lowercase, trim)
            const candidateSkills = skills.map(skill => 
              skill.toLowerCase().trim()
            );
            const normalizedRequiredSkills = requiredSkills.map(skill => 
              skill.toLowerCase().trim()
            );

            // Tìm skills khớp
            const matched_skills = normalizedRequiredSkills.filter(requiredSkill =>
              candidateSkills.some(candidateSkill =>
                candidateSkill.includes(requiredSkill) || requiredSkill.includes(candidateSkill)
              )
            );

            matching_score = Math.round((matched_skills.length / normalizedRequiredSkills.length) * 100);
          }
        }
      } catch (matchingError) {
        console.error("Matching score calculation error:", matchingError);
        // Không throw error, tiếp tục với matching_score = 0
      }
    }

    // 💾 Insert candidate vào database - CHỈ với các trường có trong schema
    const candidateData = {
      user_id: user.id,
      full_name: full_name.trim(),
      applied_position: applied_position?.trim() || null,
      status,
      resume_url,
      skills: skills.length > 0 ? skills : null,
      matching_score,
    };

    const { data: candidate, error: insertError } = await supabase
      .from("candidates")
      .insert(candidateData)
      .select(`
        id,
        full_name,
        applied_position,
        status,
        resume_url,
        skills,
        matching_score,
        created_at
      `)
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      
      // Xử lý lỗi constraint violation
      if (insertError.code === '23505') { // Unique violation
        return new Response(
          JSON.stringify({ error: "Candidate with these details already exists" }), 
          { 
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to create candidate: " + insertError.message }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ✅ Success response
    return new Response(
      JSON.stringify({ 
        candidate,
        matching_info: {
          score: matching_score,
          // Có thể thêm thông tin matching khác nếu cần
        }
      }), 
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err: any) {
    console.error("Unexpected error:", err);
    
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