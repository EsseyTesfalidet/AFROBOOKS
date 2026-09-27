'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPlatformSettings, updatePlatformSettings } from '@/lib/firebase/firestore';
import { changePassword } from '@/lib/firebase/auth';
import PasswordInput from '@/components/shared/PasswordInput';
import { AdminHeading, AdminError } from '@/components/admin/AdminUI';
import type { PlatformSettings } from '@/types/subscription';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [baseline, setBaseline] = useState('');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  useEffect(() => {
    let active = true;
    getPlatformSettings()
      .then((value) => {
        if (active) {
          setSettings(value);
          setBaseline(JSON.stringify(value));
          setLoadError('');
        }
      })
      .catch(() => {
        if (active) setLoadError('Unable to load platform settings.');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  function update(key: keyof PlatformSettings, value: unknown) {
    setSettings((previous) => (previous ? { ...previous, [key]: value } : previous));
    setSaved(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || saving) return;
    if (
      !Number.isFinite(settings.directSaleFee) ||
      settings.directSaleFee < 0 ||
      settings.directSaleFee > 100
    ) {
      setSaveError('Commission must be between 0 and 100%.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // Save only editable fields; never overwrite live payout activation or
      // server-managed settings from an older copy of the document.
      await updatePlatformSettings({
        directSaleFee: settings.directSaleFee,
        autoApproveBooks: settings.autoApproveBooks,
        newUserSignupsOpen: settings.newUserSignupsOpen,
        newSellerSignupsOpen: settings.newSellerSignupsOpen,
        maintenanceMode: settings.maintenanceMode,
      });
      setBaseline(JSON.stringify(settings));
      setSaved(true);
    } catch {
      setSaveError('Unable to save settings. Your changes are still here.');
    } finally {
      setSaving(false);
    }
  }
  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    if (password.next !== password.confirm) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (password.next.length < 8) {
      setPasswordError('Use at least 8 characters for your new password.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(password.current, password.next);
      setPassword({ current: '', next: '', confirm: '' });
      setPasswordSuccess(true);
    } catch {
      setPasswordError(
        'Unable to update your password. Check your current password and sign-in method.',
      );
    } finally {
      setPasswordBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="Settings"
        description="Manage your commission, publishing workflow, and account security."
      />
      <AdminError error={loadError} retry={() => setAttempt((value) => value + 1)} />
      {!settings && !loadError && (
        <p role="status" className="admin-empty">
          Loading settings…
        </p>
      )}
      {settings && (
        <div className="max-w-3xl space-y-6">
          <form onSubmit={save} className="space-y-6">
            <section className="admin-panel p-6">
              <h2>Book pricing</h2>
              <p className="admin-muted text-sm leading-relaxed mt-2">
                Commission is included in the customer price and calculated after estimated
                processing. It is your platform revenue before other costs.
              </p>
              <div className="flex items-center justify-between gap-5 mt-6">
                <label htmlFor="platform-commission">AfroBooks commission</label>
                <div className="flex items-center gap-3">
                  <input
                    id="platform-commission"
                    type="number"
                    required
                    min={0}
                    max={100}
                    step={0.1}
                    value={Number.isFinite(settings.directSaleFee) ? settings.directSaleFee : ''}
                    onChange={(event) =>
                      update(
                        'directSaleFee',
                        event.target.value === '' ? NaN : Number(event.target.value),
                      )
                    }
                    className="admin-field !mt-0 !w-24 text-right"
                    disabled={saving}
                  />
                  <span className="admin-muted">%</span>
                </div>
              </div>
            </section>
            <section className="admin-panel p-6">
              <h2>Publishing & registration</h2>
              <div className="mt-5 divide-y divide-[#30352f]">
                {[
                  {
                    key: 'autoApproveBooks',
                    label: 'Approve eligible books automatically',
                    hint: 'Books requiring a manual rights review still enter the review queue.',
                  },
                  {
                    key: 'newUserSignupsOpen',
                    label: 'Show reader signup as available',
                    hint: 'Controls availability in the registration form.',
                  },
                  {
                    key: 'newSellerSignupsOpen',
                    label: 'Allow new authors',
                    hint: 'Controls author registration and switching to an author account.',
                  },
                  {
                    key: 'maintenanceMode',
                    label: 'Pause the signup page',
                    hint: 'Shows maintenance messaging during registration. Existing accounts can still use the app.',
                  },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between gap-5 py-4">
                    <span>
                      <span className="block text-sm">{item.label}</span>
                      <span className="admin-muted text-xs block mt-1 leading-relaxed">
                        {item.hint}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings[item.key as keyof PlatformSettings] === true}
                      onChange={(event) =>
                        update(item.key as keyof PlatformSettings, event.target.checked)
                      }
                      disabled={saving}
                      className="h-4 w-4 shrink-0 accent-[#d8edb2]"
                    />
                  </label>
                ))}
              </div>
            </section>
            <AdminError error={saveError} />
            <div className="flex items-center gap-4">
              <button
                type="submit"
                className="admin-primary"
                disabled={saving || JSON.stringify(settings) === baseline}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved && (
                <p role="status" className="text-sm text-[#d8edb2]">
                  Settings saved.
                </p>
              )}
            </div>
          </form>
          <section className="admin-panel p-6">
            <h2>Author payments</h2>
            <p className="admin-muted text-sm leading-relaxed mt-2">
              Stripe hosts author banking and verification. The payout workspace shows confirmed
              transfers, pending royalties, and reconciliation exceptions.
            </p>
            <Link href="/admin/payouts" className="admin-link inline-block mt-4">
              View author payouts ↗
            </Link>
          </section>
          <details className="admin-panel p-6">
            <summary className="cursor-pointer font-medium">Account security</summary>
            <form onSubmit={updatePassword} className="mt-6 space-y-4">
              <p className="admin-muted text-sm">
                Change the password for this administrator account.
              </p>
              {[
                ['current', 'Current password'],
                ['next', 'New password'],
                ['confirm', 'Confirm new password'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={'admin-password-' + key} className="block text-sm mb-2">
                    {label}
                  </label>
                  <PasswordInput
                    id={'admin-password-' + key}
                    value={password[key as keyof typeof password]}
                    required
                    disabled={passwordBusy}
                    autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                    onChange={(event) =>
                      setPassword((previous) => ({ ...previous, [key]: event.target.value }))
                    }
                  />
                </div>
              ))}
              <AdminError error={passwordError} />
              {passwordSuccess && (
                <p role="status" className="text-sm text-[#d8edb2]">
                  Password updated.
                </p>
              )}
              <button type="submit" className="admin-secondary" disabled={passwordBusy}>
                {passwordBusy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </details>
        </div>
      )}
    </main>
  );
}
