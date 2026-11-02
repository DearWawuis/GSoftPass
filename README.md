<div align="center">
  <img src="./assets/icon.png" alt="GSoftPass Logo" width="120" height="120" style="border-radius: 24px;" />
  <h1>🛡️ GSoftPass</h1>
  <p><strong>Gestor de Contraseñas y Claves de Acceso (Passkeys) Multiplataforma con Arquitectura Zero-Knowledge</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Plataformas-Android%20%7C%20Web%20%7C%20MS%20Edge-06B6D4?style=for-the-badge&logo=react" alt="Plataformas" />
    <img src="https://img.shields.io/badge/Cifrado-AES--256%20%2B%20PBKDF2-10B981?style=for-the-badge&logo=shield" alt="Cifrado" />
    <img src="https://img.shields.io/badge/React%20Native-Expo%20%2B%20TypeScript-6366F1?style=for-the-badge&logo=expo" alt="Tech Stack" />
    <img src="https://img.shields.io/badge/Cloud-Firebase%20Zero--Knowledge-F59E0B?style=for-the-badge&logo=firebase" alt="Firebase" />
  </p>

  <p>
    <a href="#-características-principales">Características</a> •
    <a href="#-arquitectura-de-seguridad-zero-knowledge">Seguridad</a> •
    <a href="#-galería-y-diseño-uxui">Capturas</a> •
    <a href="#-instalación-y-desarrollo">Instalación</a> •
    <a href="#-extensión-para-microsoft-edge">Extensión Edge</a> •
    <a href="#-compilación-para-android-y-google-play">Compilación Android</a>
  </p>
</div>

---

## 📖 Descripción General

**GSoftPass** es un gestor de contraseñas, claves de acceso (*Passkeys*) y bóveda digital 100% gratuito y multiplataforma (**Android**, **Aplicación Web** y **Extensión Manifest V3 para Microsoft Edge**).

Inspirado en los estándares de seguridad de grado empresarial de soluciones como LastPass y Dashlane, **GSoftPass** implementa un modelo estricto de **Conocimiento Cero (Zero-Knowledge)**: toda la información de tu bóveda se cifra y descifra exclusivamente en tu dispositivo local antes de sincronizarse con la nube. Jamás se almacena ni se transmite tu Contraseña Maestra en texto plano.

---

## ✨ Características Principales

* 🔐 **Bóveda Multi-Elemento:** Almacena y organiza **Cuentas/Contraseñas, Claves de Acceso (Passkeys), Notas Seguras, Tarjetas de Crédito/Débito, Cuentas Bancarias (CLABE/IBAN) e Información de Contacto**.
* 📧 **Agrupación Inteligente por "Correo Maestro":** ¿Usas un mismo correo electrónico para decenas de servicios distintos? GSoftPass agrupa automáticamente tus cuentas en un árbol desplegable bajo cada Correo Maestro, además de permitir filtros por carpetas personalizadas (*Juegos, Redes Sociales, Escuela, Bancos*, etc.).
* ⚡ **Buscador Instantáneo:** Encuentra cualquier cuenta en milisegundos escribiendo parte del correo electrónico, fragmento de la URL, nombre de usuario o título de la aplicación.
* 🎲 **Generador Criptográfico de Contraseñas (Pop-up dedicado):**
  * Visualización de alto contraste en **negritas y color blanco**.
  * Acciones rápidas alineadas a la derecha para **Regenerar** y **Copiar al portapapeles**.
  * Soporte único para **caracteres especiales extendidos y letra `ñ / Ñ`**.
  * Modo **"Fácil de leer"** (excluye caracteres ambiguos como `0, O, 1, l, I`) y selectores granulares (longitud de 6 a 64 caracteres, mayúsculas, minúsculas, números y símbolos).
* 🤖 **IA de Reconocimiento de Marcas e Iconos (`IconAIService`):** Detecta automáticamente el dominio, color corporativo, carpeta sugerida e icono oficial al escribir el nombre o la URL de la aplicación.
* 📷 **Escáner OCR de Libretas Físicas (`NotebookScannerModal`):** Digitaliza contraseñas escritas a mano o impresas en papel utilizando la cámara del dispositivo o imágenes de la galería.
* 📱 **Autocompletado Nativo en Android y Passkeys (Estilo Samsung Pass):**
  * **Android `AutofillService`:** Muestra sugerencias de inicio de sesión sobre el teclado y despliega el pop-up inferior *"¿Guardar esta Cuenta en GSoftPass?"* al registrarte en cualquier app o navegador móvil (`Chrome`, `Edge`, `Samsung Internet`, `Brave`, `Firefox`).
  * **Android 14+ `CredentialProviderService`:** Soporte nativo para crear y utilizar **Claves de Acceso (Passkeys)**.
