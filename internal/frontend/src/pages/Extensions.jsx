import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { extensionsAPI } from "@/services/extensions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const DEFAULT_FORM = {
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
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });

  useEffect(() => {
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      const response = await extensionsAPI.list();
      setExtensions(response.data);
    } catch (error) {
      toast.error("获取 Extension 列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        port: formData.port === "" ? undefined : Number(formData.port),
      };
      if (editing) {
        await extensionsAPI.update(editing.id, payload);
        toast.success("Extension 已更新");
      } else {
        await extensionsAPI.create(payload);
        toast.success("Extension 已创建");
      }
      setEditing(null);
      setOpen(false);
      setFormData({ ...DEFAULT_FORM });
      fetchExtensions();
    } catch (error) {
      toast.error("保存失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleEdit = (ext) => {
    setEditing(ext);
    setFormData({
      username: ext.username,
      secret: ext.secret,
      callerid: ext.callerid || "",
      host: ext.host || "dynamic",
      context: ext.context || "default",
      port: ext.port ? String(ext.port) : "",
      transport: ext.transport || "tcp",
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await extensionsAPI.delete(id);
      toast.success("Extension 已删除");
      fetchExtensions();
    } catch (error) {
      toast.error("删除失败", { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Extension 管理</h2>
          <p className="text-sm text-muted-foreground">管理 SIP 分机账号（创建/编辑/删除）</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData({ ...DEFAULT_FORM });
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          新建 Extension
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Extensions</CardTitle>
          <CardDescription>当前已配置的分机列表</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Username</TableHead>
                  <TableHead className="font-semibold">CallerID</TableHead>
                  <TableHead className="font-semibold">Host</TableHead>
                  <TableHead className="font-semibold">Context</TableHead>
                  <TableHead className="font-semibold text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extensions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-sm font-medium text-muted-foreground">暂无 Extension</p>
                        <p className="text-xs text-muted-foreground">点击上方按钮创建新的 Extension</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  extensions.map((ext) => (
                    <TableRow key={ext.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{ext.username}</TableCell>
                      <TableCell className="text-muted-foreground">{ext.callerid || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ext.host || "dynamic"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ext.context || "default"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(ext)} className="h-8">
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
                                <AlertDialogTitle>删除 Extension？</AlertDialogTitle>
                                <AlertDialogDescription>删除后会触发配置重载。若该 Extension 绑定了 Dongle，后端会拒绝删除。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(ext.id)}>确认删除</AlertDialogAction>
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
            <DialogTitle className="text-2xl">{editing ? "编辑 Extension" : "新建 Extension"}</DialogTitle>
            <DialogDescription>保存后将自动渲染 Asterisk 配置并 reload</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" required value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret">Secret</Label>
              <Input id="secret" type="password" required value={formData.secret} onChange={(e) => setFormData({ ...formData, secret: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="callerid">CallerID（可选）</Label>
              <Input id="callerid" value={formData.callerid} onChange={(e) => setFormData({ ...formData, callerid: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="host">Host</Label>
              <Input id="host" value={formData.host} onChange={(e) => setFormData({ ...formData, host: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="context">Context</Label>
              <Input id="context" value={formData.context} onChange={(e) => setFormData({ ...formData, context: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="port">Port（可选）</Label>
              <Input id="port" type="number" min={1} max={65535} placeholder="留空则不设置" value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Transport</Label>
              <Select value={formData.transport} onValueChange={(value) => setFormData({ ...formData, transport: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择 Transport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp+udp">TCP+UDP（推荐）</SelectItem>
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
