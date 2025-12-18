import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Power, Loader2 } from "lucide-react";

import { systemAPI } from "../services/system";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await systemAPI.getStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await systemAPI.reload();
      toast.success('Asterisk 配置已重新加载');
      fetchStatus();
    } catch (error) {
      toast.error('重新加载失败', { description: error.message });
    } finally {
      setReloading(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await systemAPI.restart();
      toast.success("Asterisk 重启已启动");
      fetchStatus();
    } catch (error) {
      toast.error("重启失败", { description: error.message });
    } finally {
      setRestarting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'normal':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'restarting':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">系统状态</h2>
          <p className="text-sm text-muted-foreground">查看 Asterisk 运行状态并执行维护操作。</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleReload} disabled={reloading} variant="secondary">
            {reloading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {reloading ? "重新加载中..." : "重新加载"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={restarting} variant="destructive">
                {restarting ? <Loader2 className="animate-spin" /> : <Power />}
                {restarting ? "重启中..." : "重启"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重启 Asterisk？</AlertDialogTitle>
                <AlertDialogDescription>
                  这可能会中断正在进行的通话，并短暂影响注册与呼叫能力。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleRestart}>确认重启</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>状态</CardDescription>
            <CardTitle className="capitalize">{status?.status || "unknown"}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>活动通道</CardDescription>
            <CardTitle>{status?.channels || 0}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>SIP 注册数</CardDescription>
            <CardTitle>{status?.registrations || 0}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>运行时间</CardDescription>
            <CardTitle>
              {status?.uptime ? `${Math.floor(status.uptime / 3600)}h` : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </div>
  );
}
