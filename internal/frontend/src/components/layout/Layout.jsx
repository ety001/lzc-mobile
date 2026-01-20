import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { Toaster } from "sonner";
import { Activity, CheckCircle2, XCircle, AlertCircle, Terminal, Menu, X } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

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

  // 点击外部区域关闭移动端菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // 禁止背景滚动
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navItems = [
    { path: "/", label: "仪表盘" },
    { path: "/extensions", label: "Extension" },
    { path: "/dongles", label: "Dongle" },
    { path: "/sms", label: "短信" },
    { path: "/notifications", label: "通知" },
    { path: "/terminal", label: "调试工具" },
    { path: "/settings", label: "设置" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 左侧：Logo 和桌面导航 */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              <Activity className="h-5 w-5" />
              <span className="hidden sm:inline">懒猫通信</span>
            </Link>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
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

          {/* 右侧：汉堡菜单按钮和状态指示器 */}
          <div className="flex items-center gap-3">
            {/* 移动端汉堡菜单按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>

            <StatusIndicator status={status} />
          </div>
        </div>

        {/* 移动端导航菜单 - 下拉式 */}
        {mobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="md:hidden border-t bg-background"
          >
            <nav className="container mx-auto px-4 py-4 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    asChild
                    variant={active ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Link to={item.path}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
          </div>
        )}
      </header>
      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
