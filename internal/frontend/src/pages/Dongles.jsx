import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";

import { extensionsAPI } from "../services/extensions";
import { donglesAPI } from "../services/dongles";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Dongles() {
  const [bindings, setBindings] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBindingId, setSmsBindingId] = useState(null);
  const [formData, setFormData] = useState({
    dongle_id: '',
    extension_id: '',
    inbound: true,
    outbound: true,
  });
  const [smsData, setSmsData] = useState({ number: '', message: '' });

  const defaultNewForm = useMemo(
    () => ({
      dongle_id: "",
      extension_id: "",
      inbound: true,
      outbound: true,
    }),
    []
  );

  const buildBindingPayload = () => {
    return {
      dongle_id: formData.dongle_id,
      extension_id: Number(formData.extension_id),
      inbound: !!formData.inbound,
      outbound: !!formData.outbound,
    };
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bindingsRes, extensionsRes] = await Promise.all([
        donglesAPI.list(),
        extensionsAPI.list(),
      ]);
      setBindings(bindingsRes.data);
      setExtensions(extensionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('获取数据失败');
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
      const payload = buildBindingPayload();
      if (editing) {
        await donglesAPI.update(editing.id, payload);
        toast.success('绑定已更新');
      } else {
        await donglesAPI.create(payload);
        toast.success('绑定已创建');
      }
      setEditing(null);
      setOpen(false);
      fetchData();
    } catch (error) {
      toast.error('保存失败', { description: error.response?.data?.error || error.message });
    }
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    try {
      await donglesAPI.sendSMS(smsBindingId, smsData);
      toast.success('短信发送成功');
      setSmsOpen(false);
      setSmsBindingId(null);
      setSmsData({ number: '', message: '' });
    } catch (error) {
      toast.error('发送失败', { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dongle 管理</h2>
          <p className="text-sm text-muted-foreground">配置 dongle 与 extension 的来去电绑定，并支持发送短信。</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData(defaultNewForm);
            setOpen(true);
          }}
        >
          <Plus />
          新建绑定
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>绑定列表</CardTitle>
          <CardDescription>Dongle → Extension 的路由关系。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dongle ID</TableHead>
                <TableHead>Extension</TableHead>
                <TableHead>来电</TableHead>
                <TableHead>去电</TableHead>
                <TableHead className="w-[220px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    暂无绑定
                  </TableCell>
                </TableRow>
              ) : (
                bindings.map((binding) => (
                  <TableRow key={binding.id}>
                    <TableCell className="font-medium">{binding.dongle_id}</TableCell>
                    <TableCell>{binding.extension?.username || "N/A"}</TableCell>
                    <TableCell>{binding.inbound ? "✓" : "—"}</TableCell>
                    <TableCell>{binding.outbound ? "✓" : "—"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSmsBindingId(binding.id);
                          setSmsOpen(true);
                        }}
                      >
                        <MessageSquarePlus />
                        发短信
                      </Button>

                      <Button
                        variant="secondary"
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
                      >
                        <Pencil />
                        编辑
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除绑定？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后会触发配置重载，并影响来去电路由。
                            </AlertDialogDescription>
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
                                  toast.error("删除失败", {
                                    description: error.response?.data?.error || error.message,
                                  });
                                }
                              }}
                            >
                              确认删除
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
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑绑定" : "新建绑定"}</DialogTitle>
            <DialogDescription>保存后会自动渲染配置并 reload。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="dongle_id">Dongle ID</Label>
              <Input
                id="dongle_id"
                required
                value={formData.dongle_id}
                disabled={!!editing}
                onChange={(e) => setFormData({ ...formData, dongle_id: e.target.value })}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">编辑时不支持修改 Dongle ID（后端不更新该字段）。</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Extension</Label>
              <Select
                value={formData.extension_id}
                onValueChange={(value) => setFormData({ ...formData, extension_id: value })}
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
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inbound"
                  checked={formData.inbound}
                  onCheckedChange={(checked) => setFormData({ ...formData, inbound: !!checked })}
                />
                <Label htmlFor="inbound">处理来电</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="outbound"
                  checked={formData.outbound}
                  onCheckedChange={(checked) => setFormData({ ...formData, outbound: !!checked })}
                />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发送短信</DialogTitle>
            <DialogDescription>通过绑定的 dongle 发送短信。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendSMS} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="sms-number">号码</Label>
              <Input
                id="sms-number"
                required
                value={smsData.number}
                onChange={(e) => setSmsData({ ...smsData, number: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sms-message">消息</Label>
              <Textarea
                id="sms-message"
                required
                rows={4}
                value={smsData.message}
                onChange={(e) => setSmsData({ ...smsData, message: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSmsOpen(false);
                  setSmsBindingId(null);
                  setSmsData({ number: "", message: "" });
                }}
              >
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
