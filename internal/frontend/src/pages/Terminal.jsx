import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Button } from "@/components/ui/button";
import "xterm/css/xterm.css";

function TerminalPage() {
  const terminalRef = useRef(null);
  const terminalInstance = useRef(null);
  const fitAddonInstance = useRef(null);
  const wsRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [resizeObserver, setResizeObserver] = useState(null);
  const [shellPath, setShellPath] = useState("/bin/ash");

  // 初始化终端（只执行一次）
  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Menlo", "DejaVu Sans Mono", "Lucida Console", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#ffffff",
      },
      scrollback: 1000,
      tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    terminalInstance.current = terminal;
    fitAddonInstance.current = fitAddon;

    // 显示欢迎信息
    terminal.writeln("\x1b[36m调试工具终端\x1b[0m");
    terminal.writeln('点击上方"连接"按钮连接到容器\r\n');

    // 设置 ResizeObserver 以自动调整终端大小
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // 忽略 resize 错误
      }
    });

    observer.observe(terminalRef.current);
    setResizeObserver(observer);

    // 清理函数
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
      }
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  // 连接到终端
  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const terminal = terminalInstance.current;
    if (!terminal) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/terminal/ws?shell=${encodeURIComponent(shellPath)}`;

    setConnectionStatus("connecting");
    terminal.clear();
    terminal.writeln("\x1b[33m正在连接到容器终端...\x1b[0m\r\n");
    terminal.writeln(`Shell: ${shellPath}\r\n`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        terminal.writeln("\x1b[32m✓ 已连接到容器终端\x1b[0m\r\n");

        // 发送初始终端大小
        const cols = terminal.cols;
        const rows = terminal.rows;
        ws.send(JSON.stringify({
          type: 'resize',
          cols: cols,
          rows: rows
        }));
        console.log('[Terminal] Initial size:', cols, 'x', rows);
      };

      ws.onmessage = (event) => {
        console.log('[Terminal] Received data:', JSON.stringify(event.data), 'length:', event.data.length);
        terminal.write(event.data);
      };

      // 监听终端大小变化
      terminal.onResize(({ cols, rows }) => {
        console.log('[Terminal] Resized to:', cols, 'x', rows);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: cols,
            rows: rows
          }));
        }
      });

      terminal.onData((data) => {
        console.log('[Terminal] Sending key:', JSON.stringify(data), 'charCode:', data.charCodeAt(0));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        terminal.writeln("\r\n\x1b[31m✗ 连接已断开\x1b[0m\r\n");
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("error");
        terminal.writeln("\r\n\x1b[31m✗ 连接错误\x1b[0m\r\n");
      };
    } catch (error) {
      console.error("Failed to connect to terminal:", error);
      setConnectionStatus("error");
      terminal.writeln(`\x1b[31m✗ 无法连接到终端: ${error.message}\x1b[0m\r\n`);
    }
  };

  // 断开连接
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus("disconnected");
    const terminal = terminalInstance.current;
    if (terminal) {
      terminal.writeln("\r\n\x1b[31m✗ 已断开连接\x1b[0m\r\n");
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500 animate-pulse";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "已连接";
      case "connecting":
        return "连接中...";
      case "error":
        return "连接错误";
      default:
        return "未连接";
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          调试工具
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          容器终端 - 用于调试 Quectel 模块和 Asterisk
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
              <span className="text-white text-sm">{getStatusText()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={shellPath}
                onChange={(e) => setShellPath(e.target.value)}
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-32"
                placeholder="/bin/ash"
                disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-gray-400 text-xs">
              工作目录: /app
            </div>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={connect}
                disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
                variant="secondary"
              >
                连接
              </Button>
              <Button
                size="sm"
                onClick={disconnect}
                disabled={connectionStatus === "disconnected"}
                variant="secondary"
              >
                断开
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={terminalRef}
          className="bg-[#1e1e1e]"
          style={{ height: "600px" }}
        />
      </div>

      <div className="mt-4 bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
          常用调试命令
        </h3>
        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li>
            <code className="bg-blue-100 dark:bg-gray-700 px-1 rounded">
              lsusb
            </code>{" "}
            - 查看 USB 设备（Quectel 模块）
          </li>
          <li>
            <code className="bg-blue-100 dark:bg-gray-700 px-1 rounded">
              minicom -D /dev/ttyUSB3
            </code>{" "}
            - 连接到 Quectel 模块 AT 接口
          </li>
          <li>
            <code className="bg-blue-100 dark:bg-gray-700 px-1 rounded">
              asterisk -rx "core show channels"
            </code>{" "}
            - 查看 Asterisk 通道
          </li>
          <li>
            <code className="bg-blue-100 dark:bg-gray-700 px-1 rounded">
              ls -la /dev/ttyUSB*
            </code>{" "}
            - 查看 USB 串口设备
          </li>
        </ul>
      </div>
    </div>
  );
}

export default TerminalPage;
