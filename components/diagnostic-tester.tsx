"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Wifi, Activity, CheckCircle2, AlertTriangle } from "lucide-react";

const PRESET_ROOMS = ["Kitchen", "Living Room", "Bedroom 1", "Bedroom 2", "Office", "Custom"];
const TEST_DURATION_MS = 10_000;
const PING_INTERVAL_MS = 250;
const PING_TIMEOUT_MS = 1_000;
const TOTAL_PINGS = TEST_DURATION_MS / PING_INTERVAL_MS; // 40

interface TestResult {
  avgLatency: number;
  packetLoss: number;
  jitter: number;
  room: string;
}

function detectDevice(): "Mobile" | "Desktop" {
  if (typeof navigator === "undefined") return "Desktop";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    ? "Mobile"
    : "Desktop";
}

async function pingOnce(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const start = performance.now();
  try {
    await fetch(`/api/ping?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return performance.now() - start;
  } catch {
    return null; // timeout or network failure
  } finally {
    clearTimeout(timer);
  }
}

interface Props {
  onTestComplete?: () => void;
}

export default function DiagnosticTester({ onTestComplete }: Props) {
  const [room, setRoom] = useState("");
  const [customRoom, setCustomRoom] = useState("");
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [progress, setProgress] = useState(0);
  const [pingCount, setPingCount] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveRoom = room === "Custom" ? customRoom.trim() : room;

  const startTest = useCallback(async () => {
    if (!effectiveRoom) return;
    setRunning(true);
    setResult(null);
    setSaveError(null);
    setCountdown(10);
    setProgress(0);
    setPingCount(0);

    const latencies: number[] = [];
    let failed = 0;
    let completed = 0;
    const startTime = Date.now();

    await new Promise<void>((resolve) => {
      intervalRef.current = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, TEST_DURATION_MS - elapsed);
        const pct = Math.min(100, (elapsed / TEST_DURATION_MS) * 100);
        setCountdown(Math.ceil(remaining / 1000));
        setProgress(pct);

        const latency = await pingOnce();
        completed++;
        if (latency === null) {
          failed++;
        } else {
          latencies.push(latency);
        }
        setPingCount(completed);

        if (elapsed >= TEST_DURATION_MS) {
          clearInterval(intervalRef.current!);
          resolve();
        }
      }, PING_INTERVAL_MS);
    });

    setProgress(100);
    setCountdown(0);

    const total = completed;
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const packetLoss = total > 0 ? (failed / total) * 100 : 0;
    const jitter =
      latencies.length > 1
        ? latencies
            .slice(1)
            .reduce((acc, val, i) => acc + Math.abs(val - latencies[i]), 0) /
          (latencies.length - 1)
        : 0;

    const testResult: TestResult = {
      avgLatency: Math.round(avgLatency * 10) / 10,
      packetLoss: Math.round(packetLoss * 10) / 10,
      jitter: Math.round(jitter * 10) / 10,
      room: effectiveRoom,
    };
    setResult(testResult);
    setRunning(false);

    // Save to Supabase
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("wifi_logs").insert({
        user_id: user.id,
        room_name: testResult.room,
        device_type: detectDevice(),
        avg_latency: testResult.avgLatency,
        packet_loss: testResult.packetLoss,
        jitter: testResult.jitter,
        test_duration_seconds: 10,
      });
      if (error) setSaveError(error.message);
      else onTestComplete?.();
    } else {
      setSaveError("Not authenticated — please sign in again.");
    }
  }, [effectiveRoom, onTestComplete]);

  const canStart = !!effectiveRoom && !running;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-primary" />
          <CardTitle>Network Diagnostic</CardTitle>
        </div>
        <CardDescription>
          Select your current location and run a 10-second test to measure
          latency, jitter, and packet loss.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Room selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Current location</label>
          <Select value={room} onValueChange={setRoom} disabled={running}>
            <SelectTrigger>
              <SelectValue placeholder="Select a room…" />
            </SelectTrigger>
            <SelectContent>
              {PRESET_ROOMS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {room === "Custom" && (
            <Input
              placeholder="Enter room name…"
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              disabled={running}
            />
          )}
        </div>

        {/* Start button */}
        <Button
          onClick={startTest}
          disabled={!canStart}
          className="w-full"
          size="lg"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse" />
              Running… {countdown}s remaining
            </span>
          ) : (
            "Start Diagnostic"
          )}
        </Button>

        {/* Live progress */}
        {running && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pingCount} pings sent</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Result card */}
        {result && !running && (
          <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-semibold">
                Test complete — {result.room}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-white border p-3">
                <p className="text-2xl font-bold text-primary">
                  {result.avgLatency}
                  <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Avg Latency</p>
              </div>
              <div className="rounded-md bg-white border p-3">
                <p className={`text-2xl font-bold ${result.packetLoss > 1 ? "text-red-500" : "text-green-600"}`}>
                  {result.packetLoss}
                  <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Packet Loss</p>
              </div>
              <div className="rounded-md bg-white border p-3">
                <p className={`text-2xl font-bold ${result.jitter > 20 ? "text-amber-500" : "text-primary"}`}>
                  {result.jitter}
                  <span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Jitter</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {saveError ? (
                <span className="text-destructive flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Save failed: {saveError}
                </span>
              ) : (
                "Result saved to your history."
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
