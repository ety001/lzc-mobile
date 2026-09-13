import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import SoftphoneSDK from "@/softphone/sdk";
import { softphoneAPI } from "@/services/softphone";

const IN_CALL_STATES = new Set(["dialing", "ringing", "answered", "in_call", "active"]);

const SoftphoneContext = createContext(null);

export function SoftphoneProvider({ children }) {
  const sdkRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const configuredRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  const [configured, setConfigured] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [extension, setExtension] = useState("");
  const [connected, setConnected] = useState(false);
  const [callState, setCallState] = useState("idle");
  const [incoming, setIncoming] = useState(null);
  const [number, setNumber] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ringingKeyRef = useRef(null);
  const audioABProfileRef = useRef("A");
  const [audioABProfile, setAudioABProfile] = useState("A");

  const pushLog = useCallback((line) => {
    setLogLines((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 80));
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const connectInternalRef = useRef(async () => {});

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const ensureSDK = useCallback(() => {
    if (sdkRef.current) return sdkRef.current;

    const sdk = new SoftphoneSDK();
    const beginIncomingUI = (msg, { toastNotify = true } = {}) => {
      const key = msg.call_id || msg.from || "ring";
      const already = ringingKeyRef.current === key;
      ringingKeyRef.current = key;
      setIncoming(msg);
      setCallState("ringing");
      setDrawerOpen(true);
      if (already) return;
      pushLog(`incoming from ${msg.from || "unknown"}`);
      if (toastNotify) {
        toast.message("来电", { description: msg.from || "未知号码" });
      }
      (async () => {
        try {
          await sdk.startRingtone();
        } catch (e) {
          pushLog(`ringtone failed: ${e.message || e}`);
        }
      })();
      if (!toastNotify) return;
      try {
        if (typeof Notification !== "undefined") {
          const show = () => {
            const n = new Notification("懒猫通讯 · 来电", {
              body: msg.from || "未知号码",
              tag: `softphone-incoming-${msg.call_id || "call"}`,
              renotify: true,
            });
            n.onclick = () => {
              window.focus();
              n.close();
            };
          };
          if (Notification.permission === "granted") show();
          else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((p) => {
              if (p === "granted") show();
            });
          }
        }
      } catch (e) {
        pushLog(`notification failed: ${e.message || e}`);
      }
    };

    sdk.on("status", (msg) => {
      if (typeof msg.configured === "boolean") setConfigured(msg.configured);
      if (typeof msg.registered === "boolean") setRegistered(msg.registered);
      if (msg.extension != null) setExtension(msg.extension || "");
      if (msg.call_state) setCallState(msg.call_state);
      if (msg.audio_ab_profile === "A" || msg.audio_ab_profile === "B") {
        audioABProfileRef.current = msg.audio_ab_profile;
        setAudioABProfile(msg.audio_ab_profile);
      }
      // Deeplink / reconnect: status may already be ringing before any incoming event.
      if (msg.call_state === "ringing" && (msg.from || msg.call_id)) {
        beginIncomingUI(
          { from: msg.from, call_id: msg.call_id },
          { toastNotify: false }
        );
      }
      pushLog(
        `status registered=${msg.registered} ext=${msg.extension || "-"} call=${msg.call_state || "-"} ab=${msg.audio_ab_profile || "-"}`
      );
    });
    sdk.on("incoming", (msg) => {
      beginIncomingUI(msg, { toastNotify: true });
    });
    sdk.on("call_state", (msg) => {
      const next = msg.state || "idle";
      setCallState(next === "ended" ? "idle" : next);
      if (msg.state === "ringing") {
        beginIncomingUI(
          { from: msg.from, call_id: msg.call_id },
          { toastNotify: false }
        );
      }
      if (msg.state === "ended" || msg.state === "answered" || msg.state === "dialing") {
        sdk.stopRingtone();
      }
      if (msg.state === "ended") {
        ringingKeyRef.current = null;
        setIncoming(null);
      }
      pushLog(`call_state ${msg.state}${msg.reason ? ` (${msg.reason})` : ""}`);
    });
    sdk.on("error", (msg) => {
      toast.error(msg.message || "Softphone error");
      pushLog(`error ${msg.message}`);
    });
    sdk.on("close", () => {
      setConnected(false);
      setMicOn(false);
      pushLog("websocket closed");
      if (!intentionalCloseRef.current && configuredRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 4));
        reconnectAttemptRef.current = attempt + 1;
        clearReconnect();
        reconnectTimerRef.current = setTimeout(() => {
          connectInternalRef.current().catch((e) => {
            pushLog(`reconnect failed: ${e.message || e}`);
          });
        }, delay);
        pushLog(`reconnect scheduled in ${delay}ms`);
      }
    });
    sdkRef.current = sdk;
    return sdk;
  }, [clearReconnect, pushLog]);

  const connectInternal = useCallback(async () => {
    if (!configuredRef.current) return;
    intentionalCloseRef.current = false;
    const sdk = ensureSDK();
    await sdk.connect();
    setConnected(true);
    reconnectAttemptRef.current = 0;
    pushLog("websocket connected");
  }, [ensureSDK, pushLog]);

  useEffect(() => {
    connectInternalRef.current = connectInternal;
  }, [connectInternal]);

  const disconnectInternal = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnect();
    sdkRef.current?.disconnect();
    setConnected(false);
    setMicOn(false);
    setCallState("idle");
    setIncoming(null);
  }, [clearReconnect]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await softphoneAPI.status();
      const data = res.data || {};
      const nextConfigured = !!data.configured;
      const prevConfigured = configuredRef.current;
      configuredRef.current = nextConfigured;
      setConfigured(nextConfigured);
      setRegistered(!!data.registered);
      setExtension(data.extension || "");
      if (data.call_state) setCallState(data.call_state);
      if (data.audio_ab_profile === "A" || data.audio_ab_profile === "B") {
        audioABProfileRef.current = data.audio_ab_profile;
        setAudioABProfile(data.audio_ab_profile);
      }
      if (data.call_state === "ringing" && (data.from || data.call_id)) {
        setIncoming({ from: data.from, call_id: data.call_id });
        setDrawerOpen(true);
      }

      if (nextConfigured && !prevConfigured) {
        await connectInternal();
      } else if (!nextConfigured && prevConfigured) {
        disconnectInternal();
      } else if (nextConfigured) {
        const ws = sdkRef.current?.ws;
        if (!ws || ws.readyState > 1) {
          await connectInternal();
        }
      }
      return data;
    } catch (e) {
      pushLog(`refreshStatus failed: ${e.message || e}`);
      throw e;
    }
  }, [connectInternal, disconnectInternal, pushLog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await softphoneAPI.status();
        if (cancelled) return;
        const data = res.data || {};
        const nextConfigured = !!data.configured;
        configuredRef.current = nextConfigured;
        setConfigured(nextConfigured);
        setRegistered(!!data.registered);
        setExtension(data.extension || "");
        if (data.call_state) setCallState(data.call_state);
        if (data.audio_ab_profile === "A" || data.audio_ab_profile === "B") {
          audioABProfileRef.current = data.audio_ab_profile;
          setAudioABProfile(data.audio_ab_profile);
        }
        if (data.call_state === "ringing" && (data.from || data.call_id)) {
          setIncoming({ from: data.from, call_id: data.call_id });
          setDrawerOpen(true);
        }
        if (nextConfigured) {
          await connectInternal();
        }
      } catch (e) {
        if (!cancelled) pushLog(`initial status failed: ${e.message || e}`);
      }
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshStatus().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const poll = setInterval(() => {
      refreshStatus().catch(() => {});
    }, 30000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(poll);
      clearReconnect();
      intentionalCloseRef.current = true;
      sdkRef.current?.disconnect();
      sdkRef.current = null;
    };
  }, [clearReconnect, connectInternal, pushLog, refreshStatus]);

  const enableMic = useCallback(async () => {
    const sdk = ensureSDK();
    if (!connected) await connectInternal();
    await sdk.enableMic();
    setMicOn(true);
    pushLog("microphone enabled");
  }, [connectInternal, connected, ensureSDK, pushLog]);

  const disableMic = useCallback(() => {
    const sdk = sdkRef.current || ensureSDK();
    sdk.disableMic();
    setMicOn(false);
    pushLog("microphone disabled");
  }, [ensureSDK, pushLog]);

  const setMicEnabled = useCallback(
    async (on) => {
      if (on) await enableMic();
      else disableMic();
    },
    [disableMic, enableMic]
  );

  const armMediaForCall = useCallback(async (sdk) => {
    const profile = audioABProfileRef.current === "B" ? "B" : "A";
    if (profile === "A") {
      await sdk.startMedia();
    } else {
      await sdk.enableMic();
    }
    setMicOn(true);
    pushLog(`media armed profile=${profile}`);
  }, [pushLog]);

  const call = useCallback(
    async (num) => {
      const target = (num ?? number).trim();
      if (!target) {
        toast.error("请输入号码");
        return;
      }
      if (!configuredRef.current) {
        toast.error("请先在设置中指定 Softphone 分机");
        return;
      }
      try {
        const sdk = ensureSDK();
        if (!connected) await connectInternal();
        await armMediaForCall(sdk);
        sdk.call(target);
        setCallState("dialing");
        pushLog(`call ${target}`);
      } catch (e) {
        toast.error("呼叫失败", { description: e.message || String(e) });
      }
    },
    [armMediaForCall, connectInternal, connected, ensureSDK, number, pushLog]
  );

  const answer = useCallback(async () => {
    try {
      const sdk = ensureSDK();
      if (!connected) await connectInternal();
      sdk.stopRingtone();
      await armMediaForCall(sdk);
      sdk.answer();
      setIncoming(null);
      pushLog("answer sent");
    } catch (e) {
      toast.error("接听失败", { description: e.message || String(e) });
    }
  }, [armMediaForCall, connectInternal, connected, ensureSDK, pushLog]);

  const hangup = useCallback(async () => {
    if (callState === "idle" && !incoming) return;
    try {
      const sdk = ensureSDK();
      if (sdk.ws?.readyState !== WebSocket.OPEN) {
        await connectInternal();
      }
      sdk.stopRingtone();
      setCallState("idle");
      setIncoming(null);
      ringingKeyRef.current = null;
      sdk.hangup();
      pushLog("hangup sent");
    } catch (e) {
      setCallState("idle");
      setIncoming(null);
      ringingKeyRef.current = null;
      toast.error("挂断失败", { description: e.message || String(e) });
    }
  }, [callState, connectInternal, ensureSDK, incoming, pushLog]);

  const dtmf = useCallback(
    async (digit) => {
      try {
        const sdk = ensureSDK();
        if (!connected) await connectInternal();
        sdk.dtmf(digit);
        pushLog(`dtmf ${digit}`);
      } catch (e) {
        toast.error("按键失败", { description: e.message || String(e) });
      }
    },
    [connectInternal, connected, ensureSDK, pushLog]
  );

  const sendTestTone = useCallback(async () => {
    const sdk = ensureSDK();
    if (!connected) await connectInternal();
    sdk.sendTestTone({ durationMs: 3000 });
    pushLog("test tone 440Hz 3s");
  }, [connectInternal, connected, ensureSDK, pushLog]);

  const dialKey = useCallback(
    (key) => {
      if (IN_CALL_STATES.has(callState)) {
        dtmf(key);
        return;
      }
      setNumber((n) => `${n}${key}`);
    },
    [callState, dtmf]
  );

  const dialBackspace = useCallback(() => {
    setNumber((n) => n.slice(0, -1));
  }, []);

  const dialClear = useCallback(() => {
    setNumber("");
  }, []);

  const value = useMemo(
    () => ({
      configured,
      registered,
      extension,
      connected,
      callState,
      incoming,
      number,
      setNumber,
      micOn,
      logLines,
      drawerOpen,
      audioABProfile,
      openDrawer,
      closeDrawer,
      setDrawerOpen,
      pushLog,
      refreshStatus,
      enableMic,
      disableMic,
      setMicEnabled,
      call,
      answer,
      hangup,
      dtmf,
      dialKey,
      dialBackspace,
      dialClear,
      sendTestTone,
      busy: IN_CALL_STATES.has(callState),
    }),
    [
      answer,
      audioABProfile,
      call,
      callState,
      closeDrawer,
      configured,
      connected,
      dialBackspace,
      dialClear,
      dialKey,
      disableMic,
      drawerOpen,
      dtmf,
      enableMic,
      extension,
      hangup,
      incoming,
      logLines,
      micOn,
      number,
      openDrawer,
      pushLog,
      refreshStatus,
      registered,
      sendTestTone,
      setMicEnabled,
    ]
  );

  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

// Hook colocated with provider (standard React context pattern).
// eslint-disable-next-line react-refresh/only-export-components
export function useSoftphone() {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error("useSoftphone must be used within SoftphoneProvider");
  }
  return ctx;
}
