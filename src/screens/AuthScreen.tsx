// src/screens/AuthScreen.tsx (Actualización con Recuperación de Contraseña)
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, ArrowRight, Globe } from 'lucide-react-native';
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

  const passwordInputRef = useRef<TextInput>(null);
  const confirmInputRef = useRef<TextInput>(null);

  // Función para enviar correo de restablecimiento de contraseña
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
          onAuthenticated(uid, cleanEmail, derivedKey, [], DEFAULT_FOLDERS);
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

        onAuthenticated(uid, cleanEmail, derivedKey, decrypted.items, decrypted.folders);
      }
    } catch {
      setErrorMsg('Error de autenticación. Verifica tus datos o tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
            <ShieldCheck size={36} color={Colors.primary} />
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
          style={{ marginTop: 16, alignItems: 'center' }}
          onPress={() => setLegalVisible(true)}
        >
          <Text style={{ color: Colors.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>
            {t.legalLink}
          </Text>
        </TouchableOpacity>

        <LegalModal visible={legalVisible} onClose={() => setLegalVisible(false)} />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  langBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  langChip: {
    paddingVertical: 5,
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
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 14,
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
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#6EE7B7',
    fontSize: 13,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
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
    height: 50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    marginLeft: 10,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  switchModeBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchModeText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});