// src/components/PasswordGeneratorModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Platform,
  ScrollView,
} from 'react-native';
import { RefreshCw, Copy, Check, X, ShieldCheck, Minus, Plus } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { CryptoService } from '../services/CryptoService';
import { PasswordGeneratorOptions } from '../types/vault';

interface PasswordGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onUsePassword: (password: string) => void;
}

export const PasswordGeneratorModal: React.FC<PasswordGeneratorModalProps> = ({
  visible,
  onClose,
  onUsePassword,
}) => {
  const [options, setOptions] = useState<PasswordGeneratorOptions>({
    length: 16,
    allowAllSpecialAndEnye: true,
    easyToRead: false,
    includeNumbers: true,
    includeLowercase: true,
    includeUppercase: true,
    includeSymbols: true,
  });

  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const regenerate = (opts: PasswordGeneratorOptions = options) => {
    const pwd = CryptoService.generatePassword(opts);
    setGeneratedPassword(pwd);
    setCopied(false);
  };

  useEffect(() => {
    if (visible) {
      regenerate(options);
    }
  }, [visible]);

  const updateOption = <K extends keyof PasswordGeneratorOptions>(
    key: K,
    value: PasswordGeneratorOptions[K]
  ) => {
    const updated = { ...options, [key]: value };
    setOptions(updated);
    regenerate(updated);
  };

  const handleCopy = async () => {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(generatedPassword);
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(generatedPassword);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.popupCard}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <ShieldCheck size={20} color={Colors.primary} />
              <Text style={styles.title}>Generador de Contraseñas</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 1. Contraseña en negritas y color blanco */}
            <View style={styles.passwordDisplayBox}>
              <Text style={styles.passwordText} selectable>
                {generatedPassword}
              </Text>
            </View>

            {/* 2. Debajo: 2 botones alineados a la derecha */}
            <View style={styles.rightAlignedActions}>
              <TouchableOpacity
                style={styles.actionSmallBtn}
                onPress={() => regenerate()}
              >
                <RefreshCw size={15} color={Colors.primary} />
                <Text style={styles.actionSmallBtnText}>Generar otra</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionSmallBtn, copied && styles.actionSmallBtnSuccess]}
                onPress={handleCopy}
              >
                {copied ? (
                  <Check size={15} color={Colors.success} />
                ) : (
                  <Copy size={15} color={Colors.textPrimary} />
                )}
                <Text style={[styles.actionSmallBtnText, copied && { color: Colors.success }]}>
                  {copied ? '¡Copiada!' : 'Copiar'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3. Longitud de contraseña deseada */}
            <View style={styles.lengthRow}>
              <Text style={styles.optionLabel}>Longitud deseada</Text>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updateOption('length', Math.max(6, options.length - 1))}
                >
                  <Minus size={16} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.lengthValue}>{options.length}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => updateOption('length', Math.min(64, options.length + 1))}
                >
                  <Plus size={16} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.quickLengthsRow}>
              {[8, 12, 16, 24, 32].map((len) => (
                <TouchableOpacity
                  key={len}
                  style={[
                    styles.quickLengthPill,
                    options.length === len && styles.quickLengthPillActive,
                  ]}
                  onPress={() => updateOption('length', len)}
                >
                  <Text
                    style={[
                      styles.quickLengthText,
                      options.length === len && styles.quickLengthTextActive,
                    ]}
                  >
                    {len}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 4. Opciones activables responsivas */}
            <View style={styles.switchesContainer}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.optionLabel}>Permitir caracteres especiales y ñ</Text>
                  <Text style={styles.optionHint}>Incluye ñ, Ñ, ¡, ¿ y símbolos extendidos</Text>
                </View>
                <Switch
                  value={options.allowAllSpecialAndEnye}
                  onValueChange={(v) => updateOption('allowAllSpecialAndEnye', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.optionLabel}>Fácil de leer</Text>
                  <Text style={styles.optionHint}>Evita caracteres ambiguos (0, O, 1, l, I)</Text>
                </View>
                <Switch
                  value={options.easyToRead}
                  onValueChange={(v) => updateOption('easyToRead', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.optionLabel, styles.switchTextCol]}>Mayúsculas (A-Z)</Text>
                <Switch
                  value={options.includeUppercase}
                  onValueChange={(v) => updateOption('includeUppercase', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.optionLabel, styles.switchTextCol]}>Minúsculas (a-z)</Text>
                <Switch
                  value={options.includeLowercase}
                  onValueChange={(v) => updateOption('includeLowercase', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.optionLabel, styles.switchTextCol]}>Números (0-9)</Text>
                <Switch
                  value={options.includeNumbers}
                  onValueChange={(v) => updateOption('includeNumbers', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.optionLabel, styles.switchTextCol]}>Símbolos (!@#$%^&*)</Text>
                <Switch
                  value={options.includeSymbols}
                  onValueChange={(v) => updateOption('includeSymbols', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.usePasswordBtn}
            onPress={() => {
              onUsePassword(generatedPassword);
              onClose();
            }}
          >
            <Text style={styles.usePasswordBtnText}>Usar esta Contraseña</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 17, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  popupCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
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
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  passwordDisplayBox: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1,
    textAlign: 'center',
  },
  rightAlignedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  actionSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionSmallBtnSuccess: {
    borderColor: Colors.success,
  },
  actionSmallBtnText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  lengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 4,
  },
  stepBtn: {
    padding: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  lengthValue: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 26,
    textAlign: 'center',
  },
  quickLengthsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 16,
  },
  quickLengthPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
  },
  quickLengthPillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  quickLengthText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  quickLengthTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  switchesContainer: {
    gap: 12,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  optionLabel: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  optionHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  usePasswordBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  usePasswordBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 15,
  },
});