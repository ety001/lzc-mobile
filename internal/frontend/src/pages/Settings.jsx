import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2, TestTube, Loader2, Bell } from "lucide-react";
import { settingsAPI } from "@/services/settings";
import { notificationsAPI } from "@/services/notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CHANNELS = [
  { value: "smtp", label: "SMTP (邮件)" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
  { value: "webhook", label: "Webhook" },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("global");

  // 全局配置状态
  const [globalLoading, setGlobalLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [httpProxy, setHttpProxy] = useState("");

  // 通知配置状态
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [configs, setConfigs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(null);
  const [formData, setFormData] = useState({
    enabled: false,
    use_proxy: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    smtp_from: "",
    smtp_to: "",
    smtp_tls: false,
    slack_webhook_url: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    webhook_url: "",
    webhook_method: "POST",
    webhook_header: "",
  });

  useEffect(() => {
    fetchGlobalSettings();
    fetchNotificationConfigs();
  }, []);

  // 全局配置相关函数
  const fetchGlobalSettings = async () => {
    try {
      const response = await settingsAPI.get();
      setHttpProxy(response.data.http_proxy || "");
    } catch (error) {
      toast.error("获取配置失败");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleGlobalSubmit = async (e) => {
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

  // 通知配置相关函数
  const fetchNotificationConfigs = async () => {
    try {
      const response = await notificationsAPI.list();
      setConfigs(response.data);
    } catch (error) {
      toast.error("获取通知配置失败");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleEdit = (channel) => {
    const config = configs.find((c) => c.channel === channel) || { channel, enabled: false };
    setEditing(channel);
    setOpen(true);
    setFormData({
      enabled: config.enabled || false,
      use_proxy: config.use_proxy || false,
      smtp_host: config.smtp_host || "",
      smtp_port: config.smtp_port || 587,
      smtp_user: config.smtp_user || "",
      smtp_password: config.smtp_password || "",
      smtp_from: config.smtp_from || "",
      smtp_to: config.smtp_to || "",
      smtp_tls: config.smtp_tls || false,
      slack_webhook_url: config.slack_webhook_url || "",
      telegram_bot_token: config.telegram_bot_token || "",
      telegram_chat_id: config.telegram_chat_id || "",
      webhook_url: config.webhook_url || "",
      webhook_method: config.webhook_method || "POST",
      webhook_header: config.webhook_header || "",
    });
  };

  const handleNotificationSubmit = async (e) => {
    e.preventDefault();
    try {
      await notificationsAPI.update(editing, formData);
      setOpen(false);
      setEditing(null);
      fetchNotificationConfigs();
      toast.success("配置保存成功");
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleTest = async (channel) => {
    setTesting(channel);
    try {
      const response = await notificationsAPI.test(channel);
      if (response.data.success) {
        toast.success("测试消息发送成功");
      } else {
        toast.error("测试失败", { description: response.data.error || "未知错误" });
      }
    } catch (error) {
      toast.error("测试失败", { description: error.response?.data?.error || error.message });
    } finally {
      setTesting(null);
    }
  };

  const getConfigForChannel = (channel) => configs.find((c) => c.channel === channel);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">设置</h2>
        <p className="text-sm text-muted-foreground">管理全局配置和通知渠道</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="global">
            <Settings2 className="mr-2 h-4 w-4" />
            全局配置
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            通知配置
          </TabsTrigger>
        </TabsList>

        {/* 全局配置 Tab */}
        <TabsContent value="global" className="space-y-6">
          {globalLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  HTTP 代理服务器
                </CardTitle>
                <CardDescription>配置全局 HTTP 代理服务器，用于通知渠道的代理连接</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGlobalSubmit} className="space-y-4">
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
          )}
        </TabsContent>

        {/* 通知配置 Tab */}
        <TabsContent value="notifications" className="space-y-6">
          {notificationsLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-8 w-40" />
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {CHANNELS.map((channel) => {
                const config = getConfigForChannel(channel.value);
                const enabled = !!config?.enabled;
                return (
                  <Card key={channel.value} className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-semibold">{channel.label}</CardTitle>
                        <CardDescription>{enabled ? "已启用" : "未启用"}</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={enabled ? "default" : "secondary"} className={enabled ? "bg-emerald-500 text-white hover:bg-emerald-500" : ""}>
                          {enabled ? "已启用" : "未启用"}
                        </Badge>
                        {enabled && (
                          <Button variant="outline" onClick={() => handleTest(channel.value)} size="sm" disabled={testing === channel.value}>
                            {testing === channel.value ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                测试中...
                              </>
                            ) : (
                              <>
                                <TestTube className="mr-2 h-4 w-4" />
                                测试
                              </>
                            )}
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => handleEdit(channel.value)} size="sm">
                          <Settings2 className="mr-2 h-4 w-4" />
                          配置
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {enabled && config && (
                        <div className="mt-2 pt-4 border-t space-y-1.5 text-xs text-muted-foreground">
                          {channel.value === "smtp" && config.smtp_host && <p>服务器: {config.smtp_host}:{config.smtp_port}</p>}
                          {channel.value === "slack" && config.slack_webhook_url && <p>Webhook 已配置</p>}
                          {channel.value === "telegram" && config.telegram_bot_token && <p>Bot Token 已配置</p>}
                          {channel.value === "webhook" && config.webhook_url && <p>URL: {config.webhook_url}</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 通知配置对话框 */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">配置 {CHANNELS.find((c) => c.value === editing)?.label}</DialogTitle>
            <DialogDescription>保存后立即生效（短信转发将使用新配置）</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNotificationSubmit} className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
              <div className="space-y-0.5">
                <div className="font-medium">启用此通知渠道</div>
                <div className="text-sm text-muted-foreground">启用后短信会转发到该渠道</div>
              </div>
              <Switch checked={formData.enabled} onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
              <div className="space-y-0.5">
                <div className="font-medium">使用 HTTP 代理</div>
                <div className="text-sm text-muted-foreground">使用全局配置的 HTTP 代理服务器发送通知</div>
              </div>
              <Switch checked={formData.use_proxy} onCheckedChange={(checked) => setFormData({ ...formData, use_proxy: checked })} />
            </div>

            {editing === "smtp" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>SMTP 服务器</Label>
                  <Input value={formData.smtp_host} onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>SMTP 端口</Label>
                  <Input type="number" value={formData.smtp_port} onChange={(e) => setFormData({ ...formData, smtp_port: Number(e.target.value) || 0 })} />
                </div>
                <div className="grid gap-2">
                  <Label>用户名</Label>
                  <Input value={formData.smtp_user} onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>密码</Label>
                  <Input type="password" value={formData.smtp_password} onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>发件人</Label>
                  <Input type="email" value={formData.smtp_from} onChange={(e) => setFormData({ ...formData, smtp_from: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>收件人</Label>
                  <Input type="email" value={formData.smtp_to} onChange={(e) => setFormData({ ...formData, smtp_to: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
                  <div className="space-y-0.5">
                    <div className="font-medium">使用 TLS/SSL</div>
                    <div className="text-sm text-muted-foreground">根据你的 SMTP 服务商要求开启</div>
                  </div>
                  <Switch checked={formData.smtp_tls} onCheckedChange={(checked) => setFormData({ ...formData, smtp_tls: checked })} />
                </div>
              </div>
            )}

            {editing === "slack" && (
              <div className="grid gap-2">
                <Label>Webhook URL</Label>
                <Input type="url" value={formData.slack_webhook_url} onChange={(e) => setFormData({ ...formData, slack_webhook_url: e.target.value })} />
              </div>
            )}

            {editing === "telegram" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Bot Token</Label>
                  <Input value={formData.telegram_bot_token} onChange={(e) => setFormData({ ...formData, telegram_bot_token: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Chat ID</Label>
                  <Input value={formData.telegram_chat_id} onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })} />
                </div>
              </div>
            )}

            {editing === "webhook" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Webhook URL</Label>
                  <Input type="url" value={formData.webhook_url} onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>HTTP 方法</Label>
                  <Select value={formData.webhook_method} onValueChange={(value) => setFormData({ ...formData, webhook_method: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择 HTTP 方法" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>自定义请求头（JSON）</Label>
                  <Textarea value={formData.webhook_header} onChange={(e) => setFormData({ ...formData, webhook_header: e.target.value })} rows={4} placeholder='{"Authorization":"Bearer token"}' />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
