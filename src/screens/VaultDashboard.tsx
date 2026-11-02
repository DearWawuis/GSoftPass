// src/screens/VaultDashboard.tsx
import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {
  Search,
  Plus,
  Copy,
  Check,
  Layers,
  Folder,
  Wand2,
  ChevronDown,
  ChevronRight,
  Mail,
  Globe,
  ScanLine,
  Smartphone,
  X,
} from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { CustomFolder, VaultItem } from '../types/vault';
import { VaultItemModal } from '../components/VaultItemModal';
import { PasswordGeneratorModal } from '../components/PasswordGeneratorModal';
import { NotebookScannerModal } from '../components/NotebookScannerModal';
import { AutofillSettingsModal } from '../components/AutofillSettingsModal';
import { AutofillBridgeService } from '../services/AutofillBridgeService';

interface VaultDashboardProps {
  masterEmail: string;
  items: VaultItem[];
  folders: CustomFolder[];
  onUpdateVault: (items: VaultItem[], folders: CustomFolder[]) => void;
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  masterEmail,
  items,
  folders,
  onUpdateVault,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 680;
  const searchInputRef = useRef<TextInput>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('ALL');
  const [groupByMasterEmail, setGroupByMasterEmail] = useState<boolean>(true);
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados de Modales
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [standaloneGenerator, setStandaloneGenerator] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [autofillModalVisible, setAutofillModalVisible] = useState(false);

  React.useEffect(() => {
    AutofillBridgeService.syncVaultWithSystemAutofill(items);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFolder = selectedFolderId === 'ALL' || item.folderId === selectedFolderId;
      if (!matchesFolder) return false;
      if (!q) return true;

      return (
        item.name.toLowerCase().includes(q) ||
        (item.url && item.url.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.masterEmail && item.masterEmail.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    });
  }, [items, searchQuery, selectedFolderId]);

