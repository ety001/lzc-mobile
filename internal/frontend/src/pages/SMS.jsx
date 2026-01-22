import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, ChevronLeft, ChevronRight, Filter, MessageSquarePlus, Eye, Check, X, Loader2 } from "lucide-react";
import { smsAPI } from "@/services/sms";
import { dongleDeviceAPI } from "@/services/dongleDevices";
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
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({
    dongle_id: "",
    direction: "",
  });
  const [dongles, setDongles] = useState([]);
  const [sendSMSOpen, setSendSMSOpen] = useState(false);
  const [smsFormData, setSmsFormData] = useState({
    dongle_id: "",
    number: "",
    message: "",
  });
  const [jumpPage, setJumpPage] = useState("");
  const [detailMessage, setDetailMessage] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]); // 正在删除的短信ID列表

  useEffect(() => {
    fetchDongles();
  }, []);

  useEffect(() => {
    fetchMessages();

    // 第一页时设置自动刷新（5秒间隔）
    let intervalId = null;
    if (page === 1) {
      intervalId = setInterval(() => {
        fetchMessages();
      }, 5000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [page, filters]);

  const fetchDongles = async () => {
    try {
      const response = await dongleDeviceAPI.list();
      setDongles(response.data);
    } catch (error) {
      toast.error("获取 dongle 设备列表失败");
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
    setDeletingIds((prev) => [...prev, id]);
    try {
      await smsAPI.delete(id);
      toast.success("短信已删除");
      await fetchMessages();
    } catch (error) {
      toast.error("删除失败", { description: error.response?.data?.error || error.message });
    } finally {
      setDeletingIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      toast.error("请选择要删除的短信");
      return;
    }
    setDeletingIds((prev) => [...prev, ...selectedIds]);
    try {
      await smsAPI.deleteBatch(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 条短信`);
      setSelectedIds([]);
      await fetchMessages();
    } catch (error) {
      toast.error("批量删除失败", { description: error.response?.data?.error || error.message });
    } finally {
      setDeletingIds([]);
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

  const handleViewDetail = (message) => {
    setDetailMessage(message);
    setDetailOpen(true);
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxButtons = 7;

    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (page <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = page - 1; i <= page + 1; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (loading && messages.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // 获取可用的 dongle 设备列表（未禁用的）
  const availableDongles = dongles.filter((d) => !d.disable);

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
                <Button variant="destructive" disabled={deletingIds.length > 0}>
                  {deletingIds.length > 0 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      删除中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除选中 ({selectedIds.length})
                    </>
                  )}
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
                  {availableDongles.map((dongle) => (
                    <SelectItem key={dongle.device_id} value={dongle.device_id}>
                      {dongle.device_id}
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
                  <TableHead className="font-semibold">方向</TableHead>
                  <TableHead className="font-semibold">推送状态</TableHead>
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
                        {message.sms_timestamp
                          ? new Date(message.sms_timestamp).toLocaleString("zh-CN")
                          : new Date(message.created_at).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{message.dongle_id}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={message.direction === "inbound" ? "default" : "secondary"}>
                          {message.direction === "inbound" ? "接收" : "发送"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {message.pushed ? (
                          <div className="flex items-center justify-center">
                            <Check className="h-4 w-4 text-green-500" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <X className="h-4 w-4 text-gray-400" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate">{message.content}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleViewDetail(message)}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title="删除"
                                disabled={deletingIds.includes(message.id)}
                              >
                                {deletingIds.includes(message.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
              <div className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页，共 {total} 条
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  首页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一页
                </Button>

                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === "..." ? (
                    <span key={idx} className="px-2">
                      {pageNum}
                    </span>
                  ) : (
                    <Button
                      key={idx}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      className="w-10"
                    >
                      {pageNum}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                >
                  末页
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const p = parseInt(jumpPage);
                      if (p >= 1 && p <= totalPages) {
                        setPage(p);
                        setJumpPage("");
                      }
                    }
                  }}
                  placeholder="页码"
                  className="w-20"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const p = parseInt(jumpPage);
                    if (p >= 1 && p <= totalPages) {
                      setPage(p);
                      setJumpPage("");
                    }
                  }}
                  disabled={!jumpPage}
                >
                  跳转
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">短信详情</DialogTitle>
          </DialogHeader>
          {detailMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">SIM 时间</Label>
                  <p className="font-mono text-sm mt-1">
                    {detailMessage.sms_timestamp
                      ? new Date(detailMessage.sms_timestamp).toLocaleString("zh-CN")
                      : "未知"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">入库时间</Label>
                  <p className="font-mono text-sm mt-1">
                    {new Date(detailMessage.created_at).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">方向</Label>
                  <p className="mt-1">
                    <Badge variant={detailMessage.direction === "inbound" ? "default" : "secondary"}>
                      {detailMessage.direction === "inbound" ? "接收" : "发送"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Dongle 设备</Label>
                  <p className="font-mono text-sm mt-1">{detailMessage.dongle_id}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">号码</Label>
                <p className="font-mono text-sm mt-1">{detailMessage.phone_number}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">推送状态</Label>
                <p className="mt-1">
                  {detailMessage.pushed ? (
                    <Badge variant="default" className="bg-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      已推送
                      {detailMessage.pushed_at && ` (${new Date(detailMessage.pushed_at).toLocaleString('zh-CN')})`}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500">
                      <X className="h-3 w-3 mr-1" />
                      未推送
                    </Badge>
                  )}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">短信内容</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap break-words bg-muted p-3 rounded-md">
                  {detailMessage.content}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {availableDongles.map((dongle) => (
                    <SelectItem key={dongle.device_id} value={dongle.device_id}>
                      {dongle.device_id}
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
