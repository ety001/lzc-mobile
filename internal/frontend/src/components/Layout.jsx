import { Outlet, Link, useLocation } from 'react-router-dom';
import { systemAPI } from '../services/system';
import { useEffect, useState } from 'react';

function StatusIndicator({ status }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'normal':
        return <span className="badge badge-success">正常</span>;
      case 'error':
        return <span className="badge badge-danger">错误</span>;
      case 'restarting':
        return <span className="badge badge-warning">重启中</span>;
      default:
        return <span className="badge badge-secondary">未知</span>;
    }
  };

  return getStatusBadge(status);
}

export default function Layout() {
  const location = useLocation();
  const [status, setStatus] = useState('unknown');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await systemAPI.getStatus();
        setStatus(response.data.status);
      } catch (error) {
        setStatus('error');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 每 5 秒更新一次

    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: '/', label: '仪表盘', icon: 'fas fa-tachometer-alt' },
    { path: '/extensions', label: 'Extension 管理', icon: 'fas fa-phone' },
    { path: '/dongles', label: 'Dongle 管理', icon: 'fas fa-mobile-alt' },
    { path: '/notifications', label: '通知配置', icon: 'fas fa-bell' },
    { path: '/logs', label: '日志', icon: 'fas fa-file-alt' },
  ];

  return (
    <div className="wrapper">
      {/* 顶部导航栏 */}
      <nav className="main-header navbar navbar-expand navbar-white navbar-light border-bottom">
        <ul className="navbar-nav">
          <li className="nav-item">
            <a className="nav-link" data-widget="pushmenu" href="#" role="button" onClick={(e) => e.preventDefault()}>
              <i className="fas fa-bars"></i>
            </a>
          </li>
        </ul>

        <ul className="navbar-nav ml-auto">
          <li className="nav-item" style={{ display: 'flex', alignItems: 'center' }}>
            <StatusIndicator status={status} />
          </li>
        </ul>
      </nav>

      {/* 侧边栏 */}
      <aside className="main-sidebar sidebar-dark-primary elevation-4">
        <a href="/" className="brand-link">
          <span className="brand-text font-weight-light">懒猫通信</span>
        </a>

        <div className="sidebar">
          <nav className="mt-2">
            <ul className="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu">
              {navItems.map((item) => (
                <li key={item.path} className="nav-item">
                  <Link
                    to={item.path}
                    className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                  >
                    <i className={`nav-icon ${item.icon}`}></i>
                    <p>{item.label}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      {/* 主内容区域 */}
      <div className="content-wrapper">
        <div className="content-header">
          <div className="container-fluid">
            <div className="row mb-2">
              <div className="col-sm-6">
                <h1 className="m-0">
                  {navItems.find(item => item.path === location.pathname)?.label || '仪表盘'}
                </h1>
              </div>
              <div className="col-sm-6">
                <ol className="breadcrumb float-sm-right">
                  <li className="breadcrumb-item">
                    <Link to="/">首页</Link>
                  </li>
                  <li className="breadcrumb-item active">
                    {navItems.find(item => item.path === location.pathname)?.label || '仪表盘'}
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <section className="content">
          <div className="container-fluid">
            <Outlet />
          </div>
        </section>
      </div>

      {/* 页脚 */}
      <footer className="main-footer">
        <div className="float-right d-none d-sm-block">
          <b>版本</b> 1.0.0
        </div>
        <strong>Copyright &copy; 2024 懒猫通信.</strong> All rights reserved.
      </footer>
    </div>
  );
}
