import React from 'react';
import {
  Ban,
  CreditCard,
  Crown,
  ExternalLink,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import {
  getFeatureAccessStatus,
  getPlansUnlockingFeature,
  type FeatureOverrideValue,
  type PremiumSettingsConfig,
} from '../lib/featureRegistry';
import {
  sanitizePublicHttpUrl,
  type AuthUserSession,
  type PaymentSettingsConfig,
  type UserAccountTier,
} from '../types/admin';

interface ProFeatureGateProps {
  featureId: string;
  premiumConfig: PremiumSettingsConfig;
  paymentConfig?: PaymentSettingsConfig;
  user: AuthUserSession | null;
  userTier: UserAccountTier;
  isAdmin: boolean;
  userFeatureOverrides?: Record<string, FeatureOverrideValue>;
  onOpenAuthModal: () => void;
  onOpenPaymentModal?: () => void;
  onOpenAdminPanel?: () => void;
  children: React.ReactNode;
}

export const ProFeatureGate: React.FC<ProFeatureGateProps> = ({
  featureId,
  premiumConfig,
  paymentConfig,
  user,
  userTier,
  isAdmin,
  userFeatureOverrides,
  onOpenAuthModal,
  onOpenPaymentModal,
  onOpenAdminPanel,
  children,
}) => {
  const access = getFeatureAccessStatus(
    featureId,
    premiumConfig,
    userTier,
    isAdmin,
    userFeatureOverrides ?? user?.featureOverrides,
    user?.proPlanId
  );

  if (access.allowed) {
    return <>{children}</>;
  }

  const isDisabledByAdmin = access.reason === 'disabled';
  const isDeniedByOverride = access.reason === 'override_denied';
  const isPlanUpgradeRequired = access.reason === 'plan_upgrade_required';
  const isRestrictedByAccount = isDisabledByAdmin || isDeniedByOverride;
  const unlockingPlans = getPlansUnlockingFeature(premiumConfig, featureId);
  const fallbackUpgradeUrl = sanitizePublicHttpUrl(premiumConfig.upgradeCtaUrl);
  const hasManualPaymentView =
    !isRestrictedByAccount &&
    Boolean(onOpenPaymentModal) &&
    Boolean(
      paymentConfig?.manualPaymentEnabled ||
        (paymentConfig?.methods && paymentConfig.methods.some((m) => m.enabled)) ||
        unlockingPlans.length > 0
    );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC] p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
        <div
          className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border ${
            isRestrictedByAccount
              ? 'bg-slate-100 border-slate-200 text-slate-600'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          {isRestrictedByAccount ? (
            <Ban className="w-6 h-6" />
          ) : (
            <Crown className="w-6 h-6" />
          )}
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700">
            {isDisabledByAdmin
              ? 'Fitur Dinonaktifkan Admin'
              : isDeniedByOverride
                ? 'Akses Dibatasi Admin'
                : isPlanUpgradeRequired && access.activePlan
                  ? `Paket Saat Ini: ${access.activePlan.name}`
                  : 'Paket Pro'}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {isRestrictedByAccount
              ? access.feature?.name || 'Akses Fitur Dibatasi'
              : isPlanUpgradeRequired
                ? 'Upgrade Jenis Paket Pro'
                : premiumConfig.upgradeTitle}
          </h2>
          {access.feature && !isRestrictedByAccount && (
            <p className="text-xs font-semibold text-blue-700">
              {access.feature.name}
            </p>
          )}
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {isDisabledByAdmin
              ? 'Fitur ini sedang dinonaktifkan sementara oleh pengelola situs.'
              : isDeniedByOverride
                ? 'Akses ke fitur ini dibatasi khusus untuk akun Anda oleh pengelola situs.'
                : isPlanUpgradeRequired
                  ? `Paket Pro Anda (${access.activePlan?.name || 'Pro'}) belum mencakup fitur ini.${
                      unlockingPlans.length > 0
                        ? ` Tersedia pada paket: ${unlockingPlans.map((p) => p.name).join(', ')}.`
                        : ''
                    }`
                  : premiumConfig.upgradeMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {!isRestrictedByAccount && !user && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk Akun Pro / Daftar</span>
            </button>
          )}

          {hasManualPaymentView && (
            <button
              type="button"
              onClick={onOpenPaymentModal}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>{premiumConfig.upgradeCtaLabel || 'Upgrade & Pembayaran'}</span>
            </button>
          )}

          {!hasManualPaymentView && !isRestrictedByAccount && fallbackUpgradeUrl && (
            <a
              href={fallbackUpgradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl"
            >
              <span>{premiumConfig.upgradeCtaLabel || 'Upgrade Paket Pro'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-xl cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Kelola di Panel Admin</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
