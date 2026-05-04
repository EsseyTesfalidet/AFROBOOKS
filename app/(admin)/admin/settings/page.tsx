'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import Toggle from '@/components/shared/Toggle';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getPlatformSettings, updatePlatformSettings } from '@/lib/firebase/firestore';
import { changePassword } from '@/lib/firebase/auth';
import PasswordInput from '@/components/shared/PasswordInput';
import type { PlatformSettings } from '@/types/subscription';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    getPlatformSettings().then(setSettings);
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    await updatePlatformSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleChangePassword() {
    setPwError('');
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError('Current password is incorrect');
    } finally {
      setPwSaving(false);
    }
  }

  function update(key: keyof PlatformSettings, value: unknown) {
    setSettings((s) => s ? { ...s, [key]: value } : s);
  }

  if (!settings) return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <div className="flex-1 flex justify-center pt-16"><LoadingSpinner size={32} /></div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7 max-w-2xl">
        <h1 className="font-display text-display-lg text-white mb-6">Platform Settings</h1>

        <div className="space-y-5">
          {/* Fees */}
          <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white">Platform Fees</h2>
            {[
              { label: 'Direct sale fee (%)', key: 'directSaleFee', value: settings.directSaleFee },
              { label: 'Subscription platform cut (%)', key: 'subscriptionPlatformCut', value: settings.subscriptionPlatformCut },
              { label: 'Borrow rate per read (cents)', key: 'borrowRatePerRead', value: settings.borrowRatePerRead },
              { label: 'New book exclusivity days', key: 'newBookExclusivityDays', value: settings.newBookExclusivityDays },
            ].map(({ label, key, value }) => (
              <div key={key} className="flex items-center justify-between">
                <label htmlFor={`fee-${key}`} className="text-sm text-[#aaa]">{label}</label>
                <input
                  id={`fee-${key}`}
                  type="number"
                  value={value}
                  onChange={(e) => update(key as keyof PlatformSettings, parseInt(e.target.value))}
                  className="w-28 px-3 py-1.5 rounded-lg border text-sm text-right"
                  style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
                />
              </div>
            ))}
          </div>

          {/* Subscription prices */}
          <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white">Subscription Prices (cents)</h2>
            {(['basic', 'standard', 'premium'] as const).map((plan) => (
              <div key={plan} className="flex items-center justify-between">
                <label htmlFor={`price-${plan}`} className="text-sm text-[#aaa] capitalize">{plan} plan</label>
                <input
                  id={`price-${plan}`}
                  type="number"
                  value={settings.subscriptionPrices[plan]}
                  onChange={(e) => update('subscriptionPrices', { ...settings.subscriptionPrices, [plan]: parseInt(e.target.value) })}
                  className="w-28 px-3 py-1.5 rounded-lg border text-sm text-right"
                  style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
                />
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white">Platform Controls</h2>
            {[
              { key: 'autoApproveBooks', label: 'Auto-approve new ebooks' },
              { key: 'newUserSignupsOpen', label: 'New user signups open' },
              { key: 'newSellerSignupsOpen', label: 'New seller signups open' },
              { key: 'subscriptionSalesActive', label: 'Subscription sales active' },
              { key: 'maintenanceMode', label: 'Maintenance mode' },
            ].map(({ key, label }) => (
              <Toggle
                key={key}
                checked={settings[key as keyof PlatformSettings] as boolean}
                onChange={(v) => update(key as keyof PlatformSettings, v)}
                label={label}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium"
            style={{ background: saved ? '#4ade80' : '#e8442a', color: saved ? '#000' : '#fff' }}
          >
            {saving && <LoadingSpinner size={14} color="currentColor" />}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>

          {/* Password Change */}
          <div className="p-5 rounded-xl border space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white">Change Password</h2>
            {[
              { label: 'Current password', key: 'current', value: pwForm.current },
              { label: 'New password', key: 'newPw', value: pwForm.newPw },
              { label: 'Confirm new password', key: 'confirm', value: pwForm.confirm },
            ].map(({ label, key, value }) => (
              <div key={key}>
                <label htmlFor={`pw-${key}`} className="block text-sm text-[#aaa] mb-1.5">{label}</label>
                <PasswordInput
                  id={`pw-${key}`}
                  value={value}
                  onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            {pwError && <p className="text-sm text-[#e8442a]">{pwError}</p>}
            {pwSuccess && <p className="text-sm" style={{ color: '#4ade80' }}>Password updated successfully.</p>}
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: '#e8442a', color: '#fff' }}
            >
              {pwSaving && <LoadingSpinner size={14} color="#fff" />}
              Update Password
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
