import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Phone, PhoneOff, PhoneIncoming, Mic, Activity, Delete } from "lucide-react";
import SoftphoneSDK, { runEchoProbe } from "@/softphone/sdk";
import { softphoneAPI } from "@/services/softphone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const inCallStates = new Set(["dialing", "ringing", "answered", "in_call", "active"]);

export default function Softphone() {
  const sdkRef = useRef(null);
  const [status, setStatus] = useState({
    configured: false,
    registered: false,
    extension: "",
    call_state: "idle",
  });
  const [number, setNumber] = useState("");
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [callState, setCallState] = useState("idle");
  const [echoBusy, setEchoBusy] = useState(false);
  const [echoStats, setEchoStats] = useState(null);
  const [toneBusy, setToneBusy] = useState(false);
  const [logLines, setLogLines] = useState([]);

  const pushLog = (line) => {
    setLogLines((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 40));
  };

  useEffect(() => {
    softphoneAPI
      .status()
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      sdkRef.current?.disconnect();
      sdkRef.current = null;
    };
  }, []);

  const ensureSDK = async () => {
    if (!sdkRef.current) {
      const sdk = new SoftphoneSDK();
      sdk.on("status", (msg) => {
        setStatus((s) => ({ ...s, ...msg }));
        if (msg.call_state) setCallState(msg.call_state);
        pushLog(`status registered=${msg.registered} ext=${msg.extension || "-"}`);
      });
      sdk.on("incoming", (msg) => {
        setIncoming(msg);
        setCallState("ringing");
        pushLog(`incoming from ${msg.from}`);
        toast.message("来电", { description: msg.from || "未知号码" });
      });
      sdk.on("call_state", (msg) => {
        const next = msg.state || "idle";
        setCallState(next === "ended" ? "idle" : next);
        if (msg.state === "ended") setIncoming(null);
        pushLog(`call_state ${msg.state}${msg.reason ? ` (${msg.reason})` : ""}`);
      });
      sdk.on("error", (msg) => {
        toast.error(msg.message || "Softphone error");
        pushLog(`error ${msg.message}`);
      });
      sdk.on("close", () => {
        setConnected(false);
        setMicOn(false);
        pushLog("websocket closed");
      });
      sdkRef.current = sdk;
    }
    // Always (re)connect — SDK.connect is idempotent while OPEN/CONNECTING.
    await sdkRef.current.connect();
    setConnected(true);
    pushLog("websocket connected");
    return sdkRef.current;
  };

  const handleConnect = async () => {
    try {
      if (!status.configured && !(await softphoneAPI.status()).data.configured) {
        toast.error("请先在设置中指定 Softphone 分机");
        return;
      }
      await ensureSDK();
      toast.success("已连接 Softphone");
    } catch (e) {
      toast.error("连接失败", { description: e.message || String(e) });
    }
  };

  const handleMic = async () => {
    try {
      const sdk = await ensureSDK();
      await sdk.enableMic();
      setMicOn(true);
      pushLog("microphone enabled");
    } catch (e) {
      toast.error("麦克风失败", { description: e.message || String(e) });
    }
  };

  const handleCall = async () => {
    if (!number.trim()) {
      toast.error("请输入号码");
      return;
    }
    try {
      const sdk = await ensureSDK();
      if (!micOn) await handleMic();
      sdk.call(number.trim());
      setCallState("dialing");
    } catch (e) {
      toast.error("呼叫失败", { description: e.message || String(e) });
    }
  };

  const handleAnswer = async () => {
    try {
      const sdk = await ensureSDK();
      if (!micOn) await handleMic();
      sdk.answer();
      setIncoming(null);
    } catch (e) {
      toast.error("接听失败", { description: e.message || String(e) });
    }
  };

  const handleHangup = async () => {
    try {
      // Prefer existing SDK; reconnect if WS dropped so hangup can still be sent.
      const sdk = sdkRef.current || (await ensureSDK());
      if (sdkRef.current) {
        try {
          await sdkRef.current.connect();
          setConnected(true);
        } catch {
          /* still try hangup if socket somehow open */
        }
      }
      sdk.hangup();
      setIncoming(null);
      setCallState("idle");
      pushLog("hangup sent");
    } catch (e) {
      setCallState("idle");
      setIncoming(null);
      toast.error("挂断失败", { description: e.message || String(e) });
    }
  };

  const handleTestTone = async () => {
    try {
      const sdk = await ensureSDK();
      setToneBusy(true);
      pushLog("test tone 440Hz 3s");
      sdk.sendTestTone({ durationMs: 3000 });
      toast.success("已发送 3 秒测试音（440Hz）");
      setTimeout(() => setToneBusy(false), 3200);
    } catch (e) {
      setToneBusy(false);
      toast.error("测试音失败", { description: e.message || String(e) });
    }
  };

  const handleDialKey = (key) => {
    setNumber((n) => `${n}${key}`);
  };

  const handleDialBackspace = () => {
    setNumber((n) => n.slice(0, -1));
  };

  const handleEchoProbe = async () => {
    setEchoBusy(true);
    setEchoStats(null);
    try {
      pushLog("echo probe start (5s)");
      const stats = await runEchoProbe({ durationMs: 5000 });
      setEchoStats(stats);
      pushLog(`echo p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms n=${stats.count}`);
      if (stats.p95 < 200) {
        toast.success("Echo 延迟达标 (p95 < 200ms)");
      } else {
        toast.warning("Echo p95 偏高", { description: `${stats.p95.toFixed(1)} ms` });
      }
    } catch (e) {
      toast.error("Echo 探测失败", { description: e.message || String(e) });
    } finally {
      setEchoBusy(false);
    }
  };

  const configured = status.configured;
  const registered = status.registered;
  const busy = inCallStates.has(callState);
  const canHangup = configured && (connected || busy || !!sdkRef.current);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Softphone</h1>
        <p className="text-muted-foreground mt-1">
          信令与语音均走懒猫 HTTPS / WSS（443-only），非 WebRTC。
        </p>
      </div>

      {!configured && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-amber-600">Softphone 不可用</CardTitle>
            <CardDescription>
              尚未指定 Softphone 分机。请到「设置 → Softphone」选择一个 Extension 后再连接。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" /> 拨号
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-2 items-center">
              <Badge variant={configured ? "secondary" : "outline"}>{configured ? "已配置" : "未配置"}</Badge>
              <Badge variant={registered ? "default" : "outline"}>{registered ? "已注册" : "未注册"}</Badge>
              <Badge variant="outline">分机 {status.extension || "-"}</Badge>
              <Badge variant="outline">状态 {callState}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleConnect} disabled={!configured || connected} variant="secondary">
                {connected ? "已连接" : "连接"}
              </Button>
              <Button onClick={handleMic} disabled={!configured || !connected || micOn} variant="outline">
                <Mic className="h-4 w-4 mr-1" />
                {micOn ? "麦克风已开" : "开启麦克风"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dial">号码</Label>
              <Input
                id="dial"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\d*#]/g, ""))}
                placeholder="分机 / 测试号 / 外线（含前缀）"
                disabled={!configured}
                inputMode="tel"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto w-full">
              {DIAL_KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  className="h-12 text-lg font-semibold"
                  disabled={!configured || busy}
                  onClick={() => handleDialKey(key)}
                >
                  {key}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-12 col-span-3"
                disabled={!configured || !number || busy}
                onClick={handleDialBackspace}
              >
                <Delete className="h-4 w-4 mr-1" /> 删除
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCall} disabled={!configured || !connected || busy || !number.trim()}>
                <Phone className="h-4 w-4 mr-1" /> 呼叫
              </Button>
              <Button onClick={handleHangup} variant="destructive" disabled={!canHangup}>
                <PhoneOff className="h-4 w-4 mr-1" /> 挂断
              </Button>
              <Button
                onClick={handleTestTone}
                variant="outline"
                disabled={!configured || !connected || toneBusy || !busy}
              >
                {toneBusy ? "测试音发送中…" : "发送测试音"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground space-y-1">
              <span className="block">媒体自测（无需外线）：拨 <code>6000</code> 回声 / <code>6001</code> 测试音。</span>
              <span className="block">外线需加 Dongle 前缀，例如 <code>999</code> + 手机号。通话中也可点「发送测试音」。</span>
            </p>

            {incoming && (
              <div className="rounded-md border p-3 flex items-center justify-between gap-3 bg-muted/40">
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="h-5 w-5 text-emerald-600" />
                  <span>来电 {incoming.from || "未知"}</span>
                </div>
                <Button onClick={handleAnswer}>接听</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> 验证 A · WSS Echo
            </CardTitle>
            <CardDescription>测量同源 WSS PCM 回显单向延迟（应在 HTTPS 域名下测）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleEchoProbe} disabled={echoBusy}>
              {echoBusy ? "探测中…" : "运行 5s Echo 探测"}
            </Button>
            {echoStats && (
              <div className="text-sm space-y-1 font-mono">
                <div>samples: {echoStats.count}</div>
                <div>p50 one-way: {echoStats.p50.toFixed(1)} ms</div>
                <div>p95 one-way: {echoStats.p95.toFixed(1)} ms</div>
                <div>max: {echoStats.max.toFixed(1)} ms</div>
                <div className={echoStats.p95 < 200 ? "text-emerald-600" : "text-amber-600"}>
                  标准: p95 {"<"} 200ms {echoStats.p95 < 200 ? "✓" : "未达标"}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>事件日志</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap">
            {logLines.length ? logLines.join("\n") : "暂无日志"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
