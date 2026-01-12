import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2, Loader2 } from "lucide-react";
import { settingsAPI } from "@/services/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [httpProxy, setHttpProxy] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await settingsAPI.get();
      setHttpProxy(response.data.http_proxy || "");
    } catch (error) {
      toast.error("获取配置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsAPI.update({ http_proxy: httpProxy });
      toast.success("配置保存成功");
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">全局配置</h2>
        <p className="text-sm text-muted-foreground">配置系统全局设置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            HTTP 代理服务器
          </CardTitle>
          <CardDescription>配置全局 HTTP 代理服务器，用于通知渠道的代理连接</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="http_proxy">代理服务器地址</Label>
              <Input
                id="http_proxy"
                type="url"
                value={httpProxy}
                onChange={(e) => setHttpProxy(e.target.value)}
                placeholder="http://proxy.example.com:8080 或 https://proxy.example.com:8080"
              />
              <p className="text-xs text-muted-foreground">
                格式：http://host:port 或 https://host:port。留空表示不使用代理。
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
