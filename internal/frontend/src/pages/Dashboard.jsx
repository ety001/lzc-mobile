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

  const getStatusColor = (status) => {
    switch (status) {
      case 'normal':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'restarting':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">加载中...</p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-4">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-white border-bottom">
              <h3 className="card-title mb-0">系统状态</h3>
            </div>
            <div className="card-body">
              <div className="row mb-4">
                <div className="col-md-3 col-sm-6 mb-3">
                  <div className="info-box">
                    <span className="info-box-icon bg-info">
                      <i className="fas fa-circle"></i>
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">系统状态</span>
                      <span className={`info-box-number ${getStatusColor(status?.status)}`}>
                        {status?.status ? status.status.toUpperCase() : 'UNKNOWN'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-sm-6 mb-3">
                  <div className="info-box">
                    <span className="info-box-icon bg-success">
                      <i className="fas fa-phone"></i>
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">活动通道</span>
                      <span className="info-box-number">{status?.channels || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-sm-6 mb-3">
                  <div className="info-box">
                    <span className="info-box-icon bg-warning">
                      <i className="fas fa-users"></i>
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">SIP 注册数</span>
                      <span className="info-box-number">{status?.registrations || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-3 col-sm-6 mb-3">
                  <div className="info-box">
                    <span className="info-box-icon bg-primary">
                      <i className="fas fa-clock"></i>
                    </span>
                    <div className="info-box-content">
                      <span className="info-box-text">运行时间</span>
                      <span className="info-box-number">{formatUptime(status?.uptime)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-12">
                  <table className="table table-bordered table-striped">
                    <thead className="thead-light">
                      <tr>
                        <th>项目</th>
                        <th>值</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>系统状态</strong></td>
                        <td>
                          <span className={`badge badge-${status?.status === 'normal' ? 'success' : status?.status === 'error' ? 'danger' : 'secondary'}`}>
                            {status?.status ? status.status.toUpperCase() : 'UNKNOWN'}
                          </span>
                        </td>
                        <td>Asterisk 系统当前运行状态</td>
                      </tr>
                      <tr>
                        <td><strong>活动通道数</strong></td>
                        <td><span className="badge badge-info">{status?.channels || 0}</span></td>
                        <td>当前正在进行的通话通道数量</td>
                      </tr>
                      <tr>
                        <td><strong>SIP 注册数</strong></td>
                        <td><span className="badge badge-warning">{status?.registrations || 0}</span></td>
                        <td>已注册的 SIP 终端数量</td>
                      </tr>
                      <tr>
                        <td><strong>运行时间</strong></td>
                        <td>{formatUptime(status?.uptime)}</td>
                        <td>系统自启动以来的运行时长</td>
                      </tr>
                      {status?.last_update && (
                        <tr>
                          <td><strong>最后更新</strong></td>
                          <td>{new Date(status.last_update).toLocaleString('zh-CN')}</td>
                          <td>状态信息的最后更新时间</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="row mt-4">
                <div className="col-12">
                  <div className="btn-toolbar" role="toolbar">
                    <div className="btn-group mr-2" role="group">
                      <button
                        type="button"
                        onClick={handleReload}
                        disabled={reloading}
                        className="btn btn-primary"
                      >
                        {reloading ? (
                          <>
                            <span className="spinner-border spinner-border-sm mr-2" role="status"></span>
                            重新加载中...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-sync-alt mr-2"></i>
                            重新加载配置
                          </>
                        )}
                      </button>
                    </div>
                    <div className="btn-group" role="group">
                      <button
                        type="button"
                        onClick={handleRestart}
                        disabled={restarting}
                        className="btn btn-danger"
                      >
                        {restarting ? (
                          <>
                            <span className="spinner-border spinner-border-sm mr-2" role="status"></span>
                            重启中...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-power-off mr-2"></i>
                            重启 Asterisk
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
