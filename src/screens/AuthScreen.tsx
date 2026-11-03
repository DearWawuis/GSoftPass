// src/screens/AuthScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Globe,
  Fingerprint,
  KeyRound,
  CheckSquare,
  Square,
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { Colors } from '../theme/colors';
import { CryptoService } from '../services/CryptoService';
import { StorageService } from '../services/StorageService';
import { FirebaseService } from '../services/FirebaseService';
import { CustomFolder, VaultItem } from '../types/vault';
import { LegalModal } from '../components/LegalModal';
import { LanguageCode, LANGUAGE_LABELS, Translations } from '../i18n/translations';

interface AuthScreenProps {
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  onAuthenticated: (
    uid: string,
    email: string,
    derivedKey: string,
    items: VaultItem[],
    folders: CustomFolder[]
  ) => void;
}

const DEFAULT_FOLDERS: CustomFolder[] = [
  { id: 'games', name: 'Juegos', icon: 'Gamepad2' },
  { id: 'social', name: 'Redes Sociales', icon: 'Share2' },
  { id: 'school', name: 'Escuela', icon: 'GraduationCap' },
  { id: 'finance', name: 'Bancos y Tarjetas', icon: 'CreditCard' },
];

// 7 días en milisegundos para no pedir 2FA a cada rato en el mismo dispositivo
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const AuthScreen: React.FC<AuthScreenProps> = ({
  lang,
  onChangeLang,
  onAuthenticated,
}) => {
  const t = Translations[lang];
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [legalVisible, setLegalVisible] = useState(false);

  // Estados de Biometría y 2FA Inteligente (7 días de confianza)
  const [savedBioSession, setSavedBioSession] = useState<{
    uid: string;
    email: string;
    derivedKey: string;
  } | null>(null);
  const [pending2FASession, setPending2FASession] = useState<{
    uid: string;
    email: string;
    derivedKey: string;
    items: VaultItem[];
    folders: CustomFolder[];
    secret: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [remember2FADevice, setRemember2FADevice] = useState(true);

  const passwordInputRef = useRef<TextInput>(null);
  const confirmInputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkBiometricSession();
  }, []);

  const checkBiometricSession = async () => {
    if (Platform.OS === 'web') return;
    const raw = await StorageService.getItem('biometric_enabled_session');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.email && parsed?.derivedKey) {
          setSavedBioSession(parsed);
          setEmail(parsed.email);
        }
      } catch {}
    }
  };

  /**
   * Desbloqueo con Huella / Rostro:
   * Al autenticar con biometría física en un dispositivo ya vinculado,
   * entra directo sin molestar pidiendo el código 2FA.
   */
  const handleBiometricLogin = async () => {
    if (!savedBioSession) return;
    setErrorMsg('');

    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: `Desbloquear bóveda de ${savedBioSession.email}`,
      cancelLabel: 'Usar Contraseña Maestra',
    });

    if (!authResult.success) return;

    setLoading(true);
    try {
      const userStorageKey = `user_${savedBioSession.email.replace(/[^a-z0-9]/g, '_')}`;
      const encryptedVault = await StorageService.getItem(`${userStorageKey}_vault`);
      let items: VaultItem[] = [];
      let folders: CustomFolder[] = DEFAULT_FOLDERS;

      if (encryptedVault) {
        const decrypted = CryptoService.decryptVault<{
          items: VaultItem[];
          folders: CustomFolder[];
        }>(encryptedVault, savedBioSession.derivedKey);
        if (decrypted) {
          items = decrypted.items;
          folders = decrypted.folders;
        }
      }

      // Renueva la confianza de 7 días en este dispositivo y entra directo
      await StorageService.setItem(
        `${userStorageKey}_2fa_trusted_until`,
        String(Date.now() + SEVEN_DAYS_MS)
      );

      onAuthenticated(
        savedBioSession.uid,
        savedBioSession.email,
        savedBioSession.derivedKey,
        items,
        folders
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verifica si la cuenta tiene 2FA activo Y si ya pasaron más de 7 días
   * (o es un dispositivo nuevo donde aún no se ha verificado).
   */
  const proceedOrRequire2FA = async (
    uid: string,
    cleanEmail: string,
    derivedKey: string,
    items: VaultItem[],
    folders: CustomFolder[]
  ) => {
    const userStorageKey = `user_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const saved2FASecret = await StorageService.getItem(`${userStorageKey}_2fa_secret`);

    if (!saved2FASecret) {
      onAuthenticated(uid, cleanEmail, derivedKey, items, folders);
      return;
    }

    // Revisamos si este dispositivo ya fue verificado en los últimos 7 días
    const trustedUntilRaw = await StorageService.getItem(
      `${userStorageKey}_2fa_trusted_until`
    );
    const trustedUntil = trustedUntilRaw ? Number(trustedUntilRaw) : 0;

    if (Date.now() < trustedUntil) {
      // Dispositivo de confianza vigente: entra directo sin pedir código
      onAuthenticated(uid, cleanEmail, derivedKey, items, folders);
      return;
    }

    // Es un dispositivo nuevo o ya pasó 1 semana: solicitamos el código 2FA
    setPending2FASession({
      uid,
      email: cleanEmail,
      derivedKey,
      items,
      folders,
      secret: saved2FASecret,
    });
    setTotpCode('');
  };

  const handleVerify2FA = async () => {
    if (!pending2FASession) return;
    if (CryptoService.verifyTOTPCode(pending2FASession.secret, totpCode)) {
      const userStorageKey = `user_${pending2FASession.email.replace(/[^a-z0-9]/g, '_')}`;
      if (remember2FADevice) {
        await StorageService.setItem(
          `${userStorageKey}_2fa_trusted_until`,
          String(Date.now() + SEVEN_DAYS_MS)
        );
      }

      onAuthenticated(
        pending2FASession.uid,
        pending2FASession.email,
        pending2FASession.derivedKey,
        pending2FASession.items,
        pending2FASession.folders
      );
      setPending2FASession(null);
    } else {
      setErrorMsg('Código 2FA inválido o expirado. Verifica tu app autenticadora.');
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Por favor ingresa tu correo maestro en el campo superior.');
      return;
    }
    try {
      setLoading(true);
      const auth = getAuth();
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMsg('¡Correo de restablecimiento enviado! Revisa tu bandeja de entrada.');
    } catch {
      setErrorMsg('No se pudo enviar el correo. Verifica que el correo esté registrado.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    setErrorMsg('');
    setSuccessMsg('');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Ingresa un correo electrónico válido.');
      return;
    }
    if (masterPassword.length < 8) {
      setErrorMsg('La Contraseña Maestra debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const derivedKey = CryptoService.deriveMasterKey(masterPassword, cleanEmail);
      const authHash = CryptoService.createAuthHash(derivedKey, masterPassword);
      const userStorageKey = `user_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;

      if (isRegistering) {
        if (masterPassword !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden.');
          setLoading(false);
          return;
        }

        const initialItems: VaultItem[] = [];
        const encryptedVault = CryptoService.encryptVault(
          { items: initialItems, folders: DEFAULT_FOLDERS },
          derivedKey
        );

        let uid = userStorageKey;
        if (FirebaseService.isConfigured()) {
          uid = await FirebaseService.registerUserVault(cleanEmail, authHash, encryptedVault);
        }

        await StorageService.setItem(`${userStorageKey}_uid`, uid);
        await StorageService.setItem(`${userStorageKey}_hash`, authHash);
        await StorageService.setItem(`${userStorageKey}_vault`, encryptedVault);

        onAuthenticated(uid, cleanEmail, derivedKey, initialItems, DEFAULT_FOLDERS);
      } else {
        let uid = (await StorageService.getItem(`${userStorageKey}_uid`)) || userStorageKey;
        let encryptedVault: string | null = null;

        if (FirebaseService.isConfigured()) {
          const cloudData = await FirebaseService.loginAndFetchVault(cleanEmail, authHash);
          uid = cloudData.uid;
          encryptedVault = cloudData.encryptedVault;

          if (encryptedVault) {
            await StorageService.setItem(`${userStorageKey}_uid`, uid);
            await StorageService.setItem(`${userStorageKey}_hash`, authHash);
            await StorageService.setItem(`${userStorageKey}_vault`, encryptedVault);
          }
        } else {
          const savedHash = await StorageService.getItem(`${userStorageKey}_hash`);
          if (!savedHash) {
            setErrorMsg('No existe una cuenta con este correo.');
            setLoading(false);
            return;
          }
          if (savedHash !== authHash) {
            setErrorMsg('Contraseña Maestra incorrecta.');
            setLoading(false);
            return;
          }
          encryptedVault = await StorageService.getItem(`${userStorageKey}_vault`);
        }

        if (!encryptedVault) {
          await proceedOrRequire2FA(uid, cleanEmail, derivedKey, [], DEFAULT_FOLDERS);
          return;
        }

        const decrypted = CryptoService.decryptVault<{
          items: VaultItem[];
          folders: CustomFolder[];
        }>(encryptedVault, derivedKey);

        if (!decrypted) {
          setErrorMsg('Contraseña Maestra incorrecta.');
          setLoading(false);
          return;
        }

        await proceedOrRequire2FA(
          uid,
          cleanEmail,
          derivedKey,
          decrypted.items,
          decrypted.folders
        );
      }
    } catch {
      setErrorMsg('Error de autenticación. Verifica tus datos o tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  if (pending2FASession) {
    return (
      <KeyboardAvoidingView style={styles.outerContainer}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <View style={styles.iconBadge}>
                <KeyRound size={34} color={Colors.primary} />
              </View>
              <Text style={styles.brandTitle}>Verificación 2FA</Text>
              <Text style={styles.brandSubtitle}>
                Ingresa el código de 6 dígitos de tu autenticador para{' '}
                {pending2FASession.email}
              </Text>
            </View>

            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TextInput
              style={styles.totpInput}
              placeholder="000000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={totpCode}
              onChangeText={setTotpCode}
              returnKeyType="done"
              onSubmitEditing={handleVerify2FA}
            />

            {/* Casilla para recordar este dispositivo durante 7 días */}
            <TouchableOpacity
              style={styles.rememberDeviceRow}
              onPress={() => setRemember2FADevice(!remember2FADevice)}
            >
              {remember2FADevice ? (
                <CheckSquare size={18} color={Colors.primary} />
              ) : (
                <Square size={18} color={Colors.textSecondary} />
              )}
              <Text style={styles.rememberDeviceText}>
                Confiar en este dispositivo y no pedir código durante 7 días
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={handleVerify2FA}>
              <Text style={styles.primaryButtonText}>Verificar y Desbloquear</Text>
              <ArrowRight size={18} color={Colors.background} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchModeBtn}
              onPress={() => {
                setPending2FASession(null);
                setErrorMsg('');
              }}
            >
              <Text style={styles.switchModeText}>Volver al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.outerContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Barra de Selección de Idioma con espacio superior garantizado en MS Edge y Móvil */}
        <View style={styles.langBar} accessibilityRole="tablist">
          <Globe size={15} color={Colors.primary} />
          {(Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => (
            <TouchableOpacity
              key={code}
              style={[styles.langChip, lang === code && styles.langChipActive]}
              onPress={() => onChangeLang(code)}
              accessibilityRole="tab"
            >
              <Text style={[styles.langChipText, lang === code && styles.langChipTextActive]}>
                {LANGUAGE_LABELS[code]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <View style={styles.iconBadge}>
              <ShieldCheck size={34} color={Colors.primary} />
            </View>
            <Text style={styles.brandTitle} accessibilityRole="header">
              GSoftPass
            </Text>
            <Text style={styles.brandSubtitle}>
              {isRegistering ? t.subtitleRegister : t.subtitleLogin}
            </Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorBox} accessibilityLiveRegion="assertive">
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBox} accessibilityLiveRegion="polite">
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t.masterEmail}</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="tu_correo@ejemplo.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.label}>{t.masterPassword}</Text>
              {!isRegistering && (
                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={Colors.textSecondary} />
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="••••••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                value={masterPassword}
                onChangeText={setMasterPassword}
                autoCapitalize="none"
                returnKeyType={isRegistering ? 'next' : 'done'}
                onSubmitEditing={() => {
                  if (isRegistering) {
                    confirmInputRef.current?.focus();
                  } else {
                    handleSubmit();
                  }
                }}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={18} color={Colors.textSecondary} />
                ) : (
                  <Eye size={18} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {isRegistering && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t.confirmPassword}</Text>
              <View style={styles.inputWrapper}>
                <Lock size={18} color={Colors.textSecondary} />
                <TextInput
                  ref={confirmInputRef}
                  style={styles.input}
                  placeholder="••••••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  {isRegistering ? t.createVaultBtn : t.unlockVaultBtn}
                </Text>
                <ArrowRight size={18} color={Colors.background} />
              </>
            )}
          </TouchableOpacity>

          {!isRegistering && savedBioSession && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricLogin}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión con huella o rostro"
            >
              <Fingerprint size={20} color={Colors.primary} />
              <Text style={styles.biometricButtonText}>
                Entrar con Huella / Rostro
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.switchModeBtn}
            onPress={() => {
              setIsRegistering(!isRegistering);
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            <Text style={styles.switchModeText}>
              {isRegistering ? t.switchToLogin : t.switchToRegister}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 14, alignItems: 'center' }}
            onPress={() => setLegalVisible(true)}
          >
            <Text style={{ color: Colors.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>
              {t.legalLink}
            </Text>
          </TouchableOpacity>

          <LegalModal visible={legalVisible} onClose={() => setLegalVisible(false)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 28,      // Espacio superior amplio para que la barra de idiomas se vea completa
    paddingBottom: 24,
    paddingHorizontal: 24, // Margen lateral holgado alrededor de la tarjeta
  },
  langBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    width: '100%',
    maxWidth: 420,
  },
  langChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langChipActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  langChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  langChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 18,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  brandTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: '#6EE7B7',
    fontSize: 12,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 14,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    marginLeft: 10,
  },
  totpInput: {
    backgroundColor: Colors.surfaceLight,
    color: Colors.textPrimary,
    borderRadius: 12,
    height: 54,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 14,
  },
  rememberDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  rememberDeviceText: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  biometricButton: {
    marginTop: 10,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  biometricButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  switchModeBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchModeText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});