* 🧩 **Extensión para Microsoft Edge (Manifest V3):** Detecta formularios de login y registro en cualquier sitio web, inyectando píldoras de autocompletado con un clic y modales emergentes para guardar nuevas cuentas.
* 🌍 **Multilenguaje Nativo (i18n):** Interfaz traducida en tiempo real a **Español 🇪🇸, Inglés 🇺🇸, Francés 🇫🇷, Hindi 🇮🇳 y Japonés 🇯🇵**.
* ♿ **Accesibilidad y Navegación por Teclado:** Soporte completo de `Enter` (`onSubmitEditing`) para saltar entre campos e iniciar sesión sin tocar el ratón o la pantalla, más etiquetas para lectores de pantalla.
* 🛡️ **Protección Anti-Capturas (`FLAG_SECURE`):** Bloquea capturas y grabaciones de pantalla en dispositivos móviles para impedir el robo visual de credenciales.

---

## 🔒 Arquitectura de Seguridad Zero-Knowledge

```text
+-------------------------------------------------------------------------+
|                       DISPOSITIVO DEL USUARIO                           |
|  (Android / Navegador Web / Extensión Microsoft Edge)                   |
|                                                                         |
|  [Contraseña Maestra] + [Correo Maestro (Salt SHA-256)]                 |
|           │                                                             |
|           ▼  (PBKDF2-HMAC-SHA256)                                       |
|  [Llave Derivada de 256 bits (Nunca sale del dispositivo)]              |
|           │                                                             |
|           ├──────────────────────────────┐                              |
|           ▼                              ▼                              |
|  Cifrado Local AES-256 (IV único)   HMAC-SHA256 Auth Hash               |
|  [Blob Cifrado de la Bóveda]        [Hash de Autenticación]             |
+───────────┼──────────────────────────────┼──────────────────────────────+
            │                              │
            ▼ (HTTPS / TLS)                ▼ (HTTPS / TLS)
+-------------------------------------------------------------------------+
|                    FIREBASE CLOUD (ZERO-KNOWLEDGE)                      |
|  • Firebase Auth: Verifica el Auth Hash + Restablecimiento por correo   |
|  • Cloud Firestore: Almacena únicamente el Blob Cifrado AES-256         |
+-------------------------------------------------------------------------+
```

---

## 🖼️ Galería y Diseño UX/UI

| Dashboard Multiplataforma (Web y Móvil) | Bóveda Móvil y Generador de Contraseñas |
| :---: | :---: |
| <img src="./assets/feature-graphic.jpg" alt="Dashboard GSoftPass" width="460" /> | <img src="./assets/mobile-vault.jpg" alt="Bóveda Móvil" width="220" /> <img src="./assets/mobile-generator.jpg" alt="Generador" width="220" /> |

---

## 🗂️ Estructura del Proyecto

