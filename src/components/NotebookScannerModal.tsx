// src/components/NotebookScannerModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Camera,
  Sparkles,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../theme/colors';
import { NotebookOCRService, ScannedAccountResult } from '../services/NotebookOCRService';
import { VaultItem } from '../types/vault';

interface NotebookScannerModalProps {
  visible: boolean;
  onClose: () => void;
  defaultMasterEmail: string;
  onImportAccounts: (newItems: VaultItem[]) => void;
}

export const NotebookScannerModal: React.FC<NotebookScannerModalProps> = ({
  visible,
  onClose,
  defaultMasterEmail,
  onImportAccounts,
}) => {
  const [ocrText, setOcrText] = useState('');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [detectedAccounts, setDetectedAccounts] = useState<ScannedAccountResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const processImageWithOCR = async (base64Image?: string | null, uri?: string) => {
    if (uri) setCapturedUri(uri);
    setIsProcessing(true);
    setErrorMsg('');

    try {
      if (base64Image) {
        // Llamada a API de OCR gratuita (OCR.space API para lectura de texto en imágenes)
        const formData = new FormData();
        formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
        formData.append('language', 'spa');
        formData.append('OCREngine', '2');

        const response = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: { apikey: 'helloworld' },
          body: formData,
        });
        const result = await response.json();
        const extracted = result?.ParsedResults?.[0]?.ParsedText?.trim();

        if (extracted) {
          handleAnalyzeText(extracted);
        } else {
          setErrorMsg(
            'No se pudo distinguir texto claro en la foto. Intenta con más iluminación o escríbelo abajo.'
          );
        }
      }
    } catch {
      setErrorMsg('No se pudo conectar al motor OCR. Verifica tu conexión a internet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenCamera = async () => {
    setErrorMsg('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg('Permiso de cámara denegado. Actívalo en los ajustes de tu dispositivo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      await processImageWithOCR(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const handlePickFromGallery = async () => {
    setErrorMsg('');
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      base64: true,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      await processImageWithOCR(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const handleAnalyzeText = (text: string) => {
    setOcrText(text);
    const parsed = NotebookOCRService.parseNotebookText(text, defaultMasterEmail);
    setDetectedAccounts(parsed);
  };

  const handleSaveAll = () => {
    if (detectedAccounts.length === 0) return;

    const newVaultItems: VaultItem[] = detectedAccounts.map((acc, idx) => ({
      id: `scan_${Date.now()}_${idx}`,
      type: 'account',
      name: acc.name,
      url: acc.url,
      username: acc.username,
      masterEmail: acc.masterEmail || defaultMasterEmail,
      password: acc.password,
      folderId: acc.suggestedFolderId || 'games',
      iconUrl: acc.iconUrl,
      brandColor: acc.brandColor,
      notes: acc.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    onImportAccounts(newVaultItems);
    setOcrText('');
    setCapturedUri(null);
    setDetectedAccounts([]);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Camera size={22} color={Colors.primary} />
              <Text style={styles.title}>Escáner de Libreta (OCR)</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Fotografía tus contraseñas anotadas en papel o selecciona una imagen de tu galería para
            extraerlas y cifrarlas en tu bóveda.
          </Text>

          <View style={styles.cameraActionsRow}>
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={handleOpenCamera}
              disabled={isProcessing}
            >
              <Camera size={18} color={Colors.background} />
              <Text style={styles.cameraBtnText}>Tomar Foto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={handlePickFromGallery}
              disabled={isProcessing}
            >
              <ImageIcon size={18} color={Colors.primary} />
              <Text style={styles.galleryBtnText}>Subir de Galería</Text>
            </TouchableOpacity>
          </View>

          {isProcessing && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.loadingText}>Extrayendo credenciales de la imagen...</Text>
            </View>
          )}

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {capturedUri && (
              <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
            )}

            <View style={styles.labelRow}>
              <FileText size={14} color={Colors.textSecondary} />
              <Text style={styles.label}>
                Texto extraído (puedes corregirlo o pegar múltiples cuentas separadas por ---)
              </Text>
            </View>

            <TextInput
              style={styles.ocrInput}
              multiline
              placeholder={`Formato reconocido:\nApp: Nombre\nUsuario: ${defaultMasterEmail}\nContraseña: TuClave`}
              placeholderTextColor={Colors.textMuted}
              value={ocrText}
              onChangeText={handleAnalyzeText}
            />

            {detectedAccounts.length > 0 && (
              <View style={styles.previewSection}>
                <View style={styles.previewHeader}>
                  <Sparkles size={15} color={Colors.primary} />
                  <Text style={styles.previewTitle}>
                    Cuentas listas para importar ({detectedAccounts.length})
                  </Text>
                </View>

                {detectedAccounts.map((acc, index) => (
                  <View key={index} style={styles.detectedCard}>
                    <View style={[styles.iconBox, { backgroundColor: acc.brandColor }]}>
                      <Image source={{ uri: acc.iconUrl }} style={styles.favicon} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detectedName}>{acc.name}</Text>
                      <Text style={styles.detectedUser}>{acc.username}</Text>
                      <Text style={styles.detectedPass}>Contraseña: {acc.password}</Text>
                    </View>
                    <CheckCircle2 size={20} color={Colors.success} />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.importBtn, detectedAccounts.length === 0 && { opacity: 0.5 }]}
            disabled={detectedAccounts.length === 0}
            onPress={handleSaveAll}
          >
            <Text style={styles.importBtnText}>
              Guardar {detectedAccounts.length} Cuenta(s) en Bóveda
            </Text>
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
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
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
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  cameraActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  cameraBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
  galleryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  galleryBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: 130,
    borderRadius: 12,
    marginBottom: 12,
  },
  scrollArea: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  ocrInput: {
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    borderRadius: 12,
    padding: 14,
    minHeight: 110,
    textAlignVertical: 'top',
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  previewSection: {
    gap: 10,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  previewTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  detectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favicon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  detectedName: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  detectedUser: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  detectedPass: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  importBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  importBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 15,
  },
});