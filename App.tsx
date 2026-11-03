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
} from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
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

export default function App() {
  usePreventScreenCapture();
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

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

  // Configuración de Auto-Lock por inactividad (3 minutos por defecto)
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(3);
  const lastActivityRef = useRef<number>(Date.now());

  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
  };

  useEffect(() => {
    StorageService.getItem('autolock_minutes').then((saved) => {
      if (saved) setAutoLockMinutes(Number(saved) || 3);
    });
  }, []);

  // Monitoreo continuo de inactividad y paso a segundo plano en Android
  useEffect(() => {
    if (!session) return;
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
      await StorageService.removeItem('biometric_enabled_session');
    } finally {
      setDeleteModalVisible(false);
      setSession(null);
    }
  };

  const handleLogout = async () => {
    await FirebaseService.logout();
    setSession(null);
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} translucent={false} />
        <View style={{ flex: 1 }}>
          <AuthScreen
            lang={lang}
            onChangeLang={setLang}
            onAuthenticated={(uid, email, derivedKey, items, folders) =>
              setSession({ uid, email, derivedKey, items, folders })
            }
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.surface} translucent={false} />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.brandRow}>
            <Shield size={22} color={Colors.primary} />
            <View>
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

            {/* Botón para configurar Huella/Rostro, Auto-Lock y 2FA */}
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

      <VaultDashboard
        masterEmail={session.email}
        items={session.items}
        folders={session.folders}
        onUpdateVault={handleUpdateVault}
      />

      {/* Modal de Huella Digital, Tiempo de Inactividad y 2FA */}
      <SecuritySettingsModal
        visible={securityModalVisible}
        onClose={() => setSecurityModalVisible(false)}
        uid={session.uid}
        email={session.email}
        derivedKey={session.derivedKey}
        autoLockMinutes={autoLockMinutes}
        onChangeAutoLock={handleChangeAutoLock}
      />

      {/* Modal de Confirmación para Eliminar Cuenta */}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 6 : 0,
  },
  loginFooter: {
    paddingVertical: 12,
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
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  coffeePillSubtleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 6,
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
    maxWidth: 150,
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
    padding: 16,
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