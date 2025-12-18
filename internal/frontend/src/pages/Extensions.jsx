import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { extensionsAPI } from "../services/extensions";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const DEFAULT_EXTENSION_FORM = {
  username: "",
  secret: "",
  callerid: "",
  host: "dynamic",
  context: "default",
  port: "",
  transport: "tcp",
};

export default function Extensions() {
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    ...DEFAULT_EXTENSION_FORM,
  });

  const buildPayload = () => {
    // NOTE: 后端 port 是 int（可选）。这里若为空字符串则不发送该字段，避免 JSON 反序列化错误。
    const payload = {
      ...formData,
      port: formData.port === '' ? undefined : Number(formData.port),
    };
    return payload;
  };

  useEffect(() => {
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      const response = await extensionsAPI.list();
      setExtensions(response.data);
    } catch (error) {
      console.error('Failed to fetch extensions:', error);
      toast.error('获取 Extension 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = buildPayload();
      if (editing) {
        await extensionsAPI.update(editing.id, payload);
        toast.success('Extension 已更新');
      } else {
        await extensionsAPI.create(payload);
        toast.success('Extension 已创建');
      }
      setEditing(null);
      setOpen(false);
      setFormData({ ...DEFAULT_EXTENSION_FORM });
      fetchExtensions();
    } catch (error) {
      toast.error('保存失败', { description: error.response?.data?.error || error.message });
    }
  };

  const handleEdit = (ext) => {
    setEditing(ext);
    setFormData({
      username: ext.username,
      secret: ext.secret,
      callerid: ext.callerid || '',
      host: ext.host || 'dynamic',
      context: ext.context || 'default',
      port: ext.port ? String(ext.port) : '',
      transport: ext.transport || 'tcp',
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await extensionsAPI.delete(id);
      toast.success('Extension 已删除');
      fetchExtensions();
    } catch (error) {
      toast.error('删除失败', { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
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
          <h2 className="text-2xl font-semibold tracking-tight">Extension 管理</h2>
          <p className="text-sm text-muted-foreground">管理 SIP 分机账号（创建/编辑/删除）。</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData({ ...DEFAULT_EXTENSION_FORM });
            setOpen(true);
          }}
        >
          <Plus />
          新建 Extension
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Extensions</CardTitle>
          <CardDescription>当前已配置的分机列表。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>CallerID</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Context</TableHead>
                <TableHead className="w-[160px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {extensions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    暂无 Extension
                  </TableCell>
                </TableRow>
              ) : (
                extensions.map((ext) => (
                  <TableRow key={ext.id}>
                    <TableCell className="font-medium">{ext.username}</TableCell>
                    <TableCell>{ext.callerid || "N/A"}</TableCell>
                    <TableCell>{ext.host || "dynamic"}</TableCell>
                    <TableCell>{ext.context || "default"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(ext)}>
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
                            <AlertDialogTitle>删除 Extension？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后会触发配置重载。若该 Extension 绑定了 Dongle，后端会拒绝删除。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(ext.id)}>确认删除</AlertDialogAction>
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
            <DialogTitle>{editing ? "编辑 Extension" : "新建 Extension"}</DialogTitle>
            <DialogDescription>保存后将自动渲染 Asterisk 配置并 reload。</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="secret">Secret</Label>
              <Input
                id="secret"
                type="password"
                required
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="callerid">CallerID（可选）</Label>
              <Input
                id="callerid"
                value={formData.callerid}
                onChange={(e) => setFormData({ ...formData, callerid: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="context">Context</Label>
              <Input
                id="context"
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="port">Port（可选）</Label>
              <Input
                id="port"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                placeholder="留空则不设置"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Transport</Label>
              <Select
                value={formData.transport}
                onValueChange={(value) => setFormData({ ...formData, transport: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Transport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="udp">UDP</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  );
}
