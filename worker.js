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

    if (!env.gb_banana) {
      return new Response("D1 Binding 'gb_banana' not found", { status: 500, headers: corsHeaders });
    }

    // Initialize Database
    await env.gb_banana.prepare(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charName TEXT NOT NULL,
        bank TEXT,
        onHand TEXT,
        fuel TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // GET: Retrieve telemetry
    if (request.method === "GET") {
      const charName = url.searchParams.get("char");
      
      if (!charName) {
        // Return latest status for ALL characters
        const { results } = await env.gb_banana.prepare(`
          SELECT t1.* FROM telemetry t1
          JOIN (
            SELECT charName, MAX(timestamp) as latest 
            FROM telemetry 
            GROUP BY charName
          ) t2 ON t1.charName = t2.charName AND t1.timestamp = t2.latest
        `).all();

        const formattedResults = {};
        results.forEach(row => {
          formattedResults[row.charName] = {
            charName: row.charName,
            bank: row.bank,
            onHand: row.onHand,
            fuel: row.fuel,
            timestamp: row.timestamp
          };
        });

        return new Response(JSON.stringify(formattedResults), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return history for specific character
      const { results } = await env.gb_banana.prepare(`
        SELECT bank, onHand, fuel, timestamp 
        FROM telemetry 
        WHERE charName = ? 
        ORDER BY timestamp DESC 
        LIMIT 50
      `).bind(charName).all();

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Store telemetry
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const { charName, bank, onHand, fuel, timestamp } = data;

        if (!charName) throw new Error("Missing charName");

        // Insert new record
        await env.gb_banana.prepare(`
          INSERT INTO telemetry (charName, bank, onHand, fuel, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `).bind(charName, bank, onHand, fuel, timestamp || new Date().toISOString()).run();
          
        return new Response("OK", { headers: corsHeaders });
      } catch (err) {
        return new Response(err.message, { status: 400, headers: corsHeaders });
      }
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  },
};
