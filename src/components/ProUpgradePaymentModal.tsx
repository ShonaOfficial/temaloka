import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Building2,
  Check,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  LogIn,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import {
  FEATURE_REGISTRY,
  type PremiumSettingsConfig,
} from '../lib/featureRegistry';
import {
  sanitizePublicHttpUrl,
  type AuthUserSession,
  type ManualPaymentMethodType,
  type PaymentSettingsConfig,
} from '../types/admin';

interface ProUpgradePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentConfig: PaymentSettingsConfig;
  premiumConfig: PremiumSettingsConfig;
  user: AuthUserSession | null;
  onOpenAuthModal: () => void;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const METHOD_TYPE_META: Record<
  ManualPaymentMethodType,
  { label: string; Icon: React.FC<{ className?: string }> }
> = {
  bank: { label: 'Transfer Bank', Icon: Building2 },
  ewallet: { label: 'E-Wallet', Icon: Smartphone },
  qris: { label: 'QRIS', Icon: QrCode },
  paypal: { label: 'PayPal', Icon: Wallet },
  custom: { label: 'Pembayaran Lain', Icon: CreditCard },
};

export const ProUpgradePaymentModal: React.FC<ProUpgradePaymentModalProps> = ({
  isOpen,
  onClose,
  paymentConfig,
  premiumConfig,
  user,
  onOpenAuthModal,
  onNotify,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const activePlans = (premiumConfig.proPlans || []).filter((p) => p.enabled);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const initialPlan =
      activePlans.find((p) => p.id === premiumConfig.defaultProPlanId) || activePlans[0];
    setSelectedPlanId(initialPlan?.id || '');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, premiumConfig.defaultProPlanId]);

  if (!isOpen || typeof document === 'undefined') return null;

  const activeMethods = paymentConfig.methods.filter((m) => m.enabled);
  const selectedPlan =
    activePlans.find((p) => p.id === selectedPlanId) || activePlans[0] || null;

  const displayedPrice = selectedPlan?.priceLabel || paymentConfig.proPriceLabel;
  const displayedCycle =
    selectedPlan?.billingCycleLabel || paymentConfig.billingCycleLabel;
  const displayedTitle = selectedPlan?.name || paymentConfig.proPlanName || 'Upgrade Paket Pro';

  const planFeatures = selectedPlan
    ? FEATURE_REGISTRY.filter(
        (f) =>
          selectedPlan.enabledFeatureIds.includes(f.id) &&
          (premiumConfig.rules[f.id]?.enabled ?? true)
      )
    : FEATURE_REGISTRY.filter(
        (f) =>
          (premiumConfig.rules[f.id]?.tier || f.defaultTier) === 'pro' &&
          (premiumConfig.rules[f.id]?.enabled ?? true)
      );
  const freeAdsIncluded = planFeatures.some((f) => f.id === 'free_ads');
  const confirmUrl = sanitizePublicHttpUrl(
    paymentConfig.confirmationUrl || premiumConfig.upgradeCtaUrl
  );

  const handleCopy = (id: string, text: string, label: string) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    onNotify?.(`${label} disalin ke clipboard.`, 'success');
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="temaloka-pro-payment-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="temaloka-pro-payment-title"
                className="text-sm font-bold text-slate-900 truncate"
              >
                {displayedTitle}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {displayedPrice}{' '}
                {displayedCycle ? `· ${displayedCycle}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal pembayaran"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Pro Plans Selector (when multiple plans exist) */}
          {activePlans.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-slate-900">
                Pilih Jenis Paket Pro ({activePlans.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activePlans.map((plan) => {
                  const isSelected = selectedPlan?.id === plan.id;
                  const isCurrentUserPlan =
                    user?.tier === 'pro' && user?.proPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer space-y-1 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-400'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-slate-900 truncate">{plan.name}</span>
                        {isCurrentUserPlan ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 shrink-0">
                            Aktif
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-white border border-amber-200 text-amber-900 shrink-0">
                            {plan.priceLabel || 'Pro'}
                          </span>
                        )}
                      </div>
                      {plan.billingCycleLabel && (
                        <div className="text-[10px] text-slate-500">{plan.billingCycleLabel}</div>
                      )}
                      {plan.description && (
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                          {plan.description}
                        </p>
                      )}
                      <div className="text-[10px] font-semibold text-amber-800 pt-0.5">
                        {plan.enabledFeatureIds.length} fitur aktif
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Benefit Summary */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-amber-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>Fitur Paket {displayedTitle}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-[11px] font-bold text-amber-900">
                {displayedPrice}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {freeAdsIncluded && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-semibold">
                  <Ban className="w-3 h-3" />
                  <span>Bebas Iklan (Free Ads)</span>
                </span>
              )}
              {planFeatures
                .filter((f) => f.id !== 'free_ads')
                .map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-amber-200 text-[11px] text-slate-800 font-medium"
                  >
                    <Check className="w-3 h-3 text-amber-600" />
                    <span className="truncate max-w-[210px]">{f.name.split('(')[0].trim()}</span>
                  </span>
                ))}
              {planFeatures.length === 0 && (
                <span className="text-[11px] text-slate-600">
                  Belum ada fitur khusus yang diaktifkan pada paket ini.
                </span>
              )}
            </div>
          </div>

          {/* Account Target Info */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            {user ? (
              <>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">Email Akun untuk Aktivasi Pro:</div>
                  <div className="font-mono font-semibold text-slate-900 truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('user-email', user.email, 'Email akun')}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedId === 'user-email' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>Salin</span>
                </button>
              </>
            ) : (
              <>
                <div className="text-[11px] text-slate-700 leading-snug">
                  Masuk atau buat akun terlebih dahulu agar Admin mudah mengaktifkan paket Pro Anda.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuthModal();
                  }}
                  className="px-3 py-2 min-h-[36px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk</span>
                </button>
              </>
            )}
          </div>

          {/* Payment Instructions */}
          {paymentConfig.paymentInstructions && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-950 text-xs leading-relaxed">
              <div className="font-bold text-blue-900 mb-0.5">Petunjuk Pembayaran Manual</div>
              <p>{paymentConfig.paymentInstructions}</p>
            </div>
          )}

          {/* Active Payment Columns / Methods */}
          {!paymentConfig.manualPaymentEnabled ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-600">
              Pembayaran manual sedang dinonaktifkan sementara oleh Admin.
            </div>
          ) : activeMethods.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-600">
              Admin belum menambahkan kolom rekening / alat pembayaran manual.
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="font-bold text-slate-900">
                Pilihan Alat Pembayaran ({activeMethods.length})
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {activeMethods.map((method) => {
                  const meta = METHOD_TYPE_META[method.type] || METHOD_TYPE_META.custom;
                  const MethodIcon = meta.Icon;
                  const safeQr = sanitizePublicHttpUrl(method.qrisImageUrl);
                  return (
                    <div
                      key={method.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                            <MethodIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {method.providerName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {meta.label}
                              {method.accountHolder ? ` · a.n. ${method.accountHolder}` : ''}
                            </div>
                          </div>
                        </div>

                        {method.accountNumber && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                method.id,
                                method.accountNumber,
                                `Nomor ${method.providerName}`
                              )
                            }
                            className="px-2.5 py-1.5 min-h-[32px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            {copiedId === method.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedId === method.id ? 'Tersalin' : 'Salin'}</span>
                          </button>
                        )}
                      </div>

                      {method.accountNumber && (
                        <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-slate-900 break-all select-all">
                          {method.accountNumber}
                        </div>
                      )}

                      {safeQr && (
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-center">
                          <img
                            src={safeQr}
                            alt={`QRIS ${method.providerName}`}
                            className="max-h-44 rounded object-contain"
                          />
                        </div>
                      )}

                      {method.note && (
                        <p className="text-[11px] text-slate-600 leading-relaxed">{method.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
          {confirmUrl && (
            <a
              href={confirmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold"
            >
              <span>{paymentConfig.confirmationButtonLabel || 'Konfirmasi Pembayaran'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
