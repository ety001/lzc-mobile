import { useState } from "react";
import { toast } from "sonner";
import { Phone, Activity } from "lucide-react";
import { runEchoProbe } from "@/softphone/sdk";
import { useSoftphone } from "@/softphone/SoftphoneContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Softphone() {
  const sp = useSoftphone();
  const [echoBusy, setEchoBusy] = useState(false);
  const [echoStats, setEchoStats] = useState(null);
  const [toneBusy, setToneBusy] = useState(false);

  const handleEchoProbe = async () => {
    setEchoBusy(true);
    setEchoStats(null);
    try {
      sp.pushLog("echo probe start (5s)");
      const stats = await runEchoProbe({ durationMs: 5000 });
      setEchoStats(stats);
      sp.pushLog(`echo p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms n=${stats.count}`);
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

  const handleTestTone = async () => {
    try {
      setToneBusy(true);
      await sp.sendTestTone();
      toast.success("已发送 3 秒测试音（440Hz）");
      setTimeout(() => setToneBusy(false), 3200);
    } catch (e) {
      setToneBusy(false);
      toast.error("测试音失败", { description: e.message || String(e) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Softphone</h1>
        <Button type="button" onClick={sp.openDrawer} disabled={!sp.configured}>
          <Phone className="h-4 w-4 mr-1" /> 打开拨号盘
        </Button>
      </div>

      {!sp.configured && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-amber-600">Softphone 不可用</CardTitle>
            <CardDescription>
              尚未指定 Softphone 分机。请到「设置 → Web Softphone 分机」选择一个 Extension 并保存。配置后会自动连接。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>连接状态</CardTitle>
          <CardDescription>连接由顶栏电话保持；切换页面不会断开。拨号请用顶栏电话图标或本页「打开拨号盘」。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={sp.configured ? "secondary" : "outline"}>{sp.configured ? "已配置" : "未配置"}</Badge>
          <Badge variant={sp.connected ? "default" : "outline"}>{sp.connected ? "已连接" : "未连接"}</Badge>
          <Badge variant={sp.registered ? "default" : "outline"}>{sp.registered ? "已注册" : "未注册"}</Badge>
          <Badge variant="outline">分机 {sp.extension || "-"}</Badge>
          <Badge variant="outline">状态 {sp.callState}</Badge>
          <Badge variant={sp.micOn ? "default" : "outline"}>{sp.micOn ? "麦克风开" : "麦克风关"}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
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
            <Button
              variant="outline"
              onClick={handleTestTone}
              disabled={!sp.configured || !sp.connected || toneBusy || !sp.busy}
            >
              {toneBusy ? "测试音发送中…" : "发送测试音（通话中）"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>事件日志</CardTitle>
            <CardDescription>全局 Softphone 会话共享日志。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap">
              {sp.logLines.length ? sp.logLines.join("\n") : "暂无日志"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
