import { Delete, Mic, Phone, PhoneIncoming, PhoneOff, X } from "lucide-react";
import { useSoftphone } from "@/softphone/SoftphoneContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function SoftphoneDrawer() {
  const sp = useSoftphone();

  if (!sp.drawerOpen) return null;

  const canHangup = sp.configured && (sp.connected || sp.busy || !!sp.incoming);

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭拨号盘"
        onClick={sp.closeDrawer}
      />
      <aside
        className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-xl md:inset-y-0 md:left-auto md:right-0 md:w-full md:max-w-sm md:rounded-none md:border-l md:max-h-none"
        role="dialog"
        aria-modal="true"
        aria-label="Softphone 拨号盘"
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold">拨号盘</h2>
            <p className="text-xs text-muted-foreground">关闭抽屉不会挂断通话</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={sp.closeDrawer} aria-label="关闭">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {!sp.configured ? (
          <p className="text-sm text-amber-600 mb-4">
            尚未指定 Softphone 分机。请到「设置 → Web Softphone 分机」选择后保存。
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant={sp.configured ? "secondary" : "outline"}>{sp.configured ? "已配置" : "未配置"}</Badge>
          <Badge variant={sp.connected ? "default" : "outline"}>{sp.connected ? "已连接" : "未连接"}</Badge>
          <Badge variant={sp.registered ? "default" : "outline"}>{sp.registered ? "已注册" : "未注册"}</Badge>
          <Badge variant="outline">分机 {sp.extension || "-"}</Badge>
          <Badge variant="outline">状态 {sp.callState}</Badge>
        </div>

        {sp.incoming ? (
          <div className="rounded-md border p-3 flex items-center justify-between gap-3 bg-muted/40 mb-4">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-5 w-5 text-emerald-600" />
              <span>来电 {sp.incoming.from || "未知"}</span>
            </div>
            <Button type="button" onClick={sp.answer}>
              接听
            </Button>
          </div>
        ) : null}

        <div className="space-y-2 mb-3">
          <Label htmlFor="softphone-drawer-dial">号码</Label>
          <Input
            id="softphone-drawer-dial"
            value={sp.number}
            onChange={(e) => sp.setNumber(e.target.value.replace(/[^\d*#]/g, ""))}
            placeholder="分机 / 测试号 / 外线（含前缀）"
            disabled={!sp.configured}
            inputMode="tel"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {DIAL_KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              variant="secondary"
              className="h-12 text-lg font-semibold"
              disabled={!sp.configured || (sp.busy && !sp.connected)}
              onClick={() => sp.dialKey(key)}
            >
              {key}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 col-span-3"
            disabled={!sp.configured || !sp.number || sp.busy}
            onClick={sp.dialBackspace}
          >
            <Delete className="h-4 w-4 mr-1" /> 删除
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <Button
            type="button"
            onClick={() => sp.call()}
            disabled={!sp.configured || !sp.connected || sp.busy || !sp.number.trim()}
          >
            <Phone className="h-4 w-4 mr-1" /> 呼叫
          </Button>
          <Button type="button" variant="destructive" onClick={sp.hangup} disabled={!canHangup}>
            <PhoneOff className="h-4 w-4 mr-1" /> 挂断
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => sp.enableMic().catch(() => {})}
            disabled={!sp.configured || !sp.connected || sp.micOn}
          >
            <Mic className="h-4 w-4 mr-1" />
            {sp.micOn ? "麦克风已开" : "开启麦克风"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground space-y-1">
          <span className="block">自测：<code>6000</code> 回声 / <code>6001</code> 测试音</span>
          <span className="block">外线加前缀，如 <code>999</code> + 号码。通话中按键为 DTMF。</span>
        </p>
      </aside>
    </div>
  );
}
