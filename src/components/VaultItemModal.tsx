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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  X,
  Wand2,
  Eye,
  EyeOff,
  Trash2,
  FolderPlus,
  Sparkles,
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

const ITEM_TYPES: { id: VaultItemType; label: string }[] = [
  { id: 'account', label: 'Cuenta / App' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'bank', label: 'Banco' },
  { id: 'note', label: 'Nota Segura' },
  { id: 'contact', label: 'Contacto' },
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
  const [password, setPassword] = useState('');
  const [masterEmail, setMasterEmail] = useState(defaultMasterEmail);
  const [folderId, setFolderId] = useState<string>(folders[0]?.id || 'games');
  const [notes, setNotes] = useState('');

  // Campos de Tarjeta / Banco / Contacto
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [bankName, setBankName] = useState('');
  const [clabeOrIban, setClabeOrIban] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [generatorVisible, setGeneratorVisible] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setValidationError('');
    if (initialItem) {
      setType(initialItem.type || 'account');
      setName(initialItem.name || '');
      setUrl(initialItem.url || '');
      setUsername(initialItem.username || '');
      setPassword(initialItem.password || '');
      setMasterEmail(initialItem.masterEmail || defaultMasterEmail);
      setFolderId(initialItem.folderId || folders[0]?.id || 'games');
      setNotes(initialItem.notes || '');
      setCardHolder(initialItem.cardHolder || '');
      setCardNumber(initialItem.cardNumber || '');
      setExpirationDate(initialItem.expirationDate || '');
      setCvv(initialItem.cvv || '');
      setBankName(initialItem.bankName || '');
      setClabeOrIban(initialItem.clabeOrIban || '');
      setContactPhone(initialItem.contactPhone || '');
    } else {
      setType('account');
      setName('');
      setUrl('');
      setUsername(defaultMasterEmail);
      setPassword('');
      setMasterEmail(defaultMasterEmail);
      setFolderId(folders[0]?.id || 'games');
      setNotes('');
      setCardHolder('');
      setCardNumber('');
      setExpirationDate('');
      setCvv('');
      setBankName('');
      setClabeOrIban('');
      setContactPhone('');
    }
    setCreatingFolder(false);
    setNewFolderName('');
  }, [initialItem, visible, defaultMasterEmail]);

  const aiPrediction = IconAIService.predictBrandMetadata(name, url);

  const handleNameChange = (val: string) => {
    setName(val);
    if (validationError) setValidationError('');
    const pred = IconAIService.predictBrandMetadata(val, url);
    if (!initialItem && pred.suggestedFolderId) {
      setFolderId(pred.suggestedFolderId);
    }
    if (!url && pred.cleanDomain) {
      setUrl(`https://${pred.cleanDomain}`);
    }
  };

  const handleSavePress = () => {
    const cleanName = name.trim() || bankName.trim() || url.trim();
    if (!cleanName) {
      setValidationError('Escribe el nombre de la cuenta, sitio web o elemento.');
      return;
    }

    let createdFolder: CustomFolder | undefined;
    let targetFolderId = folderId;

    if (creatingFolder && newFolderName.trim()) {
      createdFolder = {
        id: `folder_${Date.now()}`,
        name: newFolderName.trim(),
        icon: 'Folder',
      };
      targetFolderId = createdFolder.id;
    }

    const newItem: VaultItem = {
      id: initialItem?.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      name: cleanName,
      url: url.trim(),
      username: username.trim(),
      password,
      masterEmail: masterEmail.trim() || defaultMasterEmail,
      folderId: targetFolderId,
      notes: notes.trim(),
      iconUrl: aiPrediction.iconUrl || '',
      brandColor: aiPrediction.brandColor || '#6366F1',
      cardHolder: cardHolder.trim(),
      cardNumber: cardNumber.trim(),
      expirationDate: expirationDate.trim(),
      cvv: cvv.trim(),
      bankName: bankName.trim(),
      clabeOrIban: clabeOrIban.trim(),
      contactPhone: contactPhone.trim(),
      createdAt: initialItem?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(newItem, createdFolder);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.brandPreviewRow}>
              <View
                style={[
                  styles.iconPreview,
                  { backgroundColor: aiPrediction.brandColor || Colors.accent },
                ]}
              >
                {aiPrediction.iconUrl ? (
                  <Image source={{ uri: aiPrediction.iconUrl }} style={styles.faviconImg} />
                ) : (
                  <Sparkles size={18} color="#FFF" />
                )}
              </View>
              <View>
                <Text style={styles.headerTitle}>
                  {initialItem ? 'Editar Elemento' : 'Nuevo en Bóveda'}
                </Text>
                <Text style={styles.headerSubtitle}>Cifrado local AES-256 + Sincronización Nube</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
            showsVerticalScrollIndicator={false}
          >
            {validationError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{validationError}</Text>
              </View>
            ) : null}

            {/* Selector de tipo de elemento */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
            >
              {ITEM_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typePill, type === t.id && styles.typePillActive]}
                  onPress={() => setType(t.id)}
                >
                  <Text style={[styles.typePillText, type === t.id && styles.typePillTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Nombre de la Cuenta o Elemento *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Twitch, GitHub, Netflix, BBVA..."
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={handleNameChange}
            />

            {type === 'account' && (
              <>
                <Text style={styles.label}>Sitio Web / URL o App</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://www.ejemplo.com"
                  placeholderTextColor={Colors.textMuted}
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Nombre de Usuario o Correo de Login</Text>
                <TextInput
                  style={styles.input}
                  placeholder="usuario o correo@ejemplo.com"
                  placeholderTextColor={Colors.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.passwordRow}>
                  <View style={styles.passwordInputBox}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="••••••••••••"
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
                    style={styles.generateBtn}
                    onPress={() => setGeneratorVisible(true)}
                  >
                    <Wand2 size={16} color={Colors.background} />
                    <Text style={styles.generateBtnText}>Generar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {type === 'card' && (
              <>
                <Text style={styles.label}>Titular de la Tarjeta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre como aparece en la tarjeta"
                  placeholderTextColor={Colors.textMuted}
                  value={cardHolder}
                  onChangeText={setCardHolder}
                />
                <Text style={styles.label}>Número de Tarjeta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  value={cardNumber}
                  onChangeText={setCardNumber}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Vencimiento (MM/AA)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="08/29"
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
                      keyboardType="number-pad"
                      value={cvv}
                      onChangeText={setCvv}
                    />
                  </View>
                </View>
              </>
            )}

            {type === 'bank' && (
              <>
                <Text style={styles.label}>Institución Bancaria</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. BBVA, Santander, Nu..."
                  placeholderTextColor={Colors.textMuted}
                  value={bankName}
                  onChangeText={setBankName}
                />
                <Text style={styles.label}>CLABE Interbancaria / IBAN / Cuenta</Text>
                <TextInput
                  style={styles.input}
                  placeholder="18 dígitos CLABE o número de cuenta"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  value={clabeOrIban}
                  onChangeText={setClabeOrIban}
                />
              </>
            )}

            {type === 'contact' && (
              <>
                <Text style={styles.label}>Teléfono de Contacto</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+52 55 0000 0000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                />
              </>
            )}

            <Text style={styles.label}>Correo Maestro Asociado (Para Agrupación)</Text>
            <TextInput
              style={styles.input}
              placeholder="correo_maestro@ejemplo.com"
              placeholderTextColor={Colors.textMuted}
              value={masterEmail}
              onChangeText={setMasterEmail}
              autoCapitalize="none"
            />

            {/* Selección o Creación de Carpeta */}
            <View style={styles.folderHeaderRow}>
              <Text style={styles.label}>Carpeta / Categoría</Text>
              <TouchableOpacity
                style={styles.newFolderBtn}
                onPress={() => setCreatingFolder(!creatingFolder)}
              >
                <FolderPlus size={14} color={Colors.primary} />
                <Text style={styles.newFolderBtnText}>
                  {creatingFolder ? 'Elegir existente' : '+ Crear carpeta'}
                </Text>
              </TouchableOpacity>
            </View>

            {creatingFolder ? (
              <TextInput
                style={styles.input}
                placeholder="Nombre de la nueva carpeta (ej. Streaming, Trabajo...)"
                placeholderTextColor={Colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
              />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 12 }}
              >
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
              </ScrollView>
            )}

            <Text style={styles.label}>Notas Seguras</Text>
            <TextInput
              style={[styles.input, { height: 76, textAlignVertical: 'top' }]}
              placeholder="Códigos de recuperación, preguntas de seguridad o detalles..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>

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

            <TouchableOpacity style={styles.saveBtn} onPress={handleSavePress}>
              <Save size={18} color={Colors.background} />
              <Text style={styles.saveBtnText}>Guardar en Bóveda</Text>
            </TouchableOpacity>
          </View>

          <PasswordGeneratorModal
            visible={generatorVisible}
            onClose={() => setGeneratorVisible(false)}
            onUsePassword={(pwd) => setPassword(pwd)}
          />
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
  modalCard: {
    width: '100%',
    maxWidth: 500,
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
  brandPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconPreview: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconImg: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  body: {
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  typeScroll: {
    marginBottom: 14,
  },
  typePill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typePillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderColor: Colors.primary,
  },
  typePillText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  typePillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    color: Colors.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  passwordInputBox: {
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
    fontSize: 14,
    paddingVertical: 11,
  },
  generateBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  generateBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  folderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newFolderBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  folderChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  folderChipActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  folderChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  folderChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
});