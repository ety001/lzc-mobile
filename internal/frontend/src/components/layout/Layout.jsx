import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Activity, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { systemAPI } from "@/services/system";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function StatusIndicator({ status }) {
  const config = {
    normal: {
      label: "正常",
      className: "bg-emerald-500 text-white hover:bg-emerald-500 border-emerald-500",
      icon: CheckCircle2,
    },
    restarting: {
      label: "重启中",
      className: "bg-amber-500 text-white hover:bg-amber-500 border-amber-500",
      icon: AlertCircle,
    },
    error: {
      label: "错误",
      className: "bg-destructive text-destructive-foreground hover:bg-destructive border-destructive",
      icon: XCircle,
    },
    unknown: {
      label: "未知",
      className: "bg-muted text-muted-foreground hover:bg-muted border-muted",
      icon: Activity,
    },
  };

  const current = config[status] || config.unknown;
  const Icon = current.icon;

  return (
    <Badge className={`${current.className} border flex items-center gap-1.5`} variant="outline">
      <Icon className="h-3 w-3" />
      {current.label}
    </Badge>
  );
}

export default function Layout() {
  const location = useLocation();
  const [status, setStatus] = useState("unknown");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await systemAPI.getStatus();
        setStatus(response.data.status);
      } catch {
        setStatus("error");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: "/", label: "仪表盘" },
    { path: "/extensions", label: "Extension" },
    { path: "/dongles", label: "Dongle" },
    { path: "/notifications", label: "通知" },
    { path: "/logs", label: "日志" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              <Activity className="h-5 w-5" />
              懒猫通信
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button key={item.path} asChild variant={active ? "secondary" : "ghost"} size="sm" className={active ? "font-medium" : ""}>
                    <Link to={item.path}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator status={status} />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
