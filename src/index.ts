
import { Env, ChatMessage } from "./types";


const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";


const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant named J. Provide concise and accurate responses.";


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://ai.jessejesse.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);


    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/chat") {
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>;


async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    const { messages = [] } = (await request.json()) as { messages: ChatMessage[] };


    const filteredMessages = messages.filter((msg) => msg.role !== "system");
    const finalMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...filteredMessages];

    const response = await env.AI.run(
      MODEL_ID,
      {
        messages: finalMessages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
      },
    );

    return new Response(response.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        ...corsHeaders(),
      },
    });
  } catch (error: any) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", message: error?.message }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders() },
      },
    );
  }
}

