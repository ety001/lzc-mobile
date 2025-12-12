import { useEffect, useState, useRef } from 'react';
import { logsAPI } from '../services/logs';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    fetchLogs();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchLogs = async () => {
    try {
      const response = await logsAPI.get(100);
      setLogs(response.data.lines || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      alert('获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = () => {
    if (streaming) return;

    setStreaming(true);
    const eventSource = logsAPI.stream();
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const line = event.data.replace(/^data: /, '');
      setLogs((prev) => [...prev.slice(-99), line]);
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setStreaming(false);
      eventSource.close();
    };
  };

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">日志查看</h2>
        <div className="flex gap-2">
          <button
            onClick={fetchLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            刷新
          </button>
          {!streaming ? (
            <button
              onClick={startStreaming}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              开始实时流
            </button>
          ) : (
            <button
              onClick={stopStreaming}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              停止实时流
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg h-[600px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-gray-500">暂无日志</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              {log}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
