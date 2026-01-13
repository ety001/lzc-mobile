import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, ChevronLeft, ChevronRight, Filter, MessageSquarePlus } from "lucide-react";
import { smsAPI } from "@/services/sms";
import { donglesAPI } from "@/services/dongles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function SMS() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({
    dongle_id: "",
    direction: "",
  });
  const [bindings, setBindings] = useState([]);
  const [sendSMSOpen, setSendSMSOpen] = useState(false);
  const [smsFormData, setSmsFormData] = useState({
    dongle_id: "",
    number: "",
    message: "",
  });

  useEffect(() => {
    fetchBindings();
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [page, filters]);

  const fetchBindings = async () => {
    try {
      const response = await donglesAPI.list();
      setBindings(response.data);
    } catch (error) {
      toast.error("获取 dongle 列表失败");
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        ...filters,
      };
      const response = await smsAPI.list(params);
      console.log("SMS API response:", response);
      setMessages(response.data?.data || []);
      setTotal(response.data?.total || 0);
      setTotalPages(response.data?.total_pages || 0);
      setSelectedIds([]);
    } catch (error) {
      toast.error("获取短信列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await smsAPI.delete(id);
      toast.success("短信已删除");
      fetchMessages();
    } catch (error) {
      toast.error("删除失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      toast.error("请选择要删除的短信");
      return;
    }
    try {
      await smsAPI.deleteBatch(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 条短信`);
      fetchMessages();
    } catch (error) {
      toast.error("批量删除失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setPage(1); // 重置到第一页
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === messages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(messages.map((m) => m.id));
    }
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    if (!smsFormData.dongle_id || !smsFormData.number || !smsFormData.message) {
      toast.error("请填写完整信息");
      return;
    }
    try {
      await smsAPI.send({
        dongle_id: smsFormData.dongle_id,
        number: smsFormData.number,
        message: smsFormData.message,
      });
      toast.success("短信发送成功");
      setSendSMSOpen(false);
      setSmsFormData({ dongle_id: "", number: "", message: "" });
      fetchMessages(); // 刷新列表
    } catch (error) {
      toast.error("发送失败", { description: error.response?.data?.error || error.message });
    }
  };

  const handleResetSMS = () => {
    setSmsFormData({ dongle_id: "", number: "", message: "" });
  };

  if (loading && messages.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // 获取唯一的 dongle ID 列表
  const uniqueDongleIds = [...new Set(bindings.map((b) => b.dongle_id))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">短信管理</h2>
          <p className="text-sm text-muted-foreground">查看和管理接收和发送的短信</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setSendSMSOpen(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            发短信
          </Button>
          {selectedIds.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除选中 ({selectedIds.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除？</AlertDialogTitle>
                  <AlertDialogDescription>将删除选中的 {selectedIds.length} 条短信，此操作不可恢复。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBatchDelete}>确认删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Dongle 设备</Label>
              <Select value={filters.dongle_id || "all"} onValueChange={(value) => handleFilterChange("dongle_id", value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {uniqueDongleIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>方向</Label>
              <Select value={filters.direction || "all"} onValueChange={(value) => handleFilterChange("direction", value === "all" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="inbound">接收</SelectItem>
                  <SelectItem value="outbound">发送</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>短信列表</CardTitle>
              <CardDescription className="mt-1">共 {total} 条短信</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={selectedIds.length === messages.length && messages.length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="font-semibold">时间</TableHead>
                  <TableHead className="font-semibold">Dongle</TableHead>
                  <TableHead className="font-semibold">号码</TableHead>
                  <TableHead className="font-semibold">方向</TableHead>
                  <TableHead className="font-semibold">内容</TableHead>
                  <TableHead className="font-semibold text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-sm font-medium text-muted-foreground">暂无短信</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  messages.map((message) => (
                    <TableRow key={message.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Checkbox checked={selectedIds.includes(message.id)} onCheckedChange={() => toggleSelect(message.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {new Date(message.created_at).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{message.dongle_id}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{message.phone_number}</TableCell>
                      <TableCell>
                        <Badge variant={message.direction === "inbound" ? "default" : "secondary"}>
                          {message.direction === "inbound" ? "接收" : "发送"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{message.content}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                              删除
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除短信？</AlertDialogTitle>
                              <AlertDialogDescription>此操作不可恢复。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(message.id)}>确认删除</AlertDialogAction>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页，共 {total} 条
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一页
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={sendSMSOpen} onOpenChange={setSendSMSOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">发送短信</DialogTitle>
            <DialogDescription>通过 dongle 设备发送短信</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendSMS} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="sms-dongle">Dongle 设备</Label>
              <Select
                value={smsFormData.dongle_id}
                onValueChange={(value) => setSmsFormData({ ...smsFormData, dongle_id: value })}
              >
                <SelectTrigger id="sms-dongle">
                  <SelectValue placeholder="选择 Dongle 设备" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueDongleIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sms-number">号码</Label>
              <Input
                id="sms-number"
                required
                value={smsFormData.number}
                onChange={(e) => setSmsFormData({ ...smsFormData, number: e.target.value })}
                placeholder="请输入接收短信的号码"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sms-message">短信内容</Label>
              <Textarea
                id="sms-message"
                required
                rows={4}
                value={smsFormData.message}
                onChange={(e) => setSmsFormData({ ...smsFormData, message: e.target.value })}
                placeholder="请输入短信内容"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleResetSMS}>
                重置
              </Button>
              <Button type="button" variant="outline" onClick={() => setSendSMSOpen(false)}>
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
