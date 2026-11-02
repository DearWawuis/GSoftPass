// src/types/vault.ts
export type VaultItemType = 
  | 'account'       // Contraseña / Cuenta estándar
  | 'passkey'       // Clave de acceso
  | 'note'          // Nota segura
  | 'contact'       // Información de contacto
  | 'card'          // Tarjeta de crédito/débito
  | 'bank';         // Cuenta bancaria

export interface CustomFolder {
  id: string;
  name: string;     // Ej: "Juegos", "Redes Sociales", "Escuela"
  icon: string;
}

export interface VaultItem {
  id: string;
  type: VaultItemType;
  name: string;               // Nombre identificador (Ej. "Discord", "Netflix")
  url?: string;               // URL o paquete de la app (para autocompletado e IA de iconos)
  username?: string;          // Nombre de usuario con el que inicia sesión
  masterEmail?: string;       // Correo "Maestro" para agrupar múltiples cuentas (Ej. mi_correo@gmail.com)
  password?: string;          // Contraseña (se guarda cifrada en el blob de la bóveda)
  folderId: string;           // ID de la carpeta ("Juegos", "Escuela", etc.)
  iconUrl?: string;           // Icono generado/detectado por IA
  brandColor?: string;        // Color representativo de la app detectada
  notes?: string;             // Nota referente a la cuenta
  // Campos extra para Tarjetas / Bancos / Contactos
  cardNumber?: string;
  cardHolder?: string;
  expirationDate?: string;
  cvv?: string;
  bankAccountNumber?: string;
  clabeOrIban?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordGeneratorOptions {
  length: number;
  allowAllSpecialAndEnye: boolean; // Incluye caracteres especiales y 'ñ' / 'Ñ'
  easyToRead: boolean;             // Evita caracteres ambiguos como 0, O, 1, l, I
  includeNumbers: boolean;
  includeLowercase: boolean;
  includeUppercase: boolean;
  includeSymbols: boolean;
}