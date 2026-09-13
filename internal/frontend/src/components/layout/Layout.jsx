import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { Toaster } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Menu,
  X,
  Phone,
} from "lucide-react";
import { systemAPI } from "@/services/system";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SoftphoneProvider, useSoftphone } from "@/softphone/SoftphoneContext";
import SoftphoneDrawer from "@/components/softphone/SoftphoneDrawer";

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

function SoftphoneHeaderButton() {
  const sp = useSoftphone();
  const active = sp.busy || !!sp.incoming;
  const title = !sp.configured
    ? "Softphone 未配置"
    : sp.incoming
      ? `来电 ${sp.incoming.from || ""}`
      : sp.busy
        ? `通话中 ${sp.callState}`
        : sp.connected
          ? `Softphone 已连接 ${sp.extension || ""}`
          : "Softphone 拨号盘";

  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="icon"
      className="relative"
      disabled={!sp.configured}
      onClick={() => (sp.drawerOpen ? sp.closeDrawer() : sp.openDrawer())}
      aria-label={title}
      title={title}
    >
      <Phone className="h-5 w-5" />
      {sp.configured && sp.connected && !active ? (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500" />
      ) : null}
      {active ? (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      ) : null}
    </Button>
  );
}

function LayoutShell() {
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const navItems = [
    { path: "/", label: "仪表盘" },
    { path: "/extensions", label: "Extension" },
    { path: "/dongles", label: "Dongle" },
    { path: "/softphone", label: "Softphone" },
    { path: "/sms", label: "短信" },
    { path: "/terminal", label: "调试工具" },
    { path: "/settings", label: "设置" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity"
            >
              <Activity className="h-5 w-5" />
              <span className="hidden sm:inline">懒猫通信</span>
            </Link>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    asChild
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={active ? "font-medium" : ""}
                  >
                    <Link to={item.path}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <SoftphoneHeaderButton />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <StatusIndicator status={status} />
          </div>
        </div>

        {mobileMenuOpen && (
          <div ref={mobileMenuRef} className="md:hidden border-t bg-background">
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
      <SoftphoneDrawer />
    </div>
  );
}

export default function Layout() {
  return (
    <SoftphoneProvider>
      <LayoutShell />
    </SoftphoneProvider>
  );
}
