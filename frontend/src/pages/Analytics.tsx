import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Coins, Activity, Loader2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { usageService } from "@/services/usage.service";
import { UsageResponse } from "@/types";

const PIE_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const BAR_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

const TYPE_LABELS: Record<string, string> = { chat: "Chat", image: "Image", video: "Video" };

export function Analytics() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    usageService
      .getUsage()
      .then(({ data }) => setUsage(data))
      .catch((err: any) => setError(err.response?.data?.error || "Failed to load usage data"))
      .finally(() => setLoading(false));
  }, []);

  const byTypeData = usage ? Object.entries(usage.byType).map(([name, value]) => ({ name: TYPE_LABELS[name] || name, value })) : [];
  const byModelData = usage
    ? Object.entries(usage.byModel)
        .map(([name, value]) => ({ name: name.length > 20 ? `${name.slice(0, 18)}…` : name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  if (loading) return <div className="p-6 flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Analytics</h1>
        <p className="text-muted-foreground mt-1">Your usage across NexusAI — tokens, requests, and model breakdowns</p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-6">{error}</p>}

      {usage && usage.totalRequests === 0 ? (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No usage data yet</p>
          <p className="text-sm">Start chatting or generating to see stats here</p>
        </div>
      ) : usage ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Coins className="w-4 h-4" /> Total tokens</div>
              <p className="text-3xl font-bold mt-2">{usage.totalTokens.toLocaleString()}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Activity className="w-4 h-4" /> Total requests</div>
              <p className="text-3xl font-bold mt-2">{usage.totalRequests.toLocaleString()}</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {/* By type donut */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-2">By Type</h2>
              {byTypeData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No breakdown yet</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byTypeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                        {byTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* By model bars */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-2">Tokens by Model</h2>
              {byModelData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No model data yet</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byModelData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {byModelData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          {usage.recent.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-4">Recent Activity</h2>
              <div className="space-y-2">
                {usage.recent.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs uppercase shrink-0">{TYPE_LABELS[item.type] || item.type}</span>
                    <span className="font-medium truncate flex-1">{item.model}</span>
                    <span className="text-muted-foreground text-xs">{item.tokens.toLocaleString()} tokens</span>
                    <span className="text-muted-foreground text-xs shrink-0">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
