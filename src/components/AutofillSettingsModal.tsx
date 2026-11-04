// src/components/AutofillSettingsModal.tsx
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
  AppState,
} from 'react-native';
import {
  X,
  Smartphone,
  Keyboard,
  ListFilter,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { VaultItem } from '../types/vault';
import { AutofillBridgeService, AutofillPreferences } from '../services/AutofillBridgeService';

interface AutofillSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  items: VaultItem[];
  masterEmail: string;
  onSaveNewCapturedAccount: (item: VaultItem) => void;
}

export const AutofillSettingsModal: React.FC<AutofillSettingsModalProps> = ({
  visible,
  onClose,
  items,
}) => {
  const [serviceActive, setServiceActive] = useState(false);
  const [prefs, setPrefs] = useState<AutofillPreferences>({
    inlineAutofillEnabled: true,
    dropdownAutofillEnabled: true,
  });

  const refreshStatus = async () => {
    const isEnabled = await AutofillBridgeService.isAndroidAutofillEnabled();
    setServiceActive(isEnabled);
    const savedPrefs = await AutofillBridgeService.getPreferences();
    setPrefs(savedPrefs);
    await AutofillBridgeService.syncVaultWithSystemAutofill(items);
  };

  useEffect(() => {
    if (visible) {
      refreshStatus();
    }
  }, [visible, items]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && visible) {
        refreshStatus();
      }
    });
    return () => sub.remove();
  }, [visible]);

  const handleActivateAutofill = async () => {
    await AutofillBridgeService.syncVaultWithSystemAutofill(items);
    await AutofillBridgeService.openAndroidAutofillSettings();
  };

  const handleToggleOption = async (key: keyof AutofillPreferences, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await AutofillBridgeService.savePreferences(updated, items);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Smartphone size={22} color={Colors.primary} />
              <Text style={styles.title}>Configuración de Autocompletar</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* OPCIÓN 1 DE LASTPASS: Activar Autocompletar */}
            <View style={styles.optionCard}>
              <View style={styles.optionRow}>
                <View style={styles.optionTextCol}>
                  <View style={styles.badgeTitleRow}>
                    <Text style={styles.optionTitle}>Activar Autocompletar</Text>
                    {serviceActive && (
                      <View style={styles.activeBadge}>
                        <CheckCircle2 size={12} color={Colors.success} />
                        <Text style={styles.activeBadgeText}>Activo</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.optionDesc}>
                    Abre la configuración de tu celular para escoger a GSoftPass como el servicio
                    preferido para guardar e introducir contraseñas, claves de acceso e información
                    de autorrellenado.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleActivateAutofill}
              >
                <ShieldCheck size={18} color={Colors.background} />
                <Text style={styles.primaryActionBtnText}>
                  {serviceActive
                    ? 'Cambiar o Verificar Servicio Preferido'
                    : 'Activar Autocompletar en Android'}
                </Text>
                <ExternalLink size={15} color={Colors.background} />
              </TouchableOpacity>
            </View>

            {/* OPCIÓN 2 DE LASTPASS: Usar autocompletar en línea (Encima del teclado) */}
            <View style={styles.optionCard}>
              <View style={styles.optionRow}>
                <View style={styles.iconCircle}>
                  <Keyboard size={20} color={Colors.primary} />
                </View>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionTitle}>Usar autocompletar en línea</Text>
                  <Text style={styles.optionDesc}>
                    Para mostrar las sugerencias de autocompletar encima del teclado (compatible con
                    Gboard, Samsung Keyboard y SwiftKey en Android 11+).
                  </Text>
                </View>
                <Switch
                  value={prefs.inlineAutofillEnabled}
                  onValueChange={(v) => handleToggleOption('inlineAutofillEnabled', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>
            </View>

            {/* OPCIÓN 3 DE LASTPASS: Usar menú desplegable (Junto a los campos) */}
            <View style={styles.optionCard}>
              <View style={styles.optionRow}>
                <View style={styles.iconCircle}>
                  <ListFilter size={20} color={Colors.accent} />
                </View>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionTitle}>Usar menú desplegable</Text>
                  <Text style={styles.optionDesc}>
                    Para mostrar las sugerencias de autocompletar en un menú desplegable junto a los
                    campos de usuario y contraseña en aplicaciones como Twitch, redes sociales y
                    navegadores.
                  </Text>
                </View>
                <Switch
                  value={prefs.dropdownAutofillEnabled}
                  onValueChange={(v) => handleToggleOption('dropdownAutofillEnabled', v)}
                  trackColor={{ false: Colors.surfaceLight, true: Colors.primary }}
                />
              </View>
            </View>

            <View style={styles.syncStatusBox}>
              <Text style={styles.syncStatusText}>
                ✓ {items.length} cuentas sincronizadas con el motor de autorrellenado y el pop-up
                inferior de guardado automático.
              </Text>
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
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
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
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  optionCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextCol: {
    flex: 1,
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  optionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  optionDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadgeText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  primaryActionBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  syncStatusBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  syncStatusText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});