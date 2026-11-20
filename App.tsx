// App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Linking,
  Platform,
  useWindowDimensions,
  AppState,
  ActivityIndicator,
} from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { AuthScreen } from './src/screens/AuthScreen';
import { VaultDashboard } from './src/screens/VaultDashboard';
import { SecuritySettingsModal } from './src/components/SecuritySettingsModal';
import { Colors } from './src/theme/colors';
import { CustomFolder, VaultItem } from './src/types/vault';
import { CryptoService } from './src/services/CryptoService';
import { StorageService } from './src/services/StorageService';
import { FirebaseService } from './src/services/FirebaseService';
import { AutofillBridgeService } from './src/services/AutofillBridgeService';
import { IconAIService } from './src/services/IconAIService';
import { LanguageCode, Translations } from './src/i18n/translations';
import { LogOut, Shield, Trash2, AlertTriangle, Fingerprint } from 'lucide-react-native';

const BUY_ME_A_COFFEE_URL = 'https://www.buymeacoffee.com/DearTony';

const SESSION_ONE_MONTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PERSISTENT_SESSION_KEY = 'gsoftpass_active_session_30d';

const DEFAULT_FOLDERS: CustomFolder[] = [
  { id: 'games', name: 'Juegos', icon: 'Gamepad2' },
  { id: 'social', name: 'Redes Sociales', icon: 'Share2' },
  { id: 'school', name: 'Escuela', icon: 'GraduationCap' },
  { id: 'finance', name: 'Bancos y Tarjetas', icon: 'CreditCard' },
];

