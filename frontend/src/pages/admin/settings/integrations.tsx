import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

export default function AdminIntegrations() {
  const { user } = useAuth();
  const router = useRouter();
  const [mpesaConfig, setMpesaConfig] = useState({
    environment: 'sandbox',
    consumerKey: '',
    consumerSecret: '',
    shortcode: '',
    passkey: '',
    callbackUrl: '',
    enableStkPush: false,
    enableC2B: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mpesa_config');
      if (saved) {
        setMpesaConfig(JSON.parse(saved));
      }
    }
  }, []);

  const handleChange = (field: string, value: any) => {
    setMpesaConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mpesa_config', JSON.stringify(mpesaConfig));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaving(false);
    toast.success('M-Pesa settings saved (demo)');
  };

  return (
    <Layout>
      <h1>Integrations</h1>
      <div className="card settings-card">
        <h2>M-Pesa Integration</h2>
        <p className="alert alert-info">
          Configure M-Pesa to enable STK Push and direct Till/Paybill payments.
          This feature is currently disabled in production. Enable it after obtaining credentials from Safaricom.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Environment</label>
            <select value={mpesaConfig.environment} onChange={(e) => handleChange('environment', e.target.value)} className="input">
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <label>Consumer Key</label>
            <input type="text" value={mpesaConfig.consumerKey} onChange={(e) => handleChange('consumerKey', e.target.value)} className="input" />
          </div>
          <div>
            <label>Consumer Secret</label>
            <input type="text" value={mpesaConfig.consumerSecret} onChange={(e) => handleChange('consumerSecret', e.target.value)} className="input" />
          </div>
          <div>
            <label>Shortcode / Paybill / Till Number</label>
            <input type="text" value={mpesaConfig.shortcode} onChange={(e) => handleChange('shortcode', e.target.value)} className="input" />
          </div>
          <div>
            <label>Passkey</label>
            <input type="text" value={mpesaConfig.passkey} onChange={(e) => handleChange('passkey', e.target.value)} className="input" />
          </div>
          <div>
            <label>Callback URL</label>
            <input type="text" value={mpesaConfig.callbackUrl} onChange={(e) => handleChange('callbackUrl', e.target.value)} className="input" />
          </div>
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mpesaConfig.enableStkPush} onChange={(e) => handleChange('enableStkPush', e.target.checked)} />
            Enable STK Push
          </label>
          <label className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={mpesaConfig.enableC2B} onChange={(e) => handleChange('enableC2B', e.target.checked)} />
            Enable Direct C2B (Till/Paybill)
          </label>
        </div>
        <button className="btn btn-primary mt-4" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </Layout>
  );
}
