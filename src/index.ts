import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT = `You are Jesse, a helpful and friendly AI assistant. Provide concise and  accurate responses. 

Guidelines:
- Be conversational but professional
- Use clear, readable formatting with proper markdown when helpful
- Keep code examples well-formatted and commented
- If you're unsure about something, be honest about your limitations
- Maintain a positive and supportive tone`;

function corsHeaders(origin: string) {
  const allowedOrigins = [
    "https://ai.jessejesse.com",
    "https://www.ai.jessejesse.com"
  ];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "https://ai.jessejesse.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "https://ai.jessejesse.com";

  
    if (request.method === "OPTIONS") {
      return new Response(null, { 
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Allow-Credentials": "true",
        }
      });
    }

   
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }


    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        return handleChatRequest(request, env, origin);
      }
      return new Response("Method not allowed", { 
        status: 405, 
        headers: corsHeaders(origin) 
      });
    }

    return new Response("Not found", { 
      status: 404, 
      headers: corsHeaders(origin) 
    });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(request: Request, env: Env, origin: string): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            ...corsHeaders(origin),
          },
        }
      );
    }

    const { messages = [] } = (await request.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required and cannot be empty" }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            ...corsHeaders(origin),
          },
        }
      );
    }

 
    const filteredMessages = messages.filter((msg) => msg.role !== "system");
    const finalMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...filteredMessages,
    ];

  
    const response = await env.AI.run(
      MODEL_ID,
      {
        messages: finalMessages,
        max_tokens: 2048,
        stream: true, 
      },
      {
        returnRawResponse: true,
      }
    );

    if (!response.body) {
      throw new Error("No response body from AI model");
    }

    return new Response(response.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
        ...corsHeaders(origin),
      },
    });
  } catch (error: any) {
    console.error("Error processing chat request:", error);
    
    const status = error.message?.includes("rate limit") ? 429 : 500;
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to process request", 
        message: error?.message || "Internal server error",
        ...(status === 429 && { retryAfter: 60 })
      }),
      {
        status,
        headers: { 
          "content-type": "application/json",
          ...corsHeaders(origin),
          ...(status === 429 && { "retry-after": "60" })
        },
      }
    );
  }
}

