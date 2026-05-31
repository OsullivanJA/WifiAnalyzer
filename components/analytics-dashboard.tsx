"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, RefreshCw, BarChart2, TrendingUp, AlertTriangle, Info, Wifi } from "lucide-react";

interface LogRow {
  id: string;
  created_at: string;
  room_name: string;
  device_type: string;
  avg_latency: number;
  packet_loss: number;
  jitter: number;
}

interface RoomAggregate {
  room: string;
  avgLatency: number;
  avgPacketLoss: number;
  avgJitter: number;
}

function buildRoomAggregates(logs: LogRow[]): RoomAggregate[] {
  const map: Record<string, { latency: number[]; loss: number[]; jitter: number[] }> = {};
  for (const log of logs) {
    if (!map[log.room_name]) map[log.room_name] = { latency: [], loss: [], jitter: [] };
    map[log.room_name].latency.push(log.avg_latency);
    map[log.room_name].loss.push(log.packet_loss);
    map[log.room_name].jitter.push(log.jitter);
  }
  return Object.entries(map).map(([room, v]) => ({
    room,
    avgLatency: Math.round((v.latency.reduce((a, b) => a + b, 0) / v.latency.length) * 10) / 10,
    avgPacketLoss: Math.round((v.loss.reduce((a, b) => a + b, 0) / v.loss.length) * 10) / 10,
    avgJitter: Math.round((v.jitter.reduce((a, b) => a + b, 0) / v.jitter.length) * 10) / 10,
  }));
}

function buildHourlyData(logs: LogRow[]) {
  const buckets: Record<number, number[]> = {};
  for (let h = 0; h < 24; h++) buckets[h] = [];
  for (const log of logs) {
    const hour = new Date(log.created_at).getHours();
    buckets[hour].push(log.avg_latency);
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, "0")}:00`,
    avgLatency:
      buckets[h].length > 0
        ? Math.round((buckets[h].reduce((a, b) => a + b, 0) / buckets[h].length) * 10) / 10
        : null,
  }));
}

interface Insight {
  type: "destructive" | "warning" | "info";
  room: string;
  message: string;
}

function buildInsights(aggregates: RoomAggregate[]): Insight[] {
  const insights: Insight[] = [];
  for (const agg of aggregates) {
    if (agg.avgPacketLoss > 1) {
      insights.push({
        type: "destructive",
        room: agg.room,
        message: `High Packet Loss detected in ${agg.room} (${agg.avgPacketLoss}%). This causes dropped Zoom calls and gaming stutter. Likely physical blockage or severe channel interference.`,
      });
    } else if (agg.avgJitter > 20) {
      insights.push({
        type: "warning",
        room: agg.room,
        message: `High Jitter in ${agg.room} (${agg.avgJitter}ms) but packet loss is normal. Your signal strength is fine, but you are experiencing data traffic spikes. Check if other household devices are streaming or downloading simultaneously.`,
      });
    }
    if (agg.avgLatency > 50) {
      insights.push({
        type: "info",
        room: agg.room,
        message: `Distance attenuation detected in ${agg.room} (avg ${agg.avgLatency}ms latency). Your device is struggling to reach the Hub through walls. Recommend a Wi-Fi mesh node halfway between this room and the router.`,
      });
    }
  }
  return insights;
}

interface Props {
  refreshKey?: number;
}

export default function AnalyticsDashboard({ refreshKey }: Props) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("wifi_logs")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setLogs(data as LogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  async function deleteLog(id: string) {
    const supabase = createClient();
    await supabase.from("wifi_logs").delete().eq("id", id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  const roomAggregates = buildRoomAggregates(logs);
  const hourlyData = buildHourlyData(logs);
  const insights = buildInsights(roomAggregates);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Analytics Dashboard</h2>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Smart Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Smart Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg p-3 text-sm ${
                  ins.type === "destructive"
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : ins.type === "warning"
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}
              >
                {ins.type === "destructive" && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
                {ins.type === "warning" && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />}
                {ins.type === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />}
                <p>{ins.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {logs.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Wifi className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No test data yet. Run your first diagnostic above.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart — dead zones */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Packet Loss by Room</CardTitle>
                <CardDescription>Average % — rooms above 2% are flagged in red</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={roomAggregates} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <XAxis dataKey="room" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, "Avg Packet Loss"]} />
                    <Bar dataKey="avgPacketLoss" radius={[4, 4, 0, 0]}>
                      {roomAggregates.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.avgPacketLoss > 2 ? "#ef4444" : "#3b82f6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Line chart — time of day */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Latency by Hour of Day
                </CardTitle>
                <CardDescription>Average latency across all rooms (ms)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={hourlyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10 }}
                      interval={3}
                    />
                    <YAxis tick={{ fontSize: 12 }} unit="ms" />
                    <Tooltip formatter={(v) => [`${v}ms`, "Avg Latency"]} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="avgLatency"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      name="Avg Latency"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Data table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Tests</CardTitle>
              <CardDescription>
                {logs.length} test{logs.length !== 1 ? "s" : ""} recorded
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Jitter</TableHead>
                    <TableHead>Packet Loss</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.room_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.device_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={log.avg_latency > 50 ? "text-blue-600 font-semibold" : ""}>
                          {log.avg_latency}ms
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={log.jitter > 20 ? "text-amber-600 font-semibold" : ""}>
                          {log.jitter}ms
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={log.packet_loss > 1 ? "text-red-600 font-semibold" : ""}>
                          {log.packet_loss}%
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLog(log.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
