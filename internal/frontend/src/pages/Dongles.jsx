import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { extensionsAPI } from "@/services/extensions";
import { donglesAPI } from "@/services/dongles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Dongles() {
  const [bindings, setBindings] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBindingId, setSmsBindingId] = useState(null);
  const [formData, setFormData] = useState({ dongle_id: "", extension_id: "", inbound: true, outbound: true });
  const [smsData, setSmsData] = useState({ number: "", message: "" });

  const defaultForm = useMemo(() => ({ dongle_id: "", extension_id: "", inbound: true, outbound: true }), []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bindingsRes, extensionsRes] = await Promise.all([donglesAPI.list(), extensionsAPI.list()]);
      setBindings(bindingsRes.data);
      setExtensions(extensionsRes.data);
    } catch (error) {
      toast.error("获取数据失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.extension_id) {
      toast.error("请选择 Extension");
      return;
    }
    try {
      const payload = {
        dongle_id: formData.dongle_id,
        extension_id: Number(formData.extension_id),
        inbound: !!formData.inbound,
        outbound: !!formData.outbound,
      };
      if (editing) {
        await donglesAPI.update(editing.id, payload);
        toast.success("绑定已更新");
      } else {
        await donglesAPI.create(payload);
        toast.success("绑定已创建");
      }
      setEditing(null);
      setOpen(false);
      fetchData();
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    try {
      await donglesAPI.sendSMS(smsBindingId, smsData);
      toast.success("短信发送成功");
      setSmsOpen(false);
      setSmsBindingId(null);
      setSmsData({ number: "", message: "" });
    } catch (error) {
      toast.error("发送失败", { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Dongle 管理</h2>
          <p className="text-sm text-muted-foreground">配置 dongle 与 extension 的来去电绑定，并支持发送短信</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData(defaultForm);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          新建绑定
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>绑定列表</CardTitle>
          <CardDescription>Dongle → Extension 的路由关系</CardDescription>
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
                        <p className="text-xs text-muted-foreground">点击上方按钮创建新的绑定</p>
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
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setSmsBindingId(binding.id); setSmsOpen(true); }} className="h-8">
                            <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                            发短信
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(binding);
                              setFormData({
                                dongle_id: binding.dongle_id,
                                extension_id: String(binding.extension_id),
                                inbound: binding.inbound,
                                outbound: binding.outbound,
                              });
                              setOpen(true);
                            }}
                            className="h-8"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            编辑
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
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
                                <AlertDialogAction
                                  onClick={async () => {
                                    try {
                                      await donglesAPI.delete(binding.id);
                                      toast.success("绑定已删除");
                                      fetchData();
                                    } catch (error) {
                                      toast.error("删除失败", { description: error.response?.data?.error || error.message });
                                    }
                                  }}
                                >
                                  确认删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{editing ? "编辑绑定" : "新建绑定"}</DialogTitle>
            <DialogDescription>保存后会自动渲染配置并 reload</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="dongle_id">Dongle ID</Label>
              <Input id="dongle_id" required value={formData.dongle_id} disabled={!!editing} onChange={(e) => setFormData({ ...formData, dongle_id: e.target.value })} />
              {editing && <p className="text-xs text-muted-foreground">编辑时不支持修改 Dongle ID</p>}
            </div>
            <div className="grid gap-2">
              <Label>Extension</Label>
              <Select value={formData.extension_id} onValueChange={(value) => setFormData({ ...formData, extension_id: value })}>
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
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox id="inbound" checked={formData.inbound} onCheckedChange={(checked) => setFormData({ ...formData, inbound: !!checked })} />
                <Label htmlFor="inbound">处理来电</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="outbound" checked={formData.outbound} onCheckedChange={(checked) => setFormData({ ...formData, outbound: !!checked })} />
                <Label htmlFor="outbound">处理去电</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">发送短信</DialogTitle>
            <DialogDescription>通过绑定的 dongle 发送短信</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendSMS} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="sms-number">号码</Label>
              <Input id="sms-number" required value={smsData.number} onChange={(e) => setSmsData({ ...smsData, number: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sms-message">消息</Label>
              <Textarea id="sms-message" required rows={4} value={smsData.message} onChange={(e) => setSmsData({ ...smsData, message: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setSmsOpen(false); setSmsBindingId(null); setSmsData({ number: "", message: "" }); }}>
                取消
              </Button>
              <Button type="submit">发送</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
