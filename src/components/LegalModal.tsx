// src/components/LegalModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { X, ShieldCheck, FileText, Lock } from 'lucide-react-native';
import { Colors } from '../theme/colors';

interface LegalModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

export const LegalModal: React.FC<LegalModalProps> = ({
  visible,
  onClose,
  initialTab = 'privacy',
}) => {
  const [tab, setTab] = useState<'privacy' | 'terms'>(initialTab);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <ShieldCheck size={22} color={Colors.primary} />
              <Text style={styles.title}>Centro Legal y Privacidad</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Selector de Pestaña */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'privacy' && styles.tabBtnActive]}
              onPress={() => setTab('privacy')}
            >
              <Lock size={15} color={tab === 'privacy' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.tabText, tab === 'privacy' && styles.tabTextActive]}>
                Aviso de Privacidad
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'terms' && styles.tabBtnActive]}
              onPress={() => setTab('terms')}
            >
              <FileText size={15} color={tab === 'terms' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.tabText, tab === 'terms' && styles.tabTextActive]}>
                Términos y Condiciones
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {tab === 'privacy' ? (
              <View style={styles.legalSection}>
                <Text style={styles.UpdateDate}>Última actualización: Noviembre 2026</Text>

                <Text style={styles.h2}>1. Arquitectura de Conocimiento Cero (Zero-Knowledge)</Text>
                <Text style={styles.p}>
                  GSoftPass opera bajo un modelo estricto de Conocimiento Cero (Zero-Knowledge).
                  Toda la información almacenada en tu bóveda (contraseñas, claves de acceso, notas
                  seguras, tarjetas, cuentas bancarias y contactos) se cifra y descifra
                  exclusivamente en tu dispositivo local mediante el estándar criptográfico AES-256
                  y derivación de clave PBKDF2-HMAC-SHA256 antes de sincronizarse con la nube.
                </Text>
                <Text style={styles.p}>
                  Tu Contraseña Maestra jamás se transmite, almacena ni es accesible para GSoftPass
                  ni para ningún tercero. Solo tú puedes desbloquear tu bóveda.
                </Text>

                <Text style={styles.h2}>2. Uso de Permisos Sensibles en Android y Web</Text>
                <Text style={styles.p}>
                  • Servicio de Autocompletado (BIND_AUTOFILL_SERVICE): Se utiliza exclusivamente
                  para identificar campos de inicio de sesión o registro en aplicaciones y sitios
                  web cuando tú lo solicitas, permitiéndote rellenar tus cuentas guardadas o
                  almacenar nuevas credenciales en tu bóveda cifrada. GSoftPass no monitorea ni
                  recopila tu historial de navegación.
                </Text>
                <Text style={styles.p}>
                  • Cámara y Galería (android.permission.CAMERA): Se utiliza únicamente cuando
                  activas de forma manual la función "Escáner de Libreta (OCR)" para digitalizar
                  contraseñas escritas en papel. Las imágenes no se almacenan en ningún servidor.
                </Text>

                <Text style={styles.h2}>3. Almacenamiento, Retención y Eliminación de Datos</Text>
                <Text style={styles.p}>
                  Los datos sincronizados en Firebase Cloud Firestore consisten únicamente en
                  bloques de texto cifrado (blobs AES-256) asociados a tu correo electrónico.
                  Puedes eliminar permanentemente tu cuenta y todos tus datos cifrados en cualquier
                  momento desde el botón de eliminación (icono de papelera roja) ubicado en la
                  barra superior de la aplicación.
                </Text>

                <Text style={styles.h2}>4. No Compartición con Terceros</Text>
                <Text style={styles.p}>
                  GSoftPass es una herramienta gratuita sin fines publicitarios. No vendemos,
                  alquilamos ni compartimos datos personales o metadatos con anunciantes ni
                  terceros.
                </Text>
              </View>
            ) : (
              <View style={styles.legalSection}>
                <Text style={styles.UpdateDate}>Última actualización: Noviembre 2026</Text>

                <Text style={styles.h2}>1. Aceptación de los Términos</Text>
                <Text style={styles.p}>
                  Al crear una bóveda o utilizar GSoftPass en Android, Web o como Extensión para
                  Microsoft Edge, aceptas estos Términos y Condiciones de Uso.
                </Text>

                <Text style={styles.h2}>2. Responsabilidad sobre la Contraseña Maestra</Text>
                <Text style={styles.p}>
                  Debido a nuestra arquitectura de seguridad Zero-Knowledge, GSoftPass no posee
                  copia alguna de tu Contraseña Maestra ni cuenta con puertas traseras para
                  restablecerla. Eres el único responsable de custodiar y recordar tu Contraseña
                  Maestra. En caso de extravío u olvido de la Contraseña Maestra, no será
                  técnicamente posible recuperar el contenido cifrado de la bóveda.
                </Text>

                <Text style={styles.h2}>3. Uso Permitido del Software</Text>
                <Text style={styles.p}>
                  GSoftPass se proporciona de forma gratuita para la gestión personal de
                  credenciales y notas seguras. Queda prohibido el uso de la aplicación para
                  almacenar material ilícito o vulnerar cuentas de terceros.
                </Text>

                <Text style={styles.h2}>4. Limitación de Garantía</Text>
                <Text style={styles.p}>
                  El software se proporciona "tal cual" ("AS IS"), aplicando estándares
                  criptográficos de grado industrial (AES-256 y PBKDF2-HMAC-SHA256) y bloqueo de
                  capturas de pantalla (FLAG_SECURE). El usuario es responsable de mantener su
                  dispositivo libre de malware o accesos físicos no autorizados.
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Entendido</Text>
          </TouchableOpacity>
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
    maxWidth: 540,
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
    marginBottom: 14,
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
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: Colors.primary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  scrollBody: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  legalSection: {
    paddingBottom: 20,
  },
  UpdateDate: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
  },
  h2: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 6,
  },
  p: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  closeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 15,
  },
});