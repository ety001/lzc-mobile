import { Outlet, Link, useLocation } from 'react-router-dom';
import { systemAPI } from '../services/system';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

function StatusIndicator({ status }) {
  const colors = {
    normal: 'bg-green-500',
    restarting: 'bg-yellow-500',
    error: 'bg-red-500',
    unknown: 'bg-gray-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colors[status] || colors.unknown}`} />
      <span className="text-sm text-gray-600 capitalize">{status}</span>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const [status, setStatus] = useState('unknown');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await systemAPI.getStatus();
        setStatus(response.data.status);
      } catch {
        setStatus('error');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 每 5 秒更新一次

    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: '/', label: '仪表盘' },
    { path: '/extensions', label: 'Extension 管理' },
    { path: '/dongles', label: 'Dongle 管理' },
    { path: '/notifications', label: '通知配置' },
    { path: '/logs', label: '日志' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">懒猫通信</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      location.pathname === item.path
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center">
              <StatusIndicator status={status} />
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
