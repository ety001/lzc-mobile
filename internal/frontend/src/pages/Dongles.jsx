import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Radio, Link, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { extensionsAPI } from "@/services/extensions";
import { dongleDeviceAPI } from "@/services/dongleDevices";
import { dongleBindingAPI } from "@/services/dongleBindings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Dongles() {
  const [activeTab, setActiveTab] = useState("bindings");

  // Dongle 设备状态
  const [devices, setDevices] = useState([]);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [viewingDevice, setViewingDevice] = useState(null);
  const [deviceFormData, setDeviceFormData] = useState({
    device_id: "",
    device: "/dev/ttyUSB0",
    audio: "/dev/ttyUSB1",
    data: "/dev/ttyUSB2",
    group: 0,
    context: "quectel-incoming",
    dial_prefix: "999",
    disable: false,
  });

  // 绑定状态
  const [bindings, setBindings] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [bindingLoading, setBindingLoading] = useState(true);
  const [bindingSubmitting, setBindingSubmitting] = useState(false);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState(null);
  const [bindingFormData, setBindingFormData] = useState({
    dongle_id: "",
    extension_id: "",
    inbound: true,
    outbound: true,
  });

  const defaultDeviceForm = useMemo(
    () => ({
      device_id: "",
      device: "/dev/ttyUSB0",
      audio: "/dev/ttyUSB1",
      data: "/dev/ttyUSB2",
      group: 0,
      context: "quectel-incoming",
      dial_prefix: "999",
      disable: false,
    }),
    []
  );

  const defaultBindingForm = useMemo(
    () => ({ dongle_id: "", extension_id: "", inbound: true, outbound: true }),
    []
  );

  useEffect(() => {
    fetchDevices();
    fetchBindings();
    fetchExtensions();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await dongleDeviceAPI.list();
      setDevices(response.data);
    } catch (error) {
      toast.error("获取设备列表失败");
    } finally {
      setDeviceLoading(false);
    }
  };

  const fetchBindings = async () => {
    try {
      const response = await dongleBindingAPI.list();
      setBindings(response.data);
    } catch (error) {
      toast.error("获取绑定列表失败");
    } finally {
      setBindingLoading(false);
    }
  };

  const fetchExtensions = async () => {
    try {
      const response = await extensionsAPI.list();
      setExtensions(response.data);
    } catch (error) {
      toast.error("获取 Extension 列表失败");
    }
  };

  const handleDeviceSubmit = async (e) => {
    e.preventDefault();
    if (deviceSubmitting) return;

    setDeviceSubmitting(true);
    try {
      if (editingDevice) {
        await dongleDeviceAPI.update(editingDevice.id, deviceFormData);
        toast.success("设备已更新");
      } else {
        await dongleDeviceAPI.create(deviceFormData);
        toast.success("设备已创建");
      }
      setDeviceDialogOpen(false);
      setEditingDevice(null);
      setDeviceFormData(defaultDeviceForm);
      fetchDevices();
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    } finally {
      setDeviceSubmitting(false);
    }
  };

  const handleDeviceDelete = async (device) => {
    if (deviceSubmitting) return;

    setDeviceSubmitting(true);
    try {
      await dongleDeviceAPI.delete(device.id);
      toast.success("设备已删除");
      fetchDevices();
    } catch (error) {
      toast.error("删除失败", { description: error.response?.data?.error || error.message });
    } finally {
      setDeviceSubmitting(false);
    }
  };

  const handleBindingSubmit = async (e) => {
    e.preventDefault();
    if (bindingSubmitting) return;

    if (!bindingFormData.extension_id) {
      toast.error("请选择 Extension");
      return;
    }

    setBindingSubmitting(true);
    try {
      const payload = {
        dongle_id: bindingFormData.dongle_id,
        extension_id: Number(bindingFormData.extension_id),
        inbound: !!bindingFormData.inbound,
        outbound: !!bindingFormData.outbound,
      };
      await dongleBindingAPI.create(payload);
      toast.success("绑定已创建");
      setBindingDialogOpen(false);
      setBindingFormData(defaultBindingForm);
      fetchBindings();
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    } finally {
      setBindingSubmitting(false);
    }
  };

  const handleBindingDelete = async (binding) => {
    if (bindingSubmitting) return;

    setBindingSubmitting(true);
    try {
      await dongleBindingAPI.delete(binding.id);
      toast.success("绑定已删除");
      fetchBindings();
    } catch (error) {
      toast.error("删除失败", { description: error.response?.data?.error || error.message });
    } finally {
      setBindingSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">Dongle 管理</h2>
        <p className="text-sm text-muted-foreground">管理 USB Dongle 设备和绑定关系</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="devices">
            <Radio className="mr-2 h-4 w-4" />
            Dongle 管理
          </TabsTrigger>
          <TabsTrigger value="bindings">
            <Link className="mr-2 h-4 w-4" />
            Dongle 绑定
          </TabsTrigger>
        </TabsList>

        {/* Dongle 管理 Tab */}
        <TabsContent value="devices" className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">物理设备管理</h3>
              <p className="text-sm text-muted-foreground">配置 USB Dongle 设备参数</p>
            </div>
            <Button
              onClick={() => {
                setEditingDevice(null);
                setDeviceFormData(defaultDeviceForm);
                setDeviceDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建设备
            </Button>
          </div>

          {deviceLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : devices.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-sm font-medium text-muted-foreground">暂无设备</p>
                <p className="text-xs text-muted-foreground">点击上方按钮创建新的 Dongle 设备</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <Card key={device.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-mono">{device.device_id}</CardTitle>
                      <CardDescription>{device.disable ? "已禁用" : "已启用"}</CardDescription>
                    </div>
                    <Badge variant={device.disable ? "secondary" : "default"} className={device.disable ? "" : "bg-emerald-500 text-white hover:bg-emerald-500"}>
                      {device.disable ? "禁用" : "启用"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">设备:</span>
                        <span className="font-mono">{device.device}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">音频:</span>
                        <span className="font-mono">{device.audio}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">数据:</span>
                        <span className="font-mono">{device.data}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">外呼前缀:</span>
                        <span className="font-mono">{device.dial_prefix}</span>
                      </div>
                      {device.imei && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IMEI:</span>
                          <span className="font-mono">{device.imei}</span>
                        </div>
                      )}
                      {device.operator && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">运营商:</span>
                          <span>{device.operator}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setViewingDevice(device);
                          setDetailDialogOpen(true);
                        }}
                      >
                        详情
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDevice(device);
                          setDeviceFormData(device);
                          setDeviceDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={deviceSubmitting}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除设备？</AlertDialogTitle>
                            <AlertDialogDescription>删除设备前请确保没有相关的绑定关系。</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeviceDelete(device)} disabled={deviceSubmitting}>
                              {deviceSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {deviceSubmitting ? "删除中..." : "确认删除"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Dongle 绑定 Tab */}
        <TabsContent value="bindings" className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">绑定关系管理</h3>
              <p className="text-sm text-muted-foreground">配置 Dongle 与 Extension 的来去电绑定</p>
            </div>
            <Button
              onClick={() => {
                setBindingFormData(defaultBindingForm);
                setBindingDialogOpen(true);
              }}
              disabled={devices.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              新建绑定
            </Button>
          </div>

          {bindingLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>绑定列表</CardTitle>
                <CardDescription>
                  Dongle → Extension 的路由关系。一个 dongle 可以绑定多个 extension，每个绑定可以独立配置来电/去电开关。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Dongle ID</TableHead>
                        <TableHead className="font-semibold">Extension</TableHead>
                        <TableHead className="font-semibold">来电</TableHead>
                        <TableHead className="font-semibold">去电</TableHead>
                        <TableHead className="font-semibold text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bindings.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <p className="text-sm font-medium text-muted-foreground">暂无绑定</p>
                              <p className="text-xs text-muted-foreground">
                                {devices.length === 0 ? "请先创建 Dongle 设备" : "点击上方按钮创建新的绑定"}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        bindings.map((binding) => (
                          <TableRow key={binding.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              <Badge variant="outline" className="font-mono">
                                {binding.dongle_id}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{binding.extension?.username || "N/A"}</Badge>
                            </TableCell>
                            <TableCell>
                              {binding.inbound ? (
                                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">✓ 启用</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {binding.outbound ? (
                                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">✓ 启用</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" disabled={bindingSubmitting}>
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    删除
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>删除绑定？</AlertDialogTitle>
                                    <AlertDialogDescription>删除后会触发配置重载，并影响来去电路由。</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleBindingDelete(binding)} disabled={bindingSubmitting}>
                                      {bindingSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                      {bindingSubmitting ? "删除中..." : "确认删除"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dongle 设备对话框 */}
      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{editingDevice ? "编辑设备" : "新建设备"}</DialogTitle>
            <DialogDescription>保存后会自动渲染配置并 reload</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeviceSubmit} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="device_id">
                设备 ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="device_id"
                required
                value={deviceFormData.device_id}
                disabled={!!editingDevice}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, device_id: e.target.value })}
                placeholder="quectel0"
              />
              <p className="text-xs text-muted-foreground">
                {editingDevice ? "编辑时不支持修改设备 ID" : "Quectel 设备 ID（如 quectel0）"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="device">Device 路径</Label>
                <Input
                  id="device"
                  value={deviceFormData.device}
                  onChange={(e) => setDeviceFormData({ ...deviceFormData, device: e.target.value })}
                  placeholder="/dev/ttyUSB0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="audio">Audio 路径</Label>
                <Input
                  id="audio"
                  value={deviceFormData.audio}
                  onChange={(e) => setDeviceFormData({ ...deviceFormData, audio: e.target.value })}
                  placeholder="/dev/ttyUSB1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data">Data 路径</Label>
                <Input
                  id="data"
                  value={deviceFormData.data}
                  onChange={(e) => setDeviceFormData({ ...deviceFormData, data: e.target.value })}
                  placeholder="/dev/ttyUSB2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="group">组号</Label>
                <Input
                  id="group"
                  type="number"
                  value={deviceFormData.group}
                  onChange={(e) => setDeviceFormData({ ...deviceFormData, group: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dial_prefix">外呼前缀</Label>
                <Input
                  id="dial_prefix"
                  value={deviceFormData.dial_prefix}
                  onChange={(e) => setDeviceFormData({ ...deviceFormData, dial_prefix: e.target.value })}
                  placeholder="999"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="context">来电上下文</Label>
              <Input
                id="context"
                value={deviceFormData.context}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, context: e.target.value })}
                placeholder="quectel-incoming"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/50">
              <div className="space-y-0.5">
                <div className="font-medium">禁用设备</div>
                <div className="text-sm text-muted-foreground">禁用后将不会处理来电和去电</div>
              </div>
              <Switch
                checked={deviceFormData.disable}
                onCheckedChange={(checked) => setDeviceFormData({ ...deviceFormData, disable: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeviceDialogOpen(false)} disabled={deviceSubmitting}>
                取消
              </Button>
              <Button type="submit" disabled={deviceSubmitting}>
                {deviceSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {deviceSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dongle 绑定对话框 */}
      <Dialog open={bindingDialogOpen} onOpenChange={setBindingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">新建绑定</DialogTitle>
            <DialogDescription>保存后会自动渲染配置并 reload</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBindingSubmit} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="binding_dongle_id">
                Dongle ID <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bindingFormData.dongle_id}
                onValueChange={(value) => setBindingFormData({ ...bindingFormData, dongle_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Dongle 设备" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.device_id}>
                      {device.device_id} {device.disable && "(已禁用)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {devices.length === 0 ? "请先创建 Dongle 设备" : "选择要绑定的 Dongle 设备"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Extension</Label>
              <Select
                value={bindingFormData.extension_id}
                onValueChange={(value) => setBindingFormData({ ...bindingFormData, extension_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Extension" />
                </SelectTrigger>
                <SelectContent>
                  {extensions.map((ext) => (
                    <SelectItem key={ext.id} value={String(ext.id)}>
                      {ext.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                一个 dongle 可以绑定多个 extension
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inbound"
                  checked={bindingFormData.inbound}
                  onCheckedChange={(checked) => setBindingFormData({ ...bindingFormData, inbound: !!checked })}
                />
                <Label htmlFor="inbound">处理来电</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="outbound"
                  checked={bindingFormData.outbound}
                  onCheckedChange={(checked) => setBindingFormData({ ...bindingFormData, outbound: !!checked })}
                />
                <Label htmlFor="outbound">处理去电</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBindingDialogOpen(false)} disabled={bindingSubmitting}>
                取消
              </Button>
              <Button type="submit" disabled={bindingSubmitting}>
                {bindingSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {bindingSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 设备详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">{viewingDevice?.device_id} 详情</DialogTitle>
            <DialogDescription>设备配置和 SIM 卡信息</DialogDescription>
          </DialogHeader>
          {viewingDevice && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-3">设备配置</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">设备路径:</span>
                    <span className="ml-2 font-mono">{viewingDevice.device}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">音频路径:</span>
                    <span className="ml-2 font-mono">{viewingDevice.audio}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">数据路径:</span>
                    <span className="ml-2 font-mono">{viewingDevice.data}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">组号:</span>
                    <span className="ml-2">{viewingDevice.group}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">外呼前缀:</span>
                    <span className="ml-2 font-mono">{viewingDevice.dial_prefix}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">来电上下文:</span>
                    <span className="ml-2">{viewingDevice.context}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">运行状态</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">状态:</span>
                    <Badge className="ml-2" variant={viewingDevice.status === "online" ? "default" : "secondary"}>
                      {viewingDevice.status || "unknown"}
                    </Badge>
                  </div>
                  {viewingDevice.signal_strength !== undefined && (
                    <div>
                      <span className="text-muted-foreground">信号强度:</span>
                      <span className="ml-2">{viewingDevice.signal_strength}</span>
                    </div>
                  )}
                  {viewingDevice.imei && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">IMEI:</span>
                      <span className="ml-2 font-mono">{viewingDevice.imei}</span>
                    </div>
                  )}
                  {viewingDevice.imsi && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">IMSI:</span>
                      <span className="ml-2 font-mono">{viewingDevice.imsi}</span>
                    </div>
                  )}
                  {viewingDevice.operator && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">运营商:</span>
                      <span className="ml-2">{viewingDevice.operator}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