```text
GSoftPass/
├── App.tsx                                 # Punto de entrada, Header responsivo, i18n y bloqueo de pantalla
├── app.json                                # Configuración de Expo, permisos de Android y plugins
├── eas.json                                # Perfiles de compilación (.apk y .aab para Google Play)
├── assets/                                 # Iconos oficiales (1024x1024) y recursos gráficos
├── extension/                              # Extensión Manifest V3 para Microsoft Edge
│   ├── manifest.json                       # Configuración de permisos y popup de la extensión
│   ├── background.js                       # Service Worker de sincronización de cuentas
│   └── contentScript.js                    # Detector de formularios web y Pop-up de guardado/autofill
├── native-android/                         # Servicios Nativos de Android (Kotlin + XML)
│   ├── GSoftPassAutofillService.kt         # Servicio de Autocompletado nativo estilo Samsung Pass
│   ├── GSoftPassCredentialService.kt       # Proveedor nativo de Claves de Acceso (Passkeys API 34+)
│   ├── autofill_service_config.xml         # Compatibilidad con Chrome, Edge, Samsung Browser, etc.
│   └── credential_provider_config.xml      # Descriptor XML de Passkeys
├── plugins/
│   └── withGSoftPassAutofill.js            # Expo Config Plugin para inyectar servicios en AndroidManifest.xml
├── public-legal/
│   └── index.html                          # Portal público de Aviso de Privacidad y Eliminación de Cuenta
└── src/
    ├── components/
    │   ├── AutofillSettingsModal.tsx       # Panel de activación del servicio de Autocompletado
    │   ├── LegalModal.tsx                  # Centro Legal (Aviso de Privacidad y Términos Zero-Knowledge)
    │   ├── NotebookScannerModal.tsx        # Escáner de libretas con Cámara/Galería y OCR real
    │   ├── PasswordGeneratorModal.tsx      # Pop-up Generador con soporte de 'ñ' y lectura fácil
    │   └── VaultItemModal.tsx              # Formulario multi-elemento con previsualización de icono IA
    ├── i18n/
    │   └── translations.ts                 # Diccionario en Español, Inglés, Francés, Hindi y Japonés
    ├── screens/
    │   ├── AuthScreen.tsx                  # Login, Registro, Recuperación de Contraseña e Idiomas
    │   └── VaultDashboard.tsx              # Bóveda principal responsiva, buscador y agrupación por correo
    ├── services/
    │   ├── AutofillBridgeService.ts        # Sincronización entre la bóveda, Android Autofill y Edge
    │   ├── CryptoService.ts                # Motor PBKDF2-HMAC-SHA256, AES-256 y Generador de entropía
    │   ├── FirebaseService.ts              # Sincronización Cloud Firestore y Eliminación Permanente
    │   ├── IconAIService.ts                # Predictor de marcas, colores e iconos por IA/dominio
    │   ├── NotebookOCRService.ts           # Parser inteligente de apuntes y contraseñas en papel
    │   └── StorageService.ts               # Almacenamiento seguro en hardware (SecureStore / Web)
    ├── theme/
    │   └── colors.ts                       # Paleta de colores Slate/Cyan/Indigo de alto contraste
    └── types/
        └── vault.ts                        # Interfaces TypeScript de la bóveda
```

---

## 🚀 Instalación y Desarrollo Local

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone [https://github.com/TU_USUARIO/GSoftPass.git](https://github.com/TU_USUARIO/GSoftPass.git)
cd GSoftPass
npm install
```

### 2. Configurar Firebase (Gratis)
1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Activa **Authentication** (proveedor *Correo electrónico/contraseña*).
3. Activa **Cloud Firestore** con la regla de seguridad por propietario (`request.auth.uid == userId`).
4. Coloca tus credenciales `firebaseConfig` dentro de `src/services/FirebaseService.ts`.

### 3. Ejecutar en Modo Desarrollo
```bash
# Iniciar en Navegador Web
npx expo start --web

# Iniciar en Android
npx expo start --android
```

---

## 🧩 Extensión para Microsoft Edge

1. Genera el empaquetado web de producción:
   ```bash
   npx expo export --platform web
   ```
2. Copia el contenido de la carpeta `extension/` (`manifest.json`, `background.js`, `contentScript.js` e `icon.png`) dentro de la carpeta generada `dist/`.
3. Abre Microsoft Edge y navega a `edge://extensions/`.
4. Activa el **Modo de desarrollador** y haz clic en **Cargar descomprimida** (*Load unpacked*).
5. Selecciona la carpeta `dist/` y fija el icono de **GSoftPass** en tu barra de herramientas.

---

## 📦 Compilación para Android y Google Play Store

Este proyecto incluye un *Config Plugin* personalizado (`plugins/withGSoftPassAutofill.js`) que inyecta automáticamente los servicios nativos de Kotlin (`AutofillService` y `CredentialProviderService`) durante la compilación con **EAS Build**:

```bash
# 1. Generar archivo .APK instalable para pruebas directas en dispositivos Android
eas build -p android --profile preview

# 2. Generar archivo .AAB firmado para producción en Google Play Console
eas build -p android --profile production
```

### Cómo activar el Autocompletado en tu teléfono Android:
1. Instala el `.apk` compilado en tu dispositivo.
2. Abre **GSoftPass**, inicia sesión y toca el botón **Autofill** en la barra de herramientas.
3. Presiona **"Abrir Ajustes de Autocompletado de Android"** y selecciona **GSoftPass** como tu servicio predeterminado.

---

## ☕ Apoya el Proyecto

**GSoftPass** es un proyecto gratuito pensado para devolverle a los usuarios el control total de sus contraseñas sin suscripciones forzosas. Si te resulta útil, puedes apoyar su desarrollo continuo invitándome un café:

<div align="center">
  <a href="https://www.buymeacoffee.com/tu_usuario" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" width="210" />
  </a>
</div>

---

## 📄 Licencia y Privacidad

* Consulta nuestro [Aviso de Privacidad Zero-Knowledge y Política de Eliminación de Datos](./public-legal/index.html).
* Distribuido bajo la licencia **MIT**.