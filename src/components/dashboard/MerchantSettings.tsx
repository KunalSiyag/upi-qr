import React, { useEffect, useState } from 'react';

interface Merchant {
  id: string;
  name: string;
  apiKey: string;
  vpa?: string;
  webhookUrl?: string;
}

export const MerchantSettings: React.FC = () => {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revealKey, setRevealKey] = useState(false);

  const [vpa, setVpa] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    fetchMerchant();
  }, []);

  const fetchMerchant = async () => {
    try {
      const res = await fetch("/api/internal/merchant-profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setMerchant(data.merchant);
      setVpa(data.merchant.vpa || "");
      setWebhookUrl(data.merchant.webhookUrl || "");
    } catch (err) {
      setError("Unable to load merchant profile.");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/internal/merchant-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vpa, webhookUrl }),
      });

      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setMerchant(data.merchant);
      setSuccess("Settings updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading your dashboard...</div>;
  }

  if (!merchant) {
    return <div className="text-center py-20 text-red-500">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Merchant Settings</h2>
        <p className="text-gray-500">Manage your API credentials and payment preferences.</p>
      </div>

      {/* API Key Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">API Credentials</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Merchant ID</label>
            <input 
              type="text" 
              readOnly 
              value={merchant.id} 
              className="w-full sm:w-96 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Secret API Key</label>
            <div className="flex items-center space-x-2">
              <input 
                type={revealKey ? "text" : "password"}
                readOnly 
                value={merchant.apiKey} 
                className="w-full sm:w-96 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-mono focus:outline-none"
              />
              <button 
                type="button"
                onClick={() => setRevealKey(!revealKey)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                {revealKey ? "Hide" : "Reveal"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Use this key in the Authorization header: <code className="bg-gray-100 px-1 py-0.5 rounded">Bearer {merchant.apiKey.substring(0,8)}...</code></p>
          </div>
        </div>
      </div>

      {/* Payment Settings */}
      <form onSubmit={saveSettings} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Configuration</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID (VPA)</label>
            <input 
              type="text" 
              value={vpa}
              onChange={(e) => setVpa(e.target.value)}
              placeholder="e.g. yourname@okicici"
              className="w-full sm:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 mt-1">This is where your customer payments will be routed directly.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL (Optional)</label>
            <input 
              type="url" 
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks/upi"
              className="w-full sm:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-500 mt-1">We will send a POST request here when a payment is successful.</p>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</div>}
          {success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">{success}</div>}

          <div>
            <button 
              type="submit" 
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
