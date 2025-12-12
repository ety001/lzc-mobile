import { useEffect, useState } from 'react';
import { systemAPI } from '../services/system';

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await systemAPI.getStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await systemAPI.reload();
      alert('Asterisk 配置已重新加载');
      fetchStatus();
    } catch (error) {
      alert('重新加载失败: ' + error.message);
    } finally {
      setReloading(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm('确定要重启 Asterisk 吗？这可能会中断正在进行的通话。')) {
      return;
    }
    setRestarting(true);
    try {
      await systemAPI.restart();
      alert('Asterisk 重启已启动');
      fetchStatus();
    } catch (error) {
      alert('重启失败: ' + error.message);
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-6">系统状态</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">状态</div>
            <div className="text-2xl font-bold capitalize">{status?.status || 'unknown'}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">活动通道</div>
            <div className="text-2xl font-bold">{status?.channels || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">SIP 注册数</div>
            <div className="text-2xl font-bold">{status?.registrations || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">运行时间</div>
            <div className="text-2xl font-bold">
              {status?.uptime ? `${Math.floor(status.uptime / 3600)}h` : 'N/A'}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleReload}
            disabled={reloading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {reloading ? '重新加载中...' : '重新加载配置'}
          </button>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {restarting ? '重启中...' : '重启 Asterisk'}
          </button>
        </div>
      </div>
    </div>
  );
}
