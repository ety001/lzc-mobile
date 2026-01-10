import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Square, RefreshCw } from "lucide-react";
import { logsAPI } from "@/services/logs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    fetchLogs();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const fetchLogs = async () => {
    try {
      const response = await logsAPI.get(100);
      setLogs(response.data.lines || []);
    } catch (error) {
      toast.error("获取日志失败");
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = () => {
    if (streaming) return;
    setStreaming(true);
    const eventSource = logsAPI.stream();
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const line = event.data.replace(/^data: /, "");
      setLogs((prev) => [...prev.slice(-99), line]);
    };

    eventSource.onerror = () => {
      setStreaming(false);
      eventSource.close();
    };
  };

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">日志查看</h2>
          <p className="text-sm text-muted-foreground">支持最近日志拉取与实时 SSE 流</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} size="default">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          {!streaming ? (
            <Button onClick={startStreaming} size="default">
              <Play className="mr-2 h-4 w-4" />
              开始实时流
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopStreaming} size="default">
              <Square className="mr-2 h-4 w-4" />
              停止实时流
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>日志</CardTitle>
              <CardDescription className="mt-1">{streaming ? "实时流已开启（最多保留最近 100 行）" : "显示最近 100 行"}</CardDescription>
            </div>
            {streaming && <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white animate-pulse">实时流</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <ScrollArea className="h-[600px] bg-slate-950 text-green-400">
              <div className="p-4 font-mono text-xs leading-relaxed">
                {logs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">暂无日志</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap break-words hover:bg-slate-900/50 px-2 py-1 rounded transition-colors">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
