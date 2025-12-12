import { useEffect, useState } from 'react';
import { notificationsAPI } from '../services/notifications';

const CHANNELS = [
  { value: 'smtp', label: 'SMTP (邮件)' },
  { value: 'slack', label: 'Slack' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'webhook', label: 'Webhook' },
];

export default function Notifications() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_to: '',
    smtp_tls: false,
    slack_webhook_url: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    webhook_url: '',
    webhook_method: 'POST',
    webhook_header: '',
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await notificationsAPI.list();
      setConfigs(response.data);
    } catch (error) {
      console.error('Failed to fetch configs:', error);
      alert('获取通知配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (channel) => {
    const config = configs.find((c) => c.channel === channel) || { channel, enabled: false };
    setEditing(channel);
    setFormData({
      enabled: config.enabled || false,
      smtp_host: config.smtp_host || '',
      smtp_port: config.smtp_port || 587,
      smtp_user: config.smtp_user || '',
      smtp_password: config.smtp_password || '',
      smtp_from: config.smtp_from || '',
      smtp_to: config.smtp_to || '',
      smtp_tls: config.smtp_tls || false,
      slack_webhook_url: config.slack_webhook_url || '',
      telegram_bot_token: config.telegram_bot_token || '',
      telegram_chat_id: config.telegram_chat_id || '',
      webhook_url: config.webhook_url || '',
      webhook_method: config.webhook_method || 'POST',
      webhook_header: config.webhook_header || '',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await notificationsAPI.update(editing, formData);
      setEditing(null);
      fetchConfigs();
      alert('配置保存成功');
    } catch (error) {
      alert('保存失败: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  const getConfigForChannel = (channel) => {
    return configs.find((c) => c.channel === channel);
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold mb-6">通知配置</h2>

      <div className="space-y-4">
        {CHANNELS.map((channel) => {
          const config = getConfigForChannel(channel.value);
          return (
            <div key={channel.value} className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{channel.label}</h3>
                <div className="flex items-center gap-4">
                  <span className={`text-sm ${config?.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                    {config?.enabled ? '已启用' : '未启用'}
                  </span>
                  <button
                    onClick={() => handleEdit(channel.value)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    配置
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">配置 {CHANNELS.find((c) => c.value === editing)?.label}</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="mr-2"
                  />
                  启用此通知渠道
                </label>

                {editing === 'smtp' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">SMTP 服务器</label>
                      <input
                        type="text"
                        value={formData.smtp_host}
                        onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">SMTP 端口</label>
                      <input
                        type="number"
                        value={formData.smtp_port}
                        onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">用户名</label>
                      <input
                        type="text"
                        value={formData.smtp_user}
                        onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">密码</label>
                      <input
                        type="password"
                        value={formData.smtp_password}
                        onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">发件人</label>
                      <input
                        type="email"
                        value={formData.smtp_from}
                        onChange={(e) => setFormData({ ...formData, smtp_from: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">收件人</label>
                      <input
                        type="email"
                        value={formData.smtp_to}
                        onChange={(e) => setFormData({ ...formData, smtp_to: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.smtp_tls}
                        onChange={(e) => setFormData({ ...formData, smtp_tls: e.target.checked })}
                        className="mr-2"
                      />
                      使用 TLS/SSL
                    </label>
                  </>
                )}

                {editing === 'slack' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Webhook URL</label>
                    <input
                      type="url"
                      value={formData.slack_webhook_url}
                      onChange={(e) => setFormData({ ...formData, slack_webhook_url: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    />
                  </div>
                )}

                {editing === 'telegram' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Bot Token</label>
                      <input
                        type="text"
                        value={formData.telegram_bot_token}
                        onChange={(e) => setFormData({ ...formData, telegram_bot_token: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Chat ID</label>
                      <input
                        type="text"
                        value={formData.telegram_chat_id}
                        onChange={(e) => setFormData({ ...formData, telegram_chat_id: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                  </>
                )}

                {editing === 'webhook' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Webhook URL</label>
                      <input
                        type="url"
                        value={formData.webhook_url}
                        onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">HTTP 方法</label>
                      <select
                        value={formData.webhook_method}
                        onChange={(e) => setFormData({ ...formData, webhook_method: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      >
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">自定义请求头 (JSON)</label>
                      <textarea
                        value={formData.webhook_header}
                        onChange={(e) => setFormData({ ...formData, webhook_header: e.target.value })}
                        rows={3}
                        placeholder='{"Authorization": "Bearer token"}'
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