// Escudo Anti-Crash: impide que cualquier error de renderizado cierre la aplicación en Android
class RootErrorBoundary extends React.Component<
  { onResetSession: () => void; children: React.ReactNode },
  { hasError: boolean; errorText: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorText: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      errorText: error?.message || String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: Colors.background,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Text style={{ color: Colors.primary, fontSize: 20, fontWeight: '800', marginBottom: 10 }}>
            Recuperación Segura de GSoftPass
          </Text>
          <Text
            style={{
              color: Colors.textSecondary,
              fontSize: 13,
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            Se detectó un dato corrupto en la caché local: {this.state.errorText}
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: 14,
              paddingHorizontal: 22,
              borderRadius: 12,
            }}
            onPress={() => {
              this.setState({ hasError: false, errorText: '' });
              this.props.onResetSession();
            }}
          >
            <Text style={{ color: Colors.background, fontWeight: '800', fontSize: 14 }}>
              Restablecer vista e iniciar sesión
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [restoringSession, setRestoringSession] = useState(true);
  const [lang, setLang] = useState<LanguageCode>('es');
  const t = Translations[lang] || Translations.es;

  const [session, setSession] = useState<{
    uid: string;
    email: string;
    derivedKey: string;
    authHash: string;
    items: VaultItem[];
    folders: CustomFolder[];
  } | null>(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.innerHTML = `
        html, body, #root {
          min-width: 450px !important;
          min-height: 620px !important;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          background-color: #0B0F19;
          overflow-x: hidden;
        }
      `;
      document.head.appendChild(style);
    } else if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      } catch {}
    }

    restorePersistentOneMonthSession();
  }, []);

  const restorePersistentOneMonthSession = async () => {
    try {
      const savedRaw = await StorageService.getItem(PERSISTENT_SESSION_KEY);
      if (!savedRaw) {
        setRestoringSession(false);
        return;
      }

      const parsed = JSON.parse(savedRaw);
      if (
        !parsed ||
        !parsed.email ||
        !parsed.derivedKey ||
        !parsed.expiresAt ||
        Date.now() > Number(parsed.expiresAt)
      ) {
        await StorageService.removeItem(PERSISTENT_SESSION_KEY);
        setRestoringSession(false);
        return;
      }

      const userStorageKey = `user_${String(parsed.email).replace(/[^a-z0-9]/g, '_')}`;
      const savedHash =
        parsed.authHash || (await StorageService.getItem(`${userStorageKey}_hash`)) || '';
      let encryptedVault = await StorageService.getItem(`${userStorageKey}_vault`);

      if (FirebaseService.isConfigured() && savedHash) {
        try {
          const cloudDoc = await FirebaseService.fetchLatestCloudVault(
            parsed.uid,
            parsed.email,
            savedHash
          );
          if (cloudDoc?.encryptedVault) {
            encryptedVault = cloudDoc.encryptedVault;
            await StorageService.setItem(`${userStorageKey}_vault`, encryptedVault);
          }
        } catch {}
      }

      let items: VaultItem[] = [];
      let folders: CustomFolder[] = DEFAULT_FOLDERS;

      if (encryptedVault) {
        const decrypted = CryptoService.decryptVault<{
          items: VaultItem[];
          folders: CustomFolder[];
        }>(encryptedVault, parsed.derivedKey);
        if (decrypted) {
          items = Array.isArray(decrypted.items) ? decrypted.items : [];
          folders =
            Array.isArray(decrypted.folders) && decrypted.folders.length > 0
              ? decrypted.folders
              : DEFAULT_FOLDERS;
        }
      }

      setSession({
        uid: String(parsed.uid || userStorageKey),
        email: String(parsed.email),
        derivedKey: String(parsed.derivedKey),
        authHash: String(savedHash),
        items,
        folders,
      });

      setTimeout(() => {
        AutofillBridgeService.syncVaultWithSystemAutofill(items).catch(() => {});
      }, 400);
    } catch {
      await StorageService.removeItem(PERSISTENT_SESSION_KEY);
    } finally {
      setRestoringSession(false);
    }
  };

  useEffect(() => {
    if (!session?.uid) return;

    const syncWithCloudAndNativeAutofill = async () => {
      try {
        const current = sessionRef.current;
        if (!current) return;

        let workingItems = Array.isArray(current.items) ? [...current.items] : [];
        const workingFolders = Array.isArray(current.folders)
          ? [...current.folders]
          : DEFAULT_FOLDERS;
        let hasNewNativeItems = false;

        if (Platform.OS === 'android') {
          const pending = await AutofillBridgeService.consumeAndroidSavedAccounts();
          if (Array.isArray(pending) && pending.length > 0) {
            const newVaultItems: VaultItem[] = pending.map((p) => {
              const brand = IconAIService.predictBrandMetadata(p.name || '', p.url || '');
              return {
                id: `autofill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                type: 'account',
                name: p.name || 'Cuenta Guardada',
                url: p.url || '',
                username: p.username || current.email,
                password: p.password || '',
                masterEmail: current.email,
                folderId: brand.suggestedFolderId || 'social',
                iconUrl: brand.iconUrl || '',
                brandColor: brand.brandColor || '#6366F1',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
            });
            workingItems = [...newVaultItems, ...workingItems];
            hasNewNativeItems = true;
          }
        }

        if (hasNewNativeItems) {
          await handleUpdateVault(workingItems, workingFolders);
          return;
        }

        if (FirebaseService.isConfigured() && current.authHash) {
          const cloudDoc = await FirebaseService.fetchLatestCloudVault(
            current.uid,
            current.email,
            current.authHash
          );
          if (cloudDoc?.encryptedVault) {
            const decrypted = CryptoService.decryptVault<{
              items: VaultItem[];
              folders: CustomFolder[];
            }>(cloudDoc.encryptedVault, current.derivedKey);
            if (decrypted && Array.isArray(decrypted.items)) {
              const userStorageKey = `user_${current.email.replace(/[^a-z0-9]/g, '_')}`;
              await StorageService.setItem(`${userStorageKey}_vault`, cloudDoc.encryptedVault);
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      items: decrypted.items,
                      folders:
                        Array.isArray(decrypted.folders) && decrypted.folders.length > 0
                          ? decrypted.folders
                          : prev.folders,
                    }
                  : null
              );
              await AutofillBridgeService.syncVaultWithSystemAutofill(decrypted.items);
            }
          }
        }
      } catch {}
    };

    const timer = setTimeout(() => {
      syncWithCloudAndNativeAutofill();
    }, 500);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncWithCloudAndNativeAutofill();
      }
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [session?.uid]);

  const handleAuthenticatedSession = async (
    uid: string,
    email: string,
    derivedKey: string,
    authHash: string,
    items: VaultItem[],
    folders: CustomFolder[]
  ) => {
    const safeItems = Array.isArray(items) ? items : [];
    const safeFolders =
      Array.isArray(folders) && folders.length > 0 ? folders : DEFAULT_FOLDERS;

    setSession({
      uid: String(uid || email),
      email: String(email),
      derivedKey: String(derivedKey),
      authHash: String(authHash || ''),
      items: safeItems,
      folders: safeFolders,
    });

    try {
      await StorageService.setItem(
        PERSISTENT_SESSION_KEY,
        JSON.stringify({
          uid: String(uid || email),
          email: String(email),
          derivedKey: String(derivedKey),
          authHash: String(authHash || ''),
          expiresAt: Date.now() + SESSION_ONE_MONTH_TTL_MS,
        })
      );

      setTimeout(() => {
        AutofillBridgeService.syncVaultWithSystemAutofill(safeItems).catch(() => {});
      }, 400);
    } catch {}
  };

  const handleOpenCoffee = () => {
    Linking.openURL(BUY_ME_A_COFFEE_URL).catch(() => {});
  };

  const handleUpdateVault = async (
    updatedItems: VaultItem[],
    updatedFolders: CustomFolder[]
  ) => {
    const current = sessionRef.current;
    if (!current) return;

    const cleanItems: VaultItem[] = JSON.parse(
      JSON.stringify(Array.isArray(updatedItems) ? updatedItems : [])
    );
    const cleanFolders: CustomFolder[] = JSON.parse(
      JSON.stringify(
        Array.isArray(updatedFolders) && updatedFolders.length > 0
          ? updatedFolders
          : DEFAULT_FOLDERS
      )
    );

    const nextSession = {
      ...current,
      items: cleanItems,
      folders: cleanFolders,
    };
    sessionRef.current = nextSession;
    setSession(nextSession);

    try {
      const userStorageKey = `user_${current.email.replace(/[^a-z0-9]/g, '_')}`;
      const encryptedVault = CryptoService.encryptVault(
        { items: cleanItems, folders: cleanFolders },
        current.derivedKey
      );

      await StorageService.setItem(`${userStorageKey}_vault`, encryptedVault);
      await AutofillBridgeService.syncVaultWithSystemAutofill(cleanItems);

      if (FirebaseService.isConfigured()) {
        await FirebaseService.updateEncryptedVault(
          current.uid,
          current.email,
          encryptedVault,
          current.authHash
        );
      }
    } catch {}
  };

  const handleDeleteAccountPermanently = async () => {
    if (!session) return;
    const userStorageKey = `user_${session.email.replace(/[^a-z0-9]/g, '_')}`;

    try {
      if (FirebaseService.isConfigured()) {
        await FirebaseService.deleteAccountAndVaultPermanently(
          session.uid,
          session.email,
          session.authHash
        );
      }
      await StorageService.removeItem(`${userStorageKey}_uid`);
      await StorageService.removeItem(`${userStorageKey}_hash`);
      await StorageService.removeItem(`${userStorageKey}_vault`);
      await StorageService.removeItem(`${userStorageKey}_2fa_secret`);
      await StorageService.removeItem(`${userStorageKey}_2fa_trusted_until`);
      await StorageService.removeItem('biometric_enabled_session');
      await StorageService.removeItem(PERSISTENT_SESSION_KEY);
    } finally {
      setDeleteModalVisible(false);
      setSession(null);
    }
  };

  const handleLogout = async () => {
    await StorageService.removeItem(PERSISTENT_SESSION_KEY);
    await FirebaseService.logout();
    setSession(null);
  };

  if (restoringSession) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <RootErrorBoundary onResetSession={handleLogout}>
      {!session ? (
        <SafeAreaView style={styles.safeArea}>
          <StatusBar
            barStyle="light-content"
            backgroundColor={Colors.background}
            translucent={false}
          />
          <View style={styles.mainContentWrapper}>
            <AuthScreen
              lang={lang}
              onChangeLang={setLang}
              onAuthenticated={handleAuthenticatedSession}
            />
          </View>

          <View style={styles.loginFooter}>
            <TouchableOpacity
              style={styles.coffeePillSubtle}
              onPress={handleOpenCoffee}
              accessibilityRole="link"
              accessibilityLabel="Buy me a taco en Buy Me a Coffee"
            >
              <Text style={{ fontSize: 15 }}>🌮</Text>
              <Text style={styles.coffeePillSubtleText}>Buy me a taco</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.safeArea}>
          <StatusBar
            barStyle="light-content"
            backgroundColor={Colors.background}
            translucent={false}
          />

          <View style={styles.appOuterFrame}>
            <View style={styles.headerCard}>
              <View style={styles.headerTopRow}>
                <View style={styles.brandRow}>
                  <Shield size={22} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>GSoftPass</Text>
                    <Text style={styles.emailSubtitle} numberOfLines={1}>
                      {session.email}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.coffeeHeaderBtn}
                    onPress={handleOpenCoffee}
                    accessibilityRole="link"
                    accessibilityLabel="Buy me a taco"
                  >
                    <Text style={{ fontSize: 14 }}>🌮</Text>
                    {!isMobile && <Text style={styles.coffeeHeaderText}>Buy me a taco</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.securityHeaderBtn}
                    onPress={() => setSecurityModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Configurar Huella y 2FA"
                  >
                    <Fingerprint size={17} color={Colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteAccountBtn}
                    onPress={() => setDeleteModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Eliminar cuenta y bóveda"
                  >
                    <Trash2 size={16} color={Colors.danger} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.logoutBtn}
                    onPress={handleLogout}
                    accessibilityRole="button"
                    accessibilityLabel={t.lockVault}
                  >
                    <LogOut size={16} color={Colors.textSecondary} />
                    {!isMobile && <Text style={styles.logoutText}>{t.lockVault}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.dashboardWrapper}>
              <VaultDashboard
                masterEmail={session.email}
                items={session.items}
                folders={session.folders}
                onUpdateVault={handleUpdateVault}
              />
            </View>
          </View>

          {/* Montaje condicional: solo se monta cuando el usuario toca el botón de seguridad */}
          {securityModalVisible && (
            <SecuritySettingsModal
              visible={securityModalVisible}
              onClose={() => setSecurityModalVisible(false)}
              uid={session.uid}
              email={session.email}
              derivedKey={session.derivedKey}
              authHash={session.authHash}
            />
          )}

          {deleteModalVisible && (
            <Modal
              visible={deleteModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setDeleteModalVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                  <View style={styles.warningHeader}>
                    <AlertTriangle size={24} color={Colors.danger} />
                    <Text style={styles.modalTitle}>¿Eliminar Cuenta y Bóveda?</Text>
                  </View>
                  <Text style={styles.modalDesc}>
                    Esta acción borrará permanentemente tu cuenta ({session.email}) y todas tus
                    contraseñas cifradas tanto de este dispositivo como de la nube. Debido a nuestra
                    arquitectura Zero-Knowledge, esta acción no se puede deshacer.
                  </Text>
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setDeleteModalVisible(false)}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmDeleteBtn}
                      onPress={handleDeleteAccountPermanently}
                    >
                      <Text style={styles.confirmDeleteText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </SafeAreaView>
      )}
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    ...(Platform.OS === 'web'
      ? { minWidth: 450, minHeight: 620 }
      : {}),
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 12,
    paddingBottom: Platform.OS === 'android' ? 24 : 12,
  },
  mainContentWrapper: {
    flex: 1,
  },
  appOuterFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: Platform.OS === 'android' ? 18 : 22,
    paddingTop: 6,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  dashboardWrapper: {
    flex: 1,
  },
  loginFooter: {
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coffeePillSubtle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#5F7FFF',
    borderWidth: 1,
    borderColor: '#000000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  coffeePillSubtleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  emailSubtitle: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coffeeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#5F7FFF',
    borderWidth: 1,
    borderColor: '#000000',
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  coffeeHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  securityHeaderBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.14)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  deleteAccountBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 17, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  modalDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});