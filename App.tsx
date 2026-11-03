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
import { LanguageCode, Translations } from './src/i18n/translations';
import { LogOut, Shield, Trash2, AlertTriangle, Fingerprint } from 'lucide-react-native';

const BUY_ME_A_COFFEE_URL = 'https://www.buymeacoffee.com/DearTony';

// Duración de sesión en la Extensión MS Edge / Web: 72 horas (3 días)
const WEB_SESSION_TTL_MS = 72 * 60 * 60 * 1000;
const WEB_PERSIST_KEY = 'web_extension_active_session_72h';

const DEFAULT_FOLDERS: CustomFolder[] = [
  { id: 'games', name: 'Juegos', icon: 'Gamepad2' },
  { id: 'social', name: 'Redes Sociales', icon: 'Share2' },
  { id: 'school', name: 'Escuela', icon: 'GraduationCap' },
  { id: 'finance', name: 'Bancos y Tarjetas', icon: 'CreditCard' },
];

export default function App() {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [restoringSession, setRestoringSession] = useState(Platform.OS === 'web');
  const [lang, setLang] = useState<LanguageCode>('es');
  const t = Translations[lang];

  const [session, setSession] = useState<{
    uid: string;
    email: string;
    derivedKey: string;
    items: VaultItem[];
    folders: CustomFolder[];
  } | null>(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [securityModalVisible, setSecurityModalVisible] = useState(false);

  // Auto-Lock en móvil (por defecto 5 min); en Extensión Web dura 72 horas
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(5);
  const lastActivityRef = useRef<number>(Date.now());

  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
  };

  // 1. Configurar estilos del Pop-up de MS Edge y restaurar sesión de 72 horas si existe
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
      restoreWebExtensionSession();
    } else {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    }
  }, []);

  const restoreWebExtensionSession = async () => {
    try {
      const savedRaw = await StorageService.getItem(WEB_PERSIST_KEY);
      if (!savedRaw) {
        setRestoringSession(false);
        return;
      }

      const parsed = JSON.parse(savedRaw);
      if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
        // Ya pasaron las 72 horas: limpiamos y pedimos login
        await StorageService.removeItem(WEB_PERSIST_KEY);
        setRestoringSession(false);
        return;
      }

      const userStorageKey = `user_${parsed.email.replace(/[^a-z0-9]/g, '_')}`;
      const encryptedVault = await StorageService.getItem(`${userStorageKey}_vault`);
      let items: VaultItem[] = [];
      let folders: CustomFolder[] = DEFAULT_FOLDERS;

      if (encryptedVault) {
        const decrypted = CryptoService.decryptVault<{
          items: VaultItem[];
          folders: CustomFolder[];
        }>(encryptedVault, parsed.derivedKey);
        if (decrypted) {
          items = decrypted.items;
          folders = decrypted.folders;
        }
      }

      setSession({
        uid: parsed.uid,
        email: parsed.email,
        derivedKey: parsed.derivedKey,
        items,
        folders,
      });
    } catch {
      await StorageService.removeItem(WEB_PERSIST_KEY);
    } finally {
      setRestoringSession(false);
    }
  };

  const handleAuthenticatedSession = async (
    uid: string,
    email: string,
    derivedKey: string,
    items: VaultItem[],
    folders: CustomFolder[]
  ) => {
    setSession({ uid, email, derivedKey, items, folders });

    // Si estamos en la Extensión MS Edge / Web, guardamos la sesión activa por 72 horas
    if (Platform.OS === 'web') {
      await StorageService.setItem(
        WEB_PERSIST_KEY,
        JSON.stringify({
          uid,
          email,
          derivedKey,
          expiresAt: Date.now() + WEB_SESSION_TTL_MS,
        })
      );
    }
  };

  useEffect(() => {
    StorageService.getItem('autolock_minutes').then((saved) => {
      if (saved) setAutoLockMinutes(Number(saved) || 5);
    });
  }, []);

  // Auto-Lock por inactividad en Celular Android (en Web/Extensión se rige por las 72 horas)
  useEffect(() => {
    if (!session || Platform.OS === 'web') return;
    resetInactivityTimer();

    const interval = setInterval(() => {
      const elapsedMs = Date.now() - lastActivityRef.current;
      if (elapsedMs >= autoLockMinutes * 60 * 1000) {
        handleLogout();
      }
    }, 10000);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const elapsedMs = Date.now() - lastActivityRef.current;
        if (elapsedMs >= autoLockMinutes * 60 * 1000) {
          handleLogout();
        }
      } else {
        lastActivityRef.current = Date.now();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [session, autoLockMinutes]);

  const handleChangeAutoLock = async (minutes: number) => {
    setAutoLockMinutes(minutes);
    resetInactivityTimer();
    await StorageService.setItem('autolock_minutes', String(minutes));
  };

  const handleOpenCoffee = () => {
    Linking.openURL(BUY_ME_A_COFFEE_URL).catch(() => {});
  };

  const handleUpdateVault = async (
    updatedItems: VaultItem[],
    updatedFolders: CustomFolder[]
  ) => {
    if (!session) return;
    resetInactivityTimer();
    setSession({
      ...session,
      items: updatedItems,
      folders: updatedFolders,
    });

    const userStorageKey = `user_${session.email.replace(/[^a-z0-9]/g, '_')}`;
    const encryptedVault = CryptoService.encryptVault(
      { items: updatedItems, folders: updatedFolders },
      session.derivedKey
    );

    await StorageService.setItem(`${userStorageKey}_vault`, encryptedVault);

    if (FirebaseService.isConfigured()) {
      await FirebaseService.updateEncryptedVault(
        session.uid,
        session.email,
        encryptedVault
      );
    }
  };

  const handleDeleteAccountPermanently = async () => {
    if (!session) return;
    const userStorageKey = `user_${session.email.replace(/[^a-z0-9]/g, '_')}`;

    try {
      if (FirebaseService.isConfigured()) {
        await FirebaseService.deleteAccountAndVaultPermanently(session.uid);
      }
      await StorageService.removeItem(`${userStorageKey}_uid`);
      await StorageService.removeItem(`${userStorageKey}_hash`);
      await StorageService.removeItem(`${userStorageKey}_vault`);
      await StorageService.removeItem(`${userStorageKey}_2fa_secret`);
      await StorageService.removeItem(`${userStorageKey}_2fa_trusted_until`);
      await StorageService.removeItem('biometric_enabled_session');
      await StorageService.removeItem(WEB_PERSIST_KEY);
    } finally {
      setDeleteModalVisible(false);
      setSession(null);
    }
  };

  const handleLogout = async () => {
    await StorageService.removeItem(WEB_PERSIST_KEY);
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

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} translucent={false} />
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
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      onTouchStart={resetInactivityTimer}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} translucent={false} />

      {/* Contenedor exterior con espaciado alrededor para que nada quede pegado a las orillas */}
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
                accessibilityLabel="Configurar Huella, Auto-Lock y 2FA"
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

      <SecuritySettingsModal
        visible={securityModalVisible}
        onClose={() => setSecurityModalVisible(false)}
        uid={session.uid}
        email={session.email}
        derivedKey={session.derivedKey}
        autoLockMinutes={autoLockMinutes}
        onChangeAutoLock={handleChangeAutoLock}
      />

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
    </SafeAreaView>
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
  // Marco centrado con espaciado alrededor tanto en MS Edge como en Android
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