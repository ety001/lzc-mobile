import { useEffect, useState } from 'react';
import { extensionsAPI } from '../services/extensions';
import { donglesAPI } from '../services/dongles';
import { toast } from 'sonner';

export default function Dongles() {
  const [bindings, setBindings] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    dongle_id: '',
    extension_id: '',
    inbound: true,
    outbound: true,
  });
  const [smsData, setSmsData] = useState({ number: '', message: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bindingsRes, extensionsRes] = await Promise.all([
        donglesAPI.list(),
        extensionsAPI.list(),
      ]);
      setBindings(bindingsRes.data);
      setExtensions(extensionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await donglesAPI.update(editing.id, formData);
        toast.success('绑定已更新');
      } else {
        await donglesAPI.create(formData);
        toast.success('绑定已创建');
      }
      setShowModal(false);
      setEditing(null);
      fetchData();
    } catch (error) {
      toast.error('保存失败', { description: error.response?.data?.error || error.message });
    }
  };

  const handleSendSMS = async (e) => {
    e.preventDefault();
    try {
      await donglesAPI.sendSMS(showSMSModal, smsData);
      toast.success('短信发送成功');
      setShowSMSModal(null);
      setSmsData({ number: '', message: '' });
    } catch (error) {
      toast.error('发送失败', { description: error.response?.data?.error || error.message });
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Dongle 管理</h2>
        <button
          onClick={() => {
            setEditing(null);
            setFormData({ dongle_id: '', extension_id: '', inbound: true, outbound: true });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          新建绑定
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {bindings.map((binding) => (
            <li key={binding.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {binding.dongle_id} → {binding.extension?.username}
                  </div>
                  <div className="text-sm text-gray-500">
                    来电: {binding.inbound ? '✓' : '✗'} | 去电: {binding.outbound ? '✓' : '✗'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSMSModal(binding.id)}
                    className="text-green-600 hover:text-green-900"
                  >
                    发短信
                  </button>
                  <button
                    onClick={() => {
                      setEditing(binding);
                      setFormData({
                        dongle_id: binding.dongle_id,
                        extension_id: binding.extension_id,
                        inbound: binding.inbound,
                        outbound: binding.outbound,
                      });
                      setShowModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('确定要删除这个绑定吗？')) return;
                      try {
                        await donglesAPI.delete(binding.id);
                        toast.success('绑定已删除');
                        fetchData();
                      } catch (error) {
                        toast.error('删除失败', { description: error.response?.data?.error || error.message });
                      }
                    }}
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
            <h3 className="text-lg font-bold mb-4">{editing ? '编辑' : '新建'} Dongle 绑定</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Dongle ID</label>
                  <input
                    type="text"
                    required
                    value={formData.dongle_id}
                    onChange={(e) => setFormData({ ...formData, dongle_id: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Extension</label>
                  <select
                    required
                    value={formData.extension_id}
                    onChange={(e) =>
                      setFormData({ ...formData, extension_id: parseInt(e.target.value) })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  >
                    <option value="">选择 Extension</option>
                    {extensions.map((ext) => (
                      <option key={ext.id} value={ext.id}>
                        {ext.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.inbound}
                      onChange={(e) => setFormData({ ...formData, inbound: e.target.checked })}
                      className="mr-2"
                    />
                    处理来电
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.outbound}
                      onChange={(e) => setFormData({ ...formData, outbound: e.target.checked })}
                      className="mr-2"
                    />
                    处理去电
                  </label>
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

      {showSMSModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold mb-4">发送短信</h3>
            <form onSubmit={handleSendSMS}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">号码</label>
                  <input
                    type="text"
                    required
                    value={smsData.number}
                    onChange={(e) => setSmsData({ ...smsData, number: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">消息</label>
                  <textarea
                    required
                    value={smsData.message}
                    onChange={(e) => setSmsData({ ...smsData, message: e.target.value })}
                    rows={4}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  发送
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSMSModal(null);
                    setSmsData({ number: '', message: '' });
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
