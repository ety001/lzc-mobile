import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

import { notificationsAPI } from "../services/notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CHANNELS = [
  { value: "smtp", label: "SMTP (邮件)" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
  { value: "webhook", label: "Webhook" },
];

export default function Notifications() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_to: '',
    smtp_tls: false,
    slack_webhook_url: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    webhook_url: '',
    webhook_method: 'POST',
    webhook_header: '',
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await notificationsAPI.list();
      setConfigs(response.data);
    } catch (error) {
      console.error('Failed to fetch configs:', error);
      toast.error('获取通知配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (channel) => {
    const config = configs.find((c) => c.channel === channel) || { channel, enabled: false };
    setEditing(channel);
    setOpen(true);
    setFormData({
      enabled: config.enabled || false,
      smtp_host: config.smtp_host || '',
      smtp_port: config.smtp_port || 587,
      smtp_user: config.smtp_user || '',
      smtp_password: config.smtp_password || '',
      smtp_from: config.smtp_from || '',
      smtp_to: config.smtp_to || '',
      smtp_tls: config.smtp_tls || false,
      slack_webhook_url: config.slack_webhook_url || '',
      telegram_bot_token: config.telegram_bot_token || '',
      telegram_chat_id: config.telegram_chat_id || '',
      webhook_url: config.webhook_url || '',
      webhook_method: config.webhook_method || 'POST',
      webhook_header: config.webhook_header || '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await notificationsAPI.update(editing, formData);
      setOpen(false);
      setEditing(null);
      fetchConfigs();
      toast.success('配置保存成功');
    } catch (error) {
      toast.error('保存失败', { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  const getConfigForChannel = (channel) => {
    return configs.find((c) => c.channel === channel);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">通知配置</h2>
        <p className="text-sm text-muted-foreground">配置短信转发的通知渠道（支持多渠道并行）。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CHANNELS.map((channel) => {
          const config = getConfigForChannel(channel.value);
          const enabled = !!config?.enabled;
          return (
            <Card key={channel.value}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{channel.label}</CardTitle>
                  <CardDescription>
                    {enabled ? "已启用" : "未启用"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={enabled ? "default" : "secondary"}
                    className={enabled ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Button variant="secondary" onClick={() => handleEdit(channel.value)}>
                    <Settings2 />
                    配置
                  </Button>
                </div>
              </CardHeader>
              <CardContent />
            </Card>
          );
        })}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              配置 {CHANNELS.find((c) => c.value === editing)?.label}
            </DialogTitle>
            <DialogDescription>保存后立即生效（短信转发将使用新配置）。</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">启用此通知渠道</div>
                <div className="text-sm text-muted-foreground">启用后短信会转发到该渠道。</div>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>

            {editing === "smtp" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>SMTP 服务器</Label>
                  <Input
                    value={formData.smtp_host}
                    onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>SMTP 端口</Label>
                  <Input
                    type="number"
                    value={formData.smtp_port}
                    onChange={(e) =>
                      setFormData({ ...formData, smtp_port: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>用户名</Label>
                  <Input
                    value={formData.smtp_user}
                    onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>密码</Label>
                  <Input
                    type="password"
                    value={formData.smtp_password}
                    onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>发件人</Label>
                  <Input
                    type="email"
                    value={formData.smtp_from}
                    onChange={(e) => setFormData({ ...formData, smtp_from: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>收件人</Label>
                  <Input
                    type="email"
                    value={formData.smtp_to}
                    onChange={(e) => setFormData({ ...formData, smtp_to: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium">使用 TLS/SSL</div>
                    <div className="text-sm text-muted-foreground">根据你的 SMTP 服务商要求开启。</div>
                  </div>
                  <Switch
                    checked={formData.smtp_tls}
                    onCheckedChange={(checked) => setFormData({ ...formData, smtp_tls: checked })}
                  />
                </div>
              </div>
            )}

            {editing === "slack" && (
              <div className="grid gap-2">
                <Label>Webhook URL</Label>
                <Input
                  type="url"
                  value={formData.slack_webhook_url}
                  onChange={(e) => setFormData({ ...formData, slack_webhook_url: e.target.value })}
                />
              </div>
            )}

            {editing === "telegram" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Bot Token</Label>
                  <Input
                    value={formData.telegram_bot_token}
                    onChange={(e) =>
                      setFormData({ ...formData, telegram_bot_token: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Chat ID</Label>
                  <Input
                    value={formData.telegram_chat_id}
                    onChange={(e) =>
                      setFormData({ ...formData, telegram_chat_id: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            {editing === "webhook" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Webhook URL</Label>
                  <Input
                    type="url"
                    value={formData.webhook_url}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>HTTP 方法</Label>
                  <Select
                    value={formData.webhook_method}
                    onValueChange={(value) => setFormData({ ...formData, webhook_method: value })}
                  >
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
                  <Textarea
                    value={formData.webhook_header}
                    onChange={(e) =>
                      setFormData({ ...formData, webhook_header: e.target.value })
                    }
                    rows={4}
                    placeholder='{"Authorization":"Bearer token"}'
                  />
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
