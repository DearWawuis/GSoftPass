// src/components/SecuritySettingsModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  X,
  Fingerprint,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors } from '../theme/colors';
import { StorageService } from '../services/StorageService';
import { CryptoService } from '../services/CryptoService';
import { FirebaseService } from '../services/FirebaseService';

interface SecuritySettingsModalProps {
  visible: boolean;
  onClose: () => void;
  uid: string;
  email: string;
  derivedKey: string;
  authHash?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  visible,
  onClose,
  uid,
  email,
  derivedKey,
  authHash,
}) => {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [settingUp2FA, setSettingUp2FA] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const userKey = `user_${email.replace(/[^a-z0-9]/g, '_')}`;

  useEffect(() => {
    if (visible) {
      loadSecurityStatus();
    }
  }, [visible]);

  const loadSecurityStatus = async () => {
    setStatusMessage('');
    if (Platform.OS !== 'web') {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(hasHardware && isEnrolled);
    }

    const bioSaved = await StorageService.getItem('biometric_enabled_session');
    setBiometricEnabled(!!bioSaved);

    let saved2FASecret = await StorageService.getItem(`${userKey}_2fa_secret`);

    // Consultamos siempre Firestore para reflejar el estado real persistente en la nube
    if (FirebaseService.isConfigured()) {
      const cloudDoc = await FirebaseService.fetchLatestCloudVault(uid, email, authHash);
      if (cloudDoc?.twoFAEnabled && cloudDoc?.encryptedTwoFASecret) {
        const decryptedSecret = CryptoService.decryptVault<{ secret: string }>(
          cloudDoc.encryptedTwoFASecret,
          derivedKey
        );
        if (decryptedSecret?.secret) {
          saved2FASecret = decryptedSecret.secret;
          await StorageService.setItem(`${userKey}_2fa_secret`, saved2FASecret);
        }
      } else if (cloudDoc && cloudDoc.twoFAEnabled === false && !saved2FASecret) {
        saved2FASecret = null;
      }
    }

    if (saved2FASecret) {
      setTwoFAEnabled(true);
      setTotpSecret(saved2FASecret);
      setSettingUp2FA(false);
    } else {
      setTwoFAEnabled(false);
      setTotpSecret('');
      setSettingUp2FA(false);
    }
  };

  const handleToggleBiometrics = async (enable: boolean) => {
    setStatusMessage('');
    if (!enable) {
      await StorageService.removeItem('biometric_enabled_session');
      setBiometricEnabled(false);
      setStatusMessage('Desbloqueo biométrico desactivado.');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirma tu huella o rostro para habilitar el acceso rápido en GSoftPass',
      cancelLabel: 'Cancelar',
    });

    if (result.success) {
      await StorageService.setItem(
        'biometric_enabled_session',
        JSON.stringify({ uid, email, derivedKey, authHash })
      );
      setBiometricEnabled(true);
      setStatusMessage('¡Huella / Rostro habilitado! Ahora podrás iniciar sesión con 1 toque.');
    } else {
      setStatusMessage('No se pudo verificar tu biometría.');
    }
  };

  const handleStart2FASetup = () => {
    const newSecret = CryptoService.generateTOTPSecret();
    setTotpSecret(newSecret);
    setVerificationCode('');
    setSettingUp2FA(true);
    setStatusMessage('');
  };

  const handleConfirmEnable2FA = async () => {
    if (!CryptoService.verifyTOTPCode(totpSecret, verificationCode)) {
      setStatusMessage('Código incorrecto. Verifica los 6 dígitos en tu app autenticadora.');
      return;
    }

    const encryptedSecret = CryptoService.encryptVault({ secret: totpSecret }, derivedKey);
    const savedInCloud = await FirebaseService.updateCloudTwoFA(
      uid,
      email,
      encryptedSecret,
      authHash
    );

    if (FirebaseService.isConfigured() && !savedInCloud) {
      setStatusMessage(
        'No se pudo guardar el 2FA en la nube. Verifica tu conexión a internet e inténtalo de nuevo.'
      );
      return;
    }

    await StorageService.setItem(`${userKey}_2fa_secret`, totpSecret);
    await StorageService.setItem(
      `${userKey}_2fa_trusted_until`,
      String(Date.now() + SEVEN_DAYS_MS)
    );

    setTwoFAEnabled(true);
    setSettingUp2FA(false);
    setStatusMessage(
      '¡2FA activado y guardado en tu base de datos! Si reinstalas la app o inicias sesión en otro dispositivo, te pedirá el código.'
    );
  };

  const handleDisable2FA = async () => {
    await StorageService.removeItem(`${userKey}_2fa_secret`);
    await StorageService.removeItem(`${userKey}_2fa_trusted_until`);
    await FirebaseService.updateCloudTwoFA(uid, email, null, authHash);
    setTwoFAEnabled(false);
    setTotpSecret('');
    setSettingUp2FA(false);
    setStatusMessage('Autenticación 2FA desactivada.');
  };

  const handleCopySecret = async () => {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(totpSecret);
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(totpSecret);
      }
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {}
  };

  const otpAuthUri = `otpauth://totp/GSoftPass:${encodeURIComponent(
    email
  )}?secret=${totpSecret}&issuer=GSoftPass`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    otpAuthUri
  )}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Fingerprint size={22} color={Colors.primary} />
              <Text style={styles.title}>Seguridad, Biometría y 2FA</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {statusMessage ? (
              <View style={styles.statusBanner}>
                <CheckCircle2 size={16} color={Colors.primary} />
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            ) : null}

            {/* SECCIÓN 1: HUELLA DIGITAL / ROSTRO */}
            <View style={styles.sectionBox}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.sectionTitle}>Iniciar sesión con Huella o Rostro</Text>
                  <Text style={styles.sectionDesc}>
                    {Platform.OS === 'web'
                      ? 'Disponible en la aplicación instalada en tu celular Android.'
                      : biometricSupported
                      ? 'Desbloquea tu bóveda al instante usando el sensor biométrico de tu teléfono.'
                      : 'Tu dispositivo no tiene huella o rostro registrado en los ajustes de Android.'}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  disabled={!biometricSupported}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>
            </View>

            {/* SECCIÓN 2: AUTENTICACIÓN DE DOS FACTORES (2FA TOTP PERSISTENTE EN NUBE) */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <ShieldAlert size={18} color={Colors.accent} />
                <Text style={styles.sectionTitle}>
                  Verificación en 2 Pasos (2FA Authenticator)
                </Text>
              </View>
              <Text style={styles.sectionDesc}>
                Solicita un código de 6 dígitos (Google Authenticator, Microsoft Authenticator o
                Authy) cuando inicies sesión en un dispositivo nuevo, después de reinstalar la
                aplicación o cada 7 días.
              </Text>

              {twoFAEnabled ? (
                <View style={styles.enabled2FABox}>
                  <Text style={styles.enabled2FAText}>✓ Protección 2FA Activa en tu cuenta</Text>
                  <TouchableOpacity style={styles.disable2FABtn} onPress={handleDisable2FA}>
                    <Text style={styles.disable2FAText}>Desactivar 2FA</Text>
                  </TouchableOpacity>
                </View>
              ) : !settingUp2FA ? (
                <TouchableOpacity style={styles.setup2FABtn} onPress={handleStart2FASetup}>
                  <KeyRound size={16} color={Colors.background} />
                  <Text style={styles.setup2FABtnText}>Configurar 2FA Ahora</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.qrSetupContainer}>
                  <Text style={styles.stepInstruction}>
                    1. Escanea este código QR o pega la clave secreta en tu app Google / Microsoft
                    Authenticator:
                  </Text>

                  <View style={styles.qrWrapper}>
                    <Image source={{ uri: qrUrl }} style={styles.qrImage} />
                  </View>

                  <View style={styles.secretRow}>
                    <Text style={styles.secretCodeText} selectable>
                      {totpSecret}
                    </Text>
                    <TouchableOpacity style={styles.copySmallBtn} onPress={handleCopySecret}>
                      {copiedSecret ? (
                        <Check size={15} color={Colors.success} />
                      ) : (
                        <Copy size={15} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.stepInstruction}>
                    2. Escribe el código de 6 dígitos que muestra tu aplicación autenticadora para
                    confirmar:
                  </Text>

                  <TextInput
                    style={styles.codeInput}
                    placeholder="000000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                  />

                  <TouchableOpacity
                    style={styles.confirm2FABtn}
                    onPress={handleConfirmEnable2FA}
                  >
                    <Text style={styles.confirm2FABtnText}>Verificar y Activar 2FA</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 17, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  statusText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  sectionBox: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  setup2FABtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  setup2FABtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  enabled2FABox: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  enabled2FAText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
    lineHeight: 16,
  },
  disable2FABtn: {
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 8,
  },
  disable2FAText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  qrSetupContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stepInstruction: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  qrWrapper: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 14,
    marginVertical: 8,
  },
  qrImage: {
    width: 150,
    height: 150,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceLight,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  secretCodeText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  copySmallBtn: {
    padding: 6,
  },
  codeInput: {
    backgroundColor: Colors.surfaceLight,
    color: Colors.textPrimary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  confirm2FABtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirm2FABtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
});