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
} from 'react-native';
import {
  X,
  Fingerprint,
  Clock,
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

interface SecuritySettingsModalProps {
  visible: boolean;
  onClose: () => void;
  uid: string;
  email: string;
  derivedKey: string;
  autoLockMinutes: number;
  onChangeAutoLock: (minutes: number) => void;
}

const TIMEOUT_OPTIONS = [
  { label: '1 min', value: 1 },
  { label: '3 min', value: 3 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
];

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  visible,
  onClose,
  uid,
  email,
  derivedKey,
  autoLockMinutes,
  onChangeAutoLock,
}) => {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Estados de 2FA (TOTP)
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

    const saved2FASecret = await StorageService.getItem(`${userKey}_2fa_secret`);
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

  // 1. Activar o desactivar Desbloqueo con Huella / Rostro
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
        JSON.stringify({ uid, email, derivedKey })
      );
      setBiometricEnabled(true);
      setStatusMessage('¡Huella / Rostro habilitado! Ahora podrás iniciar sesión con 1 toque.');
    } else {
      setStatusMessage('No se pudo verificar tu biometría.');
    }
  };

  // 2. Configurar 2FA (TOTP)
  const handleStart2FASetup = () => {
    const newSecret = CryptoService.generateTOTPSecret();
    setTotpSecret(newSecret);
    setVerificationCode('');
    setSettingUp2FA(true);
    setStatusMessage('');
  };

  const handleConfirmEnable2FA = async () => {
    if (CryptoService.verifyTOTPCode(totpSecret, verificationCode)) {
      await StorageService.setItem(`${userKey}_2fa_secret`, totpSecret);
      setTwoFAEnabled(true);
      setSettingUp2FA(false);
      setStatusMessage('¡Autenticación de 2 Factores (2FA) activada correctamente!');
    } else {
      setStatusMessage('Código incorrecto. Verifica los 6 dígitos en tu app autenticadora.');
    }
  };

  const handleDisable2FA = async () => {
    await StorageService.removeItem(`${userKey}_2fa_secret`);
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
      <View style={styles.overlay}>
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

          <ScrollView showsVerticalScrollIndicator={false}>
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

            {/* SECCIÓN 2: CIERRE AUTOMÁTICO POR INACTIVIDAD */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <Clock size={17} color={Colors.primary} />
                <Text style={styles.sectionTitle}>
                  Bloqueo automático por inactividad
                </Text>
              </View>
              <Text style={styles.sectionDesc}>
                Cierra la sesión automáticamente si dejas de usar la aplicación o pasas a otra app en
                tu celular.
              </Text>

              <View style={styles.pillsRow}>
                {TIMEOUT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.timeoutPill,
                      autoLockMinutes === opt.value && styles.timeoutPillActive,
                    ]}
                    onPress={() => onChangeAutoLock(opt.value)}
                  >
                    <Text
                      style={[
                        styles.timeoutPillText,
                        autoLockMinutes === opt.value && styles.timeoutPillTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* SECCIÓN 3: AUTENTICACIÓN DE DOS FACTORES (2FA TOTP) */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <ShieldAlert size={18} color={Colors.accent} />
                <Text style={styles.sectionTitle}>
                  Verificación en 2 Pasos (2FA Authenticator)
                </Text>
              </View>
              <Text style={styles.sectionDesc}>
                Solicita un código dinámico de 6 dígitos (Google Authenticator, Microsoft
                Authenticator o Authy) además de tu Contraseña Maestra al iniciar sesión.
              </Text>

              {twoFAEnabled ? (
                <View style={styles.enabled2FABox}>
                  <Text style={styles.enabled2FAText}>✓ Protección 2FA Activa en esta cuenta</Text>
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
      </View>
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
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  timeoutPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeoutPillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderColor: Colors.primary,
  },
  timeoutPillText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  timeoutPillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
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
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  enabled2FAText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  disable2FABtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  disable2FAText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '700',
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