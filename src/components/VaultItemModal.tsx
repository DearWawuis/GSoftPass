// src/components/VaultItemModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import {
  X,
  Wand2,
  Eye,
  EyeOff,
  Sparkles,
  FolderPlus,
  Trash2,
  Save,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { CustomFolder, VaultItem, VaultItemType } from '../types/vault';
import { IconAIService } from '../services/IconAIService';
import { PasswordGeneratorModal } from './PasswordGeneratorModal';

interface VaultItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: VaultItem, newFolder?: CustomFolder) => void;
  onDelete?: (id: string) => void;
  initialItem?: VaultItem | null;
  folders: CustomFolder[];
  defaultMasterEmail: string;
}

const ITEM_TYPES: { type: VaultItemType; label: string }[] = [
  { type: 'account', label: 'Cuenta / Contraseña' },
  { type: 'passkey', label: 'Clave de acceso' },
  { type: 'note', label: 'Nota segura' },
  { type: 'card', label: 'Tarjeta Crédito/Débito' },
  { type: 'bank', label: 'Cuenta Bancaria' },
  { type: 'contact', label: 'Contacto' },
];

export const VaultItemModal: React.FC<VaultItemModalProps> = ({
  visible,
  onClose,
  onSave,
  onDelete,
  initialItem,
  folders,
  defaultMasterEmail,
}) => {
  const [type, setType] = useState<VaultItemType>('account');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [masterEmail, setMasterEmail] = useState(defaultMasterEmail);
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [folderId, setFolderId] = useState(folders[0]?.id || 'games');
  const [brandColor, setBrandColor] = useState(Colors.accent);
  const [iconUrl, setIconUrl] = useState('');

  // Campos adicionales según tipo de elemento
  const [cardNumber, setCardNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [clabeOrIban, setClabeOrIban] = useState('');
  const [phone, setPhone] = useState('');

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (initialItem) {
      setType(initialItem.type);
      setName(initialItem.name);
      setUrl(initialItem.url || '');
      setUsername(initialItem.username || '');
      setMasterEmail(initialItem.masterEmail || defaultMasterEmail);
      setPassword(initialItem.password || '');
      setNotes(initialItem.notes || '');
      setFolderId(initialItem.folderId);
      setBrandColor(initialItem.brandColor || Colors.accent);
      setIconUrl(initialItem.iconUrl || '');
      setCardNumber(initialItem.cardNumber || '');
      setExpirationDate(initialItem.expirationDate || '');
      setCvv(initialItem.cvv || '');
      setBankAccountNumber(initialItem.bankAccountNumber || '');
      setClabeOrIban(initialItem.clabeOrIban || '');
      setPhone(initialItem.phone || '');
    } else {
      setType('account');
      setName('');
      setUrl('');
      setUsername('');
      setMasterEmail(defaultMasterEmail);
      setPassword('');
      setNotes('');
      setFolderId(folders[0]?.id || 'games');
      setBrandColor(Colors.accent);
      setIconUrl('');
      setCardNumber('');
      setExpirationDate('');
      setCvv('');
      setBankAccountNumber('');
      setClabeOrIban('');
      setPhone('');
    }
  }, [initialItem, visible]);

  // IA: Detecta automáticamente el icono, color y carpeta sugerida al escribir nombre o URL
  const handleAutoDetectBrand = (newName: string, newUrl: string) => {
    if (!newName && !newUrl) return;
    const prediction = IconAIService.predictBrand(newName, newUrl);
    setBrandColor(prediction.brandColor);
    setIconUrl(prediction.iconUrl);
    if (!initialItem && prediction.suggestedFolderId) {
      setFolderId(prediction.suggestedFolderId);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;

    let createdFolder: CustomFolder | undefined;
    let finalFolderId = folderId;

    if (creatingFolder && newFolderName.trim()) {
      createdFolder = {
        id: `folder_${Date.now()}`,
        name: newFolderName.trim(),
        icon: 'Folder',
      };
      finalFolderId = createdFolder.id;
    }

    const item: VaultItem = {
      id: initialItem ? initialItem.id : `item_${Date.now()}`,
      type,
      name: name.trim(),
      url: url.trim() || undefined,
      username: username.trim() || undefined,
      masterEmail: masterEmail.trim().toLowerCase() || defaultMasterEmail,
      password: password || undefined,
      folderId: finalFolderId,
      iconUrl: iconUrl || undefined,
      brandColor,
      notes: notes.trim() || undefined,
      cardNumber: cardNumber.trim() || undefined,
      expirationDate: expirationDate.trim() || undefined,
      cvv: cvv.trim() || undefined,
      bankAccountNumber: bankAccountNumber.trim() || undefined,
      clabeOrIban: clabeOrIban.trim() || undefined,
      phone: phone.trim() || undefined,
      createdAt: initialItem ? initialItem.createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    onSave(item, createdFolder);
    setCreatingFolder(false);
    setNewFolderName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {initialItem ? 'Detalles del Elemento' : 'Nuevo Elemento en Bóveda'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Selector de Tipo de Elemento */}
            <Text style={styles.label}>Tipo de elemento</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {ITEM_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.type}
                  style={[styles.typeChip, type === t.type && styles.typeChipActive]}
                  onPress={() => setType(t.type)}
                >
                  <Text style={[styles.typeChipText, type === t.type && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Preview de Icono Generado por IA + Nombre */}
            <View style={styles.brandPreviewRow}>
              <View style={[styles.iconBox, { backgroundColor: brandColor }]}>
                {iconUrl ? (
                  <Image source={{ uri: iconUrl }} style={styles.faviconImg} />
                ) : (
                  <Text style={styles.iconFallbackText}>
                    {name ? name.charAt(0).toUpperCase() : 'G'}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.aiLabelRow}>
                  <Text style={styles.label}>Nombre identificador</Text>
                  <View style={styles.aiBadge}>
                    <Sparkles size={12} color={Colors.primary} />
                    <Text style={styles.aiBadgeText}>Icono IA activo</Text>
                  </View>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Discord, Netflix, BBVA, Wi-Fi Casa..."
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={(txt) => {
                    setName(txt);
                    handleAutoDetectBrand(txt, url);
                  }}
                />
              </View>
            </View>

            {/* Campos para Cuenta / Contraseña o Clave de acceso */}
            {(type === 'account' || type === 'passkey') && (
              <>
                <Text style={styles.label}>URL o Aplicación donde se usará</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://aplicacion.com"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  value={url}
                  onChangeText={(txt) => {
                    setUrl(txt);
                    handleAutoDetectBrand(name, txt);
                  }}
                />

                <Text style={styles.label}>Nombre de usuario / Login</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Usuario o correo de inicio de sesión"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  value={username}
                  onChangeText={setUsername}
                />

                <Text style={styles.label}>
                  Correo "Maestro" (Agrupa todas las cuentas asociadas a este correo)
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="tu_correo_maestro@gmail.com"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  value={masterEmail}
                  onChangeText={setMasterEmail}
                />

                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.passwordInputRow}>
                  <View style={styles.passwordFieldWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Ingresa o genera una contraseña segura"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      {showPassword ? (
                        <EyeOff size={18} color={Colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={Colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.generatorTriggerBtn}
                    onPress={() => setShowGenerator(true)}
                  >
                    <Wand2 size={18} color={Colors.background} />
                    <Text style={styles.generatorTriggerText}>Generar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Campos para Tarjeta de Débito/Crédito */}
            {type === 'card' && (
              <>
                <Text style={styles.label}>Número de Tarjeta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor={Colors.textMuted}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  keyboardType="numeric"
                />
                <View style={styles.twoColumns}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Vencimiento (MM/AA)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="12/29"
                      placeholderTextColor={Colors.textMuted}
                      value={expirationDate}
                      onChangeText={setExpirationDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>CVV</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="123"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showPassword}
                      value={cvv}
                      onChangeText={setCvv}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Campos para Cuenta Bancaria */}
            {type === 'bank' && (
              <>
                <Text style={styles.label}>Número de Cuenta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Número de cuenta bancaria"
                  placeholderTextColor={Colors.textMuted}
                  value={bankAccountNumber}
                  onChangeText={setBankAccountNumber}
                />
                <Text style={styles.label}>CLABE Interbancaria / IBAN</Text>
                <TextInput
                  style={styles.input}
                  placeholder="18 dígitos CLABE"
                  placeholderTextColor={Colors.textMuted}
                  value={clabeOrIban}
                  onChangeText={setClabeOrIban}
                />
              </>
            )}

            {/* Campos para Contacto */}
            {type === 'contact' && (
              <>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+52 55 0000 0000"
                  placeholderTextColor={Colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                />
                <Text style={styles.label}>Correo de contacto</Text>
                <TextInput
                  style={styles.input}
                  placeholder="contacto@correo.com"
                  placeholderTextColor={Colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                />
              </>
            )}

            {/* Selección o creación de Carpeta / Filtro */}
            <View style={styles.folderHeaderRow}>
              <Text style={styles.label}>Guardar en Carpeta / Filtro</Text>
              <TouchableOpacity
                style={styles.newFolderToggle}
                onPress={() => setCreatingFolder(!creatingFolder)}
              >
                <FolderPlus size={14} color={Colors.primary} />
                <Text style={styles.newFolderToggleText}>
                  {creatingFolder ? 'Elegir existente' : '+ Crear carpeta'}
                </Text>
              </TouchableOpacity>
            </View>

            {creatingFolder ? (
              <TextInput
                style={styles.input}
                placeholder="Nombre de la nueva carpeta (Ej. Trabajo, Streaming...)"
                placeholderTextColor={Colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
              />
            ) : (
              <View style={styles.foldersGrid}>
                {folders.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.folderChip, folderId === f.id && styles.folderChipActive]}
                    onPress={() => setFolderId(f.id)}
                  >
                    <Text
                      style={[
                        styles.folderChipText,
                        folderId === f.id && styles.folderChipTextActive,
                      ]}
                    >
                      {f.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Nota referente a la cuenta */}
            <Text style={styles.label}>Nota (Opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Agrega detalles extra, preguntas de seguridad o pines..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>

          {/* Footer de acciones */}
          <View style={styles.footer}>
            {initialItem && onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  onDelete(initialItem.id);
                  onClose();
                }}
              >
                <Trash2 size={18} color={Colors.danger} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Save size={18} color={Colors.background} />
              <Text style={styles.saveBtnText}>Guardar en Bóveda</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Pop-up Generador de Contraseñas */}
      <PasswordGeneratorModal
        visible={showGenerator}
        onClose={() => setShowGenerator(false)}
        onUsePassword={(pwd) => setPassword(pwd)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 17, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '92%',
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
    marginBottom: 14,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  scrollBody: {
    marginBottom: 14,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  typeScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderColor: Colors.primary,
  },
  typeChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: Colors.primary,
  },
  brandPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
  },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  faviconImg: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  iconFallbackText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
  },
  aiLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    color: Colors.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  passwordFieldWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordInput: {
    flex: 1,
    color: Colors.textPrimary,
    paddingVertical: 12,
    fontSize: 14,
  },
  generatorTriggerBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
  },
  generatorTriggerText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  folderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  newFolderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newFolderToggleText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  folderChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  folderChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: Colors.accent,
  },
  folderChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  folderChipTextActive: {
    color: '#A5B4FC',
  },
  textArea: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  deleteBtn: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
});