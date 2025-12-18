import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Square, RefreshCw } from "lucide-react";

import { logsAPI } from "../services/logs";
import { Button } from "@/components/ui/button";
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
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchLogs = async () => {
    try {
      const response = await logsAPI.get(100);
      setLogs(response.data.lines || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('获取日志失败');
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
      const line = event.data.replace(/^data: /, '');
      setLogs((prev) => [...prev.slice(-99), line]);
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">日志查看</h2>
          <p className="text-sm text-muted-foreground">支持最近日志拉取与实时 SSE 流。</p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={fetchLogs}>
            <RefreshCw />
            刷新
          </Button>
          {!streaming ? (
            <Button onClick={startStreaming}>
              <Play />
              开始实时流
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopStreaming}>
              <Square />
              停止实时流
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>日志</CardTitle>
          <CardDescription>{streaming ? "实时流已开启（最多保留最近 100 行）" : "显示最近 100 行"}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] rounded-md border bg-black text-green-300">
            <div className="p-4 font-mono text-xs leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">暂无日志</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap break-words">
                    {log}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
