import { Outlet, Link, useLocation } from "react-router-dom";
import { systemAPI } from "../services/system";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function StatusIndicator({ status }) {
  const config = {
    normal: { label: "normal", className: "bg-emerald-600 text-white hover:bg-emerald-600" },
    restarting: { label: "restarting", className: "bg-amber-500 text-black hover:bg-amber-500" },
    error: { label: "error", className: "bg-destructive text-destructive-foreground hover:bg-destructive" },
    unknown: { label: "unknown", className: "bg-muted text-foreground hover:bg-muted" },
  };

  const current = config[status] || config.unknown;
  return <Badge className={current.className}>{current.label}</Badge>;
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
    const interval = setInterval(fetchStatus, 5000); // 每 5 秒更新一次

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
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-semibold tracking-tight">
              懒猫通信
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    asChild
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                  >
                    <Link to={item.path}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <StatusIndicator status={status} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
