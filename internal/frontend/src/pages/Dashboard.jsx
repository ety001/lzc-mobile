import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Power, Loader2, Activity, Phone, Users, Clock } from "lucide-react";
import { systemAPI } from "@/services/system";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await systemAPI.reload();
      toast.success("Asterisk 配置已重新加载");
      fetchStatus();
    } catch (error) {
      toast.error("重新加载失败", { description: error.message });
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

  const getStatusConfig = (statusValue) => {
    switch (statusValue) {
      case "normal":
        return { label: "正常", className: "bg-emerald-500 hover:bg-emerald-500 text-white" };
      case "error":
        return { label: "错误", className: "bg-destructive hover:bg-destructive text-destructive-foreground" };
      case "restarting":
        return { label: "重启中", className: "bg-amber-500 hover:bg-amber-500 text-white" };
      default:
        return { label: "未知", className: "bg-muted hover:bg-muted text-muted-foreground" };
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return "N/A";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${secs}秒`;
    return `${secs}秒`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(status?.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">系统状态</h2>
          <p className="text-sm text-muted-foreground">查看 Asterisk 运行状态并执行维护操作</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReload} disabled={reloading} variant="outline" size="default">
            {reloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {reloading ? "重新加载中..." : "重新加载"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={restarting} variant="destructive" size="default">
                {restarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
                {restarting ? "重启中..." : "重启"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>重启 Asterisk？</AlertDialogTitle>
                <AlertDialogDescription>这可能会中断正在进行的通话，并短暂影响注册与呼叫能力。</AlertDialogDescription>
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">系统运行状态</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活动通道</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.channels || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">当前活跃的通话通道数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SIP 注册数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.registrations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">已注册的 SIP 终端数量</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">运行时间</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.uptime ? formatUptime(status.uptime) : "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1">系统持续运行时长</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