  const groupedByEmail = useMemo(() => {
    const groups: Record<string, VaultItem[]> = {};
    filteredItems.forEach((item) => {
      const key = item.masterEmail || masterEmail || 'Sin correo asociado';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems, masterEmail]);

  const handleCopyPassword = async (item: VaultItem) => {
    const textToCopy = item.password || item.cardNumber || item.clabeOrIban || item.notes || '';
    if (!textToCopy) return;
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(textToCopy);
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(item.id);
    }
  };

  const handleSaveItem = (savedItem: VaultItem, newFolder?: CustomFolder) => {
    const updatedFolders = newFolder ? [...folders, newFolder] : folders;
    const exists = items.some((i) => i.id === savedItem.id);
    const updatedItems = exists
      ? items.map((i) => (i.id === savedItem.id ? savedItem : i))
      : [savedItem, ...items];

    onUpdateVault(updatedItems, updatedFolders);
  };

  const handleDeleteItem = (id: string) => {
    const updatedItems = items.filter((i) => i.id !== id);
    onUpdateVault(updatedItems, folders);
  };

  const toggleEmailGroup = (emailKey: string) => {
    setExpandedEmails((prev) => ({
      ...prev,
      [emailKey]: prev[emailKey] === undefined ? false : !prev[emailKey],
    }));
  };

  const renderVaultCard = (item: VaultItem) => {
    const folderName = folders.find((f) => f.id === item.folderId)?.name || 'General';
    const isCopied = copiedId === item.id;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.vaultCard}
        activeOpacity={0.8}
        onPress={() => {
          setEditingItem(item);
          setItemModalVisible(true);
        }}
      >
        <View style={[styles.cardIconBox, { backgroundColor: item.brandColor || Colors.accent }]}>
          {item.iconUrl ? (
            <Image source={{ uri: item.iconUrl }} style={styles.cardFavicon} />
          ) : (
            <Text style={styles.cardIconLetter}>{item.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.folderTag}>
              <Text style={styles.folderTagText}>{folderName}</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.username || item.url || item.cardNumber || 'Ver detalles seguros'}
          </Text>
          {item.url ? (
            <View style={styles.urlRow}>
              <Globe size={11} color={Colors.textMuted} />
              <Text style={styles.urlText} numberOfLines={1}>
                {item.url}
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.copyIconBtn, isCopied && styles.copyIconBtnSuccess]}
          onPress={() => handleCopyPassword(item)}
          accessibilityLabel="Copiar contraseña"
        >
          {isCopied ? (
            <Check size={18} color={Colors.success} />
          ) : (
            <Copy size={18} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* SECCIÓN SUPERIOR RESPONSIVA: En celular separa el Buscador arriba y los Botones abajo */}
      <View style={[styles.topWrapper, !isMobile && styles.topWrapperDesktop]}>
        {/* 1. Barra de Búsqueda amplia y tocable en toda su área */}
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.searchBox, !isMobile && { flex: 1, marginBottom: 0 }]}
          onPress={() => searchInputRef.current?.focus()}
        >
          <Search size={18} color={Colors.primary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Buscar por correo, URL o nombre..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* 2. Fila de Botones de Herramientas y "+ Nueva Cuenta" sin amontonarse */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setStandaloneGenerator(true)}
            accessibilityLabel="Abrir Generador de Contraseñas"
          >
            <Wand2 size={18} color={Colors.primary} />
            {isMobile && <Text style={styles.toolBtnLabel}>Generar</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setScannerVisible(true)}
            accessibilityLabel="Escanear libreta"
          >
            <ScanLine size={18} color={Colors.primary} />
            {isMobile && <Text style={styles.toolBtnLabel}>Escáner</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setAutofillModalVisible(true)}
            accessibilityLabel="Configurar Autocompletado"
          >
            <Smartphone size={18} color={Colors.primary} />
            {isMobile && <Text style={styles.toolBtnLabel}>Autofill</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              setEditingItem(null);
              setItemModalVisible(true);
            }}
            accessibilityLabel="Crear Nueva Cuenta"
          >
            <Plus size={18} color={Colors.background} />
            <Text style={styles.addBtnText}>Nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTROS DE CARPETAS Y AGRUPACIÓN POR CORREO MAESTRO */}
      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.foldersScrollContent}
        >
          <TouchableOpacity
            style={[styles.filterPill, selectedFolderId === 'ALL' && styles.filterPillActive]}
            onPress={() => setSelectedFolderId('ALL')}
          >
            <Text
              style={[
                styles.filterPillText,
                selectedFolderId === 'ALL' && styles.filterPillTextActive,
              ]}
            >
              Todas ({items.length})
            </Text>
          </TouchableOpacity>

          {folders.map((folder) => (
            <TouchableOpacity
              key={folder.id}
              style={[
                styles.filterPill,
                selectedFolderId === folder.id && styles.filterPillActive,
              ]}
              onPress={() => setSelectedFolderId(folder.id)}
            >
              <Folder
                size={13}
                color={selectedFolderId === folder.id ? Colors.primary : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterPillText,
                  selectedFolderId === folder.id && styles.filterPillTextActive,
                ]}
              >
                {folder.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.groupToggleBtn, groupByMasterEmail && styles.groupToggleBtnActive]}
          onPress={() => setGroupByMasterEmail(!groupByMasterEmail)}
        >
          <Layers size={15} color={groupByMasterEmail ? Colors.primary : Colors.textSecondary} />
          <Text
            style={[
              styles.groupToggleText,
              groupByMasterEmail && { color: Colors.primary, fontWeight: '700' },
            ]}
          >
            Agrupar por Correo Maestro
          </Text>
        </TouchableOpacity>
      </View>

      {/* LISTA DE CUENTAS DE LA BÓVEDA */}
      <ScrollView
        style={styles.vaultList}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Tu bóveda está lista</Text>
            <Text style={styles.emptySubtitle}>
              Presiona el botón "+ Nueva" para guardar tu primera cuenta o usa el Escáner.
            </Text>
          </View>
        ) : groupByMasterEmail ? (
          Object.entries(groupedByEmail).map(([emailKey, groupItems]) => {
            const isExpanded = expandedEmails[emailKey] ?? true;
            return (
              <View key={emailKey} style={styles.emailGroupSection}>
                <TouchableOpacity
                  style={styles.emailGroupHeader}
                  onPress={() => toggleEmailGroup(emailKey)}
                >
                  <View style={styles.emailHeaderLeft}>
                    {isExpanded ? (
                      <ChevronDown size={18} color={Colors.primary} />
                    ) : (
                      <ChevronRight size={18} color={Colors.textSecondary} />
                    )}
                    <Mail size={16} color={Colors.accent} />
                    <Text style={styles.emailGroupTitle} numberOfLines={1}>
                      {emailKey}
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{groupItems.length}</Text>
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.emailGroupBody}>
                    {groupItems.map((item) => renderVaultCard(item))}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          filteredItems.map((item) => renderVaultCard(item))
        )}
      </ScrollView>

      {/* Modales */}
      <VaultItemModal
        visible={itemModalVisible}
        onClose={() => setItemModalVisible(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        initialItem={editingItem}
        folders={folders}
        defaultMasterEmail={masterEmail}
      />

      <PasswordGeneratorModal
        visible={standaloneGenerator}
        onClose={() => setStandaloneGenerator(false)}
        onUsePassword={() => setStandaloneGenerator(false)}
      />

      <NotebookScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        defaultMasterEmail={masterEmail}
        onImportAccounts={(newScannedItems) => {
          onUpdateVault([...newScannedItems, ...items], folders);
        }}
      />

      <AutofillSettingsModal
        visible={autofillModalVisible}
        onClose={() => setAutofillModalVisible(false)}
        items={items}
        masterEmail={masterEmail}
        onSaveNewCapturedAccount={(newItem) => {
          onUpdateVault([newItem, ...items], folders);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  topWrapper: {
    marginBottom: 12,
  },
  topWrapperDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    marginLeft: 10,
    height: '100%',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolBtn: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toolBtnLabel: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  addBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  addBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  filtersContainer: {
    marginBottom: 12,
    gap: 8,
  },
  foldersScrollContent: {
    paddingVertical: 2,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: Colors.primary,
  },
  filterPillText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  groupToggleBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupToggleBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  groupToggleText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  vaultList: {
    flex: 1,
  },
  emailGroupSection: {
    marginBottom: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  emailGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
  },
  emailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  emailGroupTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  countBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
  },
  emailGroupBody: {
    padding: 10,
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardFavicon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  cardIconLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  folderTag: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  folderTagText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  urlText: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  copyIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIconBtnSuccess: {
    borderWidth: 1,
    borderColor: Colors.success,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});