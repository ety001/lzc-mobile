import { useEffect, useState } from 'react';
import { extensionsAPI } from '../services/extensions';
import { toast } from 'sonner';

export default function Extensions() {
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    secret: '',
    callerid: '',
    host: 'dynamic',
    context: 'default',
    port: '',
    transport: 'tcp',
  });

  const buildPayload = () => {
    // NOTE: 后端 port 是 int（可选）。这里若为空字符串则不发送该字段，避免 JSON 反序列化错误。
    const payload = {
      ...formData,
      port: formData.port === '' ? undefined : Number(formData.port),
    };
    return payload;
  };

  useEffect(() => {
    fetchExtensions();
  }, []);

  const fetchExtensions = async () => {
    try {
      const response = await extensionsAPI.list();
      setExtensions(response.data);
    } catch (error) {
      console.error('Failed to fetch extensions:', error);
      toast.error('获取 Extension 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = buildPayload();
      if (editing) {
        await extensionsAPI.update(editing.id, payload);
        toast.success('Extension 已更新');
      } else {
        await extensionsAPI.create(payload);
        toast.success('Extension 已创建');
      }
      setShowModal(false);
      setEditing(null);
      setFormData({
        username: '',
        secret: '',
        callerid: '',
        host: 'dynamic',
        context: 'default',
        port: '',
        transport: 'tcp',
      });
      fetchExtensions();
    } catch (error) {
      toast.error('保存失败', { description: error.response?.data?.error || error.message });
    }
  };

  const handleEdit = (ext) => {
    setEditing(ext);
    setFormData({
      username: ext.username,
      secret: ext.secret,
      callerid: ext.callerid || '',
      host: ext.host || 'dynamic',
      context: ext.context || 'default',
      port: ext.port ? String(ext.port) : '',
      transport: ext.transport || 'tcp',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个 Extension 吗？')) {
      return;
    }
    try {
      await extensionsAPI.delete(id);
      toast.success('Extension 已删除');
      fetchExtensions();
    } catch (error) {
      toast.error('删除失败', { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Extension 管理</h2>
        <button
          onClick={() => {
            setEditing(null);
            setFormData({
              username: '',
              secret: '',
              callerid: '',
              host: 'dynamic',
              context: 'default',
              port: '',
              transport: 'tcp',
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          新建 Extension
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {extensions.map((ext) => (
            <li key={ext.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{ext.username}</div>
                  <div className="text-sm text-gray-500">
                    CallerID: {ext.callerid || 'N/A'} | Host: {ext.host} | Context: {ext.context}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(ext)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(ext.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold mb-4">{editing ? '编辑' : '新建'} Extension</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Secret</label>
                  <input
                    type="password"
                    required
                    value={formData.secret}
                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CallerID</label>
                  <input
                    type="text"
                    value={formData.callerid}
                    onChange={(e) => setFormData({ ...formData, callerid: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Host</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Context</label>
                  <input
                    type="text"
                    value={formData.context}
                    onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Port（可选）</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    placeholder="留空则不设置"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Transport</label>
                  <select
                    value={formData.transport}
                    onChange={(e) => setFormData({ ...formData, transport: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
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
                  onClick={() => {
                    setShowModal(false);
                    setEditing(null);
                  }}
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
