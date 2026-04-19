export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET: Retrieve telemetry
    if (request.method === "GET") {
      const charName = url.searchParams.get("char");
      
      if (!charName) {
        // Return overall status if KV is available
        if (env.GB_BANANA) {
          const list = await env.GB_BANANA.list({ prefix: "latest_" });
          const results = {};
          for (const key of list.keys) {
            const name = key.name.replace("latest_", "");
            results[name] = await env.GB_BANANA.get(key.name, "json");
          }
          return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response("No char specified or KV not bound", { status: 400, headers: corsHeaders });
      }

      if (env.GB_BANANA) {
        const history = await env.GB_BANANA.get(`history_${charName}`, "json") || [];
        return new Response(JSON.stringify(history), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response("KV Namespace 'GB_BANANA' not found", { status: 500, headers: corsHeaders });
    }

    // POST: Store telemetry
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const { charName, bank, onHand, fuel, timestamp } = data;

        if (!charName) throw new Error("Missing charName");

        if (env.GB_BANANA) {
          // Update Latest
          await env.GB_BANANA.put(`latest_${charName}`, JSON.stringify(data));

          // Update History (Keep last 50)
          let history = await env.GB_BANANA.get(`history_${charName}`, "json") || [];
          history.unshift({ bank, onHand, fuel, timestamp });
          if (history.length > 50) history = history.slice(0, 50);
          await env.GB_BANANA.put(`history_${charName}`, JSON.stringify(history));
          
          return new Response("OK", { headers: corsHeaders });
        }

        return new Response("KV Namespace 'GB_BANANA' not found", { status: 500, headers: corsHeaders });
      } catch (err) {
        return new Response(err.message, { status: 400, headers: corsHeaders });
      }
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  },
};
