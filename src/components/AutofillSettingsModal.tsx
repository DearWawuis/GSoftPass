// src/components/AutofillSettingsModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  X,
  Smartphone,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Globe,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { VaultItem } from '../types/vault';
import { AutofillBridgeService } from '../services/AutofillBridgeService';

interface AutofillSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  items: VaultItem[];
  masterEmail: string;
  onSaveNewCapturedAccount?: (newItem: VaultItem) => void;
}

export const AutofillSettingsModal: React.FC<AutofillSettingsModalProps> = ({
  visible,
  onClose,
  items,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  const accountItemsCount = items.filter(
    (i) => i.type === 'account' || i.type === 'passkey'
  ).length;

  useEffect(() => {
    if (visible) {
      handleForceSync();
    }
  }, [visible, items]);

  const handleForceSync = async () => {
    setSyncing(true);
    await AutofillBridgeService.syncVaultWithSystemAutofill(items);
    setLastSyncCount(accountItemsCount);
    setTimeout(() => setSyncing(false), 400);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Smartphone size={22} color={Colors.primary} />
              <Text style={styles.title}>Servicio de Autocompletado</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.statusBox}>
            <CheckCircle2 size={22} color={Colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                Índice de Autocompletado Sincronizado
              </Text>
              <Text style={styles.statusSub}>
                {lastSyncCount} cuentas listas para autocompletar en Android y Microsoft Edge.
              </Text>
            </View>
            <TouchableOpacity style={styles.syncBtn} onPress={handleForceSync}>
              <RefreshCw size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Configuración Nativa en Android */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <ShieldCheck size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>1. Autocompletado Nativo en Android</Text>
            </View>
            <Text style={styles.sectionDesc}>
              Selecciona a GSoftPass como tu servicio predeterminado en los ajustes de Android.
              Al iniciar sesión o crear una cuenta en cualquier aplicación, Android mostrará la
              sugerencia sobre tu teclado y el diálogo para guardar contraseñas nuevas.
            </Text>

            <TouchableOpacity
              style={styles.primaryActionBtn}
              onPress={() => AutofillBridgeService.openAndroidAutofillSettings()}
            >
              <Text style={styles.primaryActionText}>
                Abrir Ajustes de Autocompletado de Android
              </Text>
              <ExternalLink size={16} color={Colors.background} />
            </TouchableOpacity>
          </View>

          {/* Estado en Extensión Microsoft Edge */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Globe size={18} color={Colors.accent} />
              <Text style={styles.sectionTitle}>2. Extensión para Microsoft Edge</Text>
            </View>
            <Text style={styles.sectionDesc}>
              {Platform.OS === 'web'
                ? 'El motor web de GSoftPass está activo. Las cuentas de tu bóveda se sincronizan automáticamente con el detector de formularios del navegador.'
                : 'Inicia sesión con tu misma cuenta en la extensión de Microsoft Edge para sincronizar tus cuentas en tu PC.'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 17, 0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 22,
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
    gap: 10,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: Colors.success,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  statusTitle: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  statusSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  syncBtn: {
    padding: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  sectionCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  sectionDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  primaryActionBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
});