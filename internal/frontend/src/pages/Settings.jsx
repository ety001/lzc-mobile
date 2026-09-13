import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Settings2, TestTube, Loader2, Bell, Monitor, Smartphone, Tv } from "lucide-react";
import { settingsAPI } from "@/services/settings";
import { notificationsAPI } from "@/services/notifications";
import { extensionsAPI } from "@/services/extensions";
import { useSoftphone } from "@/softphone/SoftphoneContext";
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

function DeviceIcon({ device }) {
  const cls = "h-4 w-4 shrink-0 text-muted-foreground";
  if (device.is_tv) return <Tv className={cls} />;
  if (device.is_mobile) return <Smartphone className={cls} />;
  return <Monitor className={cls} />;
}

function deviceLabel(device) {
  return device.remark_name || device.name || device.model || String(device.id || "").slice(0, 8);
}

export default function Settings() {
  const softphone = useSoftphone();
  const [activeTab, setActiveTab] = useState("global");

  // 全局配置状态
  const [globalLoading, setGlobalLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [httpProxy, setHttpProxy] = useState("");
  const [dongleHealthEnabled, setDongleHealthEnabled] = useState(true);
  const [softphoneExtensionId, setSoftphoneExtensionId] = useState("");
  const [audioABProfile, setAudioABProfile] = useState("A");
  const [savingAudioAB, setSavingAudioAB] = useState(false);
  const [extensions, setExtensions] = useState([]);

  // 懒猫客户端通知设备（对齐 email-notify / 商店审核反馈）
  const [notifyData, setNotifyData] = useState(null);
  const [notifySelected, setNotifySelected] = useState(null);
  const [notifyBusy, setNotifyBusy] = useState("");
  const [notifyError, setNotifyError] = useState("");

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
    fetchNotifyDevices();
    extensionsAPI
      .list()
      .then((res) => setExtensions(res.data || []))
      .catch(() => {});
  }, []);

  const fetchNotifyDevices = async () => {
    try {
      const response = await settingsAPI.getNotifyDevices();
      const res = response.data;
      setNotifyData(res);
      setNotifyError("");
      if (res.device_filter_enabled) {
        const all = new Set((res.devices || []).map((d) => d.id));
        const saved = new Set(res.selected_notify_devices || []);
        setNotifySelected(new Set([...all].filter((id) => saved.has(id))));
      } else {
        setNotifySelected(new Set());
      }
    } catch (error) {
      setNotifyError(error.response?.data?.error || error.message || "加载通知设备失败");
      setNotifyData(null);
      setNotifySelected(new Set());
    }
  };

  const notifyDevices = useMemo(() => notifyData?.devices || [], [notifyData]);
  const notifyDirty = useMemo(() => {
    if (!notifyData || !notifySelected) return false;
    const allOn = notifySelected.size === notifyDevices.length && notifyDevices.length > 0;
    const savedEnabled = !!notifyData.device_filter_enabled;
    const savedSet = new Set(notifyData.selected_notify_devices || []);
    if (allOn) return savedEnabled;
    if (!savedEnabled) return notifySelected.size > 0;
    if (savedSet.size !== notifySelected.size) return true;
    for (const id of notifySelected) if (!savedSet.has(id)) return true;
    return false;
  }, [notifyData, notifySelected, notifyDevices]);

  const buildNotifyPayload = () => {
    const allOn = notifySelected.size === notifyDevices.length && notifyDevices.length > 0;
    if (allOn) return { enabled: false, devices: [] };
    return { enabled: true, devices: [...notifySelected] };
  };

  const handleNotifySave = async () => {
    if (notifyBusy) return;
    setNotifyBusy("save");
    try {
      await settingsAPI.saveNotifyDevices(buildNotifyPayload());
      await fetchNotifyDevices();
      toast.success("通知设备设置已保存");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "保存失败");
    } finally {
      setNotifyBusy("");
    }
  };

  const handleNotifyTest = async () => {
    if (notifyBusy) return;
    setNotifyBusy("test");
    try {
      await settingsAPI.saveNotifyDevices(buildNotifyPayload());
      await fetchNotifyDevices();
      await settingsAPI.testNotifyDevices();
      toast.success("测试通知已发送，请留意选中设备上的系统通知");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "测试通知发送失败");
    } finally {
      setNotifyBusy("");
    }
  };

  // 全局配置相关函数
  const fetchGlobalSettings = async () => {
    try {
      const response = await settingsAPI.get();
      setHttpProxy(response.data.http_proxy || "");
      setDongleHealthEnabled(response.data.dongle_health_enabled !== false);
      setSoftphoneExtensionId(
        response.data.softphone_extension_id ? String(response.data.softphone_extension_id) : ""
      );
      setAudioABProfile(response.data.audio_ab_profile === "B" ? "B" : "A");
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
      await settingsAPI.update({
        http_proxy: httpProxy,
        dongle_health_enabled: dongleHealthEnabled,
        softphone_extension_id: softphoneExtensionId ? Number(softphoneExtensionId) : null,
        audio_ab_profile: audioABProfile,
      });
      toast.success("配置保存成功");
      try {
        await softphone.refreshStatus();
      } catch {
        /* refresh best-effort */
      }
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAudioABChange = async (next) => {
    const profile = next === "B" ? "B" : "A";
    if (profile === audioABProfile) return;
    setSavingAudioAB(true);
    try {
      const res = await settingsAPI.update({
        http_proxy: httpProxy,
        dongle_health_enabled: dongleHealthEnabled,
        softphone_extension_id: softphoneExtensionId ? Number(softphoneExtensionId) : null,
        audio_ab_profile: profile,
      });
      setAudioABProfile(profile);
      if (res.data?.asterisk_restarted) {
        toast.success(`已切换到音频方案 ${profile}，Asterisk 正在重启`);
      } else {
        toast.success(`已切换到音频方案 ${profile}`);
      }
      try {
        await softphone.refreshStatus();
      } catch {
        /* ignore */
      }
    } catch (error) {
      toast.error("切换音频方案失败", {
        description: error.response?.data?.error || error.message,
      });
    } finally {
      setSavingAudioAB(false);
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
            <>
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

                    <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
                      <div className="space-y-0.5">
                        <div className="font-medium">Dongle 设备健康检查</div>
                        <div className="text-sm text-muted-foreground">
                          定期检查 Dongle 设备状态，异常时自动重载模块并发送通知
                        </div>
                      </div>
                      <Switch
                        checked={dongleHealthEnabled}
                        onCheckedChange={(checked) => setDongleHealthEnabled(checked)}
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border p-4">
                      <div className="font-medium">Web Softphone 分机</div>
                      <p className="text-sm text-muted-foreground">
                        指定供浏览器 Softphone 使用的 Extension。未指定时 Softphone 不可用（不会自动选第一个）。
                      </p>
                      <Select
                        value={softphoneExtensionId || "none"}
                        onValueChange={(v) => setSoftphoneExtensionId(v === "none" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="未指定（Softphone 不可用）" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">未指定（Softphone 不可用）</SelectItem>
                          {extensions.map((ext) => (
                            <SelectItem key={ext.id} value={String(ext.id)}>
                              {ext.username}
                              {ext.callerid ? ` (${ext.callerid})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3 rounded-lg border p-4">
                      <div className="font-medium">音频 A/B 对照测试</div>
                      <p className="text-sm text-muted-foreground">
                        对比 0.0.3 前能出声的组合（A）与后续实验栈（B）。切换会重写 Asterisk 配置并重启。
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={savingAudioAB}
                          onClick={() => handleAudioABChange("A")}
                          className={`rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                            audioABProfile === "A"
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          <div className="font-medium">方案 A（基线）</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Softphone 自动开麦（≈e59c917）+ Asterisk 宽 RTP 10000–20000，允许
                            bridge_native_rtp（≈f55a267）
                          </p>
                        </button>
                        <button
                          type="button"
                          disabled={savingAudioAB}
                          onClick={() => handleAudioABChange("B")}
                          className={`rounded-md border px-3 py-3 text-left text-sm transition-colors ${
                            audioABProfile === "B"
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          <div className="font-medium">方案 B（当前实验）</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            RTP 收窄到 ingress 段、noload bridge_native_rtp、media_use_received_transport
                          </p>
                        </button>
                      </div>
                      {savingAudioAB && (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          正在切换并重启 Asterisk…
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        当前生效：<span className="font-medium text-foreground">方案 {audioABProfile}</span>
                        。建议先测 A；若 A 有声、B 无声，问题就在 B 的 RTP/bridge 改动。
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
            </>
          )}
        </TabsContent>

        {/* 通知配置 Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  通知设备
                </CardTitle>
                <CardDescription>
                  Softphone 来电时向选中的懒猫客户端推送即时通知；列表包含您登录过的终端。
                  全部打开表示向所有在线设备广播。离线设备不会报错（仅向在线客户端发送）。
                </CardDescription>
              </div>
              {notifyDevices.length > 0 && notifySelected && (
                <div className="shrink-0 pr-2 pt-1">
                  <Switch
                    checked={notifySelected.size === notifyDevices.length}
                    onCheckedChange={(checked) => {
                      if (checked) setNotifySelected(new Set(notifyDevices.map((d) => d.id)));
                      else setNotifySelected(new Set());
                    }}
                    disabled={!!notifyBusy}
                    aria-label="全选或全不选"
                    title="全选 / 全不选"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-1">
              {notifyError ? (
                <p className="py-3 text-sm text-amber-700">{notifyError}</p>
              ) : !notifyData ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载设备列表…
                </div>
              ) : notifyDevices.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  当前账号下没有已绑定的客户端设备。请确认通过懒猫微服打开本应用（需注入 X-HC-User-ID）。
                </p>
              ) : (
                <div className="max-h-[17.5rem] overflow-y-auto overscroll-contain rounded-md border border-border/60 divide-y divide-border/40">
                  {notifyDevices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/60"
                    >
                      <DeviceIcon device={d} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {deviceLabel(d)}
                          <Badge
                            variant={d.online ? "default" : "secondary"}
                            className="shrink-0 text-[10px]"
                          >
                            {d.online ? "在线" : "离线"}
                          </Badge>
                          {d.notify_unsupported && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-300 text-[10px] text-amber-600"
                              title="该设备未实现系统通知能力，发送时将被跳过"
                            >
                              不支持通知
                            </Badge>
                          )}
                        </p>
                        {d.model && (
                          <p className="truncate text-xs text-muted-foreground">{d.model}</p>
                        )}
                      </div>
                      <Switch
                        checked={notifySelected?.has(d.id) ?? false}
                        onCheckedChange={(checked) => {
                          setNotifySelected((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(d.id);
                            else next.delete(d.id);
                            return next;
                          });
                        }}
                        disabled={!!notifyBusy}
                        aria-label={`接收通知：${deviceLabel(d)}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-4">
                <Button onClick={handleNotifySave} disabled={!!notifyBusy || !notifyDirty}>
                  {notifyBusy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存设置
                </Button>
                <Button variant="outline" onClick={handleNotifyTest} disabled={!!notifyBusy || !notifyData}>
                  {notifyBusy === "test" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="mr-2 h-4 w-4" />
                  )}
                  测试客户端通知
                </Button>
                {notifySelected && notifySelected.size === 0 && notifyDevices.length > 0 && (
                  <p className="w-full text-xs text-amber-600">
                    当前未选择任何设备：若保存为过滤模式将不会发送通知；默认未过滤时仍会向全部在线设备广播
                  </p>
                )}
                <p className="w-full text-xs text-muted-foreground">
                  「测试客户端通知」会先保存当前选择，再向选中的在线设备发送一条测试通知
                </p>
              </div>
            </CardContent>
          </Card>

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
