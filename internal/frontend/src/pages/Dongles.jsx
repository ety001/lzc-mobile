import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { extensionsAPI } from "@/services/extensions";
import { donglesAPI } from "@/services/dongles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [formData, setFormData] = useState({ dongle_id: "", extension_id: "", inbound: true, outbound: true });

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
                        <p className="text-xs text-muted-foreground">点击上方按钮创建新的绑定</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  bindings.map((binding) => {
                    // 统计同一个 dongle 绑定了多少个 extension
                    const sameDongleCount = bindings.filter(b => b.dongle_id === binding.dongle_id).length;
                    return (
                    <TableRow key={binding.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {binding.dongle_id}
                          </Badge>
                          {sameDongleCount > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              {sameDongleCount} 个绑定
                            </Badge>
                          )}
                        </div>
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
                    );
                  })
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
              <Input 
                id="dongle_id" 
                required 
                value={formData.dongle_id} 
                disabled={!!editing} 
                onChange={(e) => setFormData({ ...formData, dongle_id: e.target.value })} 
                placeholder="例如: dongle0, dongle1"
              />
              <p className="text-xs text-muted-foreground">
                {editing ? "编辑时不支持修改 Dongle ID" : "Quectel 设备 ID，格式为 quectel0、quectel1 等。提示：同一个 dongle 可以多次创建绑定，每次选择不同的 extension"}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Extension</Label>
              <Select value={formData.extension_id} onValueChange={(value) => setFormData({ ...formData, extension_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择 Extension" />
                </SelectTrigger>
                <SelectContent>
                  {extensions.map((ext) => {
                    // 检查该 extension 是否已经与当前 dongle_id 绑定（编辑时排除当前绑定）
                    const isBound = bindings.some(
                      (b) => b.dongle_id === formData.dongle_id && 
                             b.extension_id === ext.id && 
                             (!editing || b.id !== editing.id)
                    );
                    return (
                      <SelectItem key={ext.id} value={String(ext.id)} disabled={false}>
                        {ext.username}
                        {isBound && <span className="ml-2 text-xs text-muted-foreground">(已绑定)</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                一个 dongle 可以绑定多个 extension。如果 extension 已绑定，仍可重复绑定以创建新的绑定关系。
              </p>
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
    </div>
  );
}